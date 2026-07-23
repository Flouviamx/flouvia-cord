---
title: "Building a multi-tenant architecture on Neon"
date: "2026.07.23"
type: "BLOG"
topic: "Engineering"
authors:
  - "ANDRÉ VALLE"
  - "CORD ENG"
readTime: "8 MIN READ"
---
At 2 a.m. on a Tuesday, an on-call engineer's pager fires. A database shard—one of 2,000 that collectively processed $1.9 trillion in payments in 2025—has entered a degraded state. Two nodes are down, and a third is blocking an index build due to a misconfigured vote.

This scenario played out hundreds of times a year across our Document Database fleet. The combinatorial explosion of failure modes made it impossible to anticipate every scenario with static, hand-coded automation. We needed a fundamentally different approach.

## Why static automation breaks at scale

Our original auto-remediation system operated as a single-step, hard-coded state machine. A set of plugins—each responsible for one issue, like 'fix votes', 'fix priority', or 'rebuild downed node'—ran in a carefully ordered sequence based on hard-coded ranking and assumptions within a reconciliation loop.

This worked well for simple cases, like if a single node went down, or one or two misconfigured votes, but it had fundamental limitations:

- Implicit dependencies between plugins meant that ordering was fragile. The "fix votes" and "fix priorities" plugins required no nodes to be down, but they had higher priority.
- Multi-failure scenarios exposed blind spots. When multiple impaired nodes combined with network partitions, the static logic would loop indefinitely.

## The shift to Serverless Postgres with Neon

To solve this, we migrated our core routing tier to Neon's Serverless Postgres. Rather than managing physical shards and dealing with manual rebalancing, we leveraged Neon's separation of storage and compute.

This allowed us to build a true multi-tenant architecture using two core concepts:

### 1. Row-Level Security (RLS) for Tenant Isolation
Instead of provisioning a new database for every customer (which scales poorly and increases infrastructure costs), we pool tenants into shared databases. We enforce strict data isolation using Postgres Row-Level Security (RLS). 

Every query executed by our API is wrapped in a transaction that sets a local variable for the `tenant_id`. Postgres automatically appends `WHERE tenant_id = current_setting('app.current_tenant')` to every read and write. Even if there is a bug in our application logic, a tenant cannot see another tenant's data.

### 2. Connection pooling at the Edge
A massive challenge with Postgres is connection exhaustion. If 5,000 tenants connect simultaneously, Postgres will crash. We solved this by deploying PgBouncer at the edge, scaling it across multiple regions, and routing queries to Neon compute endpoints dynamically.

## The Result

By migrating to this architecture, we reduced our pager volume by 92%. We no longer wake up to fix broken shards because compute scales instantly based on load, and storage is managed transparently by the cloud provider. We can now onboard 10,000 new tenants without modifying a single piece of infrastructure.
