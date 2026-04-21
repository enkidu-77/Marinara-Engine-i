// ──────────────────────────────────────────────
// Service: Character Commands
// ──────────────────────────────────────────────
// Parses hidden commands from character messages in Conversation mode.
// Commands are embedded by the LLM in the response and stripped before
// the message is shown to the user.
//
// Supported commands:
// - [schedule_update: status="online", activity="free time"]
// - [cross_post: target="group"] or [cross_post: target="CharName"]
// - [selfie] or [selfie: context="description of the selfie"]
// - [memory: target="CharName", summary="description of the memory"]
// - [scene: scenario="...", background="...", plan="..."] (initiate a mini-roleplay scene)
// - [haptic: action="vibrate", intensity=0.5, duration=3] (haptic device feedback)
// - <influence>text</influence> (OOC influence for connected roleplay)
//
// Assistant commands (Professor Mari):
// - [create_persona: name="...", description="...", personality="...", appearance="..."]
// - [create_character: name="...", description="...", personality="...", first_message="...", scenario="..."]
// - [update_character: name="...", description="...", personality="...", first_message="...", scenario="...", backstory="...", appearance="...", mes_example="...", creator_notes="...", system_prompt="...", post_history_instructions="..."]
// - [update_persona: name="...", description="...", personality="...", appearance="...", scenario="...", backstory="..."]
// - [create_chat: character="...", mode="conversation|roleplay"]
// - [navigate: panel="...", tab="..."]
// - [fetch: type="character|persona|lorebook|chat|preset", name="..."]

export interface ScheduleUpdateCommand {
  type: "schedule_update";
  status?: "online" | "idle" | "dnd" | "offline";
  activity?: string;
  duration?: string;
}

export interface CrossPostCommand {
  type: "cross_post";
  /** "group" to post in a group chat, or a character/chat name for DM */
  target: string;
}

export interface SelfieCommand {
  type: "selfie";
  /** Optional context hint from the character about the selfie */
  context?: string;
}

export interface MemoryCommand {
  type: "memory";
  /** Target character name */
  target: string;
  /** Short description of the memory */
  summary: string;
}

export interface SceneCommand {
  type: "scene";
  /** Description of the scene/scenario the character wants to play out */
  scenario: string;
  /** Optional background suggestion */
  background?: string;
  /** Optional plot plan / outline for how the scene unfolds */
  plan?: string;
}

export interface InfluenceCommand {
  type: "influence";
  /** The OOC influence text to inject into the connected roleplay */
  content: string;
}

export interface HapticCommand {
  type: "haptic";
  /** Device action */
  action: "vibrate" | "oscillate" | "rotate" | "position" | "stop";
  /** Intensity / speed (0.0-1.0) */
  intensity?: number;
  /** Duration in seconds */
  duration?: number;
}

// ── Assistant commands (Professor Mari) ──

export interface CreatePersonaCommand {
  type: "create_persona";
  name: string;
  description?: string;
  personality?: string;
  appearance?: string;
}

export interface CreateCharacterCommand {
  type: "create_character";
  name: string;
  description?: string;
  personality?: string;
  firstMessage?: string;
  scenario?: string;
}

export interface UpdateCharacterCommand {
  type: "update_character";
  name: string;
  description?: string;
  personality?: string;
  firstMessage?: string;
  scenario?: string;
  backstory?: string;
  appearance?: string;
  mesExample?: string;
  creatorNotes?: string;
  systemPrompt?: string;
  postHistoryInstructions?: string;
}

export interface UpdatePersonaCommand {
  type: "update_persona";
  name: string;
  description?: string;
  personality?: string;
  appearance?: string;
  scenario?: string;
  backstory?: string;
}

export interface CreateChatCommand {
  type: "create_chat";
  character: string;
  mode?: "conversation" | "roleplay";
}

export interface NavigateCommand {
  type: "navigate";
  panel: string;
  tab?: string;
}

export interface FetchCommand {
  type: "fetch";
  /** What kind of item to fetch */
  fetchType: "character" | "persona" | "lorebook" | "chat" | "preset";
  /** Name of the item to retrieve */
  name: string;
}

export type AssistantCommand =
  | CreatePersonaCommand
  | CreateCharacterCommand
  | UpdateCharacterCommand
  | UpdatePersonaCommand
  | CreateChatCommand
  | NavigateCommand
  | FetchCommand;

