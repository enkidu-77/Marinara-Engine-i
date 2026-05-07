# Professor Mari

<p align="center">
  <img src="../packages/client/public/sprites/mari/Mari_explaining.png" width="320" alt="Professor Mari explaining Marinara Engine" />
</p>

Professor Mari is Marinara Engine's built-in assistant character. She lives in your character library by default, cannot be deleted, and is meant to help new users set up Marinara, understand the app, and create or edit basic content without having to learn every panel first.

This guide explains what Mari can do today, what she cannot do yet, and how her app knowledge works.

## What Mari Is For

Use Mari when you want help with:

- Setting up your first connection, character, persona, conversation, roleplay, or Game Mode session.
- Understanding the difference between Conversation, Roleplay, and Game Mode.
- Creating a new character card or persona from a rough description.
- Updating an existing character card or persona.
- Creating a lorebook from worldbuilding notes.
- Opening a specific app panel, such as Characters, Lorebooks, Connections, Agents, Personas, or Settings.
- Reviewing existing characters, personas, lorebooks, chats, or presets after she fetches them into context.
- Explaining common Marinara concepts, such as lorebooks, presets, agents, sprites, selfies, Game Mode, and connected chats.

Mari is a guide and helper, not a replacement for the full documentation. When something is version-specific or has changed recently, prefer the docs and release notes as the source of truth.

## What Mari Can Do

Mari has built-in assistant commands that the app processes after her message. The command text is hidden from you; you only see the result.

Implemented actions include:

- Create personas.
- Create character cards.
- Update existing character cards.
- Update existing personas.
- Create lorebooks, optionally with starter entries.
- Create new Conversation or Roleplay chats with a selected character.
- Navigate to app panels and settings tabs.
- Fetch existing characters, personas, lorebooks, chats, and presets so she can inspect their details before advising or editing.

When Mari creates something, she should ask for the important details first. When she updates something, she should fetch the current item first and change only the requested fields.

## Important Safety Notes

Creating new content is usually safe. Editing existing content deserves more care.

- Character edits keep a recoverable version snapshot that can be rolled back from the character history.
- Persona edits overwrite the persona without a snapshot. Back up a persona first if you want to preserve the old version.
- Mari should fetch an item before updating it so she can avoid overwriting unrelated fields.
- Mari cannot reliably know what you meant if you ask for a broad rewrite with no constraints. Give her the specific field or behavior you want changed.

## What Mari Cannot Do Yet

These are not implemented as dedicated Mari workflows today:

- Submit GitHub bug reports or feature requests from inside the app.
- Draft a GitHub bug report from a dedicated `#bug-report` trigger.
- Create a fully configured Game Mode chat or complete the whole Game Setup Wizard through hidden commands.
- Manage billing, external accounts, sync, or provider dashboards for you.
- Guarantee her built-in app knowledge is newer than the installed version.
- Automatically ingest the latest GitHub docs into her own prompt.

Mari can still talk you through those tasks. For Game Mode, for example, she can help choose the genre, tone, party, persona, GM style, model, and lorebooks, then guide you through the wizard. The wizard remains the source of truth for starting the game.

## How Mari Knows About Marinara

Mari has a built-in assistant prompt that explains Marinara's major features and command syntax. That prompt is bundled with the app and updated when the app updates.

Marinara also has separate knowledge-source features:

- **Knowledge Sources** let you upload text-based files or PDFs for the Knowledge Retrieval agent.
- **Knowledge Retrieval** scans selected lorebooks and uploaded files, extracts relevant information, and injects it into the prompt.
- **Knowledge Router** selects relevant lorebook entries by ID and injects the selected entries directly.

Those knowledge-source features are general agent tools. They are not the same thing as Mari's built-in app prompt, and the app does not currently maintain an automatic "GitHub docs to Mari knowledge base" pipeline.

## Getting Better Answers From Mari

For setup help, tell Mari what you are trying to do and what provider/model you are using.

Good examples:

- "Help me set up Game Mode for a dark fantasy campaign. I have Claude Opus for the GM and ComfyUI for images."
- "Create a character card for a cheerful alchemist. Ask me for details one step at a time."
- "Fetch my character Luna and help me make her first message less generic."
- "Explain why my Roleplay HUD keeps showing the wrong time."

If Mari gives an answer that does not match what you see in the app, check the docs and release notes, then report the mismatch in Discord or GitHub. The most useful report is specific: what Mari said, what the docs/app showed instead, and which Marinara version you are running.

## Related Docs

- [Conversation Mode](CONVERSATION.md)
- [Roleplay Mode](ROLEPLAY.md)
- [Game Mode](GAME_MODE.md)
- [FAQ](FAQ.md)
- [Troubleshooting](TROUBLESHOOTING.md)
