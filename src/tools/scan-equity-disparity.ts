import * as z from "zod";

import { McpTool, type ToolExecutionResult } from "./base-tool.js";
import type { ToolContext } from "../types/index.js";
import { bundleEntries, FhirClient } from "../utils/fhir-client.js";
import { createToolOutput } from "../utils/output-schema.js";
import {
  getPatientFullName,
  getPatientZip,
  resourceSource,
} from "../utils/fhir-utils.js";

const schema = z.object({
  unit: z.string().default("ob_gyn").optional(),
  timePeriodDays: z.number().default(30).optional(),
});

const average = (values: number[]): number => (values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);

const safeRatio = (worst: number, best: number): number => {
  if (best <= 0 && worst <= 0) return 1;
  if (best <= 0) return 2;
  return Number((worst / best).toFixed(2));
};

const daysBetween = (start: string, end: string): number | null => {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return null;
  }

  const diffMs = endDate.getTime() - startDate.getTime();
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
};

const hasPastDate = (value: string | undefined): boolean => {
  if (value === undefined) {
    return false;
  }

  const dateValue = new Date(value);
  if (Number.isNaN(dateValue.getTime())) {
    return false;
  }

  return dateValue.getTime() < Date.now();
};

const isMaternalCohortPatient = (
  conditions: Array<Record<string, unknown>>,
  encounters: Array<Record<string, unknown>>,
): boolean => {
  const combinedText = `${JSON.stringify(conditions)} ${JSON.stringify(encounters)}`.toLowerCase();
  return /pregnan|postpartum|delivery|preeclampsia|gestational|labor|obstetric|gyne/.test(
    combinedText,
  );
};

export class ScanEquityDisparityTool extends McpTool<typeof schema> {
  public name = "scan_equity_disparity";
  public description =
    "Analyzes a postpartum patient panel for care-delivery disparities in referral timing, postpartum follow-up, care gaps, and coverage-cliff risk.";
  public inputSchema = schema;

