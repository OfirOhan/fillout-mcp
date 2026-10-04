/**
 * Minimal typed client for the Fillout REST API.
 * Docs: https://www.fillout.com/help/fillout-rest-api
 */

export const BASE_URLS = {
  us: "https://api.fillout.com/v1/api",
  eu: "https://eu-api.fillout.com/v1/api",
} as const;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface FilloutClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: FetchLike;
}

export interface SubmissionQuery {
  limit?: number;
  offset?: number;
  afterDate?: string;
  beforeDate?: string;
  status?: "finished" | "in_progress";
  sort?: "asc" | "desc";
  search?: string;
  includeEditLink?: boolean;
}

export interface NewSubmission {
  questions: { id: string; value?: unknown }[];
  urlParameters?: { id: string; name: string; value: string }[];
  submissionTime?: string;
}

export class FilloutApiError extends Error {
  constructor(
    public status: number,
    public body: string,
    path: string,
  ) {
    super(`Fillout API ${status} on ${path}: ${body.slice(0, 500)}`);
    this.name = "FilloutApiError";
  }
}

export class FilloutClient {
  private apiKey: string;
  private baseUrl: string;
  private fetchImpl: FetchLike;

  constructor(opts: FilloutClientOptions) {
    if (!opts.apiKey) throw new Error("A Fillout API key is required (set FILLOUT_API_KEY).");
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? BASE_URLS.us).replace(/\/+$/, "");
    this.fetchImpl = opts.fetch ?? ((input, init) => fetch(input, init));
  }

  private async request<T>(method: string, path: string, query?: object, body?: unknown): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await this.fetchImpl(url.toString(), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new FilloutApiError(res.status, text, path);
    if (!text) return {} as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return { message: text } as T;
    }
  }

  listForms() {
    return this.request<{ name: string; formId: string }[]>("GET", "/forms");
  }

  getForm(formId: string) {
    return this.request<Record<string, unknown>>("GET", `/forms/${encodeURIComponent(formId)}`);
  }

  listSubmissions(formId: string, q: SubmissionQuery = {}) {
    return this.request<{ responses: Record<string, unknown>[]; totalResponses: number; pageCount: number }>(
      "GET",
      `/forms/${encodeURIComponent(formId)}/submissions`,
      q,
    );
  }

  getSubmission(formId: string, submissionId: string, includeEditLink?: boolean) {
    return this.request<Record<string, unknown>>(
      "GET",
      `/forms/${encodeURIComponent(formId)}/submissions/${encodeURIComponent(submissionId)}`,
      { includeEditLink },
    );
  }

  async createSubmissions(formId: string, submissions: NewSubmission[]) {
    if (submissions.length < 1 || submissions.length > 10) {
      throw new Error("Fillout accepts between 1 and 10 submissions per request.");
    }
    return this.request<{ submissions: Record<string, unknown>[] }>(
      "POST",
      `/forms/${encodeURIComponent(formId)}/submissions`,
      undefined,
      { submissions },
    );
  }

  deleteSubmission(formId: string, submissionId: string) {
    return this.request<Record<string, unknown>>(
      "DELETE",
      `/forms/${encodeURIComponent(formId)}/submissions/${encodeURIComponent(submissionId)}`,
    );
  }

  createWebhook(formId: string, url: string) {
    return this.request<{ id: number }>("POST", "/webhook/create", undefined, { formId, url });
  }

  deleteWebhook(webhookId: string) {
    return this.request<Record<string, unknown>>("POST", "/webhook/delete", undefined, { webhookId });
  }
}

type NamedValue = { id?: string; name?: string; value?: unknown };

/** Turn Fillout's verbose submission objects into compact, LLM-friendly records. */
export function flattenSubmission(s: Record<string, unknown>): Record<string, unknown> {
  const answers: Record<string, unknown> = {};
  for (const q of (s.questions as NamedValue[] | undefined) ?? []) {
    if (q.value === null || q.value === undefined || q.value === "") continue;
    answers[q.name || q.id || "unknown"] = q.value;
  }
  const out: Record<string, unknown> = {
    submissionId: s.submissionId,
    submissionTime: s.submissionTime,
    answers,
  };
  const calcs = (s.calculations as NamedValue[] | undefined) ?? [];
  if (calcs.length) out.calculations = Object.fromEntries(calcs.map((c) => [c.name ?? c.id, c.value]));
  const params = (s.urlParameters as NamedValue[] | undefined) ?? [];
  if (params.length) out.urlParameters = Object.fromEntries(params.map((p) => [p.name ?? p.id, p.value]));
  for (const k of ["quiz", "login", "editLink", "scheduling", "payments"]) {
    const v = s[k];
    if (v && !(Array.isArray(v) && v.length === 0)) out[k] = v;
  }
  return out;
}
