# Memory

## Facts
- Project Josanshi is a maternal-health MCP server for the Prompt Opinion platform.
- Guardrail tool implements deterministic and semantic safety checks.
- Maya Thompson is a synthetic patient case used for testing high-risk scenarios (postpartum hypertensive emergency).

## Decisions
- Refactored guardrails to be permissive for "Clinical History" and "Record Summaries".
- Lowered BLOCK to REVISE for history-intent responses with high-risk signals missing escalation.
- Updated Gemini judge prompt to align with this permissive logic.
- Implemented a verdict hierarchy (BLOCK > REVISE > APPROVE) to ensure safety signals are never lost during judge merging.
- Registered `WebSearchTool` in the MCP server to enable external clinical evidence retrieval.
- Updated the system prompt to enforce `get_all_patients_id` as the standard entry point for population-wide clinical audits to improve A2A orchestration.

## Open Questions
- None.

## Risks
- Permissive history logic might slightly increase the risk of missing an explicit escalation warning if the agent fails to append it during revision. However, clinical history is primarily for record-keeping.

## Recent Changes
- Modified `src/tools/guardrail.ts` logic and judge prompt (including a TS narrowing fix).
- Updated `prompts/guardrails.md` with history exceptions.
- Added `tests/guardrail-tool.test.ts` for unit testing the guardrail tool.
- Updated `src/tools/registry.ts` to include `WebSearchTool`.
- Updated `prompts/system-prompt.md` to support seamless A2A population-wide diagnostic audits.
