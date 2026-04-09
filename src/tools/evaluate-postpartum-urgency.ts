import * as z from "zod";

import { McpTool, type ToolExecutionResult } from "./base-tool.js";
import type { ToolContext } from "../types/index.js";
import { createToolOutput } from "../utils/output-schema.js";

const schema = z.object({
  systolicBp: z.number().min(50).max(260).optional(),
  diastolicBp: z.number().min(30).max(180).optional(),
  heartRate: z.number().min(20).max(240).optional(),
  temperatureC: z.number().min(30).max(45).optional(),
  oxygenSaturation: z.number().min(50).max(100).optional(),
  heavyBleeding: z.boolean().default(false),
  severeHeadache: z.boolean().default(false),
  visualChanges: z.boolean().default(false),
  chestPain: z.boolean().default(false),
  shortnessOfBreath: z.boolean().default(false),
});

export class EvaluatePostpartumUrgencyTool extends McpTool<typeof schema> {
  public name = "evaluate_postpartum_urgency";
  public description =
    "Classifies postpartum urgency from direct vital signs and red-flag symptoms provided by the agent.";
  public inputSchema = schema;

  protected async execute(
    _context: ToolContext,
    input: z.infer<typeof schema>,
  ): Promise<ToolExecutionResult> {
    await Promise.resolve();
    const severeHypertension =
      (input.systolicBp ?? 0) >= 160 || (input.diastolicBp ?? 0) >= 110;
    const moderateHypertension =
      (input.systolicBp ?? 0) >= 140 || (input.diastolicBp ?? 0) >= 90;
    const sepsisConcern =
      (input.temperatureC ?? 0) >= 38.0 && (input.heartRate ?? 0) >= 100;
    const hypoxia = (input.oxygenSaturation ?? 100) < 94;

    const emergentFlags = [
      input.heavyBleeding ? "HEAVY_BLEEDING" : null,
      severeHypertension ? "SEVERE_HYPERTENSION" : null,
      sepsisConcern ? "SEPSIS_CONCERN" : null,
      hypoxia ? "LOW_OXYGEN" : null,
      input.chestPain ? "CHEST_PAIN" : null,
      input.shortnessOfBreath ? "SHORTNESS_OF_BREATH" : null,
    ].filter((value): value is string => value !== null);

    const urgentFlags = [
      moderateHypertension ? "ELEVATED_BLOOD_PRESSURE" : null,
      input.severeHeadache ? "SEVERE_HEADACHE" : null,
      input.visualChanges ? "VISUAL_CHANGES" : null,
    ].filter((value): value is string => value !== null);

    const urgencyLevel =
      emergentFlags.length > 0
        ? "EMERGENT"
        : urgentFlags.length > 0
          ? "URGENT"
          : "ROUTINE";

    return {
      output: createToolOutput({
        status: "SUCCESS",
        data: {
          urgencyLevel,
          emergentFlags,
          urgentFlags,
          recommendation:
            urgencyLevel === "EMERGENT"
              ? "Immediate escalation to emergency evaluation is recommended."
              : urgencyLevel === "URGENT"
                ? "Prompt same-day clinical review is recommended."
                : "No immediate red flags from provided values; continue routine follow-up.",
        },
        confidence: 92,
        sources: ["Agent-provided patient values"],
      }),
      fhirSourceData: JSON.stringify(input),
    };
  }
}

