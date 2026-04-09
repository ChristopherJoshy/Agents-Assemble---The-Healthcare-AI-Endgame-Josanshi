import { createToolOutput, type GuardrailFlag, type ToolOutput, validateToolOutputShape } from "../utils/output-schema.js";

export type JudgeResult = {
  verdict: "VERIFIED" | "MODIFIED" | "BLOCKED";
  confidence: number;
  flags: GuardrailFlag[];
  correction?: string;
  reasoning: string;
};

type GeminiApiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite-preview";

export type GuardrailResult = {
  verdict: "VERIFIED" | "MODIFIED" | "BLOCKED";
  output: ToolOutput;
  confidence: number;
  flags: GuardrailFlag[];
};

const getValueAtPath = (value: unknown, path: string): unknown => {
  return path.split(".").reduce<unknown>((current, part) => {
    if (typeof current !== "object" || current === null || !(part in current)) {
      return undefined;
    }

    return (current as Record<string, unknown>)[part];
  }, value);
};

const scanStrings = (value: unknown): string[] => {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => scanStrings(item));
  }

  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap((item) => scanStrings(item));
  }

  return [];
};

const safeBlockedFallback = (toolName: string): ToolOutput =>
  createToolOutput({
    status: "BLOCKED",
    data: null,
    message: `This response from ${toolName} was blocked by the Josanshi clinical safety guardrail. A human clinical review is required before proceeding.`,
    confidence: 0,
    sources: [],
  });

const rulesLayer = {
  schemaCheck: (output: ToolOutput): GuardrailFlag[] => validateToolOutputShape(output),

  clinicalRangeCheck: (output: ToolOutput): GuardrailFlag[] => {
    const checks = [
      { path: "data.vitals.systolic", min: 50, max: 300 },
      { path: "data.vitals.diastolic", min: 30, max: 200 },
      { path: "data.vitals.heartRate", min: 20, max: 300 },
      { path: "data.vitals.temperature", min: 32, max: 44 },
      { path: "data.hemoglobin", min: 3, max: 25 },
      { path: "data.riskScore", min: 0, max: 10 },
      { path: "confidence", min: 0, max: 100 },
    ];

    return checks.flatMap((check) => {
      const value = getValueAtPath(output, check.path);
      if (typeof value === "number" && (value < check.min || value > check.max)) {
        return [
          {
            criterion: "PLAUSIBLE",
            issue: `Value at ${check.path} is outside safe clinical range.`,
            severity: "HIGH" as const,
          },
        ];
      }

      return [];
    });
  },

  codeFormatCheck: (output: ToolOutput): GuardrailFlag[] => {
    const strings = scanStrings(output.data);
    const flags: GuardrailFlag[] = [];

    for (const text of strings) {
      if (text.startsWith("LOINC:") && !/^\d{1,5}-\d$/.test(text.replace(/^LOINC:/, "").trim())) {
        flags.push({
          criterion: "GROUNDED",
          issue: `Invalid LOINC format detected: ${text}`,
          severity: "MEDIUM",
        });
      }

      if (text.startsWith("ICD10:") && !/^[A-Z]\d{2}(\.\d{1,4})?$/.test(text.replace(/^ICD10:/, "").trim())) {
        flags.push({
          criterion: "GROUNDED",
          issue: `Invalid ICD-10 format detected: ${text}`,
          severity: "MEDIUM",
        });
      }
    }

    return flags;
  },

  dangerousAdviceScan: (toolName: string, output: ToolOutput): GuardrailFlag[] => {
    if (toolName === "check_medication_safety") {
      return [];
    }

    const dangerousPatterns = [
      /\d+\s*mg\s*(of\s+)?\w+/gi,
      /administer\s+\w+/gi,
      /prescribe\s+\w+/gi,
      /give\s+\d+/gi,
    ];

    const text = scanStrings(output.data).join(" ");
    return dangerousPatterns.some((pattern) => pattern.test(text))
      ? [
          {
            criterion: "SAFE",
            issue: "Potential dosing or prescribing advice detected outside the medication safety tool.",
            severity: "HIGH",
          },
        ]
      : [];
  },

  selfHarmEscalationCheck: (toolName: string, output: ToolOutput): GuardrailFlag[] => {
    if (toolName !== "screen_depression") {
      return [];
    }

    const selfHarmFlag = getValueAtPath(output, "data.selfHarmFlag");
    const severity = getValueAtPath(output, "data.severity");

    if (selfHarmFlag === true && severity !== "IMMEDIATE_ESCALATION") {
      return [
        {
          criterion: "SAFE",
          issue: "screen_depression reported selfHarmFlag without IMMEDIATE_ESCALATION severity.",
          severity: "HIGH",
        },
      ];
    }

    return [];
  },
};

