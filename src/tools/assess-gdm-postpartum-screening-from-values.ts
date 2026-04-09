import * as z from "zod";

import { McpTool, type ToolExecutionResult } from "./base-tool.js";
import type { ToolContext } from "../types/index.js";
import { createToolOutput } from "../utils/output-schema.js";

const schema = z.object({
  historyGestationalDiabetes: z.boolean().default(false),
  postpartumWeeks: z.number().min(0).max(104).optional(),
  had75gOgtt: z.boolean().default(false),
  fastingGlucoseMgDl: z.number().min(20).max(600).optional(),
  twoHourGlucoseMgDl: z.number().min(20).max(1000).optional(),
});

export class AssessGdmPostpartumScreeningFromValuesTool extends McpTool<typeof schema> {
  public name = "assess_gdm_postpartum_screening_from_values";
  public description =
    "Assesses postpartum diabetes-screening status and glycemic risk from direct values provided by the agent.";
  public inputSchema = schema;

  protected async execute(
    _context: ToolContext,
    input: z.infer<typeof schema>,
  ): Promise<ToolExecutionResult> {
    await Promise.resolve();

    const fasting = input.fastingGlucoseMgDl;
    const twoHour = input.twoHourGlucoseMgDl;

    const glycemicClass =
      fasting !== undefined && fasting >= 126 || twoHour !== undefined && twoHour >= 200
        ? "DIABETES_RANGE"
        : fasting !== undefined && fasting >= 100 || twoHour !== undefined && twoHour >= 140
          ? "PREDIABETES_RANGE"
          : fasting !== undefined || twoHour !== undefined
            ? "NORMAL_RANGE"
            : "NO_GLUCOSE_DATA";

    const screeningWindowStatus =
      !input.historyGestationalDiabetes
        ? "NOT_APPLICABLE"
        : input.postpartumWeeks === undefined
          ? "UNKNOWN"
          : input.postpartumWeeks < 4
            ? "TOO_EARLY_FOR_STANDARD_OGTT"
            : input.postpartumWeeks <= 12
              ? input.had75gOgtt
                ? "COMPLETED_IN_WINDOW"
                : "DUE_NOW"
              : input.had75gOgtt
                ? "COMPLETED_LATE_OR_UNKNOWN"
                : "OVERDUE";

    return {
      output: createToolOutput({
        status: "SUCCESS",
        data: {
          screeningWindowStatus,
          glycemicClass,
          recommendation:
            glycemicClass === "DIABETES_RANGE"
              ? "Urgent diabetes-focused follow-up is recommended."
              : screeningWindowStatus === "DUE_NOW" || screeningWindowStatus === "OVERDUE"
                ? "Arrange postpartum glucose screening promptly."
                : "Continue postpartum metabolic follow-up per risk profile.",
        },
        confidence: 90,
        sources: [
          "Agent-provided postpartum diabetes screening values",
          "ACOG gestational diabetes postpartum screening guidance",
        ],
      }),
      fhirSourceData: JSON.stringify(input),
    };
  }
}
