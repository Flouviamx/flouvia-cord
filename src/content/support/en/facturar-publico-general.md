---
title: "General Public Invoicing"
description: "How to issue a CFDI to the General Public in Cord today."
category: "Invoicing"
---

This applies only to organizations in **Mexico**. Any sale you don't invoice to a specific RFC — counter sales, charges where the client didn't request an invoice — must be declared to the SAT under the generic General Public RFC.

### How to do it in Cord today

1. When creating the quote or invoice, use a client with no tax ID captured (or create one named "General Public" and leave its RFC field blank).
2. When stamping, Cord detects there's no specific RFC and automatically uses the generic RFC **XAXX010101000** with the name **PÚBLICO EN GENERAL**, as required by the SAT.

<Callout type="warning">
Cord doesn't yet have a tool that automatically groups several sales from a period into a single periodic Global Invoice (daily, weekly, or monthly). Today, each sale to the general public is stamped as an individual CFDI with the generic RFC. If your business needs to consolidate several sales into a single Global Invoice by periodicity, coordinate that calculation with your accountant while we build that automation.
</Callout>