const runRulesLayer = (output: ToolOutput, toolName: string): { blocked: boolean; flags: GuardrailFlag[] } => {
  const flags = [
    ...rulesLayer.schemaCheck(output),
    ...rulesLayer.clinicalRangeCheck(output),
    ...rulesLayer.codeFormatCheck(output),
    ...rulesLayer.dangerousAdviceScan(toolName, output),
    ...rulesLayer.selfHarmEscalationCheck(toolName, output),
  ];

  return {
    blocked: flags.some((flag) => flag.severity === "HIGH" && flag.criterion === "SAFE"),
    flags,
  };
};

export const geminiJudge = async (
  toolName: string,
  toolInput: unknown,
  toolOutput: ToolOutput,
  fhirSourceData: string,
): Promise<JudgeResult> => {
  if (!process.env.GEMINI_API_KEY) {
    return {
      verdict: "VERIFIED",
      confidence: 50,
      flags: [],
      reasoning: "Judge unavailable - rule-based checks passed.",
    };
  }

  const judgePrompt = `You are a clinical safety judge for a maternal healthcare AI system.

TASK: Verify that this tool output is clinically accurate, grounded in the FHIR data provided, and safe for clinical use.

TOOL: ${toolName}
FHIR DATA READ BY TOOL:
${fhirSourceData}

TOOL INPUT:
${JSON.stringify(toolInput, null, 2)}

TOOL OUTPUT:
${JSON.stringify(toolOutput, null, 2)}

Evaluate ONLY these 4 criteria:
1. GROUNDED
2. PLAUSIBLE
3. SAFE
4. CITED

Respond with ONLY valid JSON:
{
  "verdict": "VERIFIED" | "MODIFIED" | "BLOCKED",
  "confidence": <0-100>,
  "flags": [
    { "criterion": "GROUNDED" | "PLAUSIBLE" | "SAFE" | "CITED", "issue": "<description>", "severity": "HIGH" | "MEDIUM" | "LOW" }
  ],
  "correction": "<if MODIFIED: describe what was wrong and what the corrected value should be>",
  "reasoning": "<1-2 sentences explaining the verdict>"
}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: judgePrompt }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 512,
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(5000),
      },
    );

    if (!response.ok) {
      throw new Error(`Judge HTTP ${response.status}`);
    }

    const payload = (await response.json()) as GeminiApiResponse;
    const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (typeof text !== "string") {
      throw new Error("Judge response did not include JSON text.");
    }

    const parsed = JSON.parse(text) as JudgeResult;
    return {
      verdict: parsed.verdict,
      confidence: parsed.confidence,
      flags: parsed.flags ?? [],
      correction: parsed.correction,
      reasoning: parsed.reasoning,
    };
  } catch {
    return {
      verdict: "VERIFIED",
      confidence: 50,
      flags: [],
      reasoning: "Judge unavailable - rule-based checks passed.",
    };
  }
};

const logGuardrailIncident = (
  toolName: string,
  output: ToolOutput,
  judgeResult: JudgeResult,
): void => {
  console.error(
    JSON.stringify({
      type: "guardrail_incident",
      toolName,
      output,
      judgeResult,
      timestamp: new Date().toISOString(),
    }),
  );
};

export const runGuardrail = async (
  toolName: string,
  toolInput: unknown,
  toolOutput: ToolOutput,
  fhirSourceData: string,
  retryCount = 0,
): Promise<GuardrailResult> => {
  const layer1Result = runRulesLayer(toolOutput, toolName);
  if (layer1Result.blocked) {
    return {
      verdict: "BLOCKED",
      output: safeBlockedFallback(toolName),
      confidence: 0,
      flags: layer1Result.flags,
    };
  }

  const judgeResult = await geminiJudge(toolName, toolInput, toolOutput, fhirSourceData);

  if (judgeResult.verdict === "VERIFIED") {
    return {
      verdict: "VERIFIED",
      output: toolOutput,
      confidence: judgeResult.confidence,
      flags: judgeResult.flags,
    };
  }

  if (judgeResult.verdict === "BLOCKED") {
    logGuardrailIncident(toolName, toolOutput, judgeResult);
    return {
      verdict: "BLOCKED",
      output: safeBlockedFallback(toolName),
      confidence: 0,
      flags: judgeResult.flags,
    };
  }

  if (judgeResult.verdict === "MODIFIED" && retryCount < 2) {
    return {
      verdict: "MODIFIED",
      output: {
        ...toolOutput,
        _guardrail: {
          verdict: "MODIFIED",
          correction: judgeResult.correction ?? "Guardrail requested a non-blocking correction.",
          confidence: judgeResult.confidence,
          flags: judgeResult.flags,
        },
      },
      confidence: judgeResult.confidence,
      flags: judgeResult.flags,
    };
  }

  return {
    verdict: "BLOCKED",
    output: safeBlockedFallback(toolName),
    confidence: 0,
    flags: judgeResult.flags,
  };
};