export type CharacterCommand =
  | ScheduleUpdateCommand
  | CrossPostCommand
  | SelfieCommand
  | MemoryCommand
  | SceneCommand
  | InfluenceCommand
  | HapticCommand
  | AssistantCommand;

/** Regex patterns for each command type */
const SCHEDULE_UPDATE_RE = /\[schedule_update:\s*([^\]]+)\]/gi;
const CROSS_POST_RE = /\[cross_post:\s*target="([^"]+)"\]/gi;
const SELFIE_RE = /\[selfie(?::\s*context="([^"]*)")?\]/gi;
const MEMORY_RE = /\[memory:\s*target="([^"]+)"\s*,\s*summary="([^"]+)"\]/gi;
const SCENE_RE = /\[scene:\s*([^\]]+)\]/gi;
const HAPTIC_RE = /\[haptic:\s*([^\]]+)\]/gi;
const INFLUENCE_RE = /<influence>([\s\S]*?)<\/influence>/gi;

// Assistant command regexes
const CREATE_PERSONA_RE = /\[create_persona:\s*([^\]]+)\]/gi;
const CREATE_CHARACTER_RE = /\[create_character:\s*([^\]]+)\]/gi;
const UPDATE_CHARACTER_RE = /\[update_character:\s*([^\]]+)\]/gi;
const UPDATE_PERSONA_RE = /\[update_persona:\s*([^\]]+)\]/gi;
const CREATE_CHAT_RE = /\[create_chat:\s*([^\]]+)\]/gi;
const NAVIGATE_RE = /\[navigate:\s*([^\]]+)\]/gi;
const FETCH_RE = /\[fetch:\s*([^\]]+)\]/gi;
/**
 * Parse all character commands from a message and return the cleaned message
 * with commands stripped out.
 */
