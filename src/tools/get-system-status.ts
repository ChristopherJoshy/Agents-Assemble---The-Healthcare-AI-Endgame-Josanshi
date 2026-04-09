import * as z from "zod";

import { McpTool, type ToolExecutionResult } from "./base-tool.js";
import type { ToolContext } from "../types/index.js";
import { FhirClient } from "../utils/fhir-client.js";
import { createToolOutput } from "../utils/output-schema.js";

const schema = z.object({});

export class GetSystemStatusTool extends McpTool<typeof schema> {
  public name = "get_system_status";
  public description =
    "Checks Josanshi and upstream FHIR readiness. Call this first at session start before any clinical workflow.";
  public inputSchema = schema;

  protected async execute(
    context: ToolContext,
    _input: z.infer<typeof schema>,
  ): Promise<ToolExecutionResult> {
    const startedAt = Date.now();

    if (!context.fhirServerUrl) {
      return {
        output: createToolOutput({
          status: "PARTIAL",
          data: {
            serviceStatus: "DEGRADED",
            fhirStatus: "UNAVAILABLE",
            latencyMs: Date.now() - startedAt,
            userMessage:
              "System context is not ready yet. Please wait about a minute and try again; free servers can take time to wake up.",
          },
          confidence: 60,
          sources: ["Runtime status check"],
        }),
        fhirSourceData: "{}",
      };
    }

    try {
      const client = new FhirClient(context);
      const response = await client.get("Patient", { _count: "1" });

      const ready = response !== null;
      return {
        output: createToolOutput({
          status: "SUCCESS",
          data: {
            serviceStatus: ready ? "READY" : "WARMING_UP",
            fhirStatus: ready ? "CONNECTED" : "WARMING_UP",
            latencyMs: Date.now() - startedAt,
            userMessage: ready
              ? "Josanshi is ready."
              : "Server is warming up. Please wait about a minute and try again (free Render instances can cold-start).",
          },
          confidence: ready ? 95 : 75,
          sources: ["Runtime status check", "FHIR connectivity probe"],
        }),
        fhirSourceData: JSON.stringify({ probe: response !== null }),
      };
    } catch {
      return {
        output: createToolOutput({
          status: "PARTIAL",
          data: {
            serviceStatus: "WARMING_UP",
            fhirStatus: "WARMING_UP",
            latencyMs: Date.now() - startedAt,
            userMessage:
              "Service is still loading. Please wait about a minute and retry; free servers can take time to spin up.",
          },
          confidence: 70,
          sources: ["Runtime status check"],
        }),
        fhirSourceData: "{}",
      };
    }
  }
}
