import * as z from "zod";

import { McpTool, type ToolExecutionResult } from "./base-tool.js";
import type { ToolContext } from "../types/index.js";
import { bundleEntries, firstResource, FhirClient } from "../utils/fhir-client.js";
import { createToolOutput } from "../utils/output-schema.js";
import {
  daysUntil,
  getCodeList,
  getObservationNumericValue,
  getPatientFullName,
  resourceSource,
} from "../utils/fhir-utils.js";

const schema = z.object({
  patientId: z.string().optional(),
});

const hasCondition = (conditions: Array<Record<string, unknown>>, matcher: RegExp): boolean =>
  conditions.some((condition) => {
    const codeText =
      typeof (condition.code as Record<string, unknown> | undefined)?.text === "string"
        ? ((condition.code as Record<string, unknown>).text as string)
        : "";
    const text = `${codeText} ${getCodeList(condition).join(" ")}`.toLowerCase();
    return matcher.test(text);
  });

export class AssessPostpartumRiskTool extends McpTool<typeof schema> {
  public name = "assess_postpartum_risk";
  public description =
    "Assesses postpartum risk across hemorrhage, cardiovascular, mental health, and transition domains, including imminent Medicaid coverage cliff detection.";
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
    const [conditionResponse, observationResponse, medicationResponse, patientResponse, coverageResponse, broaderObservationResponse] =
      await Promise.all([
        client.get("Condition", { patient: patientId }),
        client.get("Observation", { patient: patientId, category: "vital-signs", _count: "20" }),
        client.get("MedicationRequest", { patient: patientId, status: "active" }),
        client.get("Patient", { _id: patientId }),
        client.get("Coverage", { patient: patientId, status: "active" }),
        client.get("Observation", { patient: patientId, _count: "50" }),
      ]);

    const conditions = bundleEntries<Record<string, unknown>>(conditionResponse);
    const observations = bundleEntries<Record<string, unknown>>(observationResponse);
    const broaderObservations = bundleEntries<Record<string, unknown>>(broaderObservationResponse);
    const medications = bundleEntries<Record<string, unknown>>(medicationResponse);
    const patient = firstResource<Record<string, unknown>>(patientResponse);
    const coverage = firstResource<Record<string, unknown>>(coverageResponse);
    const patientName = patient ? getPatientFullName(patient) : null;

    const allObservations = observations.length > 0 ? observations : broaderObservations;
    const hasMaternalContext =
      hasCondition(
        conditions,
        /pregnan|postpartum|delivery|preeclampsia|gestational|labor|haemorrhage|hemorrhage|o\d{2}|obstetric|maternal/,
      ) ||
      medications.some((medication) =>
        JSON.stringify(medication).toLowerCase().includes("magnesium sulfate"),
      ) ||
      Boolean(coverage);

    if (!hasMaternalContext) {
      return {
        output: createToolOutput({
          status: "PARTIAL",
          data: {
            patientId,
            patientName,
            applicability: "UNCERTAIN",
            message:
              "This record does not show clear pregnancy or postpartum context, so a postpartum-specific risk score would not be reliable.",
            dataCompleteness: {
              hasConditions: conditions.length > 0,
              hasVitals: allObservations.length > 0,
              hasCoverage: Boolean(coverage),
            },
          },
          confidence: 35,
          sources: [
            ...conditions
              .map((condition) => resourceSource("Condition", condition.id))
              .filter((value): value is string => typeof value === "string"),
            ...(patient ? [`Patient/${patientId}`] : []),
          ],
        }),
        fhirSourceData: JSON.stringify({ conditions, allObservations, medications, patient, coverage }),
      };
    }

