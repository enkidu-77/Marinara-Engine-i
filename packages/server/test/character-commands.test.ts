import test from "node:test";
import assert from "node:assert/strict";
import { parseCharacterCommands } from "../src/services/conversation/character-commands.js";

test("parses update_character with the expanded safe text fields", () => {
  const { commands, cleanContent } = parseCharacterCommands(
    `[update_character: name="Luna", backstory="Raised by wolves", appearance="Silver hair", mes_example="<START> hi", creator_notes="Use with roleplay", system_prompt="Stay eerie", post_history_instructions="Keep replies short"]`,
  );

  assert.equal(cleanContent, "");
  assert.deepEqual(commands, [
    {
      type: "update_character",
      name: "Luna",
      backstory: "Raised by wolves",
      appearance: "Silver hair",
      mesExample: "<START> hi",
      creatorNotes: "Use with roleplay",
      systemPrompt: "Stay eerie",
      postHistoryInstructions: "Keep replies short",
    },
  ]);
});

test("parses update_persona with scenario and backstory", () => {
  const { commands, cleanContent } = parseCharacterCommands(
    `[update_persona: name="Alex Storm", scenario="Urban fantasy city", backstory="Former detective"]`,
  );

  assert.equal(cleanContent, "");
  assert.deepEqual(commands, [
    {
      type: "update_persona",
      name: "Alex Storm",
      scenario: "Urban fantasy city",
      backstory: "Former detective",
    },
  ]);
});

test("parses mixed legacy and expanded update_character fields together", () => {
  const { commands } = parseCharacterCommands(
    `[update_character: name="Luna", description="A fortune teller", personality="enigmatic", first_message="Hello", scenario="Moonlit shop", appearance="Dark velvet dress", system_prompt="Be cryptic"]`,
  );

  assert.deepEqual(commands, [
    {
      type: "update_character",
      name: "Luna",
      description: "A fortune teller",
      personality: "enigmatic",
      firstMessage: "Hello",
      scenario: "Moonlit shop",
      appearance: "Dark velvet dress",
      systemPrompt: "Be cryptic",
    },
  ]);
});

test("strips update commands while preserving visible assistant text", () => {
  const { commands, cleanContent } = parseCharacterCommands(
    `I'll tune those cards for you.\n[update_character: name="Luna", backstory="Raised by wolves"]\n[update_persona: name="Alex Storm", scenario="Urban fantasy city"]\nAnything else?`,
  );

  assert.equal(commands.length, 2);
  assert.equal(cleanContent, "I'll tune those cards for you.\n\nAnything else?");
});
