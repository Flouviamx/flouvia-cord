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
