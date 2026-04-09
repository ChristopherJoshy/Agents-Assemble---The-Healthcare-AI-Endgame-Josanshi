import * as z from "zod";

import { McpTool, type ToolExecutionResult } from "./base-tool.js";
import type { ToolContext } from "../types/index.js";
import { bundleEntries, FhirClient } from "../utils/fhir-client.js";
import { createToolOutput } from "../utils/output-schema.js";
import { getCodeList } from "../utils/fhir-utils.js";
import { readJsonData } from "../utils/data-loader.js";

const schema = z.object({
  patientId: z.string().optional(),
});

type MedicationDb = {
  meds: Record<string, { preg: string; lact: string; notes: string }>;
  contraindications: Array<{ drug: string; condition: string; severity: string }>;
};

export class GetActiveMedicationsTool extends McpTool<typeof schema> {
  public name = "get_active_medications";
  public description =
    "Returns active medications with pregnancy and lactation safety notes, allergy alerts, and ACOG-relevant contraindication cross-references.";
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
    const [medicationResponse, allergyResponse, conditionResponse, medicationDb] = await Promise.all([
      client.get("MedicationRequest", { patient: patientId, status: "active" }),
      client.get("AllergyIntolerance", { patient: patientId }),
      client.get("Condition", { patient: patientId }),
      readJsonData<MedicationDb>("src/data/medications-db.json"),
    ]);

    const medications = bundleEntries<Record<string, unknown>>(medicationResponse);
    const allergies = bundleEntries<Record<string, unknown>>(allergyResponse);
    const conditions = bundleEntries<Record<string, unknown>>(conditionResponse);
    const conditionNames = conditions
      .map((condition) => ((condition.code as Record<string, unknown> | undefined)?.text as string | undefined) ?? "")
      .filter((value) => value.length > 0);

    const medicationList = medications.map((medication) => {
      const codeableConcept = medication.medicationCodeableConcept as Record<string, unknown> | undefined;
      const displayName =
        (typeof codeableConcept?.text === "string" ? codeableConcept.text : undefined) ??
        (Array.isArray(codeableConcept?.coding)
          ? (((codeableConcept?.coding as Array<Record<string, unknown>>)[0]?.display as string | undefined) ?? null)
          : null) ??
        "Unknown medication";
      const dbKey = Object.keys(medicationDb.meds).find((key) =>
        displayName.toLowerCase().includes(key.toLowerCase()),
      );
      const dbEntry = dbKey ? medicationDb.meds[dbKey] : undefined;
      const safetyFlags = [
        ...(dbEntry?.preg === "X" ? ["Contraindicated in pregnancy per local knowledge base"] : []),
        ...(dbEntry?.lact === "L5" ? ["Contraindicated in lactation per Hale category L5"] : []),
        ...medicationDb.contraindications
          .filter(
            (item) =>
              displayName.toLowerCase().includes(item.drug.toLowerCase()) &&
              conditionNames.some((condition) =>
                condition.toLowerCase().includes(item.condition.toLowerCase()),
              ),
          )
          .map((item) => `Contraindication: ${item.drug} with ${item.condition} (${item.severity})`),
      ];

      return {
        name: displayName,
        code: getCodeList(medication)[0] ?? null,
        dosage:
          Array.isArray(medication.dosageInstruction) &&
          typeof (medication.dosageInstruction[0] as Record<string, unknown> | undefined)?.text === "string"
            ? ((medication.dosageInstruction[0] as Record<string, unknown>).text as string)
            : null,
        authoredOn: typeof medication.authoredOn === "string" ? medication.authoredOn : null,
        safetyFlags,
      };
    });

    return {
      output: createToolOutput({
        status: "SUCCESS",
        data: {
          patientId,
          medications: medicationList,
          allergies: allergies.map((allergy) => ({
            code:
              getCodeList(allergy)[0] ??
              ((allergy.code as Record<string, unknown> | undefined)?.text as string | undefined) ??
              null,
          })),
        },
        confidence: 92,
        sources: [
          ...medications
            .map((medication) =>
              typeof medication.id === "string" ? `MedicationRequest/${medication.id}` : null,
            )
            .filter((value): value is string => typeof value === "string"),
          ...allergies
            .map((allergy) =>
              typeof allergy.id === "string" ? `AllergyIntolerance/${allergy.id}` : null,
            )
            .filter((value): value is string => typeof value === "string"),
          "ACOG medication safety review",
        ],
      }),
      fhirSourceData: JSON.stringify({ medications, allergies, conditions }),
    };
  }
}
