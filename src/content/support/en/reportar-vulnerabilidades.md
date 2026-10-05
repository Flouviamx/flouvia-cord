---
title: "Report vulnerabilities"
description: "How to report a security issue in Cord and what you can expect from us."
category: "Security & Privacy"
order: 3
---

If you found a security issue in Cord, we want to hear about it. This is our responsible disclosure program: how to report, what is in scope and what we commit to.

### How to report

Write to `security@flouvia.com` with:

1. What you found and why it matters (what someone could do with it).
2. The exact steps to reproduce it, with URLs, requests or proof-of-concept code.
3. The account or environment you tested on.

Use your own account and, when you can, the test environment (`sk_test_` / `pk_test_` keys). If your testing reaches another organization's data, stop, don't keep or share it, and tell us what you were able to see.

The same contact is published at [`/.well-known/security.txt`](https://cordhq.app/.well-known/security.txt).

### Scope

- `cordhq.app`, including the API at `cordhq.app/api` and the `billing.`, `docs.` and `dev.` subdomains.
- The public surfaces: the quote link (`/q`), the hosted invoice (`/i`) and the embedded quote (`/embed`).
- The published packages: `@flouviahq/elements`, `@flouviahq/node` and `@flouviahq/cli`.

**Out of scope:** denial-of-service or volumetric attacks, social engineering against Cord's team or customers, physical access, spam or automated testing that puts load on accounts that aren't yours, and findings without demonstrable impact (for example, missing headers without an attack scenario).

### What we commit to

- Acknowledge your report within **3 business days**.
- Give you an initial assessment and keep you posted while we fix it.
- Tell you when it's fixed, and agree with you on when it can be published.
- Credit you publicly if you want.

### Safe harbor

If you act in good faith within this scope, don't access or keep more data than needed to demonstrate the issue, and give us reasonable time to fix it before publishing, we won't take legal action against you for your research.

### Rewards

We don't pay monetary rewards today. If that changes, we'll publish it on this page.
