# Josanshi: Problem, Logic, Tooling, and 1st-Prize Readiness

## Project Goal

Josanshi is a maternal-health clinical support MCP server for Prompt Opinion.
The mission is to help care teams detect high-risk postpartum issues early, reduce care gaps, and improve equitable follow-up outcomes.

This system is built for hackathon delivery with safety-first behavior suitable for future real-world hardening.

## Problem Statement

Maternal and postpartum care workflows frequently fail because of:

- fragmented patient evidence across notes and structured data
- delayed identification of severe warning signs
- inconsistent follow-up after discharge
- coverage cliff and access barriers
- unequal care delivery across demographic groups

Josanshi solves this by combining value-based risk tools + strict guardrails + operational workflow guidance.

## System Logic (End-to-End)

1. **Startup check first** with `get_system_status`
2. If warm-up/down state, warn user to retry in about 1 minute (free-server cold starts)
3. Gather evidence with built-in tools (`GetPatientDocuments` first)
4. Extract only tool-required values
5. Run relevant MCP analysis tools
6. Synthesize a concise clinical-support answer with explicit uncertainty
7. Run `guardrail` before final return

## Architecture Summary

- MCP transport + session context handling
- value-based maternal risk tools (no hidden ID-fetch analysis)
- equity disparity analytics from supplied patient arrays
- deterministic + Gemini semantic guardrail
- prompt-layer behavior contracts in `/prompts`

## Active Tool Catalog (Current Registered Tools)

### Utility / Readiness

#### 1) `get_system_status`
Purpose:

- check platform/FHIR readiness at request start
- detect warm-up/down state

Input:

- `{}`

Output highlights:

- `serviceStatus`: `READY | WARMING_UP | DEGRADED`
- `fhirStatus`
- user-facing retry guidance for cold starts

#### 2) `get_all_patients_id`
Purpose:

- list available patient IDs in current panel context

Input:

- `{}`

#### 3) `patient_id_to_name`
Purpose:

- resolve ID to display identity fields

Input:

- `patientId: string`

### Clinical Analysis Tools (Value-Based)

#### 4) `evaluate_postpartum_urgency`
Inputs: vitals + red-flag symptoms.
Output: urgency level, flags, escalation recommendation.

#### 5) `assess_hypertensive_disorder_from_values`
Inputs: BP, severe symptoms, key labs.
Output: severe-feature classification and urgency guidance.

#### 6) `assess_maternal_sepsis_from_values`
Inputs: infection concern + vitals/mental status/lactate.
Output: sepsis concern level and escalation guidance.

#### 7) `assess_vte_risk_from_values`
Inputs: postpartum VTE risk factors.
Output: VTE risk score/level and prevention-review recommendation.

#### 8) `assess_postpartum_followup_from_values`
Inputs: postpartum timing + complication/risk profile.
Output: recommended follow-up window.

#### 9) `assess_cardiac_risk_from_values`
Inputs: age/BMI/cardiac history/symptoms/BNP/EF.
Output: maternal cardiac risk score + tier (`Tier 1/2/3`) + escalation flags.

#### 10) `assess_depression_from_values`
Inputs: EPDS or PHQ-9 + self-harm item.
Output: severity and urgency recommendation.

#### 11) `assess_gdm_postpartum_screening_from_values`
Inputs: GDM history, postpartum weeks, OGTT/glucose values.
Output: screening-window status + glycemic classification.

#### 12) `assess_anemia_from_values`
Inputs: hemoglobin, ferritin, symptoms.
Output: anemia severity and escalation signal.

#### 13) `assess_pph_risk_from_values`
Inputs: baseline hemorrhage risk factors.
Output: PPH risk score + level.

#### 14) `assess_pph_treatment_urgency_from_values`
Inputs: active bleeding/hemodynamics/time since birth.
Output: treatment urgency + instability flags.

#### 15) `assess_coverage_cliff_from_values`
Inputs: coverage end date + reference date.
Output: days remaining + cliff urgency.

#### 16) `assess_maternal_vaccine_plan_from_values`
Inputs: pregnancy stage + vaccine status/non-immunity flags.
Output: due-now and postpartum-only vaccine recommendations.

#### 17) `assess_medication_safety_from_values`
Inputs: medication + pregnancy/lactation categories.
Output: concern levels + overall risk recommendation.

#### 18) `scan_equity_disparity_from_values`
Inputs: patient-level array with demographic group + care metrics.
Output: per-group disparity metrics + overall disparity index.

### Safety Gate

#### 19) `guardrail`
Inputs: user prompt + draft response + evidence summary.
Output: `APPROVE | REVISE | BLOCK` with structured issues.

Guardrail design:

- deterministic hard block for dangerous/fabricated/out-of-scope signals
- Gemini Flash Lite semantic judge with 5s timeout
- safe fallback when judge unavailable

## Why This Is Competitive

### AI Factor

- Multi-tool reasoning across high-risk maternal domains
- LLM-as-judge safety pattern on top of deterministic checks
- value-based interpretable outputs for each risk domain

### Potential Impact

- addresses top maternal harm pathways: hypertensive crisis, sepsis, hemorrhage, cardiac risk, depression/self-harm, care access gaps
- explicit coverage-cliff and equity tooling supports real care operations

### Feasibility

- tools are deterministic and fast
- startup status probe handles free-server cold starts
- all checks currently pass in this repository

## 1st-Prize Readiness Check

### Current Strengths

- broad maternal tool coverage (19 active tools)
- explicit equity disparity scanner
- dedicated cardiac risk tool
- strict guardrail policy + semantic judging
- complete compile/lint/test green locally

### Remaining Risks

- outcome quality still depends on good value extraction from documents
- clinical thresholds are heuristic and need continued expert review
- demo quality can underperform if startup/cold-start handling is unclear

### High-Value Next Moves (Recommended)

1. Add focused tests for new tools (`get_system_status`, `assess_cardiac_risk_from_values`, `scan_equity_disparity_from_values`).
2. Record a tight 2-3 minute demo with one urgent-risk case + one equity panel case.
3. Add a short “clinical limitations” section to demo narration to show safety maturity.
4. Prepare one slide mapping each judge criterion to concrete tool evidence.

## Demo Script Skeleton (Under 3 Minutes)

1. Call `get_system_status` (show readiness handling).
2. Run patient risk flow on one high-risk case (urgency + hypertension + sepsis + cardiac + guardrail).
3. Run panel equity flow with `scan_equity_disparity_from_values`.
4. Show final guarded summary and next-step actions.

## Final Standard

To maximize winning probability:

- keep claims grounded
- escalate danger clearly
- demonstrate unique moat (equity + semantic guardrail + cardiac focus)
- show practical clinical workflow value, not just model output
