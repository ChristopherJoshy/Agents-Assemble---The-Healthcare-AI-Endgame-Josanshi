import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { AssessAnemiaFromValuesTool } from "./assess-anemia-from-values.js";
import { AssessCardiacRiskFromValuesTool } from "./assess-cardiac-risk-from-values.js";
import { AssessCoverageCliffFromValuesTool } from "./assess-coverage-cliff-from-values.js";
import { AssessDepressionFromValuesTool } from "./assess-depression-from-values.js";
import { AssessGdmPostpartumScreeningFromValuesTool } from "./assess-gdm-postpartum-screening-from-values.js";
import { AssessHypertensiveDisorderFromValuesTool } from "./assess-hypertensive-disorder-from-values.js";
import { AssessMaternalSepsisFromValuesTool } from "./assess-maternal-sepsis-from-values.js";
import { AssessMedicationSafetyFromValuesTool } from "./assess-medication-safety-from-values.js";
import { AssessMaternalVaccinePlanFromValuesTool } from "./assess-maternal-vaccine-plan-from-values.js";
import { AssessPphRiskFromValuesTool } from "./assess-pph-risk-from-values.js";
import { AssessPphTreatmentUrgencyFromValuesTool } from "./assess-pph-treatment-urgency-from-values.js";
import { AssessPostpartumFollowupFromValuesTool } from "./assess-postpartum-followup-from-values.js";
import { AssessVteRiskFromValuesTool } from "./assess-vte-risk-from-values.js";
import { EvaluatePostpartumUrgencyTool } from "./evaluate-postpartum-urgency.js";
import { GetAllPatientsIdTool } from "./get-all-patients-id.js";
import { GetSystemStatusTool } from "./get-system-status.js";
import { GuardrailTool } from "./guardrail.js";
import { PatientIdToNameTool } from "./patient-id-to-name.js";
import { ScanEquityDisparityFromValuesTool } from "./scan-equity-disparity-from-values.js";
import { WebSearchTool } from "./web-search.js";

const tools = [
  new GetSystemStatusTool(),
  new GetAllPatientsIdTool(),
  new PatientIdToNameTool(),
  new EvaluatePostpartumUrgencyTool(),
  new AssessHypertensiveDisorderFromValuesTool(),
  new AssessMaternalSepsisFromValuesTool(),
  new AssessVteRiskFromValuesTool(),
  new AssessPostpartumFollowupFromValuesTool(),
  new AssessCardiacRiskFromValuesTool(),
  new AssessDepressionFromValuesTool(),
  new AssessGdmPostpartumScreeningFromValuesTool(),
  new AssessAnemiaFromValuesTool(),
  new AssessPphRiskFromValuesTool(),
  new AssessPphTreatmentUrgencyFromValuesTool(),
  new AssessCoverageCliffFromValuesTool(),
  new AssessMaternalVaccinePlanFromValuesTool(),
  new AssessMedicationSafetyFromValuesTool(),
  new ScanEquityDisparityFromValuesTool(),
  new WebSearchTool(),
  new GuardrailTool(),
];

export const registerAllTools = (server: McpServer): void => {
  for (const tool of tools) {
    tool.register(server);
  }
};
