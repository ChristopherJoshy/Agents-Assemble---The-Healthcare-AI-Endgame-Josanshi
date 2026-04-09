import * as z from "zod";

import { McpTool, type ToolExecutionResult } from "./base-tool.js";
import type { ToolContext } from "../types/index.js";
import { createToolOutput } from "../utils/output-schema.js";

const schema = z.object({
  userPrompt: z.string().optional(),
  draftResponse: z.string().optional(),
  evidenceSummary: z.string().optional(),
});

type GuardrailIssue = {
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  type:
    | "SAFETY"
    | "GROUNDING"
    | "MISLEADING"
    | "ESCALATION"
    | "OUT_OF_SCOPE"
    | "FABRICATION"
    | "NO_REVIEW_CONTEXT"
    | "JUDGE_TIMEOUT";
  message: string;
};

type GuardrailVerdict = "APPROVE" | "REVISE" | "BLOCK";

type GeminiGuardrailResult = {
  verdict: GuardrailVerdict;
  confidence: number;
  issues: GuardrailIssue[];
  revised_response?: string;
  blocked_reason?: string;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite-preview";

const hasEscalationLanguage = (text: string): boolean =>
  /urgent|immediate|emergency|same-day|escalat|call 911|ed now|seek emergency care/i.test(text);

const runDeterministicChecks = (reviewText: string): {
  verdict: GuardrailVerdict;
  issues: GuardrailIssue[];
} => {
  const issues: GuardrailIssue[] = [];
  let verdict: GuardrailVerdict = "APPROVE";

  const dangerousPatterns = [
    /ignore (the )?(symptoms|warning signs)/i,
    /do not escalate/i,
    /prescribe\s+\w+/i,
    /give\s+\d+\s*(mg|mcg|g|units)/i,
  ];

  if (dangerousPatterns.some((pattern) => pattern.test(reviewText))) {
    verdict = "BLOCK";
    issues.push({
      severity: "CRITICAL",
      type: "SAFETY",
      message: "Unsafe treatment or suppression-of-escalation language detected.",
    });
  }

  const outOfScopePatterns = [
    /this is legal advice/i,
    /guaranteed cure/i,
    /final diagnosis is/i,
    /authoritative legal determination/i,
  ];

  if (outOfScopePatterns.some((pattern) => pattern.test(reviewText))) {
    verdict = "BLOCK";
    issues.push({
      severity: "HIGH",
      type: "OUT_OF_SCOPE",
      message: "Draft contains out-of-scope or authority-overreach content.",
    });
  }

  const fabricationPatterns = [
    /confirmed by labs .* but no labs/i,
    /documented on .* not shown/i,
    /vitals show .* unavailable/i,
  ];

  if (fabricationPatterns.some((pattern) => pattern.test(reviewText))) {
    verdict = "BLOCK";
    issues.push({
      severity: "CRITICAL",
      type: "FABRICATION",
      message: "Potential fabricated or unsupported factual claim detected.",
    });
  }

  const highRiskKeywords = [
    "self-harm",
    "suicide",
    "severe hypertension",
    "sepsis",
    "hemorrhage",
    "heavy bleeding",
    "chest pain",
    "shortness of breath",
  ];

  const mentionsHighRisk = highRiskKeywords.some((term) => reviewText.includes(term));
  const isHistoryOrSummary = /history|summary|record|chart note|extracted values/i.test(reviewText);

  if (mentionsHighRisk && !hasEscalationLanguage(reviewText)) {
    if (isHistoryOrSummary) {
      // Allow clinical history reporting but flag for revision to ensure safety context is added
      verdict = "REVISE";
      issues.push({
        severity: "MEDIUM",
        type: "ESCALATION",
        message: "High-risk signal present in clinical history/summary without explicit escalation. Guidance should be appended.",
      });
    } else {
      verdict = "BLOCK";
      issues.push({
        severity: "HIGH",
        type: "ESCALATION",
        message: "High-risk maternal concern is present without clear urgent escalation language.",
      });
    }
  }

  if (
    verdict === "APPROVE" &&
    !/limited|missing|uncertain|cannot confirm|do not have enough information/i.test(reviewText)
  ) {
    issues.push({
      severity: "LOW",
      type: "GROUNDING",
      message: "Uncertainty language may be needed if evidence is incomplete.",
    });
  }

  return { verdict, issues };
};

const runGeminiJudge = async (
  userPrompt: string,
  draftResponse: string,
  evidenceSummary: string,
): Promise<GeminiGuardrailResult | null> => {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }

  const judgePrompt = `You are a maternal-health safety gate.

Evaluate the draft response for:
1) dangerous advice
2) fabricated/unsupported claims
3) out-of-scope statements
4) escalation quality for severe maternal risks

EXCEPTION: Clinical histories and record summaries are ALLOWED. If a history contains a high-risk signal (severe hypertension, sepsis, etc.) but lacks escalation, prefer REVISE (to append a warning) over BLOCK. Do not block for fabrication if the output is a factual report of retrieved records.

User prompt:\n${userPrompt}\n
Draft response:\n${draftResponse}\n
Evidence summary:\n${evidenceSummary}\n
Return ONLY JSON:
{
  "verdict": "APPROVE" | "REVISE" | "BLOCK",
  "confidence": 0-100,
  "issues": [{"severity":"LOW|MEDIUM|HIGH|CRITICAL","type":"SAFETY|GROUNDING|MISLEADING|ESCALATION|OUT_OF_SCOPE|FABRICATION","message":"..."}],
  "revised_response": "required if REVISE",
  "blocked_reason": "required if BLOCK"
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
      return null;
    }

    const payload = (await response.json()) as GeminiResponse;
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string" || text.trim().length === 0) {
      return null;
    }

    const parsed = JSON.parse(text) as GeminiGuardrailResult;
    if (!["APPROVE", "REVISE", "BLOCK"].includes(parsed.verdict)) {
      return null;
    }

    return {
      verdict: parsed.verdict,
      confidence: parsed.confidence,
      issues: parsed.issues ?? [],
      revised_response: parsed.revised_response,
      blocked_reason: parsed.blocked_reason,
    };
  } catch {
    return null;
  }
};

export class GuardrailTool extends McpTool<typeof schema> {
  public name = "guardrail";
  public description =
    "Reviews a draft maternal-health response for safety, grounding, scope compliance, and escalation quality, with deterministic blocking plus Gemini semantic judging.";
  public inputSchema = schema;

  protected async execute(
    _context: ToolContext,
    input: z.infer<typeof schema>,
  ): Promise<ToolExecutionResult> {
    const userPrompt = input.userPrompt ?? "";
    const draftResponse = input.draftResponse ?? "";
    const evidenceSummary = input.evidenceSummary ?? "";

    const hasDraft = draftResponse.trim().length > 0;
    if (!hasDraft) {
      return {
        output: createToolOutput({
          status: "SUCCESS",
          data: {
            verdict: "APPROVE",
            safe_to_return: true,
            issues: [
              {
                severity: "LOW",
                type: "NO_REVIEW_CONTEXT",
                message: "No draft clinical response was provided for guardrail review.",
              },
            ],
            confidence: 95,
          },
          confidence: 95,
          sources: ["Josanshi Guardrail"],
        }),
        fhirSourceData: JSON.stringify({ input }),
      };
    }

    const reviewText = `${userPrompt}\n${draftResponse}\n${evidenceSummary}`.toLowerCase();
    const deterministic = runDeterministicChecks(reviewText);

    if (deterministic.verdict === "BLOCK") {
      return {
        output: createToolOutput({
          status: "SUCCESS",
          data: {
            verdict: "BLOCK",
            safe_to_return: false,
            issues: deterministic.issues,
            blocked_reason: "Unsafe, fabricated, or out-of-scope content detected by deterministic guardrail checks.",
            confidence: 98,
          },
          confidence: 98,
          sources: ["Josanshi Guardrail"],
        }),
        fhirSourceData: JSON.stringify({ input }),
      };
    }

    const geminiResult = await runGeminiJudge(userPrompt, draftResponse, evidenceSummary);

    const mergedIssues = [...deterministic.issues, ...(geminiResult?.issues ?? [])];
    const confidence = geminiResult?.confidence ?? 70;

    // Hierarchy: BLOCK > REVISE > APPROVE
    let finalVerdict: GuardrailVerdict = deterministic.verdict;
    if (geminiResult) {
      if (geminiResult.verdict === "BLOCK") {
        finalVerdict = "BLOCK";
      } else if (geminiResult.verdict === "REVISE" || finalVerdict === "REVISE") {
        finalVerdict = "REVISE";
      }
    }

    if (finalVerdict === "BLOCK") {
      return {
        output: createToolOutput({
          status: "SUCCESS",
          data: {
            verdict: "BLOCK",
            safe_to_return: false,
            issues: mergedIssues,
            blocked_reason:
              geminiResult?.blocked_reason ??
              deterministic.issues.find((i) => i.type === "SAFETY" || i.type === "ESCALATION")?.message ??
              "Unsafe, fabricated, or out-of-scope content detected.",
            confidence,
          },
          confidence,
          sources: ["Josanshi Guardrail"],
        }),
        fhirSourceData: JSON.stringify({ input }),
      };
    }

    if (finalVerdict === "REVISE") {
      return {
        output: createToolOutput({
          status: "SUCCESS",
          data: {
            verdict: "REVISE",
            safe_to_return: true,
            issues: mergedIssues,
            revised_response:
              geminiResult?.revised_response ??
              "Revise wording for stronger grounding and escalation clarity before returning.",
            confidence,
          },
          confidence,
          sources: ["Josanshi Guardrail"],
        }),
        fhirSourceData: JSON.stringify({ input }),
      };
    }

    return {
      output: createToolOutput({
        status: "SUCCESS",
        data: {
          verdict: "APPROVE",
          safe_to_return: true,
          issues: mergedIssues,
          confidence,
        },
        confidence,
        sources: ["Josanshi Guardrail"],
      }),
      fhirSourceData: JSON.stringify({ input }),
    };
  }
}
