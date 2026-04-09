import pino from 'pino';
import { pinoHttp } from 'pino-http';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

const getHeader = (req: IncomingMessage, name: string): string | undefined => {
  const value = req.headers[name.toLowerCase()];

  if (Array.isArray(value)) {
    return value[0];
  }

  return typeof value === 'string' ? value : undefined;
};

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'debug',
});

export const createRequestLogger = () =>
  pinoHttp<IncomingMessage, import('node:http').ServerResponse>({
    logger,
    genReqId: (req: IncomingMessage) => getHeader(req, 'x-correlation-id') ?? randomUUID(),
    customProps: (req: IncomingMessage) => ({
      correlationId:
        typeof req.id === 'string' || typeof req.id === 'number' ? `${req.id}` : randomUUID(),
    }),
  });

export const logToolExecution = (details: {
  tool: string;
  duration: number;
  status: string;
  correlationId?: string;
  input?: unknown;
  output?: unknown;
  error?: unknown;
}): void => {
  logger.debug(details, `Tool executed: ${details.tool}`);
};

export const logApiRequest = (details: {
  url: string;
  method: string;
  duration: number;
  status: number | string;
  responseSize?: number;
  error?: unknown;
}): void => {
  logger.debug(details, `API Request: ${details.method} ${details.url}`);
};
