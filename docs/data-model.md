# Data model

The initial contracts are in `packages/types/src/index.ts`. They model a read-oriented operations dashboard and deliberately omit persistence fields that have not been agreed yet.

## Core entities

| Entity | Key fields | Notes |
| --- | --- | --- |
| `Opportunity` | `id`, company, project, category, budget, matchScore, status, deadline | Potential work available to learners. |
| `Student` | `id`, profile fields, program, tier, status, progress, earnings, mentor | Current learner dashboard view. |
| `TierSummary` | studentId, current/next tier, progress, requirements | Derived progression state for a student. |
| `Proposal` | `id`, studentName, opportunityId, status, value | The pre-delivery work submission record. |
| `Safeguard` | `id`, name, owner, status, lastCheckedAt | Operational control and health signal. |

## Phase 2–5 entities

`Bid`, `Allocation`, `EarningsEntry`, `PlatformAccount`, `TrainingModule`, `TierSummary`, `AcademicSnapshot`, `HourLog`, `BlackoutPeriod`, `Proposal`, and `SafeguardCheck` are now represented in shared TypeScript contracts. A Student has training, tier, academic, hour-log, earnings, and platform-account records; an Opportunity has bids and at most one allocation. Earnings preserve original amount/currency and historical exchange rate. Platform records deliberately exclude passwords, tokens, API keys, and credentials.

## Supporting read models

- `DashboardMetrics`: active students, opportunity pipeline, monthly earnings, completion rate.
- `EarningsSnapshot`: a period-level gross/fee/net summary.
- `AnalyticsSnapshot`: dashboard KPIs plus a weekly activity time series.
- `SettingsSummary`: displayable organization preferences.
- `ApiError`: stable `{ message }` error payload.

## Relationships

```text
Student 1 ─── 1 TierSummary
Student 1 ─── * Proposal
Opportunity 1 ─── * Proposal
```

The mock proposal stores `studentName` for display convenience while using `opportunityId` as its relationship key. A future persistent model should use `studentId`, `opportunityId`, audit timestamps, and ownership fields.

## Enumerations

- Opportunity: `new`, `reviewing`, `shortlisted`, `closed`
- Student: `active`, `at-risk`, `paused`
- Safeguard: `healthy`, `attention`, `blocked`
- Proposal: `draft`, `submitted`, `accepted`, `declined`
- Tier: `Foundation`, `Growth`, `Pro`
