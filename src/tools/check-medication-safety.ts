import * as z from "zod";
import { readJsonData } from "../utils/data-loader.js";
import { createToolOutput } from "../utils/output-schema.js";
import type { ToolContext } from "../types/index.js";
import { McpTool, type ToolExecutionResult } from "./base-tool.js";

const schema = z.object({
  drugName: z.string(),
  isPregnant: z.boolean().default(false),
  isLactating: z.boolean().default(true),
});

type MedicationDb = {
  meds: Record<string, { preg: string; lact: string; notes: string }>;
};

const OPENFDA_DRUG_EVENT_URL =
  process.env.OPENFDA_DRUG_EVENT_URL ?? "https://api.fda.gov/drug/event.json";

const getFaersSignalStrength = async (
  drugName: string,
): Promise<"LOW" | "MODERATE" | "HIGH" | "UNKNOWN"> => {
  try {
    const url = new URL(OPENFDA_DRUG_EVENT_URL);
    url.searchParams.set("search", `patient.drug.medicinalproduct:${drugName.toUpperCase()}`);
    url.searchParams.set("limit", "1");
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });

    if (!response.ok) {
      return "UNKNOWN";
    }

    const payload = (await response.json()) as {
      meta?: { results?: { total?: number } };
    };
    const total = payload.meta?.results?.total;
    if (typeof total !== "number") return "UNKNOWN";
    if (total > 1000) return "HIGH";
    if (total > 100) return "MODERATE";
    return "LOW";
  } catch {
    return "UNKNOWN";
  }
};

export class CheckMedicationSafetyTool extends McpTool<typeof schema> {
  public name = "check_medication_safety";
  public description =
    "Checks both pregnancy safety and lactation/breastfeeding safety (Hale's Lactation Risk Categories L1-L5), using the local medication knowledge base plus openFDA FAERS signal review.";
  public inputSchema = schema;

  protected async execute(
    _context: ToolContext,
    input: z.infer<typeof schema>,
  ): Promise<ToolExecutionResult> {
    const medicationDb = await readJsonData<MedicationDb>("src/data/medications-db.json");
    const dbKey = Object.keys(medicationDb.meds).find((key) =>
      input.drugName.toLowerCase().includes(key.toLowerCase()),
    );
    const entry = dbKey ? medicationDb.meds[dbKey] : undefined;
    const faersSignalStrength = await getFaersSignalStrength(input.drugName);

    const output = createToolOutput({
      status: entry ? "SUCCESS" : "PARTIAL",
      data: {
        drugName: input.drugName,
        pregnancyCategory: entry?.preg ?? null,
        lactationCategory: entry?.lact ?? null,
        faersSignalStrength,
        safeInPregnancy:
          entry ? !(input.isPregnant && ["D", "X"].includes(entry.preg)) : null,
        safeInLactation:
          entry ? !(input.isLactating && entry.lact === "L5") : null,
        notes: entry?.notes ?? "No local structured entry found; manual pharmacist review is recommended.",
      },
      confidence: entry ? 95 : 55,
      sources: [
        "Hale lactation categories",
        "FDA PLLR",
        "openFDA FAERS",
      ],
    });

    return {
      output,
      fhirSourceData: JSON.stringify({ medicationDbMatch: entry ?? null, faersSignalStrength }),
    };
  }
}
