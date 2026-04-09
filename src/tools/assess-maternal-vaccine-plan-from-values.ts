import * as z from "zod";

import { McpTool, type ToolExecutionResult } from "./base-tool.js";
import type { ToolContext } from "../types/index.js";
import { createToolOutput } from "../utils/output-schema.js";

const schema = z.object({
  isPregnant: z.boolean().default(false),
  gestationalWeeks: z.number().min(0).max(45).optional(),
  postpartum: z.boolean().default(false),
  receivedTdapThisPregnancy: z.boolean().default(false),
  receivedInfluenzaThisSeason: z.boolean().default(false),
  receivedCovidUpdatedDose: z.boolean().default(false),
  rubellaNonImmune: z.boolean().default(false),
  varicellaNonImmune: z.boolean().default(false),
});

export class AssessMaternalVaccinePlanFromValuesTool extends McpTool<typeof schema> {
  public name = "assess_maternal_vaccine_plan_from_values";
  public description =
    "Builds maternal vaccine recommendations from direct pregnancy or postpartum immunization facts provided by the agent.";
  public inputSchema = schema;

  protected async execute(
    _context: ToolContext,
    input: z.infer<typeof schema>,
  ): Promise<ToolExecutionResult> {
    await Promise.resolve();

    const dueNow: string[] = [];
    const postpartumOnly: string[] = [];

    if (input.isPregnant) {
      if (!input.receivedTdapThisPregnancy) {
        const inWindow =
          input.gestationalWeeks !== undefined && input.gestationalWeeks >= 27 && input.gestationalWeeks <= 36;
        dueNow.push(inWindow ? "Tdap (in recommended 27-36 week window)" : "Tdap (once in each pregnancy)");
      }
    }

    if (!input.receivedInfluenzaThisSeason) {
      dueNow.push("Influenza");
    }

    if (!input.receivedCovidUpdatedDose) {
      dueNow.push("Updated COVID-19 vaccine");
    }

    if ((input.postpartum || !input.isPregnant) && input.rubellaNonImmune) {
      postpartumOnly.push("MMR (postpartum/non-pregnant)");
    }

    if ((input.postpartum || !input.isPregnant) && input.varicellaNonImmune) {
      postpartumOnly.push("Varicella (postpartum/non-pregnant)");
    }

    return {
      output: createToolOutput({
        status: "SUCCESS",
        data: {
          dueNow,
          postpartumOnly,
          recommendation:
            dueNow.length === 0 && postpartumOnly.length === 0
              ? "No missing maternal vaccines identified from provided values."
              : "Review immunization timing and administer indicated vaccines per protocol.",
        },
        confidence: 88,
        sources: [
          "Agent-provided vaccine status values",
          "CDC maternal immunization guidance",
        ],
      }),
      fhirSourceData: JSON.stringify(input),
    };
  }
}
