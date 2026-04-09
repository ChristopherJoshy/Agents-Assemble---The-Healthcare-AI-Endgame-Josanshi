import * as z from "zod";

import { McpTool, type ToolExecutionResult } from "./base-tool.js";
import type { ToolContext } from "../types/index.js";
import { createToolOutput } from "../utils/output-schema.js";

const schema = z.object({
  coverageEndDate: z.string(),
  referenceDate: z.string().optional(),
});

const calculateDaysRemaining = (coverageEndDate: string, referenceDate?: string): number | null => {
  const end = new Date(coverageEndDate);
  const now = referenceDate ? new Date(referenceDate) : new Date();

  if (Number.isNaN(end.getTime()) || Number.isNaN(now.getTime())) {
    return null;
  }

  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.ceil((end.getTime() - now.getTime()) / msPerDay);
};

export class AssessCoverageCliffFromValuesTool extends McpTool<typeof schema> {
  public name = "assess_coverage_cliff_from_values";
  public description =
    "Calculates Medicaid or insurance coverage-cliff urgency from dates supplied directly by the agent.";
  public inputSchema = schema;

  protected async execute(
    _context: ToolContext,
    input: z.infer<typeof schema>,
  ): Promise<ToolExecutionResult> {
    await Promise.resolve();
    const daysRemaining = calculateDaysRemaining(input.coverageEndDate, input.referenceDate);

    if (daysRemaining === null) {
      return {
        output: createToolOutput({
          status: "ERROR",
          data: null,
          confidence: 0,
          sources: ["Agent-provided coverage dates"],
          message: "coverageEndDate or referenceDate is not a valid date string.",
        }),
        fhirSourceData: JSON.stringify(input),
      };
    }

    const riskLevel =
      daysRemaining < 0
        ? "EXPIRED"
        : daysRemaining <= 14
          ? "CRITICAL"
          : daysRemaining <= 30
            ? "HIGH"
            : daysRemaining <= 60
              ? "MODERATE"
              : "LOW";

    return {
      output: createToolOutput({
        status: "SUCCESS",
        data: {
          coverageEndDate: input.coverageEndDate,
          referenceDate: input.referenceDate ?? new Date().toISOString(),
          daysRemaining,
          riskLevel,
          recommendation:
            riskLevel === "EXPIRED"
              ? "Coverage appears expired; immediate coverage recovery workflow is recommended."
              : riskLevel === "CRITICAL"
                ? "Coverage cliff is imminent; prioritize follow-up scheduling and benefits actions now."
                : riskLevel === "HIGH"
                  ? "Start benefits renewal planning immediately."
                  : riskLevel === "MODERATE"
                    ? "Plan follow-up and renewal outreach soon."
                    : "Continue routine coverage monitoring.",
        },
        confidence: 94,
        sources: ["Agent-provided coverage dates"],
      }),
      fhirSourceData: JSON.stringify(input),
    };
  }
}

