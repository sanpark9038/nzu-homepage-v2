# Failure Modes

This document records known failure patterns for the NZU homepage data pipeline.

## FM-001: False FA move from partial roster observation

### Status

- documented
- mitigated by confidence-aware Discord wording
- mitigated by `verify-discord-summary`
- not fully blocked at roster mutation time

### Summary

A player who remained on their original team was reported as moving to FA (`무소속`) because the roster sync logic treated a non-observed player as eligible for FA fallback.

### Confirmed example

- Player: `빡재TV`
- Real-world outcome: remained on `흑카데미`
- False pipeline output: `흑카데미 -> 무소속`

### What happened

The pipeline captured a baseline where `빡재TV` belonged to `흑카데미`, then ran roster sync.

During that sync:

- FA source was considered available
- `빡재TV` was not present in current observed team roster results
- the system moved unmatched previous non-FA players into FA fallback
- Discord comparison later treated that fallback result as a real affiliation change

### Why this is a harness failure

The system collapsed three different states into one:

1. source observation
2. continuity-preserving fallback
3. publishable affiliation fact

Because those states were not separated, the alert looked authoritative even though it was inference-driven.

### Relevant code paths

- Baseline capture before refresh: [scripts/tools/run-manual-refresh.js](/c:/Users/NZU/Desktop/nzu-homepage/scripts/tools/run-manual-refresh.js:34)
- Common roster sync before chunked collection: [scripts/tools/run-ops-pipeline-chunked.js](/c:/Users/NZU/Desktop/nzu-homepage/scripts/tools/run-ops-pipeline-chunked.js:191)
- FA treated as authoritative when available: [scripts/tools/sync-team-roster-metadata.js](/c:/Users/NZU/Desktop/nzu-homepage/scripts/tools/sync-team-roster-metadata.js:649)
- Fallback move into FA for missing previously assigned players: [scripts/tools/sync-team-roster-metadata.js](/c:/Users/NZU/Desktop/nzu-homepage/scripts/tools/sync-team-roster-metadata.js:821)
- Discord affiliation-change comparison: [scripts/tools/send-manual-refresh-discord.js](/c:/Users/NZU/Desktop/nzu-homepage/scripts/tools/send-manual-refresh-discord.js:136)

### Observed evidence from the analyzed run

- The analyzed Actions run recorded `moved_count: 1`
- The move was `빡재TV` from `black` to `fa`
- The same run did not record an observed conflict proving dual presence

### Root cause

The root cause is not just an inaccurate source page.

The root cause is a publishing pipeline that allows:

- partial roster observation
- aggressive fallback reassignment
- definitive public wording

without an explicit confidence downgrade.

### Preventive harness actions

1. Distinguish `observed_move` from `fallback_move`.
2. Prevent fallback-only affiliation changes from being announced as confirmed moves.
3. Add tests for "player missing from team scrape but still actually rostered."
4. Require repeated confirmation or explicit FA observation before public move wording.

## FM-002: Hidden chat context dependency

### Status

- documented
- mitigated by `docs/harness/` and active exec plans

### Summary

Long-running project work can become dependent on private conversation history unless current state is re-encoded in repo docs and reports.

### Impact

New AI sessions may misread operational priorities, allowlists, or recent fixes.

### Harness response

- keep resumable checkpoints in repo docs
- store active plans under `docs/harness/exec-plans/active/`
- keep root docs short and current

## FM-003: Document drift between active and archived guidance

### Status

- documented
- mitigated by harness index documents

### Summary

The repo contains useful historical material, but some notes are archived while current behavior lives elsewhere.

### Risk

An external AI may over-trust an obsolete memo and make wrong operational decisions.

### Harness response

- keep active operational truth in current docs
- archive historical notes clearly
- add harness index documents that explain where truth should be read from

## FM-004: Clustered inferred affiliation changes can still look operationally real

### Status

- documented
- partially mitigated by non-definitive wording
- not yet blocked or escalated automatically

### Summary

Even after confidence labeling is in place, a run can still produce many `inferred` affiliation changes at once.
This avoids false certainty in Discord wording, but it can still create operator noise and hide a larger upstream scrape issue.

### Confirmed example

- Local verification on 2026-04-18 showed multiple `늪지대 -> 무소속` inferred affiliation changes in `tmp/reports`
- `verify-discord-summary` reported `harness_violations: []` because wording was safe
- The pattern still merits review because clustered inferred moves often indicate a partial or stale upstream observation

### Why this matters

Confidence-aware wording protects the public summary, but it does not yet distinguish:

1. a plausible single-player inferred move
2. a scrape anomaly producing many inferred FA-style changes

That means the harness currently downgrades certainty without always escalating suspicious volume.

### Preventive harness actions

1. Add a threshold rule for clustered inferred affiliation changes.
2. Mark those runs as `review-needed` even if wording is compliant.
3. Prefer team-level suspicion alerts when many players from one roster shift to inferred FA at once.
