import * as z from "zod";

import { McpTool, type ToolExecutionResult } from "./base-tool.js";
import type { ToolContext } from "../types/index.js";
import { bundleEntries, FhirClient, firstResource } from "../utils/fhir-client.js";
import { createToolOutput } from "../utils/output-schema.js";
import { getCodeList, getPatientFullName } from "../utils/fhir-utils.js";

const schema = z.object({
  patientId: z.string().optional(),
});

const categoryForCondition = (text: string): string => {
  const normalized = text.toLowerCase();
  if (normalized.includes("depression") || normalized.includes("anxiety")) return "Mental Health";
  if (normalized.includes("preeclampsia") || normalized.includes("hypertension")) return "Cardiovascular";
  if (normalized.includes("diabetes")) return "Metabolic";
  if (normalized.includes("anemia") || normalized.includes("hemorrhage")) return "Hematologic";
  return "General Obstetric";
};

export class GetClinicalConditionsTool extends McpTool<typeof schema> {
  public name = "get_clinical_conditions";
  public description =
    "Returns active maternal clinical conditions and groups them into clinically relevant categories for postpartum care review.";
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
    const [conditionResponse, patientResponse] = await Promise.all([
      client.get("Condition", { patient: patientId, "clinical-status": "active" }),
      client.get("Patient", { _id: patientId }),
    ]);

    let conditions = bundleEntries<Record<string, unknown>>(conditionResponse);
    if (conditions.length === 0) {
      conditions = bundleEntries<Record<string, unknown>>(
        await client.get("Condition", { patient: patientId }),
      );
    }
    const patient = firstResource<Record<string, unknown>>(patientResponse);
    const patientName = patient ? getPatientFullName(patient) : null;

    return {
      output: createToolOutput({
        status: conditions.length > 0 ? "SUCCESS" : "PARTIAL",
        data: {
          patientId,
          patientName,
          conditions: conditions.map((condition) => {
            const text =
              ((condition.code as Record<string, unknown> | undefined)?.text as string | undefined) ??
              "Condition";
            return {
              code: getCodeList(condition)[0] ?? null,
              display: text,
              category: categoryForCondition(text),
              clinicalStatus:
                (Array.isArray((condition.clinicalStatus as Record<string, unknown> | undefined)?.coding)
                  ? (((condition.clinicalStatus as Record<string, unknown> | undefined)?.coding as Array<Record<string, unknown>>)[0]?.code as string | undefined)
                  : undefined) ?? null,
            };
          }),
        },
        confidence: conditions.length > 0 ? 94 : 50,
        sources: conditions
          .map((condition) => (typeof condition.id === "string" ? `Condition/${condition.id}` : null))
          .filter((value): value is string => typeof value === "string")
          .concat("ACOG postpartum risk review"),
        message:
          conditions.length > 0
            ? undefined
            : "No active conditions were found in the available FHIR Condition resources for this patient.",
      }),
      fhirSourceData: JSON.stringify({ patient, conditions }),
    };
  }
}
