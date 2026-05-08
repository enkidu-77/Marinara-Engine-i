// ──────────────────────────────────────────────
// Service: Memory Recall
// ──────────────────────────────────────────────
// Chunks conversation messages into groups, embeds them, and provides
// semantic recall: given a query, find the most relevant past
// conversation fragments from specified chats.
import { PROVIDERS } from "@marinara-engine/shared";
import { eq, desc, and, gt, inArray, isNotNull } from "drizzle-orm";
import type { DB } from "../db/connection.js";
import { messages, memoryChunks } from "../db/schema/index.js";
import { newId, now } from "../utils/id-generator.js";
import { localEmbed } from "./local-embedder.js";
import type { BaseLLMProvider } from "./llm/base-provider.js";
import { createLLMProvider } from "./llm/provider-registry.js";
import { logger } from "../lib/logger.js";
const isLite = process.env.MARINARA_LITE === "true" || process.env.MARINARA_LITE === "1";

/** How many messages per chunk. */
const CHUNK_SIZE = 5;

/** Minimum similarity score to include a memory in results. */
const SIMILARITY_THRESHOLD = 0.25;

/** Maximum number of recalled memories per generation. */
const DEFAULT_TOP_K = 8;

let testLocalEmbedOverride: ((texts: string[]) => Promise<number[][] | null>) | null = null;

// ── Cosine similarity ──

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0,
    magA = 0,
    magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    magA += a[i]! * a[i]!;
    magB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Public API ──

export interface RecalledMemory {
  chatId: string;
  content: string;
  similarity: number;
  firstMessageAt: string;
  lastMessageAt: string;
}

export interface MemoryRecallEmbeddingContext {
  provider: BaseLLMProvider;
  model: string;
  source: string;
}

export interface MemoryRecallConnection {
  id: string;
  provider: string;
  baseUrl: string | null;
  apiKey: string;
  embeddingModel?: string | null;
  embeddingBaseUrl?: string | null;
  embeddingConnectionId?: string | null;
  maxContext?: number | null;
  openrouterProvider?: string | null;
  maxTokensOverride?: number | null;
  claudeFastMode?: string | boolean | null;
}

export interface MemoryRecallConnectionStorage {
  getWithKey(id: string): Promise<MemoryRecallConnection | null>;
}

function resolveMemoryRecallConnectionBaseUrl(connection: MemoryRecallConnection): string {
  if (connection.baseUrl) return connection.baseUrl.replace(/\/+$/, "");
  if (connection.provider === "claude_subscription") return "claude-agent-sdk://local";
  const providerDef = PROVIDERS[connection.provider as keyof typeof PROVIDERS];
  return providerDef?.defaultBaseUrl ?? "";
}

export async function resolveMemoryRecallEmbeddingContext(args: {
  connections: MemoryRecallConnectionStorage;
  conn: MemoryRecallConnection | null;
  baseUrl: string;
  chatMeta: Record<string, unknown>;
}): Promise<MemoryRecallEmbeddingContext | null> {
  const { connections, conn, baseUrl, chatMeta } = args;
  if (!conn) return null;

  const embeddingConnId =
    (chatMeta.embeddingConnectionId as string | undefined) || (conn.embeddingConnectionId as string | undefined);
  let embedConn = conn;
  let embedBaseUrl = baseUrl || resolveMemoryRecallConnectionBaseUrl(conn);
  if (embeddingConnId) {
    const dedicatedConnection = await connections.getWithKey(embeddingConnId);
    if (dedicatedConnection) {
      embedConn = dedicatedConnection;
      embedBaseUrl = resolveMemoryRecallConnectionBaseUrl(dedicatedConnection);
    }
  }

  if (embedConn.embeddingBaseUrl) {
    embedBaseUrl = embedConn.embeddingBaseUrl.replace(/\/+$/, "");
  }

  // Match connection settings semantics: a dedicated embedding connection may supply
  // credentials/base URL while inheriting the parent connection's embedding model.
  const embeddingModel = embedConn.embeddingModel || conn.embeddingModel;
  if (!embeddingModel || !embedBaseUrl) return null;

  return {
    provider: createLLMProvider(
      embedConn.provider,
      embedBaseUrl,
      embedConn.apiKey,
      embedConn.maxContext,
      embedConn.openrouterProvider,
      embedConn.maxTokensOverride,
      embedConn.claudeFastMode === true || embedConn.claudeFastMode === "true",
    ),
    model: embeddingModel,
    source: embeddingConnId ? `connection ${embeddingConnId}` : `chat connection ${embedConn.id}`,
  };
}

