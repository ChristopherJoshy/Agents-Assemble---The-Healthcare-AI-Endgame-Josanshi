export type GuardrailSeverity = "HIGH" | "MEDIUM" | "LOW";
export type GuardrailCriterion = "GROUNDED" | "PLAUSIBLE" | "SAFE" | "CITED";

export interface GuardrailFlag {
  criterion: GuardrailCriterion;
  issue: string;
  severity: GuardrailSeverity;
}

export interface ToolOutput {
  status: "SUCCESS" | "PARTIAL" | "ERROR" | "BLOCKED" | "NOT_APPLICABLE";
  data: Record<string, unknown> | null;
  confidence: number;
  sources: string[];
  timestamp: string;
  toolVersion: string;
  message?: string;
  _guardrail?: {
    verdict: "MODIFIED";
    correction: string;
    confidence: number;
    flags: GuardrailFlag[];
  };
}

export const TOOL_VERSION = "1.0.0";

export const createToolOutput = (
  output: Omit<ToolOutput, "timestamp" | "toolVersion"> & {
    timestamp?: string;
    toolVersion?: string;
  },
): ToolOutput => ({
  ...output,
  timestamp: output.timestamp ?? new Date().toISOString(),
  toolVersion: output.toolVersion ?? TOOL_VERSION,
});

export const validateToolOutputShape = (output: ToolOutput): GuardrailFlag[] => {
  const flags: GuardrailFlag[] = [];

  if (!["SUCCESS", "PARTIAL", "ERROR", "BLOCKED", "NOT_APPLICABLE"].includes(output.status)) {
    flags.push({
      criterion: "SAFE",
      issue: "Invalid status field on tool output.",
      severity: "HIGH",
    });
  }

  if (!Number.isFinite(output.confidence) || output.confidence < 0 || output.confidence > 100) {
    flags.push({
      criterion: "PLAUSIBLE",
      issue: "Confidence must be a finite number between 0 and 100.",
      severity: "HIGH",
    });
  }

  if (!Array.isArray(output.sources) || output.sources.some((item) => typeof item !== "string")) {
    flags.push({
      criterion: "CITED",
      issue: "Sources must be a string array.",
      severity: "HIGH",
    });
  }

  if (typeof output.timestamp !== "string" || Number.isNaN(Date.parse(output.timestamp))) {
    flags.push({
      criterion: "PLAUSIBLE",
      issue: "Timestamp must be a valid ISO 8601 string.",
      severity: "MEDIUM",
    });
  }

  if (typeof output.toolVersion !== "string" || output.toolVersion.length === 0) {
    flags.push({
      criterion: "SAFE",
      issue: "toolVersion must be present on every tool output.",
      severity: "MEDIUM",
    });
  }

  return flags;
};
