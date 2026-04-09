import * as z from "zod";

import { McpTool, type ToolExecutionResult } from "./base-tool.js";
import type { ToolContext } from "../types/index.js";
import { firstResource, FhirClient } from "../utils/fhir-client.js";
import { calculateAge } from "../utils/fhir-utils.js";
import { createToolOutput } from "../utils/output-schema.js";

const schema = z.object({
  patientId: z.string().optional(),
});

export class GetPatientDemographicsTool extends McpTool<typeof schema> {
  public name = "get_patient_demographics";
  public description =
    "Returns structured patient demographics from the current FHIR context, including language, address, and identifiers.";
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
    const patient = firstResource<Record<string, unknown>>(
      await client.get("Patient", { _id: patientId }),
    );

    if (!patient) {
      return {
        output: createToolOutput({
          status: "PARTIAL",
          data: {
            patientId,
            name: null,
            age: null,
            dob: null,
            gender: null,
            preferredLanguage: null,
            address: null,
            zip: null,
            phone: null,
            mrn: null,
          },
          confidence: 30,
          sources: [],
          message: "Patient resource was not found.",
        }),
        fhirSourceData: "{}",
      };
    }

    const name = Array.isArray(patient.name) ? (patient.name[0] as Record<string, unknown>) : {};
    const fullName = `${Array.isArray(name?.given) ? (name.given as string[]).join(" ") : ""} ${typeof name?.family === "string" ? name.family : ""}`.trim();
    const addresses = Array.isArray(patient.address)
      ? (patient.address as Array<Record<string, unknown>>)
      : [];
    const telecom = Array.isArray(patient.telecom)
      ? (patient.telecom as Array<Record<string, unknown>>)
      : [];
    const identifiers = Array.isArray(patient.identifier)
      ? (patient.identifier as Array<Record<string, unknown>>)
      : [];
    const communication = Array.isArray(patient.communication)
      ? (patient.communication as Array<Record<string, unknown>>)
      : [];
    const primaryAddress = addresses[0] ?? {};
    const preferredLanguage =
      (communication[0]?.language as Record<string, unknown> | undefined)?.text ??
      (Array.isArray((communication[0]?.language as Record<string, unknown> | undefined)?.coding)
        ? (((communication[0]?.language as Record<string, unknown> | undefined)?.coding as Array<Record<string, unknown>>)[0]?.display as string | undefined)
        : undefined) ??
      null;
    const mrn =
      identifiers.find((identifier) => {
        const coding = Array.isArray((identifier.type as Record<string, unknown> | undefined)?.coding)
          ? (((identifier.type as Record<string, unknown> | undefined)?.coding as Array<Record<string, unknown>>)[0] ?? {})
          : {};
        return coding.code === "MR";
      })?.value ?? null;

    return {
      output: createToolOutput({
        status: "SUCCESS",
        data: {
          patientId,
          name: fullName || null,
          age: typeof patient.birthDate === "string" ? calculateAge(patient.birthDate) : null,
          dob: typeof patient.birthDate === "string" ? patient.birthDate : null,
          gender: typeof patient.gender === "string" ? patient.gender : null,
          preferredLanguage: typeof preferredLanguage === "string" ? preferredLanguage : null,
          address:
            typeof primaryAddress.text === "string"
              ? primaryAddress.text
              : [primaryAddress.line, primaryAddress.city, primaryAddress.state]
                  .flat()
                  .filter((value) => typeof value === "string")
                  .join(", ") || null,
          zip: typeof primaryAddress.postalCode === "string" ? primaryAddress.postalCode : null,
          phone:
            (telecom.find((item) => item.system === "phone")?.value as string | undefined) ?? null,
          mrn: typeof mrn === "string" ? mrn : null,
        },
        confidence: 95,
        sources: [`Patient/${patientId}`, "US Core Patient Profile"],
      }),
      fhirSourceData: JSON.stringify({ patient }),
    };
  }
}
