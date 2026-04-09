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

const hasText = (resources: Array<Record<string, unknown>>, pattern: RegExp): boolean =>
  resources.some((resource) => pattern.test(JSON.stringify(resource).toLowerCase()));

export class AssessCardiacRiskTool extends McpTool<typeof schema> {
  public name = "assess_cardiac_risk";
  public description =
    "Assesses postpartum cardiovascular risk using ACOG PB 222-style tiering and maternal warning signs.";
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
    const [conditions, observations, medications, patientResponse] = await Promise.all([
      client.get("Condition", { patient: patientId }),
      client.get("Observation", { patient: patientId, _count: "20" }),
      client.get("MedicationRequest", { patient: patientId, status: "active" }),
      client.get("Patient", { _id: patientId }),
    ]);

    const conditionList = bundleEntries<Record<string, unknown>>(conditions);
    const observationList = bundleEntries<Record<string, unknown>>(observations);
    const medicationList = bundleEntries<Record<string, unknown>>(medications);
    const patient = firstResource<Record<string, unknown>>(patientResponse);
    const patientName = patient ? getPatientFullName(patient) : null;

    const systolic = observationList.find((observation) => getCodeList(observation).includes("8480-6"));
    const diastolic = observationList.find((observation) => getCodeList(observation).includes("8462-4"));
    const bnp = observationList.find((observation) =>
      getCodeList(observation).some((code) => ["30934-4", "33914-3"].includes(code)),
    );

    const severeHypertension =
      (getObservationNumericValue(systolic ?? {}) ?? 0) >= 160 ||
      (getObservationNumericValue(diastolic ?? {}) ?? 0) >= 110;
    const elevatedHypertension =
      (getObservationNumericValue(systolic ?? {}) ?? 0) >= 140 ||
      (getObservationNumericValue(diastolic ?? {}) ?? 0) >= 90;
    const significantHistory = hasText(
      conditionList,
      /preeclampsia|chronic hypertension|gestational hypertension|cardiomyopathy|heart failure/,
    );
    const antihypertensives = medicationList.filter((medication) =>
      /labetalol|nifedipine|hydralazine/.test(JSON.stringify(medication).toLowerCase()),
    );

    const tier = severeHypertension || hasText(conditionList, /cardiomyopathy|heart failure/)
      ? "Tier 3"
      : significantHistory || elevatedHypertension || (getObservationNumericValue(bnp ?? {}) ?? 0) > 100
        ? "Tier 2"
        : "Tier 1";

    const riskScore = tier === "Tier 3" ? 8 : tier === "Tier 2" ? 5 : 1;

    return {
      output: createToolOutput({
        status: "SUCCESS",
        data: {
          patientId,
          patientName,
          tier,
          riskScore,
          riskLevel: tier === "Tier 3" ? "HIGH" : tier === "Tier 2" ? "MODERATE" : "LOW",
          drivers: [
            ...(significantHistory ? ["Hypertensive or structural cardiovascular history"] : []),
            ...(elevatedHypertension ? ["Elevated postpartum blood pressure"] : []),
            ...(severeHypertension ? ["Severe-range blood pressure"] : []),
            ...(antihypertensives.length > 0 ? ["Active antihypertensive therapy"] : []),
          ],
          recommendation:
            tier === "Tier 3"
              ? "Urgent specialist review or inpatient-level escalation is recommended."
              : tier === "Tier 2"
                ? "Close postpartum blood-pressure and cardiovascular follow-up is recommended."
                : "Routine postpartum cardiovascular surveillance is appropriate.",
        },
        confidence: 93,
        sources: [
          ...conditionList
            .map((condition) => resourceSource("Condition", condition.id))
            .filter((value): value is string => typeof value === "string"),
          ...observationList
            .map((observation) => resourceSource("Observation", observation.id))
            .filter((value): value is string => typeof value === "string"),
          "ACOG PB 222 cardiovascular disease in pregnancy",
        ],
      }),
      fhirSourceData: JSON.stringify({ patient, conditionList, observationList, medicationList }),
    };
  }
}
