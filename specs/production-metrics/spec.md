# Production Metrics

## Goal

Make the first-value and production funnel measurable from persisted facts without
asking users for extra work or collecting creative content.

This is the first metrics slice. It covers quick-trial completion, first-result
latency, stale runs, and conversion from a quick trial to a delivery package or
published record.

## Requirements

### R1 Management-only access

The product metrics endpoint is available only to identities configured through
`UNLIMITED_QUOTA_ACCOUNTS`. Normal creators cannot enumerate platform-wide usage.

### R2 Quick-trial funnel

The report includes total, active, completed, failed, and stale-active quick-trial
runs. A run is stale when it remains active for more than 30 minutes.

### R3 First-result latency

For completed runs, return the sample size, median, p90, and maximum duration
between `created_at` and `updated_at`. Durations must be non-negative. Group the
same metrics by `story`, `keyframe`, and `video`.

### R4 Delivery conversion

Among projects that started a quick trial, report how many created at least one
delivery package and how many recorded at least one publish record. Rates are
`null` when there is no denominator.

### R5 Privacy

The report must not contain story ideas, project titles, owner identifiers,
prompts, generated text, or file paths.

### R6 Empty state

With no quick-trial runs, all counts are zero, latency values are `null`, and the
response remains a successful report rather than an error.

## Acceptance

- Pure aggregation tests cover counts, percentiles, per-target breakdown, stale
  runs, delivery conversion, and the empty state.
- An in-memory database test proves the report is derived from persisted rows and
  never exposes the stored idea.
- The management-only API route is locked by the existing unlimited-account
  policy.
- Full test suite and production build pass.
