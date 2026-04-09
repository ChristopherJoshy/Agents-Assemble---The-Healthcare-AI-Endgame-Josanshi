import * as z from "zod";

import { McpTool, type ToolExecutionResult } from "./base-tool.js";
import type { ToolContext } from "../types/index.js";
import { createToolOutput } from "../utils/output-schema.js";

const schema = z.object({
  epdsTotal: z.number().min(0).max(30).optional(),
  phq9Total: z.number().min(0).max(27).optional(),
  q10SelfHarm: z.number().min(0).max(3).default(0),
});

export class AssessDepressionFromValuesTool extends McpTool<typeof schema> {
  public name = "assess_depression_from_values";
  public description =
    "Assesses perinatal depression severity from direct screening scores provided by the agent.";
  public inputSchema = schema;

  protected async execute(
    _context: ToolContext,
    input: z.infer<typeof schema>,
  ): Promise<ToolExecutionResult> {
    await Promise.resolve();
    const primaryScore = input.epdsTotal ?? input.phq9Total ?? null;
    const toolName = input.epdsTotal !== undefined ? "EPDS" : input.phq9Total !== undefined ? "PHQ-9" : null;

    const severity =
      input.q10SelfHarm >= 1
        ? "IMMEDIATE_ESCALATION"
        : primaryScore === null
          ? "INSUFFICIENT_INPUT"
          : toolName === "EPDS"
            ? primaryScore >= 15
              ? "SEVERE"
              : primaryScore >= 10
                ? "MODERATE"
                : "LOW"
            : primaryScore >= 20
              ? "SEVERE"
              : primaryScore >= 10
                ? "MODERATE"
                : "LOW";

    return {
      output: createToolOutput({
        status: primaryScore === null ? "PARTIAL" : "SUCCESS",
        data: {
          screeningTool: toolName,
          score: primaryScore,
          q10SelfHarm: input.q10SelfHarm,
          severity,
          recommendation:
            severity === "IMMEDIATE_ESCALATION"
              ? "Immediate behavioral-health or emergency evaluation is required."
              : severity === "SEVERE"
                ? "Urgent behavioral-health follow-up is recommended."
                : severity === "MODERATE"
                  ? "Clinical follow-up and repeat screening are recommended."
                  : severity === "LOW"
                    ? "Continue routine perinatal mental-health surveillance."
                    : "Provide EPDS or PHQ-9 total score to complete screening classification.",
        },
        confidence: primaryScore === null ? 60 : 95,
        sources: ["Agent-provided screening values"],
      }),
      fhirSourceData: JSON.stringify(input),
    };
  }
}

