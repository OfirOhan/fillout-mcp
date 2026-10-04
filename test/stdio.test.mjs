// End-to-end: start the real MCP server over stdio against a local fake Fillout API.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { once } from "node:events";

const entry = fileURLToPath(new URL("../dist/index.js", import.meta.url));

function fakeFillout() {
  const seen = [];
  const srv = createServer((req, res) => {
    seen.push({ method: req.method, url: req.url, auth: req.headers.authorization });
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/forms") return res.end(JSON.stringify([{ name: "Contact", formId: "f123" }]));
    if (req.url.startsWith("/forms/f123/submissions")) {
      return res.end(
        JSON.stringify({
          responses: [
            { submissionId: "s1", submissionTime: "2026-10-01T10:00:00Z", questions: [{ id: "q", name: "Name", value: "Dana" }] },
          ],
          totalResponses: 1,
          pageCount: 1,
        }),
      );
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not found" }));
  });
  return { srv, seen };
}

function rpcClient(child) {
  let buf = "";
  const pending = new Map();
  child.stdout.on("data", (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    }
  });
  let id = 0;
  return {
    request(method, params) {
      const myId = ++id;
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: myId, method, params }) + "\n");
      return new Promise((resolve, reject) => {
        pending.set(myId, resolve);
        setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), 10000);
      });
    },
    notify(method, params) {
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
    },
  };
}

test("MCP handshake, tool listing and a real tool call", async () => {
  const { srv, seen } = fakeFillout();
  srv.listen(0);
  await once(srv, "listening");
  const port = srv.address().port;

  const child = spawn(process.execPath, [entry], {
    env: { ...process.env, FILLOUT_API_KEY: "test_key", FILLOUT_BASE_URL: `http://127.0.0.1:${port}` },
    stdio: ["pipe", "pipe", "pipe"],
  });
  try {
    const rpc = rpcClient(child);
    const init = await rpc.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "0.0.0" },
    });
    assert.equal(init.result.serverInfo.name, "fillout-mcp");
    rpc.notify("notifications/initialized", {});

    const list = await rpc.request("tools/list", {});
    const names = list.result.tools.map((t) => t.name).sort();
    assert.deepEqual(names, [
      "create_submissions",
      "create_webhook",
      "delete_submission",
      "delete_webhook",
      "get_form",
      "get_submission",
      "list_forms",
      "list_submissions",
    ]);
    const del = list.result.tools.find((t) => t.name === "delete_submission");
    assert.equal(del.annotations.destructiveHint, true);

    const forms = await rpc.request("tools/call", { name: "list_forms", arguments: {} });
    assert.deepEqual(JSON.parse(forms.result.content[0].text), [{ name: "Contact", formId: "f123" }]);

    const subs = await rpc.request("tools/call", { name: "list_submissions", arguments: { formId: "f123", limit: 5 } });
    const parsed = JSON.parse(subs.result.content[0].text);
    assert.deepEqual(parsed.responses[0].answers, { Name: "Dana" });
    assert.ok(seen.some((s) => s.url === "/forms/f123/submissions?limit=5"));
    assert.ok(seen.every((s) => s.auth === "Bearer test_key"));

    const bad = await rpc.request("tools/call", { name: "get_form", arguments: { formId: "missing" } });
    assert.equal(bad.result.isError, true);
    assert.match(bad.result.content[0].text, /Fillout API 404/);
  } finally {
    child.kill();
    srv.close();
  }
});
