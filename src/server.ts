import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { FilloutClient, flattenSubmission } from "./client.js";

export const VERSION = "0.1.0";

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return ok(await fn());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
  }
}

const formId = z.string().min(1).describe("The form's public ID (from list_forms or the form URL)");
const submissionId = z.string().min(1).describe("The submission ID");

export const TOOL_NAMES = [
  "list_forms",
  "get_form",
  "list_submissions",
  "get_submission",
  "create_submissions",
  "delete_submission",
  "create_webhook",
  "delete_webhook",
] as const;

export function createServer(client: FilloutClient): McpServer {
  const server = new McpServer({ name: "fillout-mcp", version: VERSION });

  server.registerTool(
    "list_forms",
    {
      title: "List forms",
      description: "List all Fillout forms in the account (name and formId).",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => run(() => client.listForms()),
  );

  server.registerTool(
    "get_form",
    {
      title: "Get form structure",
      description:
        "Get a form's questions (id, name, type) plus calculations, URL parameters, scheduling, payment and quiz fields. Use the question ids when creating submissions.",
      inputSchema: { formId },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ formId }) => run(() => client.getForm(formId)),
  );

  server.registerTool(
    "list_submissions",
    {
      title: "List submissions",
      description:
        "Query a form's submissions with date range, status, text search and pagination. Returns compact records (answers keyed by question name) unless raw=true.",
      inputSchema: {
        formId,
        limit: z.number().int().min(1).max(150).optional().describe("Page size, 1-150 (default 50)"),
        offset: z.number().int().min(0).optional().describe("Number of submissions to skip"),
        afterDate: z.string().optional().describe("Only submissions after this ISO 8601 date-time"),
        beforeDate: z.string().optional().describe("Only submissions before this ISO 8601 date-time"),
        status: z.enum(["finished", "in_progress"]).optional().describe("Default: finished"),
        sort: z.enum(["asc", "desc"]).optional().describe("Sort by submission time (default asc)"),
        search: z.string().optional().describe("Free-text search across answers"),
        includeEditLink: z.boolean().optional(),
        raw: z.boolean().optional().describe("Return Fillout's full objects instead of compact records"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ formId, raw, ...q }) =>
      run(async () => {
        const res = await client.listSubmissions(formId, q);
        const responses = res.responses ?? [];
        return {
          totalResponses: res.totalResponses,
          pageCount: res.pageCount,
          responses: raw ? responses : responses.map(flattenSubmission),
        };
      }),
  );

  server.registerTool(
    "get_submission",
    {
      title: "Get submission",
      description: "Get one submission by ID.",
      inputSchema: { formId, submissionId, includeEditLink: z.boolean().optional(), raw: z.boolean().optional() },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ formId, submissionId, includeEditLink, raw }) =>
      run(async () => {
        const res = await client.getSubmission(formId, submissionId, includeEditLink);
        const sub = ((res as { submission?: Record<string, unknown> }).submission ?? res) as Record<string, unknown>;
        return raw ? sub : flattenSubmission(sub);
      }),
  );

  server.registerTool(
    "create_submissions",
    {
      title: "Create submissions",
      description:
        "Create 1-10 submissions for a form (for example, to import data). Call get_form first to get question ids. Note: submissions created via the API do not trigger Fillout notifications, workflows or integrations.",
      inputSchema: {
        formId,
        submissions: z
          .array(
            z.object({
              questions: z.array(z.object({ id: z.string(), value: z.any() })).min(1),
              urlParameters: z.array(z.object({ id: z.string(), name: z.string(), value: z.string() })).optional(),
              submissionTime: z.string().optional(),
            }),
          )
          .min(1)
          .max(10),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ formId, submissions }) => run(() => client.createSubmissions(formId, submissions)),
  );

  server.registerTool(
    "delete_submission",
    {
      title: "Delete submission",
      description: "Permanently delete a submission. This cannot be undone, so confirm with the user first.",
      inputSchema: { formId, submissionId },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    async ({ formId, submissionId }) => run(() => client.deleteSubmission(formId, submissionId)),
  );

  server.registerTool(
    "create_webhook",
    {
      title: "Create webhook",
      description: "Register a URL that Fillout calls on every new submission to a form. Returns the webhook id.",
      inputSchema: { formId, url: z.string().url().describe("HTTPS endpoint that receives submissions") },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ formId, url }) => run(() => client.createWebhook(formId, url)),
  );

  server.registerTool(
    "delete_webhook",
    {
      title: "Delete webhook",
      description: "Remove a webhook by its id.",
      inputSchema: { webhookId: z.union([z.string(), z.number()]).describe("Webhook id from create_webhook") },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    async ({ webhookId }) => run(() => client.deleteWebhook(String(webhookId))),
  );

  return server;
}
