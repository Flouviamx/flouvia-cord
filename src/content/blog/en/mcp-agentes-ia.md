---
title: "Why we connected Cord to Claude via MCP"
excerpt: "This is how our bidirectional agent architecture works. How the Model Context Protocol turns LLMs into operators of your software."
category: "Technology"
date: "02 May 2026"
readTime: "12 MIN"
img: "/images/blog/mcp-agentes-ia.png"
authorName: "Cord Team"
authorRole: "Product engineering"
---

During the first wave of Generative Artificial Intelligence (2023-2024), almost all B2B platforms made the same mistake: they added a floating "Chatbot" in the bottom right corner of their software.

The promise was that you could ask the AI about your data. The reality is that these systems were *read-only silos*. You could ask "How much did we sell this month?", but you couldn't tell it "Create a quote for client X, apply a 10% discount, and email it to them."

To achieve true autonomy, AI needs **hands**. It needs the ability to execute real actions in the system, exactly as a human user would. And that's where the **Model Context Protocol (MCP)**, initially developed by Anthropic (creators of Claude), comes into play.

## What is the Model Context Protocol (MCP)?

MCP is to Language Models what USB ports are to computers. It is an open and secure standard that allows an AI model to connect in a standardized way to any external data source or application.

Instead of building expensive ad-hoc API integrations and fragile *plugins* for each platform (Salesforce, SAP, Notion, Cord), you expose an "MCP Server".

Claude (or any other compatible agent) connects to this server and instantly discovers a catalog of "Tools" and "Resources" it can use.

## Cord's Bidirectional Architecture

At **Cord**, we decided to adopt MCP as the definitive bridge between Claude's intelligence and our B2B payment flow infrastructure. We didn't build a chatbot; we built a set of operational primitives.

### How our MCP Tools work

When you connect a compatible MCP client to Cord, the model sees only tools allowed by the API key and active organization. It does not receive direct database access.

1. **`crear_cotizacion_borrador`:** creates a draft with a valid client and line items. It does not send it.
2. **`cartera_vencida` and `resumen_negocio`:** read operating facts within the key's read scope.
3. **`buscar_cliente`, `listar_productos`, `listar_cotizaciones`, and `listar_facturas`:** find entities before proposing an action.

> "The future of B2B software is not having better graphical user interfaces (GUIs); it is having perfect semantic APIs so that AI Agents can operate the infrastructure for us."

## Security in the MCP Ecosystem

The major concern of CFOs and CTOs when giving "hands" to AI is security. What happens if the model "hallucinates" and deletes a price list or sends an invoice with a 90% discount?

The MCP standard and its implementation in Cord solve this through the **Human-in-the-Loop (HITL)** principle for destructive or high-impact actions.

Cord does not currently expose an MCP tool to send a quote or mass-update price lists. The available write tool creates a draft and supports an idempotency key to prevent accidental duplicates. Any additional confirmation shown by an MCP client depends on that client and should not be described as a barrier the Cord server always enforces.

The actual security model combines a secret key, scopes, organization isolation, argument validation, limits, and audit records. After the draft is created, a person reviews and sends it through the authorized workflow.

## The Future of Operations

By integrating MCP, Cord ceases to be simply a quote and invoice management software. It becomes an **autonomous infrastructure engine**.

In 2026, the most efficient operations teams are not the ones who type the fastest, but those who conduct orchestras of AI Agents through secure and standardized protocols. And Cord is built precisely for this era.
