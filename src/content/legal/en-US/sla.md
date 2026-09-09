---
docId: sla
version: "2026-09-01"
effectiveDate: "2026-09-01"
supersedes: null
locale: en-US
jurisdiction: GLOBAL
appliesToCountries: [MX, US, CA, BR, ES, GB, DE, FR, CO, AR, CL, PE]
requiresAction: false
action: none
acceptanceScope: none
publicationStatus: draft
sourceKind: markdown
editorialStage: technical-draft
sourceOfTruth: src/content/legal/en-US/sla.md
artifactRoute: /en/legal/sla
artifactSha256: "0000000000000000000000000000000000000000000000000000000000000000"
lastReviewed: "2026-09-01"
reviewedBy: Technical drafting; external legal review pending
dependsOn: ["terms"]
sourceSections: ["terms@2026-08-11#sla"]
releaseBlockers: ["continuous-monitoring", "metric-definition", "maintenance-policy", "incident-notification", "support-targets", "credit-remedy", "dependency-boundaries", "legal-review", "versioned-publication"]
---

# Availability and service levels

**TECHNICAL DRAFT — not published or effective.** Cord is currently provided on
a best-effort basis and offers no standard percentage, support, or credit SLA.
The editorial date creates no commitment. Any negotiated level requires an
executed written agreement and controls capable of measuring it.

## 1. Current scope

The public page observes three signals: a Neon query, an authenticated Stripe
balance read, and a complete render of the public demo link. It does not measure
every route, region, user, email, webhook, AI, CFDI, AEAT, Resend, PostHog, MCP,
or Customer integration.

Availability of one signal does not establish all of Cord, and a dependency
failure does not itself decide contractual cause or responsibility.

## 2. Cadence and freshness

Vercel Hobby schedules one daily probe at 10:00 UTC and may delay it. A sample is
treated as recent for up to 26 hours. If a signal is absent or stale, public
status becomes unknown instead of assuming operation.

Each check has an eight-second technical timeout and stores service, success,
latency, and time. Error details remain in server logs, not the public response.
If Neon cannot persist results, no partial sample is displayed.

A daily check is not continuous monitoring and can miss an outage between
samples. It must not support a monthly uptime promise.

## 3. Display window and calculation

The view aggregates at most 90 days and calculates successes over samples that
actually exist. “100%” from one or a few samples means those probes passed, not
that service was available every minute or to every customer.

The database has no 90-day `health_checks` sweeper; 90 days is a query window,
not a retention promise. There is no measurement of eligible total minutes,
real requests, regions, or contractual exclusions.

A future SLA must define formula, time zone, period, rounding, source, partial
errors, latency, components, and dispute procedure before publishing a target.

## 4. Incidents and communications

Ops can create bilingual incidents with severity, start, summary, and
investigating, identified, monitoring, or resolved status. No incidents are
seeded and the UI offers no deletion; each change is audited.

Detection and publication are manual. There is no notification subscription,
contractual first-update deadline, follow-up cadence, or RCA procedure. The
public page does not guarantee every event is detected or published immediately.

Before an SLA, severity, owner, channels, hours, updates, closure, postmortem,
and treatment of sensitive information must be defined.

## 5. Maintenance and dependencies

There is no contractual policy for planned or emergency maintenance, notice, or
exclusions. A future agreement must distinguish maintenance from downtime and
avoid exclusions broad enough to empty the commitment.

Cord depends on Vercel, Neon, Stripe, Resend, Anthropic, Facturapi, authorities,
and integrations by function. Dependencies must be documented by component; an
external failure is not automatically force majeure and does not remove Cord's
applicable selection, redundancy, or response duties.

## 6. Support, targets, and credits

The reviewed code implements no contractual first-response, resolution, plan
availability, RTO/RPO, or automatic service-credit calculation. There is no
demonstrated claim or billing-credit procedure.

This draft therefore promises no 99.9%, 24/7 support, timed restoration, credit,
refund, or penalty. An individual agreement must define eligibility, claim
window, proof, calculation, cap, and relationship to other remedies.

## 7. Security, continuity, and force majeure

Availability and security relate, but a status page does not replace backups,
restoration, incident response, or continuity. RTO, RPO, regions, capacity, and
recovery tests lack complete contractual evidence.

An event outside reasonable control may excuse delay only to the extent it causes
nonperformance and the affected party uses reasonable mitigation and notice.
The final clause must address effects, duration, and resumption and must not
exclude liability that law does not permit limiting.

## 8. Individual agreement and blockers

A future SLA must identify Customer, plan, covered services, date, metrics,
exclusions, maintenance, support, incidents, remedies, limits, and precedence.
Public status will remain limited operational evidence and will not automatically
be incorporated as a warranty.

**Blockers:** continuous monitoring or an adequate source; metric definition;
maintenance and dependencies; severity/notification/RCA; support targets;
RTO/RPO; credit mechanism; legal review and versioned publication/execution.

Provenance and evidence: [phase 5.4 data-governance review](../../../../docs/historial/revisiones-legales/2026-09-01-data-governance.md). Original clauses remain preserved through `sourceSections`.