async function embedTexts(
  texts: string[],
  purpose: "chunk" | "query",
  embeddingContext?: MemoryRecallEmbeddingContext | null,
): Promise<number[][] | null> {
  const localEmbeddings = testLocalEmbedOverride ? await testLocalEmbedOverride(texts) : await localEmbed(texts);
  if (localEmbeddings) return localEmbeddings;

  if (!embeddingContext?.model) {
    logger.warn(
      "[memory-recall] Local embeddings are unavailable and no embedding connection is configured for %s embeddings",
      purpose,
    );
    return null;
  }

  try {
    const embeddings = await embeddingContext.provider.embed(texts, embeddingContext.model);
    logger.info(
      "[memory-recall] Used %s embedding fallback (%s) for %d %s text(s)",
      embeddingContext.source,
      embeddingContext.model,
      texts.length,
      purpose,
    );
    return embeddings;
  } catch (err) {
    logger.warn(
      err,
      "[memory-recall] Embedding fallback %s failed for %s embeddings",
      embeddingContext.source,
      purpose,
    );
    return null;
  }
}

export function setMemoryRecallLocalEmbedOverrideForTests(
  override: ((texts: string[]) => Promise<number[][] | null>) | null,
): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Memory recall local embed override is only available in tests.");
  }
  testLocalEmbedOverride = override;
}

/**
 * Chunk any un-chunked messages for a given chat and embed them.
 * Should be called after generation completes (fire-and-forget).
 */
