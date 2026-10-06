---
title: "We audited our MCP server: what we found and how we fixed it"
description: "A privilege escalation in the SSE transport, an output contract that wasn't honored, amounts without currency and seven new tools. The full audit of Cord's MCP server."
date: "2026.10.06"
type: "BLOG"
topic: "Security"
authors:
  - "CORD ENG"
readTime: "7 MIN"
---
Cord's MCP server connects assistants like Claude or Cursor to a business's real data: quotes, invoices, overdue receivables. With a write key, it also sends quotes and records payments. In other words: a language model acting with a company's credentials. We audited it end to end, and this is what came out.

## 1. A read key could write

Cord exposes MCP over two transports: stateless HTTP (`POST /api/mcp`) and the legacy SSE one (`GET /api/mcp/sse` to open the session and `POST /api/mcp/message` to send messages). The SSE session stores the organization, the key and the permission it was opened with.

The problem was in `/api/mcp/message`. It checked that the key sending the message belonged to **the same organization** as the session, and then ran the tool with the **permission stored in the session**. A read-only key from the same company that knew a sessionId could run write tools using another key's session.

The fix is one line, but it's the right line: a session belongs to a key, not to an organization.

```ts
if (session.orgId !== auth.orgId || session.keyId !== auth.keyId) {
  return rpcErrRes(null, -32001, 'Esta API key no corresponde a la sesión.', 403);
}
// and it runs with auth.scope, the caller's permission, not the session's
```

It has its test: a read key with a write key's sessionId gets a 403 and the tool never runs.

## 2. An output contract that wasn't honored

All 19 tools declared an `outputSchema`. In the 2025-06-18 protocol version, declaring it requires returning `structuredContent` that matches the schema. Cord returned only text. On top of that, the schemas had `additionalProperties: false` and a `next_cursor` typed as string that can actually be `null`: a validating client would have rejected correct responses.

Now every tool answers with both: `structuredContent` for clients that validate, and the same compact JSON as text for those that don't. Output schemas are open, so a new field breaks no one. And the text is no longer indented, which saves tokens on every call.

## 3. Amounts without currency

Cord has a rule: an amount without a currency is a number, not money. The quote, product and client tools returned `total: 12500` without saying of what. An agent that assumes pesos misreports to a business that sells in dollars. Now every amount travels with its `moneda`.

## 4. Errors that never reached the model

A collections tool threw a generic error when the plan didn't include it. The server treated it as an internal failure and the model got "Internal server error", with no way to explain to the user what was going on. On top of that, the message named the wrong plan. Now plan limits are reported as business errors, with the name of the plan that's actually needed, read from the same contract the rest of Cord uses.

Along the way we found the documentation index returned the full stack trace when it failed. Not anymore.

## 5. Seven new tools

We went from 19 to 26. The new ones are meant to let an agent integrate Cord, not just operate it:

| Tool | What for |
|---|---|
| `contexto_cuenta` | Business, country, currency, plan and whether the key is test or live. The first call. |
| `proponer_configuracion` | Proposes profile, taxes and catalog from the business's website. Returns a link; a person approves. |
| `estado_configuracion` | Whether that proposal was approved, and what was applied. |
| `validar_datos_fiscales` | RFC, tax regime and CFDI use, NIF or EIN with the same rules used when invoicing. |
| `validar_apariencia` | Checks a Cord Elements `appearance` before you put it in code. |
| `simular_evento` | Fires a test webhook through the real engine. Test keys only. |
| `buscar_documentacion` | Searches the docs and returns pages with an excerpt and URL. |

None of them changes account settings directly. `proponer_configuracion` leaves a proposal that a person approves in Cord, just like the one from onboarding.

## 6. An API that describes itself

An agent writing code against an API reads its specification. Of the 343 fields in our OpenAPI, 279 had no description: the agent had to guess what `terminos` was, whether `total` included taxes or what unit `rate` came in.

Now there's a glossary, `FIELD_DOCS`, that describes every field name in the API, and the generator applies it to every property without its own description. The CI step that compares the spec with the code fails if a property or parameter is left undescribed. Adding a field without explaining it no longer passes.

## What didn't change, on purpose

- **No tool stamps invoices.** Creating a draft, yes; issuing it to the tax authority is irreversible and a person triggers it.
- **Text written by the end customer** on the public link reaches the model marked as `cliente_externo` and delimited, so it reports it instead of following it as an instruction.
- **Actions that reach the customer** (send, approve, reject, record payment) carry `destructiveHint`, so a well-configured MCP client asks for confirmation before running them.

If you connect Cord to your assistant, ask it for `contexto_cuenta` first. Everything else follows from there.
