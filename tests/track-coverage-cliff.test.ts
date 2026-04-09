import { afterEach, describe, expect, it, vi } from "vitest";

import { FhirClient } from "../src/utils/fhir-client.js";
import { TrackCoverageCliffTool } from "../src/tools/track-coverage-cliff.js";

const context = {
  patientId: "keisha-washington",
  headers: {},
};

describe("track_coverage_cliff", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns CRITICAL when 8 days remain and required screenings are outstanding", async () => {
    vi.spyOn(FhirClient.prototype, "get").mockImplementation(async (resourceType) => {
      if (resourceType === "Coverage") {
        return {
          resourceType: "Bundle",
          entry: [
            {
              resource: {
                resourceType: "Coverage",
                id: "coverage-keisha",
                status: "active",
                period: { end: "2026-04-17" },
              },
            },
          ],
        };
      }

      if (resourceType === "Patient") {
        return {
          resourceType: "Bundle",
          entry: [
            {
              resource: {
                resourceType: "Patient",
                id: "keisha-washington",
                address: [{ state: "TX", postalCode: "73301" }],
              },
            },
          ],
        };
      }

      if (resourceType === "Condition") {
        return {
          resourceType: "Bundle",
          entry: [
            {
              resource: {
                resourceType: "Condition",
                id: "delivery",
                code: { coding: [{ code: "O80" }], text: "Normal delivery" },
                recordedDate: "2026-03-20T00:00:00Z",
              },
            },
            {
              resource: {
                resourceType: "Condition",
                id: "htn",
                code: { text: "Gestational hypertension" },
              },
            },
          ],
        };
      }

      return { resourceType: "Bundle", entry: [] };
    });

    const tool = new TrackCoverageCliffTool();
    const output = await tool.handle(context, { patientId: "keisha-washington" });

    expect(output.status).toBe("SUCCESS");
    expect(output.data?.urgency).toBe("CRITICAL");
  });

  it("returns LOW when the patient is in a 12-month extension state and screenings are complete", async () => {
    vi.spyOn(FhirClient.prototype, "get").mockImplementation(async (resourceType) => {
      if (resourceType === "Coverage") {
        return {
          resourceType: "Bundle",
          entry: [
            {
              resource: {
                resourceType: "Coverage",
                id: "coverage-lisa",
                status: "active",
                period: { end: "2027-01-15" },
              },
            },
          ],
        };
      }

      if (resourceType === "Patient") {
        return {
          resourceType: "Bundle",
          entry: [
            {
              resource: {
                resourceType: "Patient",
                id: "lisa-thompson",
                address: [{ state: "CA", postalCode: "94105" }],
              },
            },
          ],
        };
      }

      if (resourceType === "Condition") {
        return {
          resourceType: "Bundle",
          entry: [
            {
              resource: {
                resourceType: "Condition",
                id: "delivery",
                code: { coding: [{ code: "O80" }], text: "Normal delivery" },
                recordedDate: "2026-02-01T00:00:00Z",
              },
            },
          ],
        };
      }

      if (resourceType === "Observation") {
        return {
          resourceType: "Bundle",
          entry: [
            { resource: { resourceType: "Observation", id: "epds", code: { coding: [{ code: "71354-5" }] } } },
            { resource: { resourceType: "Observation", id: "bp1", code: { coding: [{ code: "8480-6" }] } } },
            { resource: { resourceType: "Observation", id: "bp2", code: { coding: [{ code: "8462-4" }] } } },
          ],
        };
      }

      if (resourceType === "CarePlan") {
        return {
          resourceType: "Bundle",
          entry: [{ resource: { resourceType: "CarePlan", id: "cp1", description: "Contraception counseling completed" } }],
        };
      }

      if (resourceType === "Encounter") {
        return {
          resourceType: "Bundle",
          entry: [
            {
              resource: {
                resourceType: "Encounter",
                id: "enc1",
                period: { start: "2026-02-15T00:00:00Z" },
              },
            },
          ],
        };
      }

      return { resourceType: "Bundle", entry: [] };
    });

    const tool = new TrackCoverageCliffTool();
    const output = await tool.handle(
      { ...context, patientId: "lisa-thompson" },
      { patientId: "lisa-thompson" },
    );

    expect(output.data?.stateExtendedTo12Months).toBe(true);
    expect(output.data?.urgency).toBe("LOW");
  });

  it("flags alreadyExpired when coverage has already ended", async () => {
    vi.spyOn(FhirClient.prototype, "get").mockImplementation(async (resourceType) => {
      if (resourceType === "Coverage") {
        return {
          resourceType: "Bundle",
          entry: [
            {
              resource: {
                resourceType: "Coverage",
                id: "expired-coverage",
                status: "active",
                beneficiary: { reference: "Patient/expired" },
                period: { end: "2026-01-01" },
              },
            },
          ],
        };
      }

      if (resourceType === "Patient") {
        return {
          resourceType: "Bundle",
          entry: [
            {
              resource: {
                resourceType: "Patient",
                id: "expired",
                address: [{ state: "TX", postalCode: "73301" }],
                extension: [],
              },
            },
          ],
        };
      }

      if (resourceType === "Condition") {
        return {
          resourceType: "Bundle",
          entry: [
            {
              resource: {
                resourceType: "Condition",
                id: "delivery",
                subject: { reference: "Patient/expired" },
                code: { coding: [{ code: "O80" }], text: "Normal delivery" },
                recordedDate: "2025-11-01T00:00:00Z",
              },
            },
          ],
        };
      }

      return { resourceType: "Bundle", entry: [] };
    });

    const tool = new TrackCoverageCliffTool();
    const output = await tool.handle(
      { patientId: "expired", headers: {} },
      { patientId: "expired" },
    );

    expect(output.data?.alreadyExpired).toBe(true);
    expect(typeof output.data?.daysUntilExpiry).toBe("number");
    expect((output.data?.daysUntilExpiry as number) < 0).toBe(true);
  });
});
