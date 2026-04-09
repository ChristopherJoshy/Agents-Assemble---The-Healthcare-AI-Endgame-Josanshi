import * as z from "zod";

import { McpTool, type ToolExecutionResult } from "./base-tool.js";
import type { ToolContext } from "../types/index.js";
import { createToolOutput } from "../utils/output-schema.js";

const schema = z.object({
  estimatedBloodLossMl: z.number().min(0).max(10000),
  ongoingBleeding: z.boolean().default(false),
  systolicBp: z.number().min(40).max(260).optional(),
  heartRate: z.number().min(20).max(240).optional(),
  signsHypovolemia: z.boolean().default(false),
  hoursSinceBirth: z.number().min(0).max(168).optional(),
});

export class AssessPphTreatmentUrgencyFromValuesTool extends McpTool<typeof schema> {
  public name = "assess_pph_treatment_urgency_from_values";
  public description =
    "Assesses postpartum hemorrhage treatment urgency from direct bleeding and hemodynamic values provided by the agent.";
  public inputSchema = schema;

  protected async execute(
    _context: ToolContext,
    input: z.infer<typeof schema>,
  ): Promise<ToolExecutionResult> {
    await Promise.resolve();

    const severeBloodLoss = input.estimatedBloodLossMl >= 1000;
    const instability =
      input.signsHypovolemia ||
      (input.systolicBp !== undefined && input.systolicBp < 90) ||
      (input.heartRate !== undefined && input.heartRate >= 120);

    const urgency =
      severeBloodLoss || instability || input.ongoingBleeding
        ? "CRITICAL"
        : input.estimatedBloodLossMl >= 500
          ? "HIGH"
          : "MODERATE";

    const txaWindowOpen =
      input.hoursSinceBirth !== undefined ? input.hoursSinceBirth <= 3 : null;

    return {
      output: createToolOutput({
        status: "SUCCESS",
        data: {
          urgency,
          severeBloodLoss,
          instability,
          txaWindowOpen,
          recommendation:
            urgency === "CRITICAL"
              ? "Activate emergency postpartum hemorrhage protocol immediately."
              : urgency === "HIGH"
                ? "Prompt hemorrhage-focused clinical intervention is recommended."
                : "Continue close surveillance and reassessment.",
        },
        confidence: 92,
        sources: [
          "Agent-provided bleeding and hemodynamic values",
          "WHO postpartum hemorrhage treatment guidance",
        ],
      }),
      fhirSourceData: JSON.stringify(input),
    };
  }
}
