// ──────────────────────────────────────────────
// Sprite Overlay — VN-style character sprites in chat
// Shows character sprites on the left/right of the roleplay view.
// Expression is determined by the Expression Engine agent result
// or falls back to keyword-based detection from message text.
// ──────────────────────────────────────────────
import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence, type TargetAndTransition } from "framer-motion";
import { useCharacterSprites, type SpriteInfo } from "../../hooks/use-characters";
import { useAgentStore } from "../../stores/agent.store";

interface SpriteOverlayProps {
  /** IDs of characters in this chat */
  characterIds: string[];
  /** The last N messages to detect expressions from */
  messages: Array<{ role: string; characterId?: string | null; content: string }>;
  /** Which side the sprites appear on */
  side: "left" | "right";
  /** Saved expressions per character (from chat metadata) */
  spriteExpressions?: Record<string, string>;
  /** Called when expression changes (to persist it) */
  onExpressionChange?: (characterId: string, expression: string) => void;
}

type Transition = "crossfade" | "bounce" | "shake" | "hop" | "none";

interface CharacterExpressionState {
  expression: string;
  transition: Transition;
}

/** Simple keyword-based expression detection from message text. */
export function detectExpression(text: string): string {
  const lower = text.toLowerCase();
  const patterns: [string, RegExp][] = [
    ["angry", /\b(anger|angry|furious|rage|yells?|shouts?|snarls?|growls?|seeth)/i],
    ["sad", /\b(sad|sorrow|cry|cries|crying|tears|weep|sob|mourn|grief|melanchol)/i],
    ["happy", /\b(happy|joy|laugh|smile|smiles|grin|grins|cheer|delight|beam|beaming|giggl)/i],
    ["surprised", /\b(surpris|shock|astonish|gasp|gasps|wide.?eye|startle|stun)/i],
    ["scared", /\b(scare|fear|afraid|terrif|frighten|tremble|trembling|shiver|panic)/i],
    ["embarrassed", /\b(embarrass|blush|blushes|flustered|sheepish|shy|avert)/i],
    ["love", /\b(love|adore|affection|heart|kiss|embrace|cherish)/i],
    ["thinking", /\b(think|ponder|consider|contemplat|muse|hmm|wonder)/i],
    ["laughing", /\b(laugh|laughing|laughter|haha|LOL|chuckle|cackle|snicker|giggle)/i],
    ["worried", /\b(worr|anxious|nervous|uneasy|fret|concern|dread)/i],
    ["disgusted", /\b(disgust|repuls|revolt|gross|nausea|sicken)/i],
    ["smirk", /\b(smirk|sly|mischiev|devious|wink|tease|teasing)/i],
    ["crying", /\b(crying|cried|weeping|tears stream|sobbing)/i],
    ["determined", /\b(determin|resolv|steadfast|unwaver|resolute|clench)/i],
    ["hurt", /\b(hurt|pain|wound|wince|grimace|ache|suffer)/i],
  ];

  for (const [expression, regex] of patterns) {
    if (regex.test(lower)) return expression;
  }
  return "neutral";
}

export function SpriteOverlay({
  characterIds,
  messages,
  side,
  spriteExpressions,
  onExpressionChange,
}: SpriteOverlayProps) {
  // Subscribe to agent expression results
  const expressionResult = useAgentStore((s) => s.lastResults.get("expression"));

  // Track current expression + transition per character
  const [states, setStates] = useState<Record<string, CharacterExpressionState>>(() => {
    const initial: Record<string, CharacterExpressionState> = {};
    if (spriteExpressions) {
      for (const [id, expr] of Object.entries(spriteExpressions)) {
        initial[id] = { expression: expr, transition: "none" };
      }
    }
    return initial;
  });

  // When agent result arrives, prefer it over keyword detection
  useEffect(() => {
    if (expressionResult?.success && expressionResult.data) {
      const data = expressionResult.data as {
        expressions?: Array<{ characterId: string; expression: string; transition?: string }>;
      };
      if (data.expressions?.length) {
        setStates((prev) => {
          const next = { ...prev };
          for (const e of data.expressions!) {
            const t = (["crossfade", "bounce", "shake", "hop", "none"] as Transition[]).includes(
              e.transition as Transition,
            )
              ? (e.transition as Transition)
              : "crossfade";
            next[e.characterId] = { expression: e.expression, transition: t };
            onExpressionChange?.(e.characterId, e.expression);
          }
          return next;
        });
        return;
      }
    }
  }, [expressionResult, onExpressionChange]);

  // Fallback: keyword-based detection when no agent result
  useEffect(() => {
    if (!messages?.length) return;
    if (expressionResult?.success && (expressionResult.data as any)?.expressions?.length) return;

    const newStates: Record<string, CharacterExpressionState> = {};

    const recentAssistant = messages.filter((m) => m.role === "assistant").slice(-5);
    for (const msg of recentAssistant) {
      if (msg.characterId) {
        const expr = detectExpression(msg.content);
        newStates[msg.characterId] = { expression: expr, transition: "crossfade" };
        onExpressionChange?.(msg.characterId, expr);
      }
    }

    for (const id of characterIds) {
      if (!newStates[id]) {
        const saved = spriteExpressions?.[id];
        if (saved) {
          newStates[id] = { expression: saved, transition: "none" };
        } else {
          const lastMsg = [...messages].reverse().find((m) => m.characterId === id && m.role === "assistant");
          const expr = lastMsg ? detectExpression(lastMsg.content) : "neutral";
          newStates[id] = { expression: expr, transition: "crossfade" };
        }
      }
    }

    setStates(newStates);
  }, [messages, characterIds, expressionResult, spriteExpressions, onExpressionChange]);

  if (characterIds.length === 0) return null;

  const visibleChars = characterIds.slice(0, 3);

  return (
    <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
      {visibleChars.map((charId) => (
        <CharacterSprite
          key={charId}
          characterId={charId}
          expression={states[charId]?.expression ?? "neutral"}
          transition={states[charId]?.transition ?? "crossfade"}
          side={side}
        />
      ))}
    </div>
  );
}