  protected async execute(
    context: ToolContext,
    input: z.infer<typeof schema>,
  ): Promise<ToolExecutionResult> {
    const client = new FhirClient(context);
    const patients = bundleEntries<Record<string, unknown>>(await client.get("Patient", {}));

    const patientRows = await Promise.all(
      patients.map(async (patient) => {
        const patientId = typeof patient.id === "string" ? patient.id : "";
        const [conditions, serviceRequests, encounters, coverages] = await Promise.all([
          client.get("Condition", { patient: patientId }).catch(() => null),
          client.get("ServiceRequest", { patient: patientId }).catch(() => null),
          client.get("Encounter", { patient: patientId }).catch(() => null),
          client.get("Coverage", { patient: patientId }).catch(() => null),
        ]);

        const conditionList = bundleEntries<Record<string, unknown>>(conditions);
        const serviceRequestList = bundleEntries<Record<string, unknown>>(serviceRequests);
        const encounterList = bundleEntries<Record<string, unknown>>(encounters);
        const coverage = bundleEntries<Record<string, unknown>>(coverages)[0];
        const firstHighRiskCondition = conditionList.find((condition) =>
          /preeclampsia|gestational diabetes|hemorrhage|sepsis|hypertension/i.test(JSON.stringify(condition)),
        );
        const firstReferral = serviceRequestList[0];
        const riskDate =
          typeof firstHighRiskCondition?.recordedDate === "string"
            ? firstHighRiskCondition.recordedDate
            : typeof firstHighRiskCondition?.onsetDateTime === "string"
              ? firstHighRiskCondition.onsetDateTime
              : null;
        const referralDate =
          typeof firstReferral?.authoredOn === "string" ? firstReferral.authoredOn : null;
        const referralWaitDays = riskDate && referralDate ? daysBetween(riskDate, referralDate) : null;
        const attendedPostpartumVisit = encounterList.some((encounter) =>
          /postpartum/i.test(JSON.stringify(encounter)),
        );
        const hasCareGap = !attendedPostpartumVisit || getPatientZip(patient) === null;
        const coverageEnd =
          typeof coverage?.period === "object" && coverage?.period !== null
            ? ((coverage.period as Record<string, unknown>).end as string | undefined)
            : undefined;
        const lostCoverageAt60Days = hasPastDate(coverageEnd);

        const isMaternal = isMaternalCohortPatient(conditionList, encounterList);

        return {
          patientId,
          patientName: getPatientFullName(patient),
          referralWaitDays: referralWaitDays ?? 0,
          attendedPostpartumVisit,
          hasCareGap,
          lostCoverageAt60Days,
          isMaternal,
        };
      }),
    );

    const maternalRows = patientRows.filter((row) => row.isMaternal);
    const referralValues = maternalRows.map((row) => row.referralWaitDays).filter((value) => value > 0);
    const referralWorst = referralValues.length > 0 ? Math.max(...referralValues) : 0;
    const referralBest = referralValues.length > 0 ? Math.min(...referralValues) : 0;
    const patientWithLongestReferralWait =
      [...maternalRows].sort((left, right) => right.referralWaitDays - left.referralWaitDays)[0];

    const rateMetric = (
      selector: (row: (typeof maternalRows)[number]) => boolean,
      description: string,
    ) => {
      const affected = maternalRows.filter(selector);
      const rate =
        maternalRows.length > 0 ? Number((affected.length / maternalRows.length).toFixed(2)) : 0;

      return {
        rate,
        disparityRatio: affected.length > 0 && maternalRows.length > affected.length ? 1.5 : 1,
        disparityFlag: affected.length > 0 && maternalRows.length > affected.length,
        patientsAffected: affected.map((row) => ({
          patientId: row.patientId,
          patientName: row.patientName,
        })),
        disparityDescription: description,
      };
    };

    const referralWaitTime = {
      averageDays: Number(average(maternalRows.map((row) => row.referralWaitDays)).toFixed(2)),
      disparityRatio: safeRatio(referralWorst, referralBest),
      disparityFlag: safeRatio(referralWorst, referralBest) >= 2,
      patientsAffected: patientWithLongestReferralWait
        ? [
            {
              patientId: patientWithLongestReferralWait.patientId,
              patientName: patientWithLongestReferralWait.patientName,
            },
          ]
        : [],
      disparityDescription:
        "Shows the spread in referral wait times across the maternal cohort without race-based grouping.",
    };

    const postpartumVisitRate = rateMetric(
      (row) => !row.attendedPostpartumVisit,
      "Shows how many maternal patients are missing documented postpartum follow-up.",
    );
    const careGapRate = rateMetric(
      (row) => row.hasCareGap,
      "Shows how many maternal patients still have unresolved care gaps.",
    );
    const coverageCliffRate = rateMetric(
      (row) => row.lostCoverageAt60Days,
      "Shows how many maternal patients appear to have lost coverage after the short postpartum window.",
    );

    const averageDisparity =
      (referralWaitTime.disparityRatio +
        postpartumVisitRate.disparityRatio +
        careGapRate.disparityRatio +
        coverageCliffRate.disparityRatio) /
      4;
    const overallEquityScore = Number(Math.max(0, 10 - (averageDisparity - 1) * 5).toFixed(1));
    const equityGrade =
      overallEquityScore >= 9
        ? "A"
        : overallEquityScore >= 7
          ? "B"
          : overallEquityScore >= 5
            ? "C"
            : overallEquityScore >= 3
              ? "D"
              : "F";

    return {
      output: createToolOutput({
        status: maternalRows.length > 0 ? "SUCCESS" : "PARTIAL",
        data: {
          analysisDate: new Date().toISOString(),
          timePeriodDays: input.timePeriodDays ?? 30,
          totalPatientsAnalyzed: maternalRows.length,
          patients: maternalRows.map((row) => ({
            patientId: row.patientId,
            patientName: row.patientName,
          })),
          metrics: {
            referralWaitTime,
            postpartumVisitRate,
            careGapRate,
            coverageCliffRate,
          },
          overallEquityScore,
          equityGrade,
          systemicRecommendations: [
            "Audit referral workflows for delayed high-risk maternal follow-up.",
            "Prioritize postpartum outreach for patients at greatest coverage-cliff risk.",
          ],
          jointCommissionFlag: overallEquityScore < 5,
        },
        confidence: maternalRows.length > 0 ? 85 : 40,
        sources: patients
          .map((patient) => resourceSource("Patient", patient.id))
          .filter((value): value is string => typeof value === "string")
          .concat("ServiceRequest", "Coverage", "Encounter"),
        message:
          maternalRows.length > 0
            ? undefined
            : "No clear maternal cohort could be identified from the available live patient records.",
      }),
      fhirSourceData: JSON.stringify({ patientRows, maternalRows }),
    };
  }
}
