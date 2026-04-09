import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express, { type Express, type Request, type Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { createRequestLogger } from '../core/logger.js';
import { createContextMiddleware } from '../core/request-context.js';
import type { ToolContext } from '../types/index.js';
import { registerAllTools } from '../tools/registry.js';
import { sessionPool } from './session-pool.js';

type SessionRuntime = {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
};

const activeSessions = new Map<string, SessionRuntime>();

const getSessionHeader = (req: Request): string | undefined => {
  const value = req.headers['mcp-session-id'];

  if (Array.isArray(value)) {
    return value[0];
  }

  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

const isInitializeRequest = (body: unknown): body is { method: 'initialize' } =>
  typeof body === 'object' &&
  body !== null &&
  'method' in body &&
  (body as { method?: unknown }).method === 'initialize';

const createSessionRuntime = async (
  createServer: () => McpServer,
  preferredSessionId?: string,
): Promise<SessionRuntime> => {
  const server = createServer();
  registerAllTools(server);

  let initializedSessionId: string | undefined;
  const runtime = {} as SessionRuntime;

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => preferredSessionId ?? randomUUID(),
    onsessioninitialized: (sessionId) => {
      initializedSessionId = sessionId;
      activeSessions.set(sessionId, runtime);
    },
  });

  transport.onclose = () => {
    const sessionId = initializedSessionId ?? transport.sessionId;

    if (sessionId !== undefined) {
      activeSessions.delete(sessionId);
      sessionPool.deleteSession(sessionId);
    }
  };

  runtime.server = server;
  runtime.transport = transport;
  await server.connect(transport);
  return runtime;
};

const getExistingSessionRuntime = (req: Request): SessionRuntime | undefined => {
  const sessionId = getSessionHeader(req);
  return sessionId !== undefined ? activeSessions.get(sessionId) : undefined;
};

const getRequestContext = (req: Request): ToolContext | undefined => {
  const requestWithLocals = req as Request & { locals?: { context?: ToolContext } };
  return requestWithLocals.locals?.context;
};

export const createApp = (createServer: () => McpServer): Express => {
  const app = express();

  app.set('trust proxy', true);
  app.use(createRequestLogger());
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.post(
    '/mcp',
    createContextMiddleware(),
    async (req: Request, res: Response): Promise<void> => {
      const context = getRequestContext(req);

      if (context === undefined) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32602,
            message: 'Bad Request: Missing FHIR context headers',
          },
          id: null,
        });
        return;
      }

      const existingRuntime = getExistingSessionRuntime(req);

      if (existingRuntime !== undefined) {
        const sessionId = getSessionHeader(req);

        if (sessionId !== undefined) {
          sessionPool.updateContext(sessionId, context);
        }

        await existingRuntime.transport.handleRequest(req, res, req.body);
        return;
      }

      if (!isInitializeRequest(req.body)) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid MCP session was provided',
          },
          id: null,
        });
        return;
      }

      const runtime = await createSessionRuntime(createServer, getSessionHeader(req));
      await runtime.transport.handleRequest(req, res, req.body);

      const initializedSessionId = runtime.transport.sessionId;

      if (initializedSessionId !== undefined) {
        sessionPool.setSession(initializedSessionId, context);
      }
    },
  );

  app.get('/mcp', async (req: Request, res: Response): Promise<void> => {
    const existingRuntime = getExistingSessionRuntime(req);

    if (existingRuntime === undefined) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    await existingRuntime.transport.handleRequest(req, res);
  });

  app.delete('/mcp', async (req: Request, res: Response): Promise<void> => {
    const existingRuntime = getExistingSessionRuntime(req);

    if (existingRuntime === undefined) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    await existingRuntime.transport.handleRequest(req, res);
  });

  return app;
};
