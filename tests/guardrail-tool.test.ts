import { describe, expect, it, vi, beforeEach } from "vitest";
import { GuardrailTool } from "../src/tools/guardrail.js";
import { createToolOutput } from "../src/utils/output-schema.js";

describe("GuardrailTool", () => {
  let tool: GuardrailTool;

  beforeEach(() => {
    tool = new GuardrailTool();
    vi.stubEnv("GEMINI_API_KEY", "test-key");
  });

  it("BLOCKS high-risk signals if no escalation and NOT a history", async () => {
    const result = await (tool as any).execute({}, {
      draftResponse: "Patient has severe hypertension (170/110). No other concerns.",
      userPrompt: "Assess this patient."
    });

    const data = result.output.data;
    expect(data.verdict).toBe("BLOCK");
  });

  it("REVISES high-risk signals if it IS a history/summary", async () => {
    const result = await (tool as any).execute({}, {
      draftResponse: "Clinical History: Patient has severe hypertension (170/110) documented in chart.",
      userPrompt: "Generate a medical history."
    });

    const data = result.output.data;
    expect(data.verdict).toBe("REVISE");
    expect(data.issues[0].message.toLowerCase()).toContain("history/summary");
  });

  it("APPROVES safe responses", async () => {
    // Mock Gemini
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                verdict: "APPROVE",
                confidence: 99,
                issues: []
              })
            }]
          }
        }]
      })
    }));

    const result = await (tool as any).execute({}, {
      draftResponse: "Patient is doing well.",
      userPrompt: "How is she?"
    });

    const data = result.output.data;
    expect(data.verdict).toBe("APPROVE");
  });
});
