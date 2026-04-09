export interface ToolContext {
  fhirServerUrl?: string;
  accessToken?: string;
  patientId?: string;
  correlationId?: string;
  headers: Record<string, string | undefined>;
}

export type McpToolResponse = {
  content: Array<{
    type: string;
    text: string;
  }>;
  isError?: boolean;
};
