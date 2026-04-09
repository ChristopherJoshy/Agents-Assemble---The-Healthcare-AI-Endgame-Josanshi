import * as z from "zod";

import { McpTool, type ToolExecutionResult } from "./base-tool.js";
import type { ToolContext } from "../types/index.js";
import { bundleEntries, firstResource, FhirClient } from "../utils/fhir-client.js";
import { createToolOutput } from "../utils/output-schema.js";
import {
  daysSince,
  daysUntil,
  getCodeList,
  getPatientFullName,
  getPatientState,
  resourceSource,
} from "../utils/fhir-utils.js";
import { readJsonData } from "../utils/data-loader.js";

const schema = z.object({
  patientId: z.string().optional(),
});

type StateExtensionMap = Record<
  string,
  { extendedTo12Months: boolean; extensionEnrollmentUrl: string }
>;

const findDeliveryDate = (
  conditions: Array<Record<string, unknown>>,
  procedures: Array<Record<string, unknown>>,
): string | null => {
  const conditionMatch = conditions.find((condition) =>
    getCodeList(condition).some((code) => ["O80", "O82"].includes(code)),
  );
  if (typeof conditionMatch?.recordedDate === "string") {
    return conditionMatch.recordedDate;
  }

  const procedureMatch = procedures.find((procedure) =>
    getCodeList(procedure).some((code) => ["59400", "59510"].includes(code)),
  );
  return typeof procedureMatch?.performedDateTime === "string"
    ? procedureMatch.performedDateTime
    : null;
};

export class TrackCoverageCliffTool extends McpTool<typeof schema> {
  public name = "track_coverage_cliff";
  public description =
    "Monitors the postpartum Medicaid coverage cliff, outstanding postpartum screenings, and state-specific extension protections.";
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
    const stateExtensionMap = await readJsonData<StateExtensionMap>(
      "data/state-medicaid-extensions.json",
    );

    const [
      coverageResponse,
      patientResponse,
      conditionResponse,
      procedureResponse,
      observationResponse,
      carePlanResponse,
      encounterResponse,
    ] = await Promise.all([
      client.get("Coverage", { patient: patientId, status: "active" }),
      client.get("Patient", { _id: patientId }),
      client.get("Condition", { patient: patientId }),
      client.get("Procedure", { patient: patientId }),
      client.get("Observation", { patient: patientId, _count: "50" }),
      client.get("CarePlan", { patient: patientId }),
      client.get("Encounter", { patient: patientId }),
    ]);

    const coverage = firstResource<Record<string, unknown>>(coverageResponse);
    const patient = firstResource<Record<string, unknown>>(patientResponse);
    const conditions = bundleEntries<Record<string, unknown>>(conditionResponse);
    const procedures = bundleEntries<Record<string, unknown>>(procedureResponse);
    const observations = bundleEntries<Record<string, unknown>>(observationResponse);
    const carePlans = bundleEntries<Record<string, unknown>>(carePlanResponse);
    const encounters = bundleEntries<Record<string, unknown>>(encounterResponse);

    const deliveryDate = findDeliveryDate(conditions, procedures);
    const postpartumDays = daysSince(deliveryDate);
    const medicaidExpiryDate =
      typeof coverage?.period === "object" && coverage?.period !== null
        ? ((coverage.period as Record<string, unknown>).end as string | undefined) ?? null
        : null;
    const daysUntilExpiry = daysUntil(medicaidExpiryDate);
    const alreadyExpired = daysUntilExpiry !== null && daysUntilExpiry < 0;
    const patientState = patient ? getPatientState(patient) : null;
    const extension = patientState ? stateExtensionMap[patientState] : undefined;
    const stateExtendedTo12Months = extension?.extendedTo12Months ?? false;

    const outstandingScreeningsBeforeExpiry: Array<{
      screeningName: string;
      dueBy: string;
      urgency: "HIGH" | "MEDIUM" | "LOW";
    }> = [];

    const epdsDone = observations.some((observation) => getCodeList(observation).includes("71354-5"));
    if (!epdsDone) {
      outstandingScreeningsBeforeExpiry.push({
        screeningName: "Edinburgh Postnatal Depression Scale",
        dueBy: medicaidExpiryDate ?? "Unknown",
        urgency: "HIGH",
      });
    }

