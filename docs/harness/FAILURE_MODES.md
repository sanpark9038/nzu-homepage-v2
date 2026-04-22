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

## FM-005: Low-quality stable CSV history can overwrite better serving match history

### Status

- documented
- mitigated by prod-sync quality guard
- mitigated by homepage integrity match-history coverage reporting
- mitigated by ops alert escalation for degraded coverage

### Summary

Stable CSV history files in `tmp/` can have valid rows but missing or unreadable headers for `상대명` and related fields.
When prod sync preferred that stable CSV blindly, it replaced higher-quality `fact_matches`-derived history with rows whose `opponent_name` was blank.

### Confirmed example

- 2026-04-22 local + live investigation
- `players.match_history` existed for many players, but `opponent_name` was blank across those rows
- public `/entry` and `/match` pages then showed widespread `0-0` or missing H2H despite real match data existing

### What happened

1. `fact_matches.csv` still had usable opponent names.
2. `parseMatchHistoryFromStableCsv()` read stable CSV rows with degraded header matching.
3. `buildServingStatsByIdentity()` treated any non-empty stable history as authoritative and overwrote the existing history.
4. prod sync wrote that degraded history into `players.match_history`.

### Relevant code paths

- Stable CSV history parsing: [scripts/tools/supabase-prod-sync.js](/c:/Users/NZU/Desktop/nzu-homepage/scripts/tools/supabase-prod-sync.js:345)
- Stable-vs-fact replacement decision: [scripts/tools/supabase-prod-sync.js](/c:/Users/NZU/Desktop/nzu-homepage/scripts/tools/supabase-prod-sync.js:642)
- Prod-sync quality report output: [scripts/tools/supabase-prod-sync.js](/c:/Users/NZU/Desktop/nzu-homepage/scripts/tools/supabase-prod-sync.js:891)
- Homepage integrity match-history coverage check: [scripts/tools/report-homepage-integrity.js](/c:/Users/NZU/Desktop/nzu-homepage/scripts/tools/report-homepage-integrity.js:428)
- Ops alert escalation for degraded coverage: [scripts/tools/run-daily-pipeline.js](/c:/Users/NZU/Desktop/nzu-homepage/scripts/tools/run-daily-pipeline.js:388)

### Root cause

The root cause was not only CSV encoding/header drift.

The deeper harness failure was allowing:

- lower-quality alternate history source
- unconditional overwrite of better current history
- no post-sync quality gate on `opponent_name` coverage

to coexist in the serving path.

### Preventive harness actions

1. Only replace current history with stable CSV when the replacement is meaningfully populated.
2. Refuse prod sync when `match_history.opponent_name` coverage falls below a safety threshold.
3. Surface coverage metrics in homepage integrity and ops alerts so degradation is visible before users report it.
