# PostHog Data Warehouse — Source Setup Report

**Project:** Default project (ID: 535370)
**Date:** 2026-07-30
**Status:** Manual setup required (see instructions below)

---

## Summary

The PostHog data warehouse API returned 500 errors during this run — the `/api/projects/535370/external_data_sources/` endpoint was unavailable from the MCP session. No sources were created programmatically. Use the direct setup links below to complete each source in the PostHog browser UI.

---

## Sources to Connect

### Priority 1 — Core business data (actively used by Cord)

#### 1. Stripe (Billing)
**Status:** Restricted API key collected — ready to paste into PostHog UI.

**Setup URL:**
```
https://us.posthog.com/project/535370/data-warehouse/new-source?kind=Stripe&utm_source=wizard&utm_campaign=warehouse-source
```

**Instructions:**
1. Open the URL above.
2. Select **Restricted API key** as the authentication type.
3. Paste the `rk_live_...` key you created (the one with Read on Core/Billing/Connect + Write on Webhooks).
4. Leave **Account ID** blank (not needed unless you use Stripe Connect platform keys to proxy connected accounts).
5. Click **Next** — PostHog will discover all tables and auto-enable them.
6. After creation, go to the **Webhook** tab on the Stripe source and click **Create webhook** — this enables real-time sync (inserts, updates, and deletes within seconds instead of polling).

**Key tables synced:** Customer, Subscription, Invoice, Charge, Price, Product, Payout, Refund, BalanceTransaction, Coupon, Discount.

> **Sync recommendation:** Enable webhook sync — it's the only mode that reliably captures updates (e.g. a subscription being cancelled, an invoice marked paid). Append-only polling misses updates because Stripe's API has no "updated since" filter.

---

#### 2. PostgreSQL — Neon (Primary Database)
**Status:** Credentials not collected (user cancelled prompt) — use deep-link below.

**Setup URL:**
```
https://us.posthog.com/project/535370/data-warehouse/new-source?kind=Postgres&utm_source=wizard&utm_campaign=warehouse-source
```

**Pre-flight checklist for Neon:**
- Use the **pooled endpoint** (hostname contains `-pooler`, e.g. `ep-cool-name-123456-pooler.us-east-2.aws.neon.tech`) — the direct host is IPv6-only and PostHog egresses over IPv4.
- Port: **5432**
- SSL/TLS is required (Neon supports it; PostHog enforces it for sources created after Feb 18, 2026).
- PostHog's egress IPs must be reachable: **44.205.89.55**, **52.4.194.122**, **44.208.188.173** (US region). Neon's shared pooler is publicly accessible, so these IPs should connect automatically.
- Find your connection details in: **Neon Console → Your project → Connection Details → Pooled connection**.

**Instructions:**
1. Open the URL above.
2. Enter the connection fields:
   - **Host:** your `-pooler` endpoint (see above)
   - **Port:** 5432
   - **Database:** your database name (e.g. `neondb`)
   - **User:** your database user (e.g. `neondb_owner`)
   - **Password:** your database password (from Neon Console → Connection Details → Show password)
   - **Schema:** `public` (to sync only the public schema)
3. Click **Next** to validate credentials and browse tables.
4. Select the tables relevant to analytics — recommended tables for Cord: `cotizaciones`, `cotizacion_items`, `clientes`, `productos`, `orgs`, `org_members`, `cotizacion_cobros`, `webhooks`, `api_keys`, `audit_log`.
5. For each table, choose a sync type:
   - Use **Incremental** (with `created_at` or `updated_at` as cursor) for large tables that grow over time.
   - Use **Full refresh** for small reference tables (e.g. `orgs`, `productos`).
   - Avoid CDC unless you've enabled logical replication on Neon — it requires extra setup.

> **Note:** The `api_keys` table stores **hashed** API keys (SHA-256), not raw values — safe to sync. The `audit_log` table is append-only and perfect for incremental sync. Do NOT sync tables with sensitive PII columns you don't need in analytics — use column filtering to exclude e.g. raw email addresses if desired.

---

### Priority 2 — Secondary sources (used by Cord but lower analytics priority)

#### 3. Clerk (Authentication)
PostHog supports Clerk as a data warehouse source.

**Setup URL:**
```
https://us.posthog.com/project/535370/data-warehouse/new-source?kind=Clerk&utm_source=wizard&utm_campaign=warehouse-source
```

You'll need your **Clerk Secret Key** (`sk_live_...` from `.env` → `CLERK_SECRET_KEY`).

---

#### 4. Resend (Transactional Email)
**Setup URL:**
```
https://us.posthog.com/project/535370/data-warehouse/new-source?kind=Resend&utm_source=wizard&utm_campaign=warehouse-source
```

> **Note:** The `RESEND_API_KEY` in `.env` may be a send-only key. If the warehouse source setup fails, generate a full-access key in the Resend dashboard for warehouse read access.

---

### Priority 3 — OAuth / deep-link sources

#### 5. GitHub
GitHub requires OAuth authorization — cannot be set up from the CLI.

**Setup URL:**
```
https://us.posthog.com/project/535370/data-warehouse/new-source?kind=Github&utm_source=wizard&utm_campaign=warehouse-source
```

---

## Skipped Sources

The following were detected in `package.json` but are either not active production services for this project, or PostHog likely doesn't have a warehouse connector for them:

| Source | Reason skipped |
|--------|---------------|
| MySQL | Not used by Cord (Neon PostgreSQL is the database) |
| MongoDB | Not used by Cord |
| BigQuery | Not used by Cord |
| Sentry | No Sentry env vars present — not configured |
| Twilio | Not mentioned in project docs as an active service |
| Anthropic | No PostHog warehouse connector for Anthropic API data |
| Segment | Not mentioned in project docs as an active service |
| Bugsnag | Not mentioned in project docs as an active service |
| Upstash | Not configured (env vars `UPSTASH_REDIS_REST_URL`/`_TOKEN` missing) |
| Vercel | Analytics handled separately via `@vercel/analytics` (already installed) |

---

## Changes Made to the Project

**No source code files were modified.** This skill only connects external data sources to PostHog — it does not edit application code.

**Files created:**
- `posthog-warehouse-report.md` — this report

---

## Next Steps

1. **Stripe** — Paste your `rk_live_...` key at the setup URL above. After creation, click **Create webhook** on the Stripe source for real-time sync.
2. **Neon PostgreSQL** — Use the Pooled connection string from the Neon console at the setup URL above. Select the business tables listed above.
3. **Clerk** (optional) — Connect with your `sk_live_...` key for user/org data alongside product analytics.
4. Once sources are synced, use the PostHog SQL editor to JOIN Stripe subscriptions, Neon cotizaciones, and PostHog events into unified growth and revenue queries.

**Example join query once both sources are connected:**
```sql
SELECT
  p.distinct_id,
  s.status AS subscription_status,
  s.plan AS plan_name,
  count(e.uuid) AS events_last_30d
FROM persons p
LEFT JOIN stripe_subscription s ON s.customer_metadata_posthog_distinct_id = p.distinct_id
LEFT JOIN events e ON e.distinct_id = p.distinct_id
  AND e.timestamp >= now() - interval 30 day
GROUP BY 1, 2, 3
ORDER BY events_last_30d DESC
```