    const systolic = allObservations.find((item) => getCodeList(item).includes("8480-6"));
    const diastolic = allObservations.find((item) => getCodeList(item).includes("8462-4"));
    const hemoglobin = allObservations.find((item) => getCodeList(item).includes("718-7"));
    const hemorrhageScore =
      (hasCondition(conditions, /postpartum hemorrhage|o72/) ? 45 : 0) +
      (hasCondition(conditions, /chorioamnionitis|infection/) ? 15 : 0) +
      ((getObservationNumericValue(hemoglobin ?? {}) ?? 99) < 10 ? 20 : 0) +
      (medications.some((medication) =>
        JSON.stringify(medication).toLowerCase().includes("magnesium sulfate"),
      )
        ? 10
        : 0);
    const cardiovascularScore =
      (hasCondition(conditions, /preeclampsia|gestational hypertension|chronic hypertension|o13|o14|o10/) ? 45 : 0) +
      ((getObservationNumericValue(systolic ?? {}) ?? 0) >= 160 ||
      (getObservationNumericValue(diastolic ?? {}) ?? 0) >= 110
        ? 30
        : (getObservationNumericValue(systolic ?? {}) ?? 0) >= 140 ||
            (getObservationNumericValue(diastolic ?? {}) ?? 0) >= 90
          ? 15
          : 0);
    const mentalHealthScore = hasCondition(conditions, /depression|anxiety|f53/) ? 35 : 0;
    const transitionScore =
      patient && Array.isArray(patient.telecom) && patient.telecom.length > 0 ? 10 : 30;

    const coverageCliffDays = daysUntil(
      typeof coverage?.period === "object" && coverage?.period !== null
        ? ((coverage.period as Record<string, unknown>).end as string | undefined)
        : null,
    );
    const riskFlags = [
      ...(coverageCliffDays !== null && coverageCliffDays >= 0 && coverageCliffDays <= 30
        ? ["COVERAGE_CLIFF_IMMINENT"]
        : []),
      ...(cardiovascularScore >= 60 ? ["SEVERE_HYPERTENSION_RISK"] : []),
      ...(hemorrhageScore >= 40 ? ["HEMORRHAGE_HIGH_RISK"] : []),
    ];

    const output = createToolOutput({
      status:
        conditions.length > 0 || allObservations.length > 0 || coverage
          ? "SUCCESS"
          : "PARTIAL",
      data: {
        patientId,
        patientName,
        hemorrhage: {
          score: Math.min(hemorrhageScore, 100),
          level: hemorrhageScore >= 40 ? "HIGH" : hemorrhageScore >= 20 ? "MODERATE" : "LOW",
        },
        cardiovascular: {
          score: Math.min(cardiovascularScore, 100),
          level:
            cardiovascularScore >= 70
              ? "CRITICAL"
              : cardiovascularScore >= 40
                ? "HIGH"
                : cardiovascularScore >= 20
                  ? "MODERATE"
                  : "LOW",
        },
        mentalHealth: {
          score: mentalHealthScore,
          level: mentalHealthScore >= 30 ? "MODERATE" : "LOW",
        },
        transition: {
          score: transitionScore,
          level: transitionScore >= 30 ? "MODERATE" : "LOW",
        },
        coverageCliffDays,
        riskFlags,
        dataCompleteness: {
          hasConditions: conditions.length > 0,
          hasVitals: allObservations.length > 0,
          hasCoverage: Boolean(coverage),
        },
      },
      confidence:
        conditions.length > 0 || allObservations.length > 0 || coverage ? 91 : 45,
      sources: [
        ...conditions
          .map((condition) => resourceSource("Condition", condition.id))
          .filter((value): value is string => typeof value === "string"),
        ...allObservations
          .map((observation) => resourceSource("Observation", observation.id))
          .filter((value): value is string => typeof value === "string"),
        ...(coverage ? [resourceSource("Coverage", coverage.id)].filter((value): value is string => typeof value === "string") : []),
        "ACOG postpartum care guidance",
      ],
    });

    return {
      output,
      fhirSourceData: JSON.stringify({ conditions, allObservations, medications, patient, coverage }),
    };
  }
}
