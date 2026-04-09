import * as z from "zod";

import { McpTool, type ToolExecutionResult } from "./base-tool.js";
import type { ToolContext } from "../types/index.js";
import { createToolOutput } from "../utils/output-schema.js";

const schema = z.object({
  priorVte: z.boolean().default(false),
  knownThrombophilia: z.boolean().default(false),
  cesareanDelivery: z.boolean().default(false),
  bmi: z.number().min(10).max(100).optional(),
  prolongedImmobility: z.boolean().default(false),
  postpartumHemorrhageOrTransfusion: z.boolean().default(false),
  hypertensiveDisorder: z.boolean().default(false),
  smoker: z.boolean().default(false),
});

export class AssessVteRiskFromValuesTool extends McpTool<typeof schema> {
  public name = "assess_vte_risk_from_values";
  public description =
    "Estimates postpartum venous thromboembolism risk from direct risk factors provided by the agent.";
  public inputSchema = schema;

  protected async execute(
    _context: ToolContext,
    input: z.infer<typeof schema>,
  ): Promise<ToolExecutionResult> {
    await Promise.resolve();

    const score =
      (input.priorVte ? 50 : 0) +
      (input.knownThrombophilia ? 40 : 0) +
      (input.cesareanDelivery ? 15 : 0) +
      ((input.bmi ?? 0) >= 40 ? 20 : (input.bmi ?? 0) >= 30 ? 10 : 0) +
      (input.prolongedImmobility ? 15 : 0) +
      (input.postpartumHemorrhageOrTransfusion ? 15 : 0) +
      (input.hypertensiveDisorder ? 10 : 0) +
      (input.smoker ? 5 : 0);

    const boundedScore = Math.min(score, 100);
    const riskLevel = boundedScore >= 60 ? "HIGH" : boundedScore >= 30 ? "MODERATE" : "LOW";

    return {
      output: createToolOutput({
        status: "SUCCESS",
        data: {
          riskScore: boundedScore,
          riskLevel,
          recommendation:
            riskLevel === "HIGH"
              ? "Urgent thromboprophylaxis review is recommended."
              : riskLevel === "MODERATE"
                ? "Clinical review for individualized VTE prevention is recommended."
                : "Routine postpartum mobility and warning-sign counseling are appropriate.",
        },
        confidence: 87,
        sources: ["Agent-provided VTE risk factors", "RCOG VTE risk guidance"],
      }),
      fhirSourceData: JSON.stringify(input),
    };
  }
}
