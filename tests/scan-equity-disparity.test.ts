import { afterEach, describe, expect, it, vi } from "vitest";

import { FhirClient } from "../src/utils/fhir-client.js";
import { ScanEquityDisparityTool } from "../src/tools/scan-equity-disparity.js";

describe("scan_equity_disparity", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("flags a panel with a 2x referral-wait disparity", async () => {
    vi.spyOn(FhirClient.prototype, "get").mockImplementation(async (resourceType, params = {}) => {
      if (resourceType === "Patient") {
        return {
          resourceType: "Bundle",
          entry: [
            { resource: { resourceType: "Patient", id: "p1", gender: "female", address: [{ postalCode: "10001" }] } },
            { resource: { resourceType: "Patient", id: "p2", gender: "female", address: [{ postalCode: "10001" }] } }
          ]
        };
      }

      if (resourceType === "Condition") {
        return {
          resourceType: "Bundle",
          entry: [{ resource: { resourceType: "Condition", id: `cond-${params.patient}`, code: { text: "Preeclampsia" }, recordedDate: "2026-04-01T00:00:00Z" } }]
        };
      }

      if (resourceType === "ServiceRequest") {
        return {
          resourceType: "Bundle",
          entry: [{ resource: { resourceType: "ServiceRequest", id: `sr-${params.patient}`, authoredOn: params.patient === "p1" ? "2026-04-02T00:00:00Z" : "2026-04-04T00:00:00Z" } }]
        };
      }

      if (resourceType === "Encounter") {
        return { resourceType: "Bundle", entry: [{ resource: { resourceType: "Encounter", id: `enc-${params.patient}`, type: [{ text: "Postpartum follow-up" }] } }] };
      }

      return { resourceType: "Bundle", entry: [] };
    });

    const tool = new ScanEquityDisparityTool();
    const output = await tool.handle({ headers: {} }, { timePeriodDays: 30, unit: "ob_gyn" });

    expect(output.data?.metrics?.referralWaitTime.disparityFlag).toBe(true);
  });

  it("returns disparityRatio 1.0 and equityGrade A for an all-same-demographic panel", async () => {
    vi.spyOn(FhirClient.prototype, "get").mockImplementation(async (resourceType) => {
      if (resourceType === "Patient") {
        return {
          resourceType: "Bundle",
          entry: [
            { resource: { resourceType: "Patient", id: "p1", gender: "female", address: [{ postalCode: "10001" }] } },
            { resource: { resourceType: "Patient", id: "p2", gender: "female", address: [{ postalCode: "10001" }] } }
          ]
        };
      }

      if (resourceType === "Encounter") {
        return { resourceType: "Bundle", entry: [{ resource: { resourceType: "Encounter", id: "enc-1", type: [{ text: "Postpartum follow-up" }] } }] };
      }

      if (resourceType === "Condition") {
        return {
          resourceType: "Bundle",
          entry: [{ resource: { resourceType: "Condition", id: "cond-1", code: { text: "Preeclampsia" }, recordedDate: "2026-04-01T00:00:00Z" } }]
        };
      }

      return { resourceType: "Bundle", entry: [] };
    });

    const tool = new ScanEquityDisparityTool();
    const output = await tool.handle({ headers: {} }, { timePeriodDays: 30, unit: "ob_gyn" });

    expect(output.data?.metrics?.referralWaitTime.disparityRatio).toBe(1);
    expect(output.data?.equityGrade).toBe("A");
  });
});
