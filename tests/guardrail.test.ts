import { afterEach, describe, expect, it, vi } from "vitest";

import { geminiJudge, runGuardrail } from "../src/middleware/guardrail.js";
import { createToolOutput } from "../src/utils/output-schema.js";

describe("guardrail", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GEMINI_API_KEY;
  });

  it("returns VERIFIED for a valid clinical output", async () => {
    const result = await runGuardrail(
      "screen_depression",
      {},
      createToolOutput({
        status: "SUCCESS",
        data: {
          selfHarmFlag: false,
          severity: "LOW",
        },
        confidence: 90,
        sources: ["ACOG perinatal mental health screening guidance"],
      }),
      "{}",
    );

    expect(result.verdict).toBe("VERIFIED");
  });

  it("returns MODIFIED when the judge requests a citation correction", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      verdict: "MODIFIED",
                      confidence: 88,
                      flags: [
                        {
                          criterion: "CITED",
                          issue: "Citation format should reference ACOG guidance directly.",
                          severity: "MEDIUM",
                        },
                      ],
                      correction: "Use an ACOG citation string in sources.",
                      reasoning: "Clinical content is sound but the citation naming is weak.",
                    }),
                  },
                ],
              },
            },
          ],
        }),
      ),
    );

    const result = await runGuardrail(
      "assess_postpartum_risk",
      {},
      createToolOutput({
        status: "SUCCESS",
        data: { riskScore: 5 },
        confidence: 90,
        sources: ["internal citation"],
      }),
      "{}",
    );

    expect(result.verdict).toBe("MODIFIED");
    expect(result.output._guardrail?.verdict).toBe("MODIFIED");
  });

  it("returns BLOCKED when dangerous advice is detected", async () => {
    const result = await runGuardrail(
      "get_vitals_snapshot",
      {},
      createToolOutput({
        status: "SUCCESS",
        data: { recommendation: "Give 500 mg ibuprofen now." },
        confidence: 90,
        sources: ["ACOG postpartum care guidance"],
      }),
      "{}",
    );

    expect(result.verdict).toBe("BLOCKED");
    expect(result.output.status).toBe("BLOCKED");
  });

  it("returns VERIFIED with lowered confidence when the judge times out", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("timeout"));

    const judge = await geminiJudge(
      "screen_depression",
      {},
      createToolOutput({
        status: "SUCCESS",
        data: { selfHarmFlag: false, severity: "LOW" },
        confidence: 90,
        sources: ["ACOG perinatal mental health screening guidance"],
      }),
      "{}",
    );

    expect(judge.verdict).toBe("VERIFIED");
    expect(judge.confidence).toBe(50);
  });
});
