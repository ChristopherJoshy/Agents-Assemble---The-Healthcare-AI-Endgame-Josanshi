import * as z from "zod";

import { McpTool, type ToolExecutionResult } from "./base-tool.js";
import type { ToolContext } from "../types/index.js";
import { createToolOutput } from "../utils/output-schema.js";

const schema = z.object({
  systolicBp: z.number().min(50).max(260),
  diastolicBp: z.number().min(30).max(180),
  severeHeadache: z.boolean().default(false),
  visualChanges: z.boolean().default(false),
  ruqPain: z.boolean().default(false),
  pulmonaryEdema: z.boolean().default(false),
  plateletsK: z.number().min(1).max(1000).optional(),
  creatinineMgDl: z.number().min(0.1).max(20).optional(),
  astU: z.number().min(0).max(5000).optional(),
  altU: z.number().min(0).max(5000).optional(),
});

export class AssessHypertensiveDisorderFromValuesTool extends McpTool<typeof schema> {
  public name = "assess_hypertensive_disorder_from_values";
  public description =
    "Assesses postpartum hypertensive disorder severity from blood pressure, symptom, and lab values provided by the agent.";
  public inputSchema = schema;

  protected async execute(
    _context: ToolContext,
    input: z.infer<typeof schema>,
  ): Promise<ToolExecutionResult> {
    await Promise.resolve();

    const severeBp = input.systolicBp >= 160 || input.diastolicBp >= 110;
    const elevatedBp = input.systolicBp >= 140 || input.diastolicBp >= 90;
    const severeSymptoms =
      input.severeHeadache || input.visualChanges || input.ruqPain || input.pulmonaryEdema;
    const severeLabs =
      (input.plateletsK !== undefined && input.plateletsK < 100) ||
      (input.creatinineMgDl !== undefined && input.creatinineMgDl >= 1.1) ||
      (input.astU !== undefined && input.astU >= 70) ||
      (input.altU !== undefined && input.altU >= 70);

    const severity =
      severeBp || severeSymptoms || severeLabs
        ? "SEVERE_FEATURES"
        : elevatedBp
          ? "ELEVATED_NO_SEVERE_FEATURES"
          : "NO_HYPERTENSIVE_SIGNAL";

    return {
      output: createToolOutput({
        status: "SUCCESS",
        data: {
          severity,
          severeBp,
          severeSymptoms,
          severeLabs,
          recommendation:
            severity === "SEVERE_FEATURES"
              ? "Immediate escalation for urgent maternal evaluation is recommended."
              : severity === "ELEVATED_NO_SEVERE_FEATURES"
                ? "Prompt blood-pressure follow-up and clinical review are recommended."
                : "No hypertension signal from provided values.",
        },
        confidence: 92,
        sources: [
          "Agent-provided blood pressure and symptom values",
          "ACOG postpartum blood pressure follow-up guidance",
        ],
      }),
      fhirSourceData: JSON.stringify(input),
    };
  }
}
