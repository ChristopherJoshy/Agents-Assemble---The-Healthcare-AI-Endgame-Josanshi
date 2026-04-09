import * as z from "zod";

import { McpTool, type ToolExecutionResult } from "./base-tool.js";
import type { ToolContext } from "../types/index.js";
import { bundleEntries, FhirClient } from "../utils/fhir-client.js";
import { createToolOutput } from "../utils/output-schema.js";
import { getCodeList, getObservationDate, getObservationNumericValue } from "../utils/fhir-utils.js";

const schema = z.object({
  patientId: z.string().optional(),
});

const VITAL_CODES: Record<string, { code: string; label: string; abnormal: (value: number) => string | null }> = {
  systolic: {
    code: "8480-6",
    label: "Systolic blood pressure",
    abnormal: (value) => (value >= 160 ? "Severe-range systolic blood pressure" : value >= 140 ? "Elevated systolic blood pressure" : null),
  },
  diastolic: {
    code: "8462-4",
    label: "Diastolic blood pressure",
    abnormal: (value) => (value >= 110 ? "Severe-range diastolic blood pressure" : value >= 90 ? "Elevated diastolic blood pressure" : null),
  },
  heartRate: {
    code: "8867-4",
    label: "Heart rate",
    abnormal: (value) => (value > 110 ? "Tachycardia" : value < 50 ? "Bradycardia" : null),
  },
  temperature: {
    code: "8310-5",
    label: "Temperature",
    abnormal: (value) => (value >= 38 ? "Fever" : value <= 36 ? "Hypothermia" : null),
  },
};

export class GetVitalsSnapshotTool extends McpTool<typeof schema> {
  public name = "get_vitals_snapshot";
  public description =
    "Returns the latest maternal vitals snapshot, abnormal flags, and a blood pressure trend signal from recent readings.";
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
    const observations = bundleEntries<Record<string, unknown>>(
      await client.get("Observation", {
        patient: patientId,
        category: "vital-signs",
        _sort: "-date",
        _count: "20",
      }),
    );

    const vitals = Object.entries(VITAL_CODES).flatMap(([key, config]) => {
      const match = observations
        .filter((observation) => getCodeList(observation).includes(config.code))
        .sort((left, right) =>
          new Date(getObservationDate(right) ?? 0).getTime() -
          new Date(getObservationDate(left) ?? 0).getTime(),
        )[0];

      if (!match) {
        return [];
      }

      const value = getObservationNumericValue(match);
      if (value === null) {
        return [];
      }

      return [
        {
          key,
          code: config.code,
          label: config.label,
          value,
          unit: (match.valueQuantity as Record<string, unknown> | undefined)?.unit ?? null,
          date: getObservationDate(match),
          flag: config.abnormal(value),
        },
      ];
    });

    const systolicReadings = observations
      .filter((observation) => getCodeList(observation).includes("8480-6"))
      .map((observation) => ({
        value: getObservationNumericValue(observation),
        date: getObservationDate(observation),
      }))
      .filter((reading): reading is { value: number; date: string | null } => typeof reading.value === "number")
      .sort((left, right) => new Date(left.date ?? 0).getTime() - new Date(right.date ?? 0).getTime());

    const lastThree = systolicReadings.slice(-3);
    const bpTrend =
      lastThree.length === 3 &&
      lastThree[0].value < lastThree[1].value &&
      lastThree[1].value < lastThree[2].value
        ? "RISING"
        : "STABLE";

    return {
      output: createToolOutput({
        status: vitals.length > 0 ? "SUCCESS" : "PARTIAL",
        data: {
          vitals,
          abnormalFlags: vitals.flatMap((vital) => (vital.flag ? [vital.flag] : [])),
          bpTrend,
        },
        confidence: vitals.length > 0 ? 92 : 45,
        sources: observations
          .map((observation) => (typeof observation.id === "string" ? `Observation/${observation.id}` : null))
          .filter((value): value is string => typeof value === "string")
          .concat("ACOG postpartum hypertension guidance"),
        message: vitals.length > 0 ? undefined : "No vital-sign observations were found.",
      }),
      fhirSourceData: JSON.stringify({ observations }),
    };
  }
}
