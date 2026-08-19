import type {
  ContactImportPreviewRow,
  ContactImportResultSummary,
  CustomerContact,
  CustomerContactInput,
  CustomerListFilters,
  CustomerRequirement,
  CustomerRequirementInput,
  CustomerResponseOutcome,
  DemandAnalyticsRow,
  DemandPoolDashboardStats,
  MatchSummary,
  PrepareRecommendationResult,
  PropertyRecommendation,
} from "./types";

export class DemandPoolApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "DemandPoolApiError";
    this.status = status;
    this.details = details;
  }
}

async function parseJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });
  const body = (await parseJson(res)) as Record<string, unknown> | null;
  if (!res.ok) {
    const message =
      (typeof body?.error === "string" && body.error) ||
      (typeof body?.message === "string" && body.message) ||
      `Request failed (${res.status})`;
    throw new DemandPoolApiError(message, res.status, body);
  }
  return body as T;
}

function toQuery(filters: CustomerListFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const demandPoolApi = {
  listCustomers(filters: CustomerListFilters = {}) {
    return request<{ contacts: CustomerContact[]; total: number }>(`/api/customers${toQuery(filters)}`);
  },

  getCustomer(id: string) {
    return request<{ contact: CustomerContact }>(`/api/customers/${id}`);
  },

  createCustomer(input: CustomerContactInput) {
    return request<{ contact: CustomerContact; deduped: boolean }>("/api/customers", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  updateCustomer(id: string, input: Partial<CustomerContactInput>) {
    return request<{ contact: CustomerContact }>(`/api/customers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  createRequirement(customerId: string, input: CustomerRequirementInput) {
    return request<{ requirement: CustomerRequirement }>(`/api/customers/${customerId}/requirements`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  updateRequirement(requirementId: string, input: Partial<CustomerRequirementInput> | { confirm: true }) {
    return request<{ requirement: CustomerRequirement }>(`/api/customers/requirements/${requirementId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  convertRequirementToLead(requirementId: string) {
    return request<{ lead: { id: string; leadCode: string }; alreadyConverted: boolean }>(
      `/api/customers/requirements/${requirementId}/convert-to-lead`,
      { method: "POST", body: "{}" }
    );
  },

  getRequirementMatches(requirementId: string, tier?: string) {
    const qs = tier ? `?tier=${encodeURIComponent(tier)}` : "";
    return request<{ recommendations: PropertyRecommendation[] }>(
      `/api/customers/requirements/${requirementId}/matches${qs}`
    );
  },

  rematchRequirement(requirementId: string) {
    return request<{ created?: number; updated?: number }>(`/api/customers/requirements/${requirementId}/matches`, {
      method: "POST",
      body: "{}",
    });
  },

  getPropertyMatches(propertyId: string, filters: Record<string, string> = {}) {
    const params = new URLSearchParams(filters);
    const qs = params.toString() ? `?${params}` : "";
    return request<{ recommendations: PropertyRecommendation[]; summary: MatchSummary }>(
      `/api/properties/${propertyId}/matches${qs}`
    );
  },

  rematchProperty(propertyId: string) {
    return request<{ created?: number; updated?: number }>(`/api/properties/${propertyId}/matches`, {
      method: "POST",
      body: "{}",
    });
  },

  prepareRecommendation(id: string) {
    return request<PrepareRecommendationResult>(`/api/recommendations/${id}/prepare`, {
      method: "POST",
      body: "{}",
    });
  },

  markRecommendationSent(id: string) {
    return request<{ recommendation: PropertyRecommendation }>(`/api/recommendations/${id}/mark-sent`, {
      method: "POST",
      body: "{}",
    });
  },

  respondToRecommendation(id: string, outcome: CustomerResponseOutcome) {
    return request<{ recommendation: PropertyRecommendation }>(`/api/recommendations/${id}/respond`, {
      method: "POST",
      body: JSON.stringify({ outcome }),
    });
  },

  /** Optional analytics endpoint — UI hides cards when unavailable. */
  getDashboardStats() {
    return request<{ stats: DemandPoolDashboardStats }>("/api/customers/stats");
  },

  getDemandAnalytics() {
    return request<{ rows: DemandAnalyticsRow[] }>("/api/customers/analytics");
  },

  /** Import preview/execute — prefers dedicated customer import routes when present. */
  async previewContactImport(payload: {
    rows: Record<string, string>[];
    mapping: Record<string, string>;
    mode: string;
  }) {
    try {
      return await request<{ rows: ContactImportPreviewRow[] }>("/api/customers/import/preview", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (err) {
      if (err instanceof DemandPoolApiError && err.status === 404) {
        return { rows: buildLocalImportPreview(payload.rows, payload.mapping) };
      }
      throw err;
    }
  },

  async executeContactImport(payload: {
    fileName: string;
    rows: Record<string, string>[];
    columnMapping: Record<string, string>;
    mode: string;
  }) {
    try {
      return await request<{ summary: ContactImportResultSummary; job?: { id: string } }>("/api/customers/import/execute", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (err) {
      if (err instanceof DemandPoolApiError && (err.status === 404 || err.status === 400)) {
        return request<{ job: { id: string }; outcomes: unknown[] }>("/api/imports", {
          method: "POST",
          body: JSON.stringify({
            entityType: "CONTACTS",
            fileName: payload.fileName,
            rows: payload.rows,
            columnMapping: payload.columnMapping,
          }),
        }).then((body) => ({
          summary: summarizeImportOutcomes(body.outcomes),
          job: body.job,
        }));
      }
      throw err;
    }
  },

  getWhatsAppHealth() {
    return request<{ configured?: boolean; providerConfigured?: boolean; status?: string }>(
      "/api/system/whatsapp-health"
    );
  },
};

function buildLocalImportPreview(rows: Record<string, string>[], mapping: Record<string, string>): ContactImportPreviewRow[] {
  return rows.map((row, index) => {
    const data: Record<string, unknown> = {};
    for (const [target, source] of Object.entries(mapping)) {
      if (source && row[source] !== undefined && row[source] !== "") data[target] = row[source];
    }
    const issues: ContactImportPreviewRow["issues"] = [];
    if (!data.name || String(data.name).trim().length < 2) issues.push({ field: "name", message: "Name is required", severity: "ERROR" });
    if (!data.phone || String(data.phone).trim().length < 8) issues.push({ field: "phone", message: "Phone is required", severity: "ERROR" });
    const hasError = issues.some((i) => i.severity === "ERROR");
    return {
      rowNumber: index + 1,
      data,
      issues,
      duplicateClass: hasError ? "INVALID" : "NEW",
      action: hasError ? "SKIP" : "CREATE",
      state: hasError ? "ERROR" : "READY",
    };
  });
}

/** Maps the real /api/imports outcome statuses (VALID/INVALID/DUPLICATE/IMPORTED/SKIPPED) onto the contact-import summary shape. */
function summarizeImportOutcomes(outcomes: unknown[]): ContactImportResultSummary {
  const list = Array.isArray(outcomes) ? outcomes : [];
  const summary: ContactImportResultSummary = {
    newContacts: 0,
    existingContacts: 0,
    newRequirements: 0,
    updatedRequirements: 0,
    skipped: 0,
    invalid: 0,
  };
  for (const item of list) {
    const status = typeof item === "object" && item && "status" in item ? String((item as { status: string }).status) : "";
    switch (status) {
      case "IMPORTED":
        summary.newContacts += 1;
        break;
      case "DUPLICATE":
        summary.existingContacts += 1;
        break;
      case "INVALID":
        summary.invalid += 1;
        break;
      case "SKIPPED":
        summary.skipped += 1;
        break;
      default:
        summary.skipped += 1;
    }
  }
  return summary;
}
