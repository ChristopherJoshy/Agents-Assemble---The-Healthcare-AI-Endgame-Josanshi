import type { ToolContext } from "../types/index.js";
import { bundleEntries, FhirClient, firstResource } from "./fhir-client.js";
import { getPatientFullName } from "./fhir-utils.js";

export type PatientResourceCollection = {
  patient: Record<string, unknown> | null;
  conditions: Record<string, unknown>[];
  observations: Record<string, unknown>[];
  medications: Record<string, unknown>[];
  allergies: Record<string, unknown>[];
  coverages: Record<string, unknown>[];
  encounters: Record<string, unknown>[];
  procedures: Record<string, unknown>[];
  carePlans: Record<string, unknown>[];
  immunizations: Record<string, unknown>[];
  documentReferences: Record<string, unknown>[];
};

export const collectPatientData = async (
  context: ToolContext,
  patientId: string,
): Promise<PatientResourceCollection> => {
  const client = new FhirClient(context);

  const [
    patientResponse,
    conditionResponse,
    observationResponse,
    medicationResponse,
    allergyResponse,
    coverageResponse,
    encounterResponse,
    procedureResponse,
    carePlanResponse,
    immunizationResponse,
    documentReferenceResponse,
  ] = await Promise.all([
    client.get("Patient", { _id: patientId }).catch(() => null),
    client.get("Condition", { patient: patientId }).catch(() => null),
    client.get("Observation", { patient: patientId, _count: "100" }).catch(() => null),
    client.get("MedicationRequest", { patient: patientId, status: "active" }).catch(() => null),
    client.get("AllergyIntolerance", { patient: patientId }).catch(() => null),
    client.get("Coverage", { patient: patientId, status: "active" }).catch(() => null),
    client.get("Encounter", { patient: patientId, _count: "50" }).catch(() => null),
    client.get("Procedure", { patient: patientId, _count: "50" }).catch(() => null),
    client.get("CarePlan", { patient: patientId, _count: "50" }).catch(() => null),
    client.get("Immunization", { patient: patientId, _count: "50" }).catch(() => null),
    client.get("DocumentReference", { patient: patientId, _count: "50" }).catch(() => null),
  ]);

  return {
    patient: firstResource<Record<string, unknown>>(patientResponse),
    conditions: bundleEntries<Record<string, unknown>>(conditionResponse),
    observations: bundleEntries<Record<string, unknown>>(observationResponse),
    medications: bundleEntries<Record<string, unknown>>(medicationResponse),
    allergies: bundleEntries<Record<string, unknown>>(allergyResponse),
    coverages: bundleEntries<Record<string, unknown>>(coverageResponse),
    encounters: bundleEntries<Record<string, unknown>>(encounterResponse),
    procedures: bundleEntries<Record<string, unknown>>(procedureResponse),
    carePlans: bundleEntries<Record<string, unknown>>(carePlanResponse),
    immunizations: bundleEntries<Record<string, unknown>>(immunizationResponse),
    documentReferences: bundleEntries<Record<string, unknown>>(documentReferenceResponse),
  };
};

export const listAllPatients = async (
  context: ToolContext,
): Promise<Array<{ patientId: string; patientName: string | null; patient: Record<string, unknown> }>> => {
  const client = new FhirClient(context);
  const patients = bundleEntries<Record<string, unknown>>(await client.get("Patient", {}));

  return patients
    .filter((patient) => typeof patient.id === "string" && patient.id.length > 0)
    .map((patient) => ({
      patientId: patient.id as string,
      patientName: getPatientFullName(patient),
      patient,
    }));
};
