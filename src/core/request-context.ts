import { randomUUID } from "node:crypto";
import type { Request, RequestHandler } from "express";
import { decodeJwt } from "jose";
import type { JWTPayload } from "jose";

import { FHIR_HEADERS } from "../config/constants.js";
import type { ToolContext } from "../types/index.js";

type RequestWithLocals = Request & {
  locals?: {
    context?: ToolContext;
  };
};

const readHeader = (req: Request, name: string): string | undefined => {
  const value = req.get(name);
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

const stripBearerPrefix = (token: string): string => token.replace(/^Bearer\s+/i, "");

export const extractContext = (req: Request): ToolContext => {
  const fhirUrl = readHeader(req, FHIR_HEADERS.serverUrl);
  const correlationId = readHeader(req, "x-correlation-id") ?? randomUUID();
  const token = readHeader(req, FHIR_HEADERS.accessToken);
  const explicitPatientId = readHeader(req, FHIR_HEADERS.patientId);

  let patientId = explicitPatientId;

  if (patientId === undefined && token !== undefined) {
    const decoded = decodeJwt(stripBearerPrefix(token)) as JWTPayload & { patient?: string };
    const jwtPatient = decoded.patient;

    if (typeof jwtPatient === "string" && jwtPatient.length > 0) {
      patientId = jwtPatient;
    }
  }

  return {
    fhirServerUrl: fhirUrl,
    accessToken: token,
    patientId,
    correlationId,
    headers: {
      [FHIR_HEADERS.serverUrl]: fhirUrl,
      [FHIR_HEADERS.accessToken]: token,
      [FHIR_HEADERS.patientId]: explicitPatientId,
    },
  };
};

export const createContextMiddleware = (): RequestHandler => (req, _res, next) => {
  try {
    const context = extractContext(req);
    const request = req as RequestWithLocals;
    request.locals ??= {};
    request.locals.context = context;
    next();
  } catch (error: unknown) {
    next(error);
  }
};
