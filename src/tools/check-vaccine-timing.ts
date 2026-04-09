import * as z from "zod";

import { McpTool, type ToolExecutionResult } from "./base-tool.js";
import type { ToolContext } from "../types/index.js";
import { bundleEntries, FhirClient } from "../utils/fhir-client.js";
import { createToolOutput } from "../utils/output-schema.js";
import { getCodeList, resourceSource } from "../utils/fhir-utils.js";

const schema = z.object({
  patientId: z.string().optional(),
  vaccineCode: z.string(),
});

const recommendationFor = (vaccineCode: string, isDue: boolean): string => {
  if (vaccineCode === "167") {
    return isDue
      ? "Tdap recommended during each pregnancy, preferably in weeks 27-36; vaccinate postpartum if missed during pregnancy."
      : "Documented Tdap dose found. Verify whether it was given in the current pregnancy.";
  }
  if (vaccineCode === "141") {
    return isDue
      ? "Influenza vaccination is recommended when in season during pregnancy or postpartum."
      : "Documented influenza vaccination found; verify seasonal currency.";
  }
  if (vaccineCode === "207") {
    return isDue
      ? "Follow the current CDC updated COVID-19 vaccine schedule for pregnancy or postpartum."
      : "Documented COVID-19 vaccination found; verify current updated-schedule status.";
  }

  return isDue
    ? "No documented dose found; review the current ACIP schedule."
    : "A documented dose was found; review interval requirements against the ACIP schedule.";
};

export class CheckVaccineTimingTool extends McpTool<typeof schema> {
  public name = "check_vaccine_timing";
  public description =
    "Checks maternal vaccine timing against ACIP-aligned scheduling using documented Immunization resources.";
  public inputSchema = schema;

  protected async execute(
    context: ToolContext,
    input: z.infer<typeof schema>,
  ): Promise<ToolExecutionResult> {
    const patientId = input.patientId ?? context.patientId;
    if (!patientId) {
      return {
        output: createToolOutput({
          status: "ERROR",
          data: null,
          confidence: 0,
          sources: [],
          message: "Patient ID is required.",
        }),
        fhirSourceData: "{}",
      };
    }

    const client = new FhirClient(context);
    const immunizations = bundleEntries<Record<string, unknown>>(
      await client.get("Immunization", {
        patient: patientId,
        vaccine_code: input.vaccineCode,
        _sort: "-date",
      }),
    ).filter((resource) => getCodeList(resource).includes(input.vaccineCode));

    const latest = immunizations[0];

    return {
      output: createToolOutput({
        status: "SUCCESS",
        data: {
          patientId,
          vaccineCode: input.vaccineCode,
          lastDoseDate:
            typeof latest?.occurrenceDateTime === "string" ? latest.occurrenceDateTime : null,
          isDue: !latest,
          recommendation: recommendationFor(input.vaccineCode, !latest),
        },
        confidence: 95,
        sources: immunizations
          .map((resource) => resourceSource("Immunization", resource.id))
          .filter((value): value is string => typeof value === "string")
          .concat("CDC ACIP maternal immunization guidance"),
      }),
      fhirSourceData: JSON.stringify({ immunizations }),
    };
  }
}
