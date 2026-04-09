# Josanshi Prompt Pack

This folder contains paste-ready Markdown content for the Prompt Opinion main-agent configuration screens shown in the UI.

- `basic.md`
- `system-prompt.md`
- `consult-prompt.md`
- `response-format.md`
- `content.md`
- `tools.md`
- `guardrails.md`
- `a2a-skills.md`

These prompts are for the main Prompt Opinion agent that calls the Josanshi MCP.

Recommended model in Prompt Opinion:

- `Gemini 3.1 Flash Lite Preview`

Prompting choices in this pack were optimized for low-latency Gemini Flash-Lite style models using current Google guidance:

- prefer clear role and task boundaries
- keep instructions explicit and ordered
- require grounded, structured outputs
- use schema-backed JSON where consistency matters
- separate safety policy from task instructions

Primary reference set used:

- Google AI structured outputs: <https://ai.google.dev/gemini-api/docs/structured-output>
- Google AI prompt best practices: <https://ai.google.dev/guide/prompt_best_practices>
- Google Cloud system-instruction safety guidance: <https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/safety-system-instructions>

Clinical reference families reflected in the prompts:

- ACOG
- CDC / ACIP
- CMQCC
- AIM Sepsis in Obstetric Care

Use these files as the source of truth for the main agent configuration that orchestrates Josanshi MCP tool calls.
