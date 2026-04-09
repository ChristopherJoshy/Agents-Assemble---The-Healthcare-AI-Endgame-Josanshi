import * as z from "zod";

import { McpTool, type ToolExecutionResult } from "./base-tool.js";
import type { ToolContext } from "../types/index.js";
import { FhirClient, firstResource } from "../utils/fhir-client.js";
import { getPatientFullName } from "../utils/fhir-utils.js";
import { createToolOutput } from "../utils/output-schema.js";

const schema = z.object({
  patientId: z.string(),
});

export class PatientIdToNameTool extends McpTool<typeof schema> {
  public name = "patient_id_to_name";
  public description =
    "Resolves a patient ID to a human-readable patient name and basic identity details when a workflow only has an internal ID.";
  public inputSchema = schema;

  protected async execute(
    context: ToolContext,
    input: z.infer<typeof schema>,
  ): Promise<ToolExecutionResult> {
    const client = new FhirClient(context);
    const patient = firstResource<Record<string, unknown>>(
      await client.get("Patient", { _id: input.patientId }),
    );

    return {
      output: createToolOutput({
        status: patient ? "SUCCESS" : "PARTIAL",
        data: {
          patientId: input.patientId,
          patientName: patient ? getPatientFullName(patient) : null,
          dateOfBirth: patient && typeof patient.birthDate === "string" ? patient.birthDate : null,
          gender: patient && typeof patient.gender === "string" ? patient.gender : null,
        },
        confidence: patient ? 95 : 40,
        sources: patient ? [`Patient/${input.patientId}`] : [],
        message: patient ? undefined : "Patient ID could not be resolved to a Patient resource.",
      }),
      fhirSourceData: JSON.stringify({ patient }),
    };
  }
}
