import * as z from "zod";

import { McpTool, type ToolExecutionResult } from "./base-tool.js";
import type { ToolContext } from "../types/index.js";
import { createToolOutput } from "../utils/output-schema.js";

const schema = z.object({
  suspectedInfection: z.boolean().default(true),
  temperatureC: z.number().min(30).max(45).optional(),
  heartRate: z.number().min(20).max(240).optional(),
  respiratoryRate: z.number().min(5).max(80).optional(),
  systolicBp: z.number().min(40).max(260).optional(),
  alteredMentalStatus: z.boolean().default(false),
  lactateMmolL: z.number().min(0).max(30).optional(),
});

export class AssessMaternalSepsisFromValuesTool extends McpTool<typeof schema> {
  public name = "assess_maternal_sepsis_from_values";
  public description =
    "Screens for maternal sepsis concern from direct infection, vital sign, and perfusion values provided by the agent.";
  public inputSchema = schema;

  protected async execute(
    _context: ToolContext,
    input: z.infer<typeof schema>,
  ): Promise<ToolExecutionResult> {
    await Promise.resolve();

    const qsofaScore =
      (input.respiratoryRate !== undefined && input.respiratoryRate >= 22 ? 1 : 0) +
      (input.systolicBp !== undefined && input.systolicBp <= 100 ? 1 : 0) +
      (input.alteredMentalStatus ? 1 : 0);

    const physiologicTrigger =
      (input.temperatureC !== undefined && input.temperatureC >= 38) ||
      (input.heartRate !== undefined && input.heartRate >= 110) ||
      (input.lactateMmolL !== undefined && input.lactateMmolL >= 2) ||
      qsofaScore >= 2;

    const shockConcern =
      (input.systolicBp !== undefined && input.systolicBp < 90) ||
      (input.lactateMmolL !== undefined && input.lactateMmolL >= 4);

    const concernLevel =
      input.suspectedInfection && shockConcern
        ? "CRITICAL"
        : input.suspectedInfection && physiologicTrigger
          ? "HIGH"
          : physiologicTrigger
            ? "MODERATE"
            : "LOW";

    return {
      output: createToolOutput({
        status: "SUCCESS",
        data: {
          concernLevel,
          qsofaScore,
          shockConcern,
          recommendation:
            concernLevel === "CRITICAL"
              ? "Immediate emergency sepsis escalation is recommended."
              : concernLevel === "HIGH"
                ? "Urgent same-day sepsis-focused evaluation is recommended."
                : concernLevel === "MODERATE"
                  ? "Close reassessment is recommended; escalate if worsening."
                  : "No strong sepsis signal from provided values.",
        },
        confidence: 89,
        sources: [
          "Agent-provided infection and vital values",
          "WHO maternal sepsis definition",
          "SCCM Sepsis-3 qSOFA guidance",
        ],
      }),
      fhirSourceData: JSON.stringify(input),
    };
  }
}
