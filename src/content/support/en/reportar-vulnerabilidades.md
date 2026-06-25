---
title: "Report vulnerabilities"
description: "How our Bug Bounty and responsible disclosure program works."
category: "Security & Privacy"
order: 3
---

At Cord, we believe security is a collective effort. We operate a private responsible disclosure program (Bug Bounty Program) for cybersecurity researchers.

### Program Scope

The following domains and assets are within scope for penetration testing:
- `cord.flouvia.com` (main web application and the API at `cord.flouvia.com/api`)
- The embeddable quoter (Cord Elements: `/embed`, `/q`, and the `@flouviahq/elements` package).

**Out of scope:** Volumetric Denial of Service (DDoS), Social Engineering against Flouvia employees, and physical attacks on our AWS/Vercel servers.

### How to Report a Bug

If you have found a security flaw (e.g., SQL Injection, XSS, Authentication Bypass, Privilege Escalation):
1. Immediately stop any testing that compromises other users' data.
2. Write a detailed report with precise reproduction steps and a proof of concept (PoC).
3. Send a GPG-encrypted email to `security@flouvia.com`.

Our internal DevSecOps team will respond in less than 24 hours and, depending on the criticality calculated using the CVSS v3.1 calculator, you will be offered a substantial financial reward.
