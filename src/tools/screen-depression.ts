import * as z from "zod";

import { McpTool, type ToolExecutionResult } from "./base-tool.js";
import type { ToolContext } from "../types/index.js";
import { bundleEntries, FhirClient, firstResource } from "../utils/fhir-client.js";
import { createToolOutput } from "../utils/output-schema.js";
import {
  getCodeList,
  getObservationDate,
  getObservationNumericValue,
  getPatientFullName,
  resourceSource,
} from "../utils/fhir-utils.js";

const schema = z.object({
  patientId: z.string().optional(),
  q10Score: z.number().min(0).max(3).optional(),
});

export class ScreenDepressionTool extends McpTool<typeof schema> {
  public name = "screen_depression";
  public description =
    "Screens postpartum depression using PHQ-9 and Edinburgh scores with explicit self-harm escalation handling.";
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
      client.get("Observation", {
        patient: patientId,
        _count: "10",
        _sort: "-date",
      }),
    ]);

    const patient = firstResource<Record<string, unknown>>(patientResponse);
    const patientName = patient ? getPatientFullName(patient) : null;

    const observations = bundleEntries<Record<string, unknown>>(observationResponse).filter((observation) =>
      getCodeList(observation).some((code) => ["71354-5", "44261-8", "44249-1"].includes(code)),
    );

    const latest = observations.sort((left, right) =>
      new Date(getObservationDate(right) ?? 0).getTime() -
      new Date(getObservationDate(left) ?? 0).getTime(),
    )[0];
    const score = latest ? getObservationNumericValue(latest) ?? 0 : 0;
    const tool = latest && getCodeList(latest).includes("71354-5") ? "EPDS" : "PHQ-9";
    const q10FromObservation =
      Array.isArray(latest?.component)
        ? ((latest?.component as Array<Record<string, unknown>>)
            .map((component) => {
              const code = Array.isArray((component.code as Record<string, unknown> | undefined)?.coding)
                ? (((component.code as Record<string, unknown> | undefined)?.coding as Array<Record<string, unknown>>)[0]?.code as string | undefined)
                : undefined;
              return code === "44261-6" ? getObservationNumericValue(component) : null;
            })
            .find((value) => typeof value === "number") ?? null)
        : null;
    const q10Score = input.q10Score ?? (typeof q10FromObservation === "number" ? q10FromObservation : 0);

    const severity =
      q10Score >= 1
        ? "IMMEDIATE_ESCALATION"
        : score >= 20 || (tool === "EPDS" && score >= 15)
          ? "SEVERE"
          : score >= 13 || (tool === "EPDS" && score >= 10)
            ? "MODERATE"
            : "LOW";

    return {
      output: createToolOutput({
        status: "SUCCESS",
        data: {
          patientId,
          patientName,
          screeningTool: tool,
          score,
          q10Score,
          selfHarmFlag: q10Score >= 1,
          severity,
          lastScreeningDate: getObservationDate(latest ?? {}) ?? null,
          recommendation:
            q10Score >= 1
              ? "Immediate behavioral-health or emergency evaluation is required."
              : severity === "SEVERE"
                ? "Urgent behavioral-health follow-up is recommended."
                : severity === "MODERATE"
                  ? "Clinical follow-up and repeat screening are recommended."
                  : "Continue routine perinatal mental-health surveillance.",
        },
        confidence: latest ? 95 : 45,
        sources: observations
          .map((observation) => resourceSource("Observation", observation.id))
          .filter((value): value is string => typeof value === "string")
          .concat("ACOG perinatal mental health screening guidance"),
      }),
      fhirSourceData: JSON.stringify({ patient, observations }),
    };
  }
}
