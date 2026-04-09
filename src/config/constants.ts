export const FHIR_HEADERS = {
  serverUrl: "x-fhir-server-url",
  accessToken: "x-fhir-access-token",
  patientId: "x-patient-id",
} as const;

export const SERVER_CONFIG = {
  name: "josanshi",
  version: "1.0.0",
} as const;

export const FHIR_CONTEXT_EXTENSION = "ai.promptopinion/fhir-context";

export const CACHE_CONFIG = {
  maxEntries: 500,
  ttlMs: 5 * 60 * 1000,
} as const;

export const SESSION_CONFIG = {
  maxSessions: 50,
  ttlMs: 30 * 60 * 1000,
} as const;
