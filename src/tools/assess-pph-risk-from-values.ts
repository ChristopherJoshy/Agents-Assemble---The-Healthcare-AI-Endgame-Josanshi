import * as z from "zod";

import { McpTool, type ToolExecutionResult } from "./base-tool.js";
import type { ToolContext } from "../types/index.js";
import { createToolOutput } from "../utils/output-schema.js";

const schema = z.object({
  priorPph: z.boolean().default(false),
  heavyCurrentBleeding: z.boolean().default(false),
  uterineAtonyHistory: z.boolean().default(false),
  placentaAccretaSpectrum: z.boolean().default(false),
  anticoagulantUse: z.boolean().default(false),
  hemoglobinGdl: z.number().min(2).max(25).optional(),
});

export class AssessPphRiskFromValuesTool extends McpTool<typeof schema> {
  public name = "assess_pph_risk_from_values";
  public description =
    "Estimates postpartum hemorrhage risk from direct structured risk factors provided by the agent.";
  public inputSchema = schema;

  protected async execute(
    _context: ToolContext,
    input: z.infer<typeof schema>,
  ): Promise<ToolExecutionResult> {
    await Promise.resolve();
    const score =
      (input.priorPph ? 30 : 0) +
      (input.heavyCurrentBleeding ? 40 : 0) +
      (input.uterineAtonyHistory ? 20 : 0) +
      (input.placentaAccretaSpectrum ? 30 : 0) +
      (input.anticoagulantUse ? 10 : 0) +
      ((input.hemoglobinGdl ?? 99) < 10 ? 10 : 0);

    const boundedScore = Math.min(score, 100);
    const level = boundedScore >= 60 ? "HIGH" : boundedScore >= 30 ? "MODERATE" : "LOW";

    return {
      output: createToolOutput({
        status: "SUCCESS",
        data: {
          riskScore: boundedScore,
          riskLevel: level,
          redFlags: [
            ...(input.heavyCurrentBleeding ? ["ACTIVE_HEAVY_BLEEDING"] : []),
            ...(input.placentaAccretaSpectrum ? ["PLACENTA_ACCRETA_SPECTRUM"] : []),
          ],
          recommendation:
            level === "HIGH"
              ? "Immediate escalation and hemorrhage protocol review are recommended."
              : level === "MODERATE"
                ? "Close monitoring and contingency planning are recommended."
                : "Continue routine hemorrhage surveillance.",
        },
        confidence: 91,
        sources: ["Agent-provided hemorrhage risk values"],
      }),
      fhirSourceData: JSON.stringify(input),
    };
  }
}

