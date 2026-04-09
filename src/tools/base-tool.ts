import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";

import { runGuardrail } from "../middleware/guardrail.js";
import { logToolExecution } from "../core/logger.js";
import { sessionPool } from "../server/session-pool.js";
import type { ToolContext, McpToolResponse } from "../types/index.js";
import { createToolOutput, type ToolOutput } from "../utils/output-schema.js";

export type ToolExecutionResult = {
  output: ToolOutput;
  fhirSourceData: string;
};

export abstract class McpTool<TInputSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  public abstract name: string;
  public abstract description: string;
  public abstract inputSchema: TInputSchema;

  protected abstract execute(
    context: ToolContext,
    input: z.output<TInputSchema>,
  ): Promise<ToolExecutionResult>;

  public async handle(
    context: ToolContext,
    input: z.output<TInputSchema>,
  ): Promise<ToolOutput> {
    return (await this.execute(context, input)).output;
  }

  public register(server: McpServer): void {
    server.registerTool(
      this.name,
      {
        description: this.description,
        inputSchema: this.inputSchema,
      },
      (async (input: z.output<TInputSchema>, requestContext: { sessionId?: string }): Promise<McpToolResponse> => {
        const startedAt = Date.now();

        try {
          const sessionId = requestContext.sessionId;
          const toolContext = sessionId ? sessionPool.getSession(sessionId)?.context : undefined;

          if (!toolContext) {
            throw new Error("FHIR request context is missing for the current MCP session");
          }

          const { output, fhirSourceData } = await this.execute(toolContext, input);
          const guarded = await runGuardrail(this.name, input, output, fhirSourceData);

          logToolExecution({
            tool: this.name,
            duration: Date.now() - startedAt,
            status: guarded.verdict === "BLOCKED" ? "error" : "success",
            input,
            output: guarded.output,
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(guarded.output, null, 2),
              },
            ],
            isError: guarded.verdict === "BLOCKED",
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unexpected tool failure";

          logToolExecution({
            tool: this.name,
            duration: Date.now() - startedAt,
            status: "error",
            input,
            error: message,
          });

          const output = createToolOutput({
            status: "ERROR",
            data: null,
            confidence: 0,
            sources: [],
            message,
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(output, null, 2),
              },
            ],
            isError: true,
          };
        }
      }) as never,
    );
  }
}
