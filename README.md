# Fillout MCP Server

[![CI](https://github.com/OfirOhan/fillout-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/OfirOhan/fillout-mcp/actions/workflows/ci.yml)
![MCP](https://img.shields.io/badge/MCP-compatible-blue)
![License: MIT](https://img.shields.io/badge/license-MIT-green)

A [Model Context Protocol](https://modelcontextprotocol.io) server for **[Fillout](https://www.fillout.com)**. It lets Claude, Cursor, ChatGPT and other AI agents work with your forms and submissions.

> **Unofficial.** This is a community project and is not affiliated with Fillout. It was built from Fillout's public REST API docs.

## What you can ask your agent

- "Summarize this week's responses to my **Customer feedback** form and group the complaints by theme."
- "Which leads from the **Demo request** form mentioned a budget over $10k? Put them in a table."
- "Import these 8 rows from my CSV into the **Event signup** form."
- "Set up a webhook so new **Applications** go to `https://hooks.example.com/apply`."

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list_forms` | List all forms (name + id) | No |
| `get_form` | Questions, types, calculations, URL params, quiz/payment fields | No |
| `list_submissions` | Filter by date range, status, free-text search; paginated; compact output | No |
| `get_submission` | One submission by id | No |
| `create_submissions` | Create 1–10 submissions (imports, back-fills) | Yes |
| `delete_submission` | Permanently delete a submission | **Destructive** |
| `create_webhook` | Send new submissions to a URL | Yes |
| `delete_webhook` | Remove a webhook | Yes |

Submissions are returned in a compact, token-friendly shape: `answers` are keyed by question name, and empty fields are dropped. Pass `raw: true` to get Fillout's full objects instead. Destructive tools carry MCP `destructiveHint` annotations, so clients can ask before running them.

## Setup

1. Create an API key in Fillout: **Settings → Developer → API key**.
2. Build it:

```bash
git clone https://github.com/OfirOhan/fillout-mcp.git
cd fillout-mcp && npm install && npm run build
```

### Claude Desktop

Add this to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "fillout": {
      "command": "node",
      "args": ["/absolute/path/to/fillout-mcp/dist/index.js"],
      "env": { "FILLOUT_API_KEY": "your_api_key" }
    }
  }
}
```

### Cursor / Claude Code / other MCP clients

Use the same command, `node /path/to/fillout-mcp/dist/index.js`, with `FILLOUT_API_KEY` in the environment. For Claude Code:

```bash
claude mcp add fillout -e FILLOUT_API_KEY=your_api_key -- node /path/to/fillout-mcp/dist/index.js
```

### Configuration

| Variable | Default | Notes |
|---|---|---|
| `FILLOUT_API_KEY` | (required) | Fillout API key |
| `FILLOUT_REGION` | `us` | Set to `eu` for EU-hosted accounts |
| `FILLOUT_BASE_URL` | (from region) | Override for self-hosted instances |

## Development

```bash
npm install
npm test   # builds, runs unit tests and an end-to-end MCP stdio test against a fake Fillout API
```

The tests run on Node 18, 20 and 22 in CI.

## Notes & limits

- Fillout's API limits requests to 5 per second per key.
- Submissions created via the API don't trigger Fillout notifications, workflows or integrations. This is Fillout's behaviour.

## Author

Built by [Ofir Ohana](https://github.com/OfirOhan), an AI agents engineer. Issues and PRs are welcome.

## License

MIT
