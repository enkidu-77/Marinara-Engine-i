import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import type { DB } from "../src/db/connection.js";
import { runMigrations } from "../src/db/migrate.js";
import { chats, memoryChunks, messages } from "../src/db/schema/index.js";
import { chatsRoutes } from "../src/routes/chats.routes.js";
import { createChatsStorage } from "../src/services/storage/chats.storage.js";
import {
  chunkAndEmbedMessages,
  recallMemories,
  setMemoryRecallLocalEmbedOverrideForTests,
} from "../src/services/memory-recall.js";
import type { BaseLLMProvider } from "../src/services/llm/base-provider.js";

class TestEmbeddingProvider {
  async embed(texts: string[], _model: string): Promise<number[][]> {
    return texts.map((text) => {
      const lower = text.toLowerCase();
      return [lower.includes("silverleaf") ? 1 : 0, lower.includes("dragon") ? 1 : 0];
    });
  }
}

test("editing a message invalidates stale memory chunks and refresh rebuilds from current text", async () => {
  const client = createClient({ url: "file::memory:" });
  const db = drizzle(client) as unknown as DB;

  try {
    await runMigrations(db);

    const now = "2026-05-05T00:00:00.000Z";
    await db.insert(chats).values({
      id: "chat-445",
      name: "Bug 445 repro",
      mode: "game",
      characterIds: "[]",
      metadata: "{}",
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(messages).values({
      id: "message-445",
      chatId: "chat-445",
      role: "assistant",
      characterId: null,
      content: "The ancient tome says florblesnatch is the password.",
      activeSwipeIndex: 0,
      extra: "{}",
      createdAt: "2026-05-05T00:01:00.000Z",
    });
    for (let i = 2; i <= 5; i++) {
      await db.insert(messages).values({
        id: `message-445-${i}`,
        chatId: "chat-445",
        role: i % 2 === 0 ? "user" : "assistant",
        characterId: null,
        content: `Follow-up message ${i}`,
        activeSwipeIndex: 0,
        extra: "{}",
        createdAt: `2026-05-05T00:0${i}:00.000Z`,
      });
    }

    await db.insert(memoryChunks).values({
      id: "chunk-445",
      chatId: "chat-445",
      content: "GM: The ancient tome says florblesnatch is the password.",
      embedding: null,
      messageCount: 5,
      firstMessageAt: "2026-05-05T00:01:00.000Z",
      lastMessageAt: "2026-05-05T00:05:00.000Z",
      createdAt: "2026-05-05T00:06:00.000Z",
    });

    const storage = createChatsStorage(db);
    await storage.updateMessageContent("message-445", "The ancient tome says silverleaf is the password.");

    const chunksAfterEdit = await db.select().from(memoryChunks).where(eq(memoryChunks.chatId, "chat-445"));
    assert.equal(chunksAfterEdit.length, 0);

    const app = Fastify({ logger: false });
    app.decorate("db", db);
    await app.register(chatsRoutes, { prefix: "/api/chats" });
    await app.ready();

    const res = await app.inject({ method: "POST", url: "/api/chats/chat-445/memories/refresh" });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { rebuilt: 1 });
    await app.close();

    const rebuiltChunks = await db.select().from(memoryChunks).where(eq(memoryChunks.chatId, "chat-445"));

    assert.equal(rebuiltChunks.length, 1);
    assert.ok(!rebuiltChunks[0]!.content.includes("florblesnatch"));
    assert.ok(rebuiltChunks[0]!.content.includes("silverleaf"));
  } finally {
    client.close();
  }
});

test("chunking uses configured embedding fallback when local embeddings are unavailable", async () => {
  const client = createClient({ url: "file::memory:" });
  const db = drizzle(client) as unknown as DB;

  try {
    setMemoryRecallLocalEmbedOverrideForTests(async () => null);
    await runMigrations(db);

    const now = "2026-05-05T00:00:00.000Z";
    await db.insert(chats).values({
      id: "chat-435-fallback",
      name: "Bug 435 fallback",
      mode: "conversation",
      characterIds: "[]",
      metadata: "{}",
      createdAt: now,
      updatedAt: now,
    });

    for (let i = 1; i <= 5; i++) {
      await db.insert(messages).values({
        id: `message-435-${i}`,
        chatId: "chat-435-fallback",
        role: i % 2 === 0 ? "assistant" : "user",
        characterId: null,
        content: i === 3 ? "The silverleaf key opens the old gate." : `Memory fallback message ${i}`,
        activeSwipeIndex: 0,
        extra: "{}",
        createdAt: `2026-05-05T00:0${i}:00.000Z`,
      });
    }

    await chunkAndEmbedMessages(
      db,
      "chat-435-fallback",
      { userName: "User", characterNames: {} },
      {
        provider: new TestEmbeddingProvider() as unknown as BaseLLMProvider,
        model: "test-embedding-model",
        source: "test fallback",
      },
    );

    const chunks = await db.select().from(memoryChunks).where(eq(memoryChunks.chatId, "chat-435-fallback"));
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0]!.embedding, JSON.stringify([1, 0]));
  } finally {
    setMemoryRecallLocalEmbedOverrideForTests(null);
    client.close();
  }
});

test("recall uses configured embedding fallback for query vectors", async () => {
  const client = createClient({ url: "file::memory:" });
  const db = drizzle(client) as unknown as DB;

  try {
    setMemoryRecallLocalEmbedOverrideForTests(async () => null);
    await runMigrations(db);

    const now = "2026-05-05T00:00:00.000Z";
    await db.insert(chats).values({
      id: "chat-435-recall",
      name: "Bug 435 recall",
      mode: "conversation",
      characterIds: "[]",
      metadata: "{}",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(memoryChunks).values({
      id: "chunk-435-recall",
      chatId: "chat-435-recall",
      content: "User: The silverleaf key opens the old gate.",
      embedding: JSON.stringify([1, 0]),
      messageCount: 5,
      firstMessageAt: "2026-05-05T00:01:00.000Z",
      lastMessageAt: "2026-05-05T00:05:00.000Z",
      createdAt: "2026-05-05T00:06:00.000Z",
    });

    const recalled = await recallMemories(db, "where is the silverleaf key?", ["chat-435-recall"], 8, {
      provider: new TestEmbeddingProvider() as unknown as BaseLLMProvider,
      model: "test-embedding-model",
      source: "test fallback",
    });

    assert.equal(recalled.length, 1);
    assert.equal(recalled[0]!.content, "User: The silverleaf key opens the old gate.");
  } finally {
    setMemoryRecallLocalEmbedOverrideForTests(null);
    client.close();
  }
});
