// ──────────────────────────────────────────────
// Importer: SillyTavern Chat (JSONL)
// ──────────────────────────────────────────────
import type { DB } from "../../db/connection.js";
import { createChatsStorage } from "../storage/chats.storage.js";
import type { ChatMode } from "@marinara-engine/shared";

interface STChatHeader {
  user_name?: string;
  character_name?: string;
  chat_metadata?: Record<string, unknown>;
}

interface STChatMessage {
  name: string;
  is_user: boolean;
  is_system?: boolean;
  send_date?: string;
  mes: string;
  extra?: {
    display_text?: string;
    type?: string;
  };
}

export interface ImportSTChatOptions {
  /** Link chat to this character ID */
  characterId?: string | null;
  /** Override mode (defaults to roleplay) */
  mode?: ChatMode;
  /** Explicitly set the chat name instead of deriving from header */
  chatName?: string;
  /** For group chats: map of speaker name → characterId */
  speakerMap?: Record<string, string>;
  /** Group ID to associate this chat with (for grouping branches) */
  groupId?: string | null;
}

/**
 * Import a SillyTavern JSONL chat file.
 *
 * Format: Line 0 = header JSON, lines 1+ = message JSON per line.
 */
export async function importSTChat(jsonlContent: string, db: DB, opts?: ImportSTChatOptions) {
  const storage = createChatsStorage(db);
  const lines = jsonlContent.split("\n").filter((l) => l.trim());

  if (lines.length < 2) {
    return { error: "Invalid JSONL: too few lines" };
  }

  // Parse header
  const header = JSON.parse(lines[0]!) as STChatHeader;
  const characterName = header.character_name ?? "Unknown";
  const userName = header.user_name ?? "User";

  // Build characterIds array
  const characterIds: string[] = [];
  if (opts?.characterId) {
    characterIds.push(opts.characterId);
  }
  // For group chats, collect all unique character IDs from speakerMap
  if (opts?.speakerMap) {
    for (const cid of Object.values(opts.speakerMap)) {
      if (cid && !characterIds.includes(cid)) characterIds.push(cid);
    }
  }

  // Create the chat
  const chat = await storage.create({
    name: opts?.chatName ?? `${characterName} (imported)`,
    mode: (opts?.mode ?? "roleplay") as ChatMode,
    characterIds,
    groupId: opts?.groupId ?? null,
    personaId: null,
    promptPresetId: null,
    connectionId: null,
  });

  if (!chat) return { error: "Failed to create chat" };

  // Import messages in batch
  const msgInputs: {
    role: "system" | "user" | "assistant" | "narrator";
    characterId: string | null;
    content: string;
  }[] = [];
  for (let i = 1; i < lines.length; i++) {
    try {
      const stMsg = JSON.parse(lines[i]!) as STChatMessage;

      // Skip pure system messages (but keep user messages flagged as system — ST does this for RP intros)
      if (stMsg.is_system && !stMsg.is_user) continue;

      const role = stMsg.is_user ? "user" : "assistant";
      const content = stMsg.extra?.display_text ?? stMsg.mes;

      // Resolve character ID for this message
      let messageCharacterId: string | null = null;
      if (!stMsg.is_user) {
        if (opts?.speakerMap && stMsg.name) {
          // Group chat: look up speaker
          messageCharacterId = opts.speakerMap[stMsg.name] ?? opts?.characterId ?? null;
        } else {
          messageCharacterId = opts?.characterId ?? null;
        }
      }

      msgInputs.push({ role, characterId: messageCharacterId, content });
    } catch {
      // Skip malformed lines
    }
  }

  await storage.createMessagesBatch(chat.id, msgInputs);

  return {
    success: true,
    chatId: chat.id,
    characterName,
    userName,
    messagesImported: msgInputs.length,
  };
}
