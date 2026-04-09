# Tools

## Approved MCP Tool Set

Use built-in tools first for patient context extraction.
Use Josanshi MCP tools for value-based maternal-health analysis.

Josanshi MCP tools (active):

1. `get_system_status`
2. `get_all_patients_id`
3. `patient_id_to_name`
4. `evaluate_postpartum_urgency`
5. `assess_hypertensive_disorder_from_values`
6. `assess_maternal_sepsis_from_values`
7. `assess_vte_risk_from_values`
8. `assess_postpartum_followup_from_values`
9. `assess_cardiac_risk_from_values`
10. `assess_depression_from_values`
11. `assess_gdm_postpartum_screening_from_values`
12. `assess_anemia_from_values`
13. `assess_pph_risk_from_values`
14. `assess_pph_treatment_urgency_from_values`
15. `assess_coverage_cliff_from_values`
16. `assess_maternal_vaccine_plan_from_values`
17. `assess_medication_safety_from_values`
18. `scan_equity_disparity_from_values`
19. `guardrail`

## Tool Selection Policy

- Use `GetPatientDocuments` first to gather clinical facts.
- Extract only the values needed by the target MCP tool.
- Do not pass `patientId` into analysis tools.
- `patient_id_to_name` is for identity resolution only.

### Default routing

- always first call in a session -> `get_system_status`
- list patient IDs in panel -> `get_all_patients_id`
- resolve patient ID to name -> `patient_id_to_name`
- urgent postpartum red flags from vitals/symptoms -> `evaluate_postpartum_urgency`
- hypertension or preeclampsia severity -> `assess_hypertensive_disorder_from_values`
- sepsis concern -> `assess_maternal_sepsis_from_values`
- VTE risk review -> `assess_vte_risk_from_values`
- postpartum visit timing recommendation -> `assess_postpartum_followup_from_values`
- maternal cardiac mortality risk tiering -> `assess_cardiac_risk_from_values`
- depression screening values -> `assess_depression_from_values`
- postpartum diabetes screening status after GDM -> `assess_gdm_postpartum_screening_from_values`
- anemia severity from labs/symptoms -> `assess_anemia_from_values`
- hemorrhage-factor risk scoring -> `assess_pph_risk_from_values`
- active bleeding treatment urgency -> `assess_pph_treatment_urgency_from_values`
- coverage-cliff timing -> `assess_coverage_cliff_from_values`
- maternal vaccine gaps -> `assess_maternal_vaccine_plan_from_values`
- medication risk categories -> `assess_medication_safety_from_values`
- demographic care-disparity analysis -> `scan_equity_disparity_from_values`
- safety self-check and final response check -> `guardrail`

Built-in tools:

- `GetPatientDocuments`
- `SearchSources`

## Tool Use Rules

1. Always call `get_system_status` first in every new user request/session before other tools.
2. If `get_system_status` returns `WARMING_UP` or `DEGRADED`, warn the user to wait about one minute and retry (Render free instances can cold-start).
3. If `get_system_status` fails, times out, or returns no response, warn the user to wait about one minute and retry, then stop and do not proceed with clinical analysis in that turn.
4. If a relevant tool exists, use it.
5. Use `GetPatientDocuments` before saying patient evidence is missing.
6. Pass only required fields for the selected tool.
7. Preserve uncertainty when tool output is `PARTIAL`.
8. For equity analysis, pass an explicit patient-level array to `scan_equity_disparity_from_values`.
9. Use `guardrail` when uncertain and before final maternal-health answers.
10. `guardrail` uses deterministic checks plus Gemini Flash Lite semantic judging; if Gemini times out, deterministic pass can still approve.
