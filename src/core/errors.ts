export class McpError extends Error {
  public readonly code: number;

  public readonly isRetryable: boolean;

  constructor(message: string, code: number, isRetryable: boolean) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.isRetryable = isRetryable;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class FhirContextError extends McpError {
  constructor(message = "FHIR context missing") {
    super(message, 4001, false);
  }
}

export class FhirClientError extends McpError {
  public readonly statusCode?: number;

  public readonly cause?: unknown;

  public readonly url?: string;

  public readonly method?: string;

  constructor(
    message: string,
    options: {
      statusCode?: number;
      isRetryable?: boolean;
      cause?: unknown;
      url?: string;
      method?: string;
    } = {},
  ) {
    const statusCode = options.statusCode;
    super(
      message,
      4002,
      options.isRetryable ??
        (statusCode === 408 || statusCode === 429 || (typeof statusCode === "number" && statusCode >= 500 && statusCode < 600)),
    );
    this.statusCode = statusCode;
    this.cause = options.cause;
    this.url = options.url;
    this.method = options.method;
  }
}

export class ToolExecutionError extends McpError {
  public readonly toolName: string;

  constructor(message: string, toolName: string) {
    super(message, 4003, false);
    this.toolName = toolName;
  }
}

export class ValidationError extends McpError {
  public readonly field: string;

  constructor(message: string, field: string) {
    super(message, 4004, false);
    this.field = field;
  }
}

export const createFhirContextError = (message: string = "FHIR context missing"): FhirContextError => new FhirContextError(message);

export const createFhirClientError = (message: string, statusCode?: number): FhirClientError =>
  new FhirClientError(message, { statusCode });

export const createToolExecutionError = (message: string, toolName: string): ToolExecutionError => new ToolExecutionError(message, toolName);

export const createValidationError = (message: string, field: string): ValidationError => new ValidationError(message, field);
