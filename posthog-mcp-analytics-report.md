# PostHog MCP Analytics — Setup Report

## Summary

Cord's MCP server (`/api/mcp`, `/api/mcp/sse`, `/api/mcp/message`) is a **custom JSON-RPC 2.0 dispatcher** — it speaks the MCP protocol directly without wrapping the `@modelcontextprotocol/sdk` Server/McpServer object. This maps to **Path C (custom dispatcher)** in the PostHog MCP analytics skill, which uses `PostHogMCP` (a `posthog-node` subclass) and explicit `captureToolCall` / `captureInitialize` calls at each dispatch point.

Every tool call and initialize handshake handled by both transports (HTTP and SSE) now emits `$mcp_*` events to PostHog.

---

## What was changed

### Package installed

| Package | Version |
|---------|---------|
| `@posthog/mcp` | `^0.10.1` (pre-1.0 beta — pinned) |

`posthog-node` was already a project dependency (`^5.47.0`) and needed no changes.

### Files modified

#### `src/lib/mcp/rpc.ts` — shared JSON-RPC motor
- Imports `PostHogMCP` from `@posthog/mcp`
- Creates a `PostHogMCP` singleton at module scope (`posthogMcp`) using `PUBLIC_POSTHOG_KEY` / `PUBLIC_POSTHOG_HOST` — the same env vars already used by `posthog-server.ts` (no duplication)
- Configured with `flushAt: 1, flushInterval: 0` for reliable delivery in serverless functions
- Calls `posthogMcp?.captureInitialize(...)` in the `initialize` case (client handshake)
- Calls `posthogMcp?.captureToolCall(...)` in the `tools/call` case — covers success, business errors (`McpToolError`), auth errors (write-scope check), and unexpected errors
- Timing (`durationMs`) is measured per tool invocation
- `distinctId` is set to `auth.keyId` (the API key identifier — the best available identity in M2M auth)
- Exports `posthogMcp` so route handlers can flush after each serverless request

#### `src/pages/api/mcp.ts` — HTTP transport
- Imports `posthogMcp` from `rpc.ts`
- Adds `await posthogMcp?.flush()` before returning the response in the `reqContext.run()` block — ensures events aren't dropped when Vercel tears down the function

#### `src/pages/api/mcp/message.ts` — SSE transport (POST leg)
- Same changes as `mcp.ts`

#### `.env`
- Added `PUBLIC_POSTHOG_KEY=phc_yemkmFUa8Sfx8vLHpRt7RKjtsW79ACkwv5MUGWHddBbq`
- Added `PUBLIC_POSTHOG_HOST=https://us.i.posthog.com`

#### `.env.example`
- Added PostHog section with docs for `PUBLIC_POSTHOG_KEY` and `PUBLIC_POSTHOG_HOST`

---

## Events you will see in PostHog

Once the server handles its next request, these events will appear in your PostHog project:

| Event | When emitted |
|-------|-------------|
| `$mcp_initialize` | On each client handshake (`initialize` method) |
| `$mcp_tool_call` | On each `tools/call` — success or error |
| `$exception` | Automatically when a tool call fails (`enableExceptionAutocapture: true`) |

All events carry:
- `$mcp_tool_name` — name of the tool called
- `$mcp_parameters` — sanitized call arguments
- `$mcp_response` — sanitized tool result
- `$mcp_duration_ms` — wall-clock time for the call
- `$mcp_is_error` — whether the call failed
- `distinct_id` — the API key ID (`keyId`) of the caller

---

## Manual steps

1. **Add `PUBLIC_POSTHOG_KEY` and `PUBLIC_POSTHOG_HOST` to Vercel** (Production Environment Variables) — the values are already in `.env` for local development. Set them in your Vercel project under Settings → Environment Variables so production also emits events.

2. **That's it.** Both transports (HTTP `POST /api/mcp` and SSE `GET /api/mcp/sse` + `POST /api/mcp/message`) share the same `rpc.ts` motor, so both are instrumented by a single set of changes.

---

## Reference

- PostHog MCP Analytics docs: https://posthog.com/docs/mcp-analytics
- SDK: `@posthog/mcp` is pre-1.0 (beta) — pin the version (`^0.10.1`) and watch the [changelog](https://github.com/PostHog/posthog-js/releases) for breaking changes before upgrading
