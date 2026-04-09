import * as z from "zod";

import { McpTool, type ToolExecutionResult } from "./base-tool.js";
import type { ToolContext } from "../types/index.js";
import { createToolOutput } from "../utils/output-schema.js";

const schema = z.object({
  drugName: z.string(),
  pregnancyCategory: z.enum(["A", "B", "C", "D", "X", "UNKNOWN"]),
  lactationCategory: z.enum(["L1", "L2", "L3", "L4", "L5", "UNKNOWN"]),
  trimester: z.enum(["FIRST", "SECOND", "THIRD", "POSTPARTUM", "UNKNOWN"]).default("UNKNOWN"),
});

export class AssessMedicationSafetyFromValuesTool extends McpTool<typeof schema> {
  public name = "assess_medication_safety_from_values";
  public description =
    "Assesses medication safety using pregnancy and lactation categories provided directly by the agent.";
  public inputSchema = schema;

  protected async execute(
    _context: ToolContext,
    input: z.infer<typeof schema>,
  ): Promise<ToolExecutionResult> {
    await Promise.resolve();
    const pregnancyConcern =
      input.pregnancyCategory === "X"
        ? "CONTRAINDICATED"
        : input.pregnancyCategory === "D"
          ? "HIGH_CONCERN"
          : input.pregnancyCategory === "C"
            ? "MODERATE_CONCERN"
            : input.pregnancyCategory === "UNKNOWN"
              ? "UNKNOWN"
              : "LOW_CONCERN";

    const lactationConcern =
      input.lactationCategory === "L5"
        ? "HIGH_CONCERN"
        : input.lactationCategory === "L4"
          ? "MODERATE_CONCERN"
          : input.lactationCategory === "UNKNOWN"
            ? "UNKNOWN"
            : "LOW_CONCERN";

    const overallRisk =
      pregnancyConcern === "CONTRAINDICATED" || lactationConcern === "HIGH_CONCERN"
        ? "HIGH"
        : pregnancyConcern === "HIGH_CONCERN" || lactationConcern === "MODERATE_CONCERN"
          ? "MODERATE"
          : pregnancyConcern === "UNKNOWN" || lactationConcern === "UNKNOWN"
            ? "UNCERTAIN"
            : "LOW";

    return {
      output: createToolOutput({
        status: "SUCCESS",
        data: {
          drugName: input.drugName,
          trimester: input.trimester,
          pregnancyCategory: input.pregnancyCategory,
          lactationCategory: input.lactationCategory,
          pregnancyConcern,
          lactationConcern,
          overallRisk,
          recommendation:
            overallRisk === "HIGH"
              ? "Avoid use until specialist review confirms safety."
              : overallRisk === "MODERATE"
                ? "Use caution and confirm risk-benefit with clinician review."
                : overallRisk === "UNCERTAIN"
                  ? "Insufficient safety certainty; seek pharmacist or specialist review."
                  : "No major category-based safety concern from supplied values.",
        },
        confidence: 90,
        sources: ["Agent-provided medication safety categories"],
      }),
      fhirSourceData: JSON.stringify(input),
    };
  }
}

