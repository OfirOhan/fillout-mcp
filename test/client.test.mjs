import { test } from "node:test";
import assert from "node:assert/strict";
import { FilloutClient, flattenSubmission, BASE_URLS } from "../dist/client.js";

function mockFetch(responder) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, ...init });
    const { status = 200, body = {} } = (await responder(url, init)) ?? {};
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  };
  fn.calls = calls;
  return fn;
}

test("sends bearer auth to the US base URL by default", async () => {
  const f = mockFetch(() => ({ body: [{ name: "Signup", formId: "abc" }] }));
  const c = new FilloutClient({ apiKey: "k_123", fetch: f });
  const forms = await c.listForms();
  assert.deepEqual(forms, [{ name: "Signup", formId: "abc" }]);
  assert.equal(f.calls[0].url, `${BASE_URLS.us}/forms`);
  assert.equal(f.calls[0].method, "GET");
  assert.equal(f.calls[0].headers.Authorization, "Bearer k_123");
});

test("builds submission query strings and skips empty params", async () => {
  const f = mockFetch(() => ({ body: { responses: [], totalResponses: 0, pageCount: 0 } }));
  const c = new FilloutClient({ apiKey: "k", fetch: f, baseUrl: BASE_URLS.eu });
  await c.listSubmissions("form 1", { limit: 10, status: "finished", search: "", sort: "desc" });
  const u = new URL(f.calls[0].url);
  assert.equal(u.origin + u.pathname, `${BASE_URLS.eu}/forms/form%201/submissions`);
  assert.equal(u.searchParams.get("limit"), "10");
  assert.equal(u.searchParams.get("sort"), "desc");
  assert.equal(u.searchParams.has("search"), false);
});

test("posts submissions and webhooks with JSON bodies", async () => {
  const f = mockFetch(() => ({ body: { id: 7 } }));
  const c = new FilloutClient({ apiKey: "k", fetch: f });
  await c.createSubmissions("f1", [{ questions: [{ id: "q1", value: "hi" }] }]);
  assert.equal(f.calls[0].method, "POST");
  assert.deepEqual(JSON.parse(f.calls[0].body), { submissions: [{ questions: [{ id: "q1", value: "hi" }] }] });
  await c.createWebhook("f1", "https://example.com/hook");
  assert.ok(f.calls[1].url.endsWith("/webhook/create"));
  await c.deleteWebhook("7");
  assert.deepEqual(JSON.parse(f.calls[2].body), { webhookId: "7" });
  await assert.rejects(() => c.createSubmissions("f1", []), /between 1 and 10/);
});

test("surfaces API errors with status and body", async () => {
  const f = mockFetch(() => ({ status: 401, body: { error: "Invalid API key" } }));
  const c = new FilloutClient({ apiKey: "bad", fetch: f });
  await assert.rejects(() => c.listForms(), /Fillout API 401 on \/forms: .*Invalid API key/);
});

test("flattens submissions into answers keyed by question name", () => {
  const flat = flattenSubmission({
    submissionId: "s1",
    submissionTime: "2026-01-01T00:00:00Z",
    questions: [
      { id: "a", name: "Email", type: "EmailInput", value: "x@y.com" },
      { id: "b", name: "Comments", type: "LongAnswer", value: null },
    ],
    calculations: [{ id: "c", name: "Score", type: "number", value: "42" }],
    urlParameters: [],
    scheduling: [],
  });
  assert.deepEqual(flat, {
    submissionId: "s1",
    submissionTime: "2026-01-01T00:00:00Z",
    answers: { Email: "x@y.com" },
    calculations: { Score: "42" },
  });
});
