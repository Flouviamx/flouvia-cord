---
title: "Cord CLI 2.0: Instant schema validation"
date: "2026.07.20"
type: "DOCS"
topic: "Engineering"
authors:
  - "CORD ENG"
readTime: "5 MIN READ"
---
Developer experience is at the core of everything we build at Cord. Today, we're thrilled to announce Cord CLI 2.0, completely rewritten in Rust, bringing instant, local schema validation to your development workflow.

## The problem with server-side validation

Historically, when you pushed a configuration or deployed a serverless function using the Cord CLI, the validation happened server-side. You would run `cord deploy`, wait 4-5 seconds for the payload to upload, only to receive a cryptic 400 Bad Request error because you mistyped an environment variable key or used an incompatible Node.js runtime version.

This feedback loop is simply too slow for modern development.

## Shift-left with local JSON Schemas

With Cord CLI 2.0, we are heavily leveraging JSON Schema and WebAssembly (Wasm) to perform strict validation directly on your machine before a single byte hits the network.

When you run `cord deploy`, the CLI instantly cross-references your `cord.config.ts` or `cord.json` file against our unified platform schema. 

```bash
$ cord deploy

❌ Error in cord.config.ts
Line 14: Invalid property 'memory_limit'. 
Expected one of: [128, 256, 512, 1024]. Received: 300.
```

Because the CLI is built in Rust using the `jsonschema` crate, this validation takes less than 2 milliseconds.

## Editor Integration

We didn't stop at the CLI. By standardizing our validation logic around JSON Schema, we've integrated directly with the Language Server Protocol (LSP). If you're using VS Code, Cursor, or Neovim, you now get real-time autocompletion, type-checking, and hover documentation for all your Cord configuration files.

Simply add the schema reference to your JSON file:

```json
{
  "$schema": "https://schema.cord.com/v2/config.json",
  "project": "my-awesome-app"
}
```

This drastically reduces the time spent checking documentation and ensures you catch misconfigurations before you even save the file. Update to CLI 2.0 today by running `npm install -g @cord/cli@latest`.
