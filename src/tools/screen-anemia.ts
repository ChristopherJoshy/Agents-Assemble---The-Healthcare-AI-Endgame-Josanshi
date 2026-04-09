import * as z from "zod";

import { McpTool, type ToolExecutionResult } from "./base-tool.js";
import type { ToolContext } from "../types/index.js";
import { bundleEntries, FhirClient, firstResource } from "../utils/fhir-client.js";
import { createToolOutput } from "../utils/output-schema.js";
import {
  getCodeList,
  getObservationNumericValue,
  getPatientFullName,
  resourceSource,
} from "../utils/fhir-utils.js";

const schema = z.object({
  patientId: z.string().optional(),
});

const findByCode = (observations: Array<Record<string, unknown>>, code: string): number | null =>
  getObservationNumericValue(
    observations.find((observation) => getCodeList(observation).includes(code)) ?? {},
  );

export class ScreenAnemiaTool extends McpTool<typeof schema> {
  public name = "screen_anemia";
  public description =
    "Screens postpartum anemia using hemoglobin, hematocrit, and CBC pattern classification for iron-deficiency and related anemia patterns.";
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
    const [patientResponse, observationResponse] = await Promise.all([
      client.get("Patient", { _id: patientId }),
      client.get("Observation", { patient: patientId, _count: "30" }),
    ]);

    const patient = firstResource<Record<string, unknown>>(patientResponse);
    const patientName = patient ? getPatientFullName(patient) : null;

    const observations = bundleEntries<Record<string, unknown>>(observationResponse);

    const hemoglobin = findByCode(observations, "718-7");
    const hematocrit = findByCode(observations, "4544-3");
    const mcv = findByCode(observations, "787-2") ?? findByCode(observations, "6768-6");
    const ferritin = findByCode(observations, "2276-4") ?? findByCode(observations, "2345-7");

    const isAnemic = (hemoglobin ?? 99) < 10 || (hematocrit ?? 99) < 30;
    const severity = (hemoglobin ?? 99) < 7 ? "SEVERE" : isAnemic ? "MODERATE" : "NONE";
    const pattern =
      isAnemic && (mcv ?? 99) < 80 && (ferritin ?? 999) < 30
        ? "IRON_DEFICIENCY_PATTERN"
        : isAnemic && (mcv ?? 0) >= 80 && (mcv ?? 0) <= 100
          ? "NORMOCYTIC_PATTERN"
          : isAnemic && (mcv ?? 0) > 100
            ? "MACROCYTIC_PATTERN"
            : "NO_CLEAR_ANEMIA_PATTERN";

    return {
      output: createToolOutput({
        status: hemoglobin !== null || hematocrit !== null ? "SUCCESS" : "PARTIAL",
        data: {
          patientId,
          patientName,
          hemoglobin,
          hematocrit,
          mcv,
          ferritin,
          isAnemic,
          severity,
          patternClassification: pattern,
          recommendation:
            severity === "SEVERE"
              ? "Urgent clinical evaluation and consideration of transfusion or IV iron is recommended."
              : isAnemic
                ? "Follow-up CBC and iron-replacement planning are recommended."
                : "No anemia-specific intervention is indicated from current CBC data.",
        },
        confidence: hemoglobin !== null || hematocrit !== null ? 94 : 40,
        sources: observations
          .map((observation) => resourceSource("Observation", observation.id))
          .filter((value): value is string => typeof value === "string")
          .concat("ACOG anemia guidance"),
      }),
      fhirSourceData: JSON.stringify({ patient, observations }),
    };
  }
}
