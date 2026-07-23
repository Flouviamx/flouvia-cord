---
title: "Cord CLI 2.0: Instant schema validation"
date: "2026.07.20"
type: "DOCS"
topic: "Engineering"
authors:
  - "CORD ENG"
readTime: "5 MIN READ"
---
Developer experience is critical for fast iteration. With Cord CLI 2.0, developers can now leverage instant, local schema validation directly in their development workflow, catching errors before they ever hit the network.

## The problem with server-side validation

Historically, when pushing a configuration or deploying a serverless function, validation happened server-side. You would run a deploy command, wait for the payload to upload, only to receive a cryptic 400 Bad Request error because of a mistyped environment variable key or an incompatible runtime version.

This feedback loop is simply too slow for modern development.

## Shift-left with local JSON Schemas

Cord CLI 2.0 heavily leverages JSON Schema and WebAssembly (Wasm) to perform strict validation directly on your machine.

When you run `cord deploy`, the CLI instantly cross-references your `cord.config.ts` or `cord.json` file against the unified platform schema. 

```bash
$ cord deploy

❌ Error in cord.config.ts
Line 14: Invalid property 'memory_limit'. 
Expected one of: [128, 256, 512, 1024]. Received: 300.
```

Because the CLI is built in Rust using the `jsonschema` crate, this local validation takes less than 2 milliseconds, allowing you to iterate instantly.

## Editor Integration

This validation logic is also integrated directly with the Language Server Protocol (LSP). If you're using VS Code, Cursor, or Neovim, you get real-time autocompletion, type-checking, and hover documentation for all your Cord configuration files out of the box.

Simply add the schema reference to your JSON file:

```json
{
  "$schema": "https://schema.cord.com/v2/config.json",
  "project": "my-awesome-app"
}
```

This drastically reduces the time spent checking documentation and ensures you catch misconfigurations before you even save the file. Start validating locally today by running `npm install -g @cord/cli@latest`.
