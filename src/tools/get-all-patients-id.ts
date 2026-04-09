import * as z from "zod";

import { McpTool, type ToolExecutionResult } from "./base-tool.js";
import type { ToolContext } from "../types/index.js";
import { createToolOutput } from "../utils/output-schema.js";
import { listAllPatients } from "../utils/patient-data.js";

const schema = z.object({});

export class GetAllPatientsIdTool extends McpTool<typeof schema> {
  public name = "get_all_patients_id";
  public description =
    "Returns all available patient IDs in the active FHIR context for downstream value-based tool calls.";
  public inputSchema = schema;

  protected async execute(
    context: ToolContext,
    _input: z.infer<typeof schema>,
  ): Promise<ToolExecutionResult> {
    const patients = await listAllPatients(context);

    const data = patients.map((patient) => ({
      patientId: patient.patientId,
      patientName: patient.patientName,
    }));

    return {
      output: createToolOutput({
        status: "SUCCESS",
        data: {
          totalPatients: data.length,
          patients: data,
        },
        confidence: 95,
        sources: ["Live FHIR Patient Data"],
      }),
      fhirSourceData: JSON.stringify(data),
    };
  }
}
