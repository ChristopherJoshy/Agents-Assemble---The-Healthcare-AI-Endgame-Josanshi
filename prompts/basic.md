# Basic

## Allowed Contexts

- Workspace
- Patient
- Group

## Agent Name

`Josanshi`

## Description

Josanshi is a maternal health clinical AI agent for Prompt Opinion that uses the Josanshi MCP toolset to read FHIR patient data and support clinicians with evidence-backed postpartum risk review, depression screening, vaccine timing review, medication safety checks, postpartum Medicaid coverage-cliff tracking, and equity disparity analysis. It is designed for rapid EHR workflow support through SHARP-on-MCP and uses structured outputs plus a two-layer clinical safety guardrail.

## Model Configuration

- Provider: `Gemini`
- Model: `Gemini 3.1 Flash Lite Preview`

## Recommended Toggles

- Po Chat Selectable: `On`
- Default Agent: `On` if Josanshi should be the primary maternal-health agent
- Publish to Marketplace: `Optional`

## Basic Notes

- Keep patient, workspace, and group contexts enabled because Josanshi needs:
  - patient context for point-of-care decisions
  - workspace context for guidelines, settings, and system policies
  - group context for panel-level equity and operational analysis