// ── Transition animation variants ──────────────────────────

interface SpriteVariant {
  initial: TargetAndTransition;
  animate: TargetAndTransition;
  exit: TargetAndTransition;
}

const CROSSFADE: SpriteVariant = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.4, ease: "easeInOut" } },
  exit: { opacity: 0, transition: { duration: 0.3 } },
};

const BOUNCE: SpriteVariant = {
  initial: { opacity: 0, scale: 0.85 },
  animate: { opacity: 1, scale: [0.85, 1.08, 0.97, 1], transition: { duration: 0.5, times: [0, 0.4, 0.7, 1] } },
  exit: { opacity: 0, scale: 0.9, transition: { duration: 0.25 } },
};

const SHAKE: SpriteVariant = {
  initial: { opacity: 0 },
  animate: { opacity: 1, x: [0, -6, 6, -4, 4, -2, 2, 0], transition: { duration: 0.45, ease: "easeOut" } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

const HOP: SpriteVariant = {
  initial: { opacity: 0, y: 0 },
  animate: { opacity: 1, y: [0, -18, 0, -8, 0], transition: { duration: 0.5, times: [0, 0.3, 0.55, 0.75, 1] } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

const NONE_VARIANT: SpriteVariant = {
  initial: { opacity: 1 },
  animate: { opacity: 1, transition: { duration: 0 } },
  exit: { opacity: 0, transition: { duration: 0 } },
};

const TRANSITION_VARIANTS: Record<Transition, SpriteVariant> = {
  crossfade: CROSSFADE,
  bounce: BOUNCE,
  shake: SHAKE,
  hop: HOP,
  none: NONE_VARIANT,
};

// ── Character Sprite ───────────────────────────────────────

function CharacterSprite({
  characterId,
  expression,
  transition,
  side,
}: {
  characterId: string;
  expression: string;
  transition: Transition;
  side: "left" | "right";
}) {
  const { data: sprites } = useCharacterSprites(characterId);
  const prevExpressionRef = useRef(expression);
  const [activeTransition, setActiveTransition] = useState<Transition>(transition);

  const spriteUrl = useMemo(() => {
    if (!sprites || !(sprites as SpriteInfo[]).length) return null;
    const spriteList = sprites as SpriteInfo[];
    const exact = spriteList.find((s) => s.expression === expression);
    if (exact) return exact.url;
    const neutral = spriteList.find((s) => s.expression === "neutral" || s.expression === "default");
    if (neutral) return neutral.url;
    return spriteList[0]?.url ?? null;
  }, [sprites, expression]);

  useEffect(() => {
    if (prevExpressionRef.current !== expression) {
      setActiveTransition(transition);
      prevExpressionRef.current = expression;
    }
  }, [expression, transition]);

  if (!spriteUrl) return null;

  const variant = TRANSITION_VARIANTS[activeTransition];

  return (
    <div
      className={`absolute bottom-0 ${side === "left" ? "left-0 max-md:-left-[15%]" : "right-0 max-md:-right-[15%]"}`}
    >
      <AnimatePresence mode="wait">
        <motion.img
          key={`${characterId}-${expression}`}
          src={spriteUrl}
          alt={`${expression} sprite`}
          className="max-h-[60vh] w-auto object-contain drop-shadow-[0_0_20px_rgba(0,0,0,0.5)]"
          draggable={false}
          initial={variant.initial}
          animate={variant.animate}
          exit={variant.exit}
        />
      </AnimatePresence>
    </div>
  );
}
