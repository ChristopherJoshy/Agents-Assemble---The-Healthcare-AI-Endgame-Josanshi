import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Server } from "node:http";

import { FHIR_CONTEXT_EXTENSION, SERVER_CONFIG } from "./config/constants.js";
import { logger } from "./core/logger.js";
import { createApp } from "./server/app.js";

const serverInfo = {
  name: SERVER_CONFIG.name,
  version: SERVER_CONFIG.version,
} as const;

export const createMcpServer = (): McpServer =>
  new McpServer(serverInfo as never, {
    capabilities: {
      extensions: {
        [FHIR_CONTEXT_EXTENSION]: {},
      },
    },
  } as never);

const app = createApp(createMcpServer);
const port = Number(process.env.PORT ?? 3000);
const httpServer: Server = app.listen(port, () => {
  logger.info({ port }, "Server started");
});

let isShuttingDown = false;

const shutdown = async (): Promise<void> => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logger.info("Shutting down gracefully...");

  await new Promise<void>((resolve, reject) => {
    httpServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
};

process.on("SIGTERM", () => {
  void shutdown();
});

process.on("SIGINT", () => {
  void shutdown();
});