    const hypertensiveHistory = conditions.some((condition) =>
      /preeclampsia|gestational hypertension|chronic hypertension|o13|o14|o10/i.test(
        JSON.stringify(condition),
      ),
    );
    const bloodPressureCheckDone = observations.some((observation) =>
      getCodeList(observation).some((code) => ["8480-6", "8462-4"].includes(code)),
    );
    if (hypertensiveHistory && !bloodPressureCheckDone) {
      outstandingScreeningsBeforeExpiry.push({
        screeningName: "Postpartum blood pressure check",
        dueBy: medicaidExpiryDate ?? "Unknown",
        urgency: "HIGH",
      });
    }

    const contraceptionCounselingDone = carePlans.some((carePlan) =>
      /contraception|family planning/i.test(JSON.stringify(carePlan)),
    );
    if (!contraceptionCounselingDone) {
      outstandingScreeningsBeforeExpiry.push({
        screeningName: "Contraception counseling",
        dueBy: medicaidExpiryDate ?? "Unknown",
        urgency: "MEDIUM",
      });
    }

    const postpartumVisitDone = encounters.some((encounter) => {
      const period = encounter.period as Record<string, unknown> | undefined;
      return typeof period?.start === "string" && postpartumDays !== null;
    });
    if (!postpartumVisitDone) {
      outstandingScreeningsBeforeExpiry.push({
        screeningName: "Postpartum follow-up visit",
        dueBy: medicaidExpiryDate ?? "Unknown",
        urgency: "HIGH",
      });
    }

    const cardiovascularRiskNeeded = conditions.some((condition) =>
      /preeclampsia|gestational diabetes|gdm/i.test(JSON.stringify(condition)),
    );
    const cardiovascularRiskDone = observations.some((observation) =>
      getCodeList(observation).some((code) => ["8480-6", "8462-4", "39156-5"].includes(code)),
    );
    if (cardiovascularRiskNeeded && !cardiovascularRiskDone) {
      outstandingScreeningsBeforeExpiry.push({
        screeningName: "Cardiovascular risk screening",
        dueBy: medicaidExpiryDate ?? "Unknown",
        urgency: "MEDIUM",
      });
    }

    const urgency =
      daysUntilExpiry !== null && daysUntilExpiry <= 10 && outstandingScreeningsBeforeExpiry.length > 0
        ? "CRITICAL"
        : daysUntilExpiry !== null && daysUntilExpiry <= 30 && outstandingScreeningsBeforeExpiry.length > 0
          ? "HIGH"
          : (daysUntilExpiry !== null && daysUntilExpiry <= 60) || outstandingScreeningsBeforeExpiry.length > 0
            ? "MEDIUM"
            : stateExtendedTo12Months && outstandingScreeningsBeforeExpiry.length === 0
              ? "LOW"
              : "MEDIUM";

    const patientName = patient ? getPatientFullName(patient) : null;

    return {
      output: createToolOutput({
        status: coverage || deliveryDate ? "SUCCESS" : "PARTIAL",
        data: {
          patientId,
          patientName,
          deliveryDate,
          postpartumDays,
          medicaidExpiryDate,
          daysUntilExpiry,
          alreadyExpired,
          stateExtendedTo12Months,
          stateExtensionEnrollmentUrl: extension?.extensionEnrollmentUrl ?? null,
          outstandingScreeningsBeforeExpiry,
          urgency,
          recommendedActions: [
            ...(urgency === "CRITICAL" ? ["Contact patient immediately to close screenings before coverage ends."] : []),
            ...(!stateExtendedTo12Months && extension?.extensionEnrollmentUrl
              ? [`Review state extension options: ${extension.extensionEnrollmentUrl}`]
              : []),
          ],
        },
        confidence: 90,
        sources: [
          ...(coverage ? [resourceSource("Coverage", coverage.id)].filter((value): value is string => typeof value === "string") : []),
          ...(patient ? [resourceSource("Patient", patient.id)].filter((value): value is string => typeof value === "string") : []),
          ...encounters
            .map((encounter) => resourceSource("Encounter", encounter.id))
            .filter((value): value is string => typeof value === "string"),
          "state-medicaid-extensions.json",
        ],
      }),
      fhirSourceData: JSON.stringify({
        coverage,
        patient,
        conditions,
        procedures,
        observations,
        carePlans,
        encounters,
      }),
    };
  }
}
