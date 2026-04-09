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

const includesPattern = (resource: Record<string, unknown>, pattern: RegExp): boolean =>
  pattern.test(JSON.stringify(resource).toLowerCase());

export class EstimatePphRiskTool extends McpTool<typeof schema> {
  public name = "estimate_pph_risk";
  public description =
    "Estimates postpartum hemorrhage risk using CMQCC-style weighted scoring and actionable hemorrhage preparedness recommendations.";
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
    const [conditions, observations, procedures, medications, patientResponse] = await Promise.all([
      client.get("Condition", { patient: patientId }),
      client.get("Observation", { patient: patientId, _count: "30" }),
      client.get("Procedure", { patient: patientId, _count: "20" }),
      client.get("MedicationRequest", { patient: patientId, status: "active" }),
      client.get("Patient", { _id: patientId }),
    ]);

    const conditionList = bundleEntries<Record<string, unknown>>(conditions);
    const observationList = bundleEntries<Record<string, unknown>>(observations);
    const procedureList = bundleEntries<Record<string, unknown>>(procedures);
    const medicationList = bundleEntries<Record<string, unknown>>(medications);
    const patient = firstResource<Record<string, unknown>>(patientResponse);
    const patientName = patient ? getPatientFullName(patient) : null;

    const factors: Array<{ label: string; score: number }> = [];
    if (conditionList.some((condition) => includesPattern(condition, /postpartum hemorrhage|o72/))) {
      factors.push({ label: "Prior PPH", score: 3 });
    }
    if (procedureList.some((procedure) => includesPattern(procedure, /59510|c-section|cesarean|caesarean/))) {
      factors.push({ label: "Cesarean delivery history", score: 2 });
    }
    if (conditionList.some((condition) => includesPattern(condition, /placenta previa|placenta accreta|placental/))) {
      factors.push({ label: "Placental abnormality", score: 4 });
    }
    if (conditionList.some((condition) => includesPattern(condition, /chorioamnionitis|infection/))) {
      factors.push({ label: "Chorioamnionitis", score: 2 });
    }
    const hemoglobin = observationList.find((observation) => getCodeList(observation).includes("718-7"));
    if ((getObservationNumericValue(hemoglobin ?? {}) ?? 99) < 10) {
      factors.push({ label: "Hemoglobin under 10 g/dL", score: 2 });
    }
    if (conditionList.some((condition) => includesPattern(condition, /twin|multiple gestation/))) {
      factors.push({ label: "Multiple gestation", score: 2 });
    }
    if (medicationList.some((medication) => includesPattern(medication, /magnesium sulfate/))) {
      factors.push({ label: "Magnesium exposure", score: 1 });
    }
    if (conditionList.some((condition) => includesPattern(condition, /polyhydramnios/))) {
      factors.push({ label: "Polyhydramnios", score: 1 });
    }

    const totalScore = factors.reduce((sum, factor) => sum + factor.score, 0);
    const riskLevel = totalScore >= 4 ? "HIGH" : totalScore >= 2 ? "MEDIUM" : "LOW";

    return {
      output: createToolOutput({
        status: "SUCCESS",
        data: {
          patientId,
          patientName,
          totalScore,
          riskLevel,
          riskFactors: factors,
          recommendations:
            riskLevel === "HIGH"
              ? [
                  "Activate high-risk hemorrhage readiness checklist.",
                  "Ensure type and cross, hemorrhage cart, and escalation team availability.",
                ]
              : riskLevel === "MEDIUM"
                ? ["Type and screen and confirm hemorrhage response readiness."]
                : ["Routine hemorrhage precautions."],
        },
        confidence: 92,
        sources: [
          ...conditionList
            .map((condition) => resourceSource("Condition", condition.id))
            .filter((value): value is string => typeof value === "string"),
          ...procedureList
            .map((procedure) => resourceSource("Procedure", procedure.id))
            .filter((value): value is string => typeof value === "string"),
          ...observationList
            .map((observation) => resourceSource("Observation", observation.id))
            .filter((value): value is string => typeof value === "string"),
          "CMQCC obstetric hemorrhage risk framework",
        ],
      }),
      fhirSourceData: JSON.stringify({ patient, conditionList, observationList, procedureList, medicationList }),
    };
  }
}
