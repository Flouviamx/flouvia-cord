---
title: "Security for compliance teams"
description: "Which security controls Cord has and how to request information for a questionnaire or vendor review."
category: "Security & Privacy"
---

If your IT or compliance team is evaluating Cord as a vendor, this is what you can review today.

### Documented controls

The [Security](/en/docs/desarrolladores/esenciales/seguridad) page describes in technical detail what Cord does today: secret encryption with AES-256-GCM, Argon2id passwords, mandatory HTTPS with HSTS, isolation between organizations, API keys restricted per resource and per IP, signed webhooks, an audit log and retention periods.

### Payment cards

Cord never receives or stores card numbers or CVC. They are captured by the payment processor's form on its own domain, and that processor operates under PCI-DSS.

### Certifications and external audits

Cord doesn't hold a certification such as SOC 2 or ISO 27001 today, nor a third-party penetration test report we can share. When we have them, we'll publish them here.

### Security questionnaires

If you need to complete a security or vendor questionnaire, write to `soporte@flouvia.com` and we'll answer it based on the controls that exist today. To report a flaw, use [Report vulnerabilities](/en/support/reportar-vulnerabilidades).
