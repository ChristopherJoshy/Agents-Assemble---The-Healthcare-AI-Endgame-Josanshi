# Response Format

## Recommendation

Do **not** use a strict JSON response schema for the main Prompt Opinion agent.

For Josanshi, the main agent should answer in **natural, human, clinician-friendly language**.

The MCP tools can stay structured internally.
The main agent should translate those structured results into clear clinical support language.

## Why Remove The Schema

The schema is useful for:

- internal pipelines
- deterministic machine parsing
- API-style tool outputs

But for the **main chat agent**, it creates responses that feel:

- robotic
- overly technical
- hard to read in a clinical workflow
- unnatural for non-technical users

That is why you are seeing replies that look like raw JSON blobs instead of normal conversation.

## Best Main-Agent Behavior

The main agent should respond like a calm, competent clinical assistant.

It should:

1. answer in plain English
2. sound natural and human
3. lead with the most important takeaway
4. mention urgency when needed
5. mention uncertainty only briefly
6. avoid raw JSON unless explicitly requested

## Recommended Plain-Language Format

Use this style instead of JSON:

### If patient context is missing

`I don’t have an active patient selected yet. Please choose a patient or share a patient ID so I can review the maternal health details.`

### If there is a normal clinical answer

Use:

- short opening sentence with the bottom line
- 1 to 3 short supporting points
- one recommended next step

Example:

`This patient appears to have elevated postpartum risk, mainly driven by hypertension history and recent blood pressure readings. I’d recommend close follow-up and reviewing whether a postpartum blood pressure check has already been completed. If you want, I can also check medication safety, depression screening, or coverage-cliff risk next.`

### If there is urgent risk

Use:

- direct and calm language
- no hedging
- clearly say urgency

Example:

`This looks urgent. The findings suggest severe postpartum risk that should be reviewed immediately by the care team. I would not treat this as routine follow-up.`

## Style Rules For The Main Agent

- Do not output raw JSON in normal chat.
- Do not echo the MCP tool schema to the user.
- Do not expose internal field names like `patient_context`, `recommended_actions`, or `uncertainty_note`.
- Convert structured tool output into normal language.
- Keep responses concise unless the user asks for more detail.

## If The Platform Requires A Response Format Field

If the UI forces you to enter something, put this:

`No fixed JSON schema. Return plain-language clinical decision-support responses that are natural, concise, and human-readable. Use short paragraphs or short bullet points only when helpful. Do not output raw JSON unless explicitly requested.`

## Best Practical Setting

For the main Josanshi agent:

- remove the JSON schema
- keep MCP tools structured underneath
- keep the guardrail agent structured if needed
- let the main chat response stay natural