export function parseCharacterCommands(content: string): {
  cleanContent: string;
  commands: CharacterCommand[];
} {
  const commands: CharacterCommand[] = [];

  // Parse schedule_update commands
  for (const match of content.matchAll(SCHEDULE_UPDATE_RE)) {
    const params = match[1]!;
    const cmd: ScheduleUpdateCommand = { type: "schedule_update" };

    const statusMatch = params.match(/status="([^"]+)"/);
    if (statusMatch) {
      const s = statusMatch[1]!.toLowerCase();
      if (["online", "idle", "dnd", "offline"].includes(s)) {
        cmd.status = s as ScheduleUpdateCommand["status"];
      }
    }

    const activityMatch = params.match(/activity="([^"]+)"/);
    if (activityMatch) cmd.activity = activityMatch[1]!;

    const durationMatch = params.match(/duration="([^"]+)"/);
    if (durationMatch) cmd.duration = durationMatch[1]!;

    commands.push(cmd);
  }

  // Parse cross_post commands
  for (const match of content.matchAll(CROSS_POST_RE)) {
    commands.push({ type: "cross_post", target: match[1]! });
  }

  // Parse selfie commands
  for (const match of content.matchAll(SELFIE_RE)) {
    commands.push({ type: "selfie", context: match[1] || undefined });
  }

  // Parse memory commands
  for (const match of content.matchAll(MEMORY_RE)) {
    commands.push({ type: "memory", target: match[1]!, summary: match[2]! });
  }

  // Parse scene commands
  for (const match of content.matchAll(SCENE_RE)) {
    const params = match[1]!;
    const cmd: SceneCommand = { type: "scene", scenario: "" };

    const scenarioMatch = params.match(/scenario="([^"]+)"/);
    if (scenarioMatch) cmd.scenario = scenarioMatch[1]!;

    const bgMatch = params.match(/background="([^"]+)"/);
    if (bgMatch) cmd.background = bgMatch[1]!;

    const planMatch = params.match(/plan="([^"]+)"/);
    if (planMatch) cmd.plan = planMatch[1]!;

    // Only add if we got a scenario
    if (cmd.scenario) commands.push(cmd);
  }

  // Parse influence commands (<influence>text</influence>)
  for (const match of content.matchAll(INFLUENCE_RE)) {
    const text = match[1]!.trim();
    if (text) commands.push({ type: "influence", content: text });
  }

  // Parse haptic commands
  for (const match of content.matchAll(HAPTIC_RE)) {
    const params = match[1]!;
    const cmd: HapticCommand = { type: "haptic", action: "vibrate" };
    const actionMatch = params.match(/action="([^"]+)"/);
    if (actionMatch) {
      const a = actionMatch[1]!.toLowerCase();
      if (["vibrate", "oscillate", "rotate", "position", "stop"].includes(a)) {
        cmd.action = a as HapticCommand["action"];
      }
    }
    const intensityMatch = params.match(/intensity=([0-9.]+)/);
    if (intensityMatch) {
      const v = parseFloat(intensityMatch[1]!);
      if (Number.isFinite(v)) cmd.intensity = Math.max(0, Math.min(1, v));
    }
    const durationMatch = params.match(/duration=([0-9.]+)/);
    if (durationMatch) {
      const v = parseFloat(durationMatch[1]!);
      if (Number.isFinite(v)) cmd.duration = Math.max(0, v);
    }
    commands.push(cmd);
  }

  // Parse assistant commands (Professor Mari)
  for (const match of content.matchAll(CREATE_PERSONA_RE)) {
    const params = match[1]!;
    const cmd: CreatePersonaCommand = { type: "create_persona", name: "" };
    const nameMatch = params.match(/name="([^"]+)"/);
    if (nameMatch) cmd.name = nameMatch[1]!;
    const descMatch = params.match(/description="([^"]+)"/);
    if (descMatch) cmd.description = descMatch[1]!;
    const persMatch = params.match(/personality="([^"]+)"/);
    if (persMatch) cmd.personality = persMatch[1]!;
    const appMatch = params.match(/appearance="([^"]+)"/);
    if (appMatch) cmd.appearance = appMatch[1]!;
    if (cmd.name) commands.push(cmd);
  }

  for (const match of content.matchAll(CREATE_CHARACTER_RE)) {
    const params = match[1]!;
    const cmd: CreateCharacterCommand = { type: "create_character", name: "" };
    const nameMatch = params.match(/name="([^"]+)"/);
    if (nameMatch) cmd.name = nameMatch[1]!;
    const descMatch = params.match(/description="([^"]+)"/);
    if (descMatch) cmd.description = descMatch[1]!;
    const persMatch = params.match(/personality="([^"]+)"/);
    if (persMatch) cmd.personality = persMatch[1]!;
    const fmMatch = params.match(/first_message="([^"]+)"/);
    if (fmMatch) cmd.firstMessage = fmMatch[1]!;
    const scenMatch = params.match(/scenario="([^"]+)"/);
    if (scenMatch) cmd.scenario = scenMatch[1]!;
    if (cmd.name) commands.push(cmd);
  }

  for (const match of content.matchAll(UPDATE_CHARACTER_RE)) {
    const params = match[1]!;
    const cmd: UpdateCharacterCommand = { type: "update_character", name: "" };
    const nameMatch = params.match(/name="([^"]+)"/);
    if (nameMatch) cmd.name = nameMatch[1]!;
    const descMatch = params.match(/description="([^"]+)"/);
    if (descMatch) cmd.description = descMatch[1]!;
    const persMatch = params.match(/personality="([^"]+)"/);
    if (persMatch) cmd.personality = persMatch[1]!;
    const fmMatch = params.match(/first_message="([^"]+)"/);
    if (fmMatch) cmd.firstMessage = fmMatch[1]!;
    const scenMatch = params.match(/scenario="([^"]+)"/);
    if (scenMatch) cmd.scenario = scenMatch[1]!;
    const backstoryMatch = params.match(/backstory="([^"]+)"/);
    if (backstoryMatch) cmd.backstory = backstoryMatch[1]!;
    const appearanceMatch = params.match(/appearance="([^"]+)"/);
    if (appearanceMatch) cmd.appearance = appearanceMatch[1]!;
    const mesExampleMatch = params.match(/mes_example="([^"]+)"/);
    if (mesExampleMatch) cmd.mesExample = mesExampleMatch[1]!;
    const creatorNotesMatch = params.match(/creator_notes="([^"]+)"/);
    if (creatorNotesMatch) cmd.creatorNotes = creatorNotesMatch[1]!;
    const systemPromptMatch = params.match(/system_prompt="([^"]+)"/);
    if (systemPromptMatch) cmd.systemPrompt = systemPromptMatch[1]!;
    const phiMatch = params.match(/post_history_instructions="([^"]+)"/);
    if (phiMatch) cmd.postHistoryInstructions = phiMatch[1]!;
    if (cmd.name) commands.push(cmd);
  }

  for (const match of content.matchAll(UPDATE_PERSONA_RE)) {
    const params = match[1]!;
    const cmd: UpdatePersonaCommand = { type: "update_persona", name: "" };
    const nameMatch = params.match(/name="([^"]+)"/);
    if (nameMatch) cmd.name = nameMatch[1]!;
    const descMatch = params.match(/description="([^"]+)"/);
    if (descMatch) cmd.description = descMatch[1]!;
    const persMatch = params.match(/personality="([^"]+)"/);
    if (persMatch) cmd.personality = persMatch[1]!;
    const appMatch = params.match(/appearance="([^"]+)"/);
    if (appMatch) cmd.appearance = appMatch[1]!;
    const scenarioMatch = params.match(/scenario="([^"]+)"/);
    if (scenarioMatch) cmd.scenario = scenarioMatch[1]!;
    const backstoryMatch = params.match(/backstory="([^"]+)"/);
    if (backstoryMatch) cmd.backstory = backstoryMatch[1]!;
    if (cmd.name) commands.push(cmd);
  }

  for (const match of content.matchAll(CREATE_CHAT_RE)) {
    const params = match[1]!;
    const cmd: CreateChatCommand = { type: "create_chat", character: "" };
    const charMatch = params.match(/character="([^"]+)"/);
    if (charMatch) cmd.character = charMatch[1]!;
    const modeMatch = params.match(/mode="([^"]+)"/);
    if (modeMatch && (modeMatch[1] === "conversation" || modeMatch[1] === "roleplay")) {
      cmd.mode = modeMatch[1];
    }
    if (cmd.character) commands.push(cmd);
  }

  for (const match of content.matchAll(NAVIGATE_RE)) {
    const params = match[1]!;
    const cmd: NavigateCommand = { type: "navigate", panel: "" };
    const panelMatch = params.match(/panel="([^"]+)"/);
    if (panelMatch) cmd.panel = panelMatch[1]!;
    const tabMatch = params.match(/tab="([^"]+)"/);
    if (tabMatch) cmd.tab = tabMatch[1]!;
    if (cmd.panel) commands.push(cmd);
  }

  for (const match of content.matchAll(FETCH_RE)) {
    const params = match[1]!;
    const cmd: FetchCommand = { type: "fetch", fetchType: "character", name: "" };
    const typeMatch = params.match(/type="([^"]+)"/);
    if (typeMatch) {
      const t = typeMatch[1]!.toLowerCase();
      if (["character", "persona", "lorebook", "chat", "preset"].includes(t)) {
        cmd.fetchType = t as FetchCommand["fetchType"];
      }
    }
    const nameMatch = params.match(/name="([^"]+)"/);
    if (nameMatch) cmd.name = nameMatch[1]!;
    if (cmd.name) commands.push(cmd);
  }

  // Strip all commands from the visible content
  let cleanContent = content
    .replace(SCHEDULE_UPDATE_RE, "")
    .replace(CROSS_POST_RE, "")
    .replace(SELFIE_RE, "")
    .replace(MEMORY_RE, "")
    .replace(SCENE_RE, "")
    .replace(HAPTIC_RE, "")
    .replace(INFLUENCE_RE, "")
    .replace(CREATE_PERSONA_RE, "")
    .replace(CREATE_CHARACTER_RE, "")
    .replace(UPDATE_CHARACTER_RE, "")
    .replace(UPDATE_PERSONA_RE, "")
    .replace(CREATE_CHAT_RE, "")
    .replace(NAVIGATE_RE, "")
    .replace(FETCH_RE, "")
    .replace(/\n{3,}/g, "\n\n") // collapse excessive newlines left by removals
    .trim();

  return { cleanContent, commands };
}

/**
 * Parse a duration string like "2h", "30m", "1h30m" into minutes.
 * Returns null if unparseable.
 */
export function parseDuration(duration: string): number | null {
  const hourMatch = duration.match(/(\d+)\s*h/i);
  const minMatch = duration.match(/(\d+)\s*m/i);

  let total = 0;
  if (hourMatch) total += parseInt(hourMatch[1]!) * 60;
  if (minMatch) total += parseInt(minMatch[1]!);

  return total > 0 ? total : null;
}