export async function chunkAndEmbedMessages(
  db: DB,
  chatId: string,
  /** Map from role → display name. Used to format "Name: content" lines. */
  nameMap: { userName: string; characterNames: Record<string, string> },
  embeddingContext?: MemoryRecallEmbeddingContext | null,
): Promise<void> {
  if (isLite) return;
  // Find the last chunk for this chat to know where to start
  const lastChunk = await db
    .select({ lastMessageAt: memoryChunks.lastMessageAt })
    .from(memoryChunks)
    .where(eq(memoryChunks.chatId, chatId))
    .orderBy(desc(memoryChunks.lastMessageAt))
    .limit(1);

  const after = lastChunk[0]?.lastMessageAt ?? null;

  // Get messages that haven't been chunked yet
  const conditions = [eq(messages.chatId, chatId)];
  if (after) {
    conditions.push(gt(messages.createdAt, after));
  }
  const unchunked = await db
    .select({
      id: messages.id,
      role: messages.role,
      characterId: messages.characterId,
      content: messages.content,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(and(...conditions))
    .orderBy(messages.createdAt);

  if (unchunked.length < CHUNK_SIZE) return; // not enough to form a chunk yet

  // Group into chunks of CHUNK_SIZE
  const chunksToCreate: Array<{
    content: string;
    messageCount: number;
    firstMessageAt: string;
    lastMessageAt: string;
  }> = [];

  // Only chunk complete groups — leftover messages wait for next round
  const completeCount = Math.floor(unchunked.length / CHUNK_SIZE) * CHUNK_SIZE;
  for (let i = 0; i < completeCount; i += CHUNK_SIZE) {
    const group = unchunked.slice(i, i + CHUNK_SIZE);
    const lines = group.map((m) => {
      const name =
        m.role === "user"
          ? nameMap.userName
          : m.role === "narrator" || m.role === "system"
            ? "Narrator"
            : ((m.characterId && nameMap.characterNames[m.characterId]) ?? "Character");
      return `${name}: ${m.content}`;
    });
    chunksToCreate.push({
      content: lines.join("\n\n"),
      messageCount: group.length,
      firstMessageAt: group[0]!.createdAt,
      lastMessageAt: group[group.length - 1]!.createdAt,
    });
  }

  if (chunksToCreate.length === 0) return;

  // Embed all chunks through embedTexts, which is local-first with configured fallback.
  const texts = chunksToCreate.map((c) => c.content);
  const embeddings = (await embedTexts(texts, "chunk", embeddingContext)) ?? [];

  // Store chunks
  const timestamp = now();
  for (let i = 0; i < chunksToCreate.length; i++) {
    const chunk = chunksToCreate[i]!;
    await db.insert(memoryChunks).values({
      id: newId(),
      chatId,
      content: chunk.content,
      embedding: embeddings[i] ? JSON.stringify(embeddings[i]) : null,
      messageCount: chunk.messageCount,
      firstMessageAt: chunk.firstMessageAt,
      lastMessageAt: chunk.lastMessageAt,
      createdAt: timestamp,
    });
  }

  logger.debug("[memory-recall] Created %d chunk(s) for chat %s", chunksToCreate.length, chatId);
}

/**
 * Rebuild all memory-recall chunks for a chat from the current message log.
 */
export async function rebuildMemoryChunks(
  db: DB,
  chatId: string,
  nameMap: { userName: string; characterNames: Record<string, string> },
  embeddingContext?: MemoryRecallEmbeddingContext | null,
): Promise<number> {
  if (isLite) return 0;

  await db.delete(memoryChunks).where(eq(memoryChunks.chatId, chatId));
  await chunkAndEmbedMessages(db, chatId, nameMap, embeddingContext);

  const rebuilt = await db
    .select({ id: memoryChunks.id })
    .from(memoryChunks)
    .where(eq(memoryChunks.chatId, chatId));
  return rebuilt.length;
}

/**
 * Recall relevant conversation memories for a given query.
 * Searches only the specified chat IDs for relevant chunks.
 */
export async function recallMemories(
  db: DB,
  query: string,
  chatIds: string[],
  topK: number = DEFAULT_TOP_K,
  embeddingContext?: MemoryRecallEmbeddingContext | null,
): Promise<RecalledMemory[]> {
  if (isLite) return [];
  if (chatIds.length === 0) return [];

  // Embed the query through embedTexts, which is local-first with configured fallback.
  const queryEmbeddings = await embedTexts([query], "query", embeddingContext);
  if (!queryEmbeddings || queryEmbeddings.length === 0) return [];
  const queryEmbedding = queryEmbeddings[0]!;
  if (queryEmbedding.length === 0) return [];

  const matchingChatIds = chatIds.slice(0, 50);

  // Load embedded chunks from matching chats (capped to prevent memory blowup)
  const MAX_CHUNKS = 500;
  const chunks = await db
    .select({
      id: memoryChunks.id,
      chatId: memoryChunks.chatId,
      content: memoryChunks.content,
      embedding: memoryChunks.embedding,
      firstMessageAt: memoryChunks.firstMessageAt,
      lastMessageAt: memoryChunks.lastMessageAt,
    })
    .from(memoryChunks)
    .where(and(inArray(memoryChunks.chatId, matchingChatIds), isNotNull(memoryChunks.embedding)))
    .orderBy(desc(memoryChunks.lastMessageAt))
    .limit(MAX_CHUNKS);

  if (chunks.length === 0) return [];

  let dimensionMismatchLogged = false;

  // Score each chunk by cosine similarity
  const scored = chunks
    .map((chunk) => {
      const embedding: number[] = JSON.parse(chunk.embedding!);
      if (!dimensionMismatchLogged && embedding.length !== queryEmbedding.length) {
        dimensionMismatchLogged = true;
        logger.warn(
          "[memory-recall] Skipping one or more memory chunks with embedding dimensions that do not match the query vector (%d vs %d). Refresh memories after changing embedding models.",
          embedding.length,
          queryEmbedding.length,
        );
      }
      return {
        chatId: chunk.chatId,
        content: chunk.content,
        similarity: cosineSimilarity(queryEmbedding, embedding),
        firstMessageAt: chunk.firstMessageAt,
        lastMessageAt: chunk.lastMessageAt,
      };
    })
    .filter((s) => s.similarity >= SIMILARITY_THRESHOLD)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  return scored;
}
