---
title: "Rate limits"
description: "Understand Cord's API technical limits and how to handle 429 responses."
category: "Developers"
order: 4
---

To ensure the stability and availability of our services for all merchants, the Cord API enforces rate limits by IP and by account key.

### Technical Limits (Rate Limits)

In the Production environment (`Live Mode`), we operate under the following standardized thresholds:
- **100 requests per second (req/s)** for read endpoints (GET).
- **20 requests per second (req/s)** for mutation and charging endpoints (POST/PUT/DELETE).
- **5 requests per second (req/s)** for direct tax invoicing endpoints to the PAC (invoices).

### Handling 429 Codes
If you exceed the allowed rate, Cord will reject the request with an HTTP `429 Too Many Requests` code.
Your application must be designed to handle this using **Exponential Backoff**:
1. If you receive a 429, pause the execution for 1 second and try again.
2. If it fails, pause for 2 seconds.
3. Then for 4, then 8, etc.

**Rate Limit Increases:** If your business model requires processing massive bursts (e.g., ticket sales or high-volume e-commerce), contact your Enterprise account executive to move you to dedicated infrastructure.
