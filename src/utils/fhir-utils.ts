import { differenceInDays, differenceInYears, parseISO } from "date-fns";

import type { ToolOutput } from "./output-schema.js";

type JsonRecord = Record<string, unknown>;

export const calculateAge = (dob: string): number =>
  Number.isNaN(Date.parse(dob)) ? 0 : differenceInYears(new Date(), parseISO(dob));

export const daysUntil = (date: string | null | undefined): number | null => {
  if (!date || Number.isNaN(Date.parse(date))) {
    return null;
  }

  return differenceInDays(parseISO(date), new Date());
};

export const daysSince = (date: string | null | undefined): number | null => {
  if (!date || Number.isNaN(Date.parse(date))) {
    return null;
  }

  return differenceInDays(new Date(), parseISO(date));
};

export const getNestedValue = (value: unknown, path: string[]): unknown => {
  let current = value;

  for (const part of path) {
    if (typeof current !== "object" || current === null || !(part in current)) {
      return undefined;
    }

    current = (current as JsonRecord)[part];
  }

  return current;
};

export const getCodeList = (resource: JsonRecord): string[] =>
  [
    ...(Array.isArray(getNestedValue(resource, ["code", "coding"]))
      ? (getNestedValue(resource, ["code", "coding"]) as JsonRecord[])
      : []),
    ...(Array.isArray(getNestedValue(resource, ["vaccineCode", "coding"]))
      ? (getNestedValue(resource, ["vaccineCode", "coding"]) as JsonRecord[])
      : []),
  ]
    .map((coding) => coding.code)
    .filter((value): value is string => typeof value === "string");

export const getObservationNumericValue = (resource: JsonRecord): number | null => {
  const quantityValue = getNestedValue(resource, ["valueQuantity", "value"]);
  if (typeof quantityValue === "number") {
    return quantityValue;
  }

  const integerValue = getNestedValue(resource, ["valueInteger"]);
  if (typeof integerValue === "number") {
    return integerValue;
  }

  const stringValue = getNestedValue(resource, ["valueString"]);
  if (typeof stringValue === "string") {
    const parsed = Number(stringValue);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

export const getObservationDate = (resource: JsonRecord): string | null => {
  const candidates = [
    getNestedValue(resource, ["effectiveDateTime"]),
    getNestedValue(resource, ["issued"]),
    getNestedValue(resource, ["period", "start"]),
    getNestedValue(resource, ["authoredOn"]),
    getNestedValue(resource, ["occurrenceDateTime"]),
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && !Number.isNaN(Date.parse(candidate))) {
      return candidate;
    }
  }

  return null;
};

export const getPatientZip = (patient: JsonRecord): string | null => {
  const zip = getNestedValue(patient, ["address", "0", "postalCode"]);
  if (typeof zip === "string") {
    const normalized = zip.match(/\d{5}/)?.[0];
    return normalized ?? null;
  }

  const addresses = Array.isArray(patient.address) ? (patient.address as JsonRecord[]) : [];
  for (const address of addresses) {
    if (typeof address.postalCode === "string") {
      const normalized = address.postalCode.match(/\d{5}/)?.[0];
      if (normalized) {
        return normalized;
      }
    }
  }

  return null;
};

export const getPatientState = (patient: JsonRecord): string | null => {
  const addresses = Array.isArray(patient.address) ? (patient.address as JsonRecord[]) : [];
  for (const address of addresses) {
    if (typeof address.state === "string" && address.state.length === 2) {
      return address.state.toUpperCase();
    }
  }

  return null;
};

export const getPatientFullName = (patient: JsonRecord): string | null => {
  const names = Array.isArray(patient.name) ? (patient.name as JsonRecord[]) : [];
  const primaryName = names[0];

  if (!primaryName) {
    return null;
  }

  const given = Array.isArray(primaryName.given)
    ? (primaryName.given as unknown[])
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .join(" ")
    : "";
  const family = typeof primaryName.family === "string" ? primaryName.family : "";
  const fullName = `${given} ${family}`.trim();

  return fullName.length > 0 ? fullName : null;
};

export const addSource = (sources: Set<string>, value: string | null | undefined): void => {
  if (typeof value === "string" && value.length > 0) {
    sources.add(value);
  }
};

export const resourceSource = (resourceType: string, id: unknown): string | null =>
  typeof id === "string" && id.length > 0 ? `${resourceType}/${id}` : null;

export const outputError = (message: string): ToolOutput => ({
  status: "ERROR",
  data: null,
  confidence: 0,
  sources: [],
  timestamp: new Date().toISOString(),
  toolVersion: "1.0.0",
  message,
});
