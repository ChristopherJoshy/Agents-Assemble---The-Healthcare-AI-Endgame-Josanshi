import type { ToolContext } from "../types/index.js";

export type FhirResource = Record<string, unknown> & {
  resourceType?: string;
  id?: string;
};

export type FhirBundle = FhirResource & {
  resourceType: "Bundle";
  entry?: Array<{ resource?: FhirResource }>;
};

const emptyBundle = (): FhirBundle => ({
  resourceType: "Bundle",
  type: "searchset",
  total: 0,
  entry: [],
});

const toQueryString = (params: Record<string, string | number | undefined>): string => {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && `${value}`.length > 0) {
      search.set(key, `${value}`);
    }
  }

  const query = search.toString();
  return query.length > 0 ? `?${query}` : "";
};

export class FhirClient {
  public constructor(private readonly context: ToolContext) {}

  public async get(
    resourceType: string,
    params: Record<string, string | number | undefined> = {},
  ): Promise<FhirResource | FhirBundle | null> {
    if (!this.context.fhirServerUrl) {
      throw new Error(
        "Missing X-FHIR-Server-URL / x-fhir-server-url header. Josanshi now requires live Prompt Opinion FHIR context and no longer uses local fallback data.",
      );
    }

    return this.getFromRemote(resourceType, params);
  }

  private async getFromRemote(
    resourceType: string,
    params: Record<string, string | number | undefined>,
  ): Promise<FhirResource | FhirBundle | null> {
    if (!this.context.fhirServerUrl) {
      return null;
    }

    const resourceId = typeof params._id === "string" ? params._id : undefined;
    const queryParams = { ...params };
    delete queryParams._id;

    const baseUrl = this.context.fhirServerUrl.replace(/\/$/, "");
    const url =
      resourceId !== undefined
        ? `${baseUrl}/${resourceType}/${resourceId}${toQueryString(queryParams)}`
        : `${baseUrl}/${resourceType}${toQueryString(queryParams)}`;

    const headers: Record<string, string> = {};
    if (this.context.accessToken) {
      headers.Authorization = `Bearer ${this.context.accessToken}`;
    }
    headers.Prefer = "handling=lenient";

    const doFetch = async (requestUrl: string): Promise<Response | null> =>
      fetch(requestUrl, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(5000),
      }).catch(() => null);

    const response = await doFetch(url);

    if (!response || response.status === 404) {
      return null;
    }

    const alternates = resourceId === undefined ? getAlternateSearchParams(resourceType, params) : [];

    if (!response.ok && [400, 404, 422].includes(response.status)) {
      for (const alternateParams of alternates) {
        const alternateUrl = `${baseUrl}/${resourceType}${toQueryString(alternateParams)}`;
        const alternateResponse = await doFetch(alternateUrl);

        if (!alternateResponse || alternateResponse.status === 404) {
          continue;
        }

        if (!alternateResponse.ok) {
          continue;
        }

        const alternateParsed = (await alternateResponse.json()) as FhirResource | FhirBundle;
        if (!isEmptyBundle(alternateParsed)) {
          return alternateParsed;
        }
      }

      return resourceId === undefined ? emptyBundle() : null;
    }

    if (!response.ok) {
      throw new Error(`FHIR request failed (${response.status}) for ${resourceType}`);
    }

    const parsed = (await response.json()) as FhirResource | FhirBundle;

    if (alternates.length > 0 && isEmptyBundle(parsed)) {
      for (const alternateParams of alternates) {
        const alternateUrl = `${baseUrl}/${resourceType}${toQueryString(alternateParams)}`;
        const alternateResponse = await doFetch(alternateUrl);

        if (!alternateResponse || !alternateResponse.ok) {
          continue;
        }

        const alternateParsed = (await alternateResponse.json()) as FhirResource | FhirBundle;
        if (!isEmptyBundle(alternateParsed)) {
          return alternateParsed;
        }
      }
    }

    return parsed;
  }
}

const isEmptyBundle = (response: FhirResource | FhirBundle | null): boolean =>
  !response ||
  (response.resourceType === "Bundle" &&
    (!Array.isArray(response.entry) || response.entry.length === 0));

const getAlternateSearchParams = (
  resourceType: string,
  params: Record<string, string | number | undefined>,
): Array<Record<string, string | number | undefined>> => {
  if (typeof params.patient !== "string" || params.patient.length === 0) {
    return [];
  }

  const patientId = params.patient;
  const patientReference = `Patient/${patientId}`;
  const base = { ...params };
  delete base.patient;

  switch (resourceType) {
    case "Coverage":
      return [
        { ...base, beneficiary: patientId },
        { ...base, beneficiary: patientReference },
        { ...base, subscriber: patientId },
        { ...base, subscriber: patientReference },
      ];
    case "ServiceRequest":
      return [{ ...base, subject: patientId }, { ...base, subject: patientReference }];
    case "Encounter":
      return [{ ...base, subject: patientId }, { ...base, subject: patientReference }];
    case "CarePlan":
    case "Procedure":
    case "Condition":
    case "Observation":
    case "MedicationRequest":
    case "AllergyIntolerance":
    case "Immunization":
      return [{ ...base, subject: patientId }, { ...base, subject: patientReference }];
    default:
      return [];
  }
};

export const bundleEntries = <T extends Record<string, unknown>>(
  response: FhirResource | FhirBundle | null,
): T[] => {
  if (!response) {
    return [];
  }

  if (response.resourceType === "Bundle") {
    const bundle = response as FhirBundle;
    const output: T[] = [];
    for (const entry of bundle.entry ?? []) {
      if (entry.resource) {
        output.push(entry.resource as T);
      }
    }
    return output;
  }

  return [response as T];
};

export const firstResource = <T extends Record<string, unknown>>(
  response: FhirResource | FhirBundle | null,
): T | null => bundleEntries<T>(response)[0] ?? null;
