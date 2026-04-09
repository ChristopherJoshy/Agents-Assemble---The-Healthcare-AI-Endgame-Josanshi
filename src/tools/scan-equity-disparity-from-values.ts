import * as z from "zod";

import { McpTool, type ToolExecutionResult } from "./base-tool.js";
import type { ToolContext } from "../types/index.js";
import { createToolOutput } from "../utils/output-schema.js";

const patientSchema = z.object({
  demographicGroup: z.string().min(1),
  referralWaitDays: z.number().min(0).optional(),
  postpartumVisitCompleted: z.boolean().optional(),
  careGapCount: z.number().min(0).optional(),
  lostCoverageWithin60Days: z.boolean().optional(),
  severeOutcome: z.boolean().optional(),
});

const schema = z.object({
  patients: z.array(patientSchema).min(2),
  panelName: z.string().optional(),
});

type PatientInput = z.infer<typeof patientSchema>;

type GroupMetric = {
  group: string;
  patientCount: number;
  avgReferralWaitDays: number;
  missingPostpartumVisitRate: number;
  careGapRate: number;
  coverageLossRate: number;
  severeOutcomeRate: number;
};

const average = (values: number[]): number =>
  values.length === 0 ? 0 : Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));

const rate = (numerator: number, denominator: number): number =>
  denominator === 0 ? 0 : Number((numerator / denominator).toFixed(2));

const disparityRatio = (values: number[]): number => {
  if (values.length === 0) return 1;

  const sorted = values.filter((value) => value >= 0).sort((a, b) => a - b);
  if (sorted.length === 0) return 1;

  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  if (best === 0 && worst === 0) return 1;
  if (best === 0 && worst > 0) return 2;

  return Number((worst / best).toFixed(2));
};

const calculateGroupMetrics = (patients: PatientInput[]): GroupMetric[] => {
  const groups = new Map<string, PatientInput[]>();

  for (const patient of patients) {
    const rows = groups.get(patient.demographicGroup) ?? [];
    rows.push(patient);
    groups.set(patient.demographicGroup, rows);
  }

  return [...groups.entries()].map(([group, rows]) => {
    const referralValues = rows
      .map((row) => row.referralWaitDays)
      .filter((value): value is number => typeof value === "number");

    const missingPostpartumVisitCount = rows.filter(
      (row) => row.postpartumVisitCompleted === false,
    ).length;
    const careGapCount = rows.filter((row) => (row.careGapCount ?? 0) > 0).length;
    const coverageLossCount = rows.filter((row) => row.lostCoverageWithin60Days === true).length;
    const severeOutcomeCount = rows.filter((row) => row.severeOutcome === true).length;

    return {
      group,
      patientCount: rows.length,
      avgReferralWaitDays: average(referralValues),
      missingPostpartumVisitRate: rate(missingPostpartumVisitCount, rows.length),
      careGapRate: rate(careGapCount, rows.length),
      coverageLossRate: rate(coverageLossCount, rows.length),
      severeOutcomeRate: rate(severeOutcomeCount, rows.length),
    };
  });
};

export class ScanEquityDisparityFromValuesTool extends McpTool<typeof schema> {
  public name = "scan_equity_disparity_from_values";
  public description =
    "Computes equity disparity metrics across demographic groups from patient-level maternal care values supplied by the agent.";
  public inputSchema = schema;

  protected async execute(
    _context: ToolContext,
    input: z.infer<typeof schema>,
  ): Promise<ToolExecutionResult> {
    await Promise.resolve();

    const groupMetrics = calculateGroupMetrics(input.patients);

    const referralRatio = disparityRatio(groupMetrics.map((metric) => metric.avgReferralWaitDays));
    const missingVisitRatio = disparityRatio(groupMetrics.map((metric) => metric.missingPostpartumVisitRate));
    const careGapRatio = disparityRatio(groupMetrics.map((metric) => metric.careGapRate));
    const coverageLossRatio = disparityRatio(groupMetrics.map((metric) => metric.coverageLossRate));
    const severeOutcomeRatio = disparityRatio(groupMetrics.map((metric) => metric.severeOutcomeRate));

    const overallDisparityIndex = Number(
      (
        (referralRatio + missingVisitRatio + careGapRatio + coverageLossRatio + severeOutcomeRatio) /
        5
      ).toFixed(2),
    );

    const highDisparity = overallDisparityIndex >= 1.5;

    return {
      output: createToolOutput({
        status: "SUCCESS",
        data: {
          panelName: input.panelName ?? null,
          totalPatients: input.patients.length,
          groupsAnalyzed: groupMetrics.length,
          groupMetrics,
          disparityMetrics: {
            referralWaitDisparityRatio: referralRatio,
            missingPostpartumVisitDisparityRatio: missingVisitRatio,
            careGapDisparityRatio: careGapRatio,
            coverageLossDisparityRatio: coverageLossRatio,
            severeOutcomeDisparityRatio: severeOutcomeRatio,
          },
          overallDisparityIndex,
          highDisparity,
          recommendation: highDisparity
            ? "Equity-focused workflow intervention is recommended for highest-risk groups."
            : "No major group-level disparity signal from provided values.",
        },
        confidence: 90,
        sources: ["Agent-provided patient-level equity values"],
      }),
      fhirSourceData: JSON.stringify(input),
    };
  }
}
