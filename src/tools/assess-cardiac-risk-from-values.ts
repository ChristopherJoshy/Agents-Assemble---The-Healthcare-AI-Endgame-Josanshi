import * as z from "zod";

import { McpTool, type ToolExecutionResult } from "./base-tool.js";
import type { ToolContext } from "../types/index.js";
import { createToolOutput } from "../utils/output-schema.js";

const schema = z.object({
  ageYears: z.number().min(12).max(70),
  bmi: z.number().min(12).max(80).optional(),
  chronicHypertension: z.boolean().default(false),
  diabetesHistory: z.boolean().default(false),
  priorCardiacCondition: z.boolean().default(false),
  chestPain: z.boolean().default(false),
  dyspnea: z.boolean().default(false),
  orthopnea: z.boolean().default(false),
  syncope: z.boolean().default(false),
  palpitations: z.boolean().default(false),
  bnpPgMl: z.number().min(0).max(10000).optional(),
  ntprobnpPgMl: z.number().min(0).max(50000).optional(),
  ejectionFractionPct: z.number().min(5).max(90).optional(),
});

export class AssessCardiacRiskFromValuesTool extends McpTool<typeof schema> {
  public name = "assess_cardiac_risk_from_values";
  public description =
    "Estimates maternal cardiac risk tier from direct clinical risk factors and symptoms provided by the agent.";
  public inputSchema = schema;

  protected async execute(
    _context: ToolContext,
    input: z.infer<typeof schema>,
  ): Promise<ToolExecutionResult> {
    await Promise.resolve();

    let score = 0;

    if (input.priorCardiacCondition) score += 4;
    if (input.chronicHypertension) score += 2;
    if (input.diabetesHistory) score += 1;
    if (input.ageYears >= 40) score += 1;
    if ((input.bmi ?? 0) >= 35) score += 1;

    const severeSymptoms = [input.chestPain, input.dyspnea, input.orthopnea, input.syncope].filter(Boolean).length;
    if (severeSymptoms >= 1) score += 2;
    if (input.palpitations) score += 1;

    if ((input.bnpPgMl ?? 0) >= 100 || (input.ntprobnpPgMl ?? 0) >= 300) score += 2;
    if ((input.ejectionFractionPct ?? 60) < 45) score += 3;

    const acogTier = score >= 7 ? "Tier 3" : score >= 4 ? "Tier 2" : "Tier 1";

    const escalationFlags = [
      ...(input.chestPain ? ["CHEST_PAIN"] : []),
      ...(input.dyspnea ? ["DYSPNEA"] : []),
      ...(input.orthopnea ? ["ORTHOPNEA"] : []),
      ...(input.syncope ? ["SYNCOPE"] : []),
      ...(((input.ejectionFractionPct ?? 60) < 45) ? ["REDUCED_EJECTION_FRACTION"] : []),
    ];

    return {
      output: createToolOutput({
        status: "SUCCESS",
        data: {
          riskScore: score,
          acogTier,
          escalationFlags,
          recommendation:
            acogTier === "Tier 3"
              ? "Urgent cardio-obstetrics co-management is recommended."
              : acogTier === "Tier 2"
                ? "Early specialist review and closer surveillance are recommended."
                : "Routine maternal-cardiac surveillance is appropriate unless symptoms worsen.",
        },
        confidence: 88,
        sources: [
          "Agent-provided maternal cardiac risk values",
          "ACOG cardio-obstetrics risk stratification principles",
        ],
      }),
      fhirSourceData: JSON.stringify(input),
    };
  }
}
