# Confidence Rules

These rules exist to stop the agent from flattening uncertain pipeline inferences into authoritative facts.

## Definitions

| Value | Meaning |
|---|---|
| `confirmed` | directly observed from an upstream source in the current run |
| `inferred` | not directly observed, but derived from comparison or rule-based reasoning |
| `fallback` | temporary continuity-preserving state used internally when direct truth is unavailable |

## Why this matters

The pipeline has already produced a false public-facing affiliation change by treating fallback output as if it were a confirmed move.

This file is intended to prevent a repeat of that failure mode.

## First application targets

The first places that should carry confidence-aware change semantics are:

- `team_roster_sync_report.json` change records such as moved / added / removed
- intermediate rows used to generate Discord or summary output
- any new affiliation-change event object introduced in future work

Prefer the field name:

- `change_confidence`

Allowed values:

- `confirmed`
- `inferred`
- `fallback`

## Messaging rules

### Confirmed

Allowed:

- definitive wording
- "moved"
- "changed team"

### Inferred

Allowed:

- observation-based wording
- provisional wording
- "appears to have moved"
- "observed as changed"

Not allowed:

- unconditional definitive move language

### Fallback

Allowed:

- continuity-preserving internal state
- review-needed wording
- "affiliation unconfirmed"
- "continuity fallback applied"

Not allowed:

- definitive move language
- observation-based public move language

## Absolute restrictions

1. Partial roster observation alone must not produce a definitive FA move.
2. Upstream access failure alone must not produce a definitive affiliation-change event.
3. A `fallback` state must not be promoted to `confirmed`.
4. A `fallback` state should not be presented publicly as `inferred` unless a separate rule explicitly allows that transition and records why.

## Practical rule for this repository

When direct roster truth is degraded:

- continuity may be preserved internally
- but the public-facing system must not convert that continuity mechanism into a confident move announcement

## Incident rule

If a future Discord summary uses definitive wording for an `inferred` or `fallback` affiliation change:

1. treat it as a harness violation
2. record it in [FAILURE_MODES.md](/c:/Users/NZU/Desktop/nzu-homepage/docs/harness/FAILURE_MODES.md)
3. update the active plan or follow-up plan with the remediation step
