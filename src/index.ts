#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BASE_URLS, FilloutClient } from "./client.js";
import { createServer } from "./server.js";

async function main() {
  const apiKey = process.env.FILLOUT_API_KEY ?? "";
  if (!apiKey) {
    console.error("fillout-mcp: FILLOUT_API_KEY is not set. Create a key in Fillout > Settings > Developer.");
    process.exit(1);
  }
  const region = (process.env.FILLOUT_REGION ?? "us").toLowerCase();
  const baseUrl = process.env.FILLOUT_BASE_URL ?? (region === "eu" ? BASE_URLS.eu : BASE_URLS.us);
  const server = createServer(new FilloutClient({ apiKey, baseUrl }));
  await server.connect(new StdioServerTransport());
  console.error(`fillout-mcp running (${baseUrl})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
