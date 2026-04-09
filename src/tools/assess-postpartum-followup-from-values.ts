import * as z from "zod";

import { McpTool, type ToolExecutionResult } from "./base-tool.js";
import type { ToolContext } from "../types/index.js";
import { createToolOutput } from "../utils/output-schema.js";

const schema = z.object({
  postpartumDays: z.number().min(0).max(365),
  hypertensiveDisorder: z.boolean().default(false),
  severeHypertension: z.boolean().default(false),
  positiveDepressionScreen: z.boolean().default(false),
  recentComplication: z.boolean().default(false),
});

export class AssessPostpartumFollowupFromValuesTool extends McpTool<typeof schema> {
  public name = "assess_postpartum_followup_from_values";
  public description =
    "Recommends follow-up timing based on postpartum day and direct risk factors provided by the agent.";
  public inputSchema = schema;

  protected async execute(
    _context: ToolContext,
    input: z.infer<typeof schema>,
  ): Promise<ToolExecutionResult> {
    await Promise.resolve();

    const targetWindow =
      input.severeHypertension
        ? "WITHIN_72_HOURS"
        : input.hypertensiveDisorder
          ? "WITHIN_7_TO_10_DAYS"
          : input.recentComplication || input.positiveDepressionScreen
            ? "WITHIN_1_TO_2_WEEKS"
            : input.postpartumDays < 21
              ? "WITHIN_3_WEEKS"
              : "COMPREHENSIVE_VISIT_BY_12_WEEKS";

    return {
      output: createToolOutput({
        status: "SUCCESS",
        data: {
          targetWindow,
          recommendation:
            targetWindow === "WITHIN_72_HOURS"
              ? "Arrange urgent postpartum blood-pressure follow-up within 72 hours."
              : targetWindow === "WITHIN_7_TO_10_DAYS"
                ? "Arrange blood-pressure focused follow-up within 7 to 10 days postpartum."
                : targetWindow === "WITHIN_1_TO_2_WEEKS"
                  ? "Arrange early follow-up within 1 to 2 weeks."
                  : targetWindow === "WITHIN_3_WEEKS"
                    ? "Ensure postpartum contact occurs within 3 weeks."
                    : "Ensure comprehensive postpartum visit occurs no later than 12 weeks.",
        },
        confidence: 91,
        sources: ["Agent-provided postpartum timing and risk values", "ACOG Optimizing Postpartum Care"],
      }),
      fhirSourceData: JSON.stringify(input),
    };
  }
}
