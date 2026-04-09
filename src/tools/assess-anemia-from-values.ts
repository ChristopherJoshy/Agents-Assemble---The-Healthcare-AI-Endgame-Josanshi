import * as z from "zod";

import { McpTool, type ToolExecutionResult } from "./base-tool.js";
import type { ToolContext } from "../types/index.js";
import { createToolOutput } from "../utils/output-schema.js";

const schema = z.object({
  hemoglobinGdl: z.number().min(2).max(25).optional(),
  ferritinNgMl: z.number().min(0).max(2000).optional(),
  symptomatic: z.boolean().default(false),
  tachycardia: z.boolean().default(false),
});

export class AssessAnemiaFromValuesTool extends McpTool<typeof schema> {
  public name = "assess_anemia_from_values";
  public description =
    "Classifies likely anemia severity from direct lab values and symptom flags provided by the agent.";
  public inputSchema = schema;

  protected async execute(
    _context: ToolContext,
    input: z.infer<typeof schema>,
  ): Promise<ToolExecutionResult> {
    await Promise.resolve();
    const hemoglobin = input.hemoglobinGdl;

    const severity =
      hemoglobin === undefined
        ? "INSUFFICIENT_INPUT"
        : hemoglobin < 7
          ? "SEVERE"
          : hemoglobin < 10
            ? "MODERATE"
            : hemoglobin < 11
              ? "MILD"
              : "NONE";

    const ironDeficiencyLikely =
      input.ferritinNgMl !== undefined ? input.ferritinNgMl < 30 : null;

    return {
      output: createToolOutput({
        status: hemoglobin === undefined ? "PARTIAL" : "SUCCESS",
        data: {
          hemoglobinGdl: hemoglobin ?? null,
          ferritinNgMl: input.ferritinNgMl ?? null,
          severity,
          ironDeficiencyLikely,
          symptomatic: input.symptomatic,
          tachycardia: input.tachycardia,
          escalationFlag:
            severity === "SEVERE" || (input.symptomatic && input.tachycardia),
          recommendation:
            severity === "SEVERE"
              ? "Urgent in-person evaluation is recommended."
              : severity === "MODERATE"
                ? "Prompt clinical follow-up and treatment planning are recommended."
                : severity === "MILD"
                  ? "Outpatient follow-up and iron optimization may be appropriate."
                  : severity === "NONE"
                    ? "No anemia signal from provided values."
                    : "Provide hemoglobin to complete anemia severity classification.",
        },
        confidence: hemoglobin === undefined ? 62 : 93,
        sources: ["Agent-provided lab and symptom values"],
      }),
      fhirSourceData: JSON.stringify(input),
    };
  }
}

