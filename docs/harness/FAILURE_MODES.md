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

## FM-006: Repeated Discord roster delta from already-applied sync rows

### Status

- documented
- mitigated by prior roster-state filtering in Discord summary generation
- covered by `send-manual-refresh-discord.test.js`

### Summary

Discord can repeat the same roster delta across daily runs when the final summary reads `team_roster_sync_report.json` as a fresh alert source without checking whether those roster changes were already present in the previous `current_roster_state.json`.

### Confirmed example

- 2026-04-27 and 2026-04-28 Discord summaries repeated the same roster deltas:
- 루다: `무소속 -> wfu`
- 강민기: `무소속 -> wfu`
- 기나: `무소속 -> ssu`

루다 also had a separate match-collection exclusion decision at the time. That was not the root cause of the repeated Discord affiliation alert; it only explained why 루다 match collection needed a separate exclusion-list change.

### What happened

1. Roster sync produced `added` or `moved` rows in `tmp/reports/team_roster_sync_report.json`.
2. The Discord summary preferred those roster-sync rows for joiner and affiliation-change sections.
3. The summary did not compare those rows against the previous `tmp/reports/current_roster_state.json`.
4. Already-applied roster state was announced again as if it were new.

### Root cause

The summary confused "sync activity observed during this run" with "new operator-facing roster delta since the last accepted roster state."

`team_roster_sync_report.json` is useful evidence, but it is not sufficient by itself for Discord delta publication.

### Relevant code paths

- Discord summary check: [scripts/tools/lib/discord-summary.js](/c:/Users/NZU/Desktop/nzu-homepage/scripts/tools/lib/discord-summary.js:136)
- Final Discord message builder: [scripts/tools/send-manual-refresh-discord.js](/c:/Users/NZU/Desktop/nzu-homepage/scripts/tools/send-manual-refresh-discord.js:609)
- Regression coverage: [scripts/tools/send-manual-refresh-discord.test.js](/c:/Users/NZU/Desktop/nzu-homepage/scripts/tools/send-manual-refresh-discord.test.js:450)

### Preventive harness actions

1. Before publishing roster-sync `added` or `moved` rows in Discord, compare them with the previous `current_roster_state.json`.
2. Suppress rows whose player identity and target team already match the previous roster-state snapshot.
3. Keep legitimate new joiners visible even when already-applied rows are suppressed.
4. Use durable identity first (`entity_id` / serving identity), with name+team only as a compatibility fallback.
5. Never use a fixed player count such as `318` or `319` as the success invariant. Counts are snapshots; success means staging/prod consistency, nonzero rows, zero missing/duplicate identities, sync success, and completed cache revalidation.

### 2026-04-29 follow-up

The first mitigation still allowed repeated `added` rows to reappear when every
roster-sync joiner was suppressed as already present in the previous
`current_roster_state.json`. In that case, Discord summary generation fell back
to `manual_refresh_baseline` vs current roster comparison, which can still see
the same already-applied joiners as new inside the current run.

The guard now uses the previous roster-state snapshot as the comparison
baseline whenever it is available, so suppressed roster-sync joiners do not
come back through the baseline fallback path.

## FM-007: Stale SOOP snapshot reused by long chunked ops runs

### Status

- documented
- mitigated by refreshing the SOOP live snapshot before homepage integrity in both the top-level manual refresh and each ops chunk
- mitigated by refreshing the SOOP live snapshot immediately before Supabase staging/prod sync
- mitigated by refusing stale database `is_live=true` values in the public player live overlay
- verified for homepage integrity by Actions run `25040648610`
- verified for live-state recovery by SOOP Live Sync run `25053187989`

### Summary

Homepage integrity can report `stale_live_snapshot_disagreement` when the ops
pipeline compares current DB/effective live data against an old
`data/metadata/soop_live_snapshot.generated.v1.json` snapshot.

The same stale snapshot can also damage the public `/tier` live-broadcaster
view if a long manual `with-sync` run reaches Supabase staging/prod sync after
the snapshot freshness window has expired. In that case, staging prepares
`is_live=false` for every player, and prod sync writes those false values to
`players`.

### Confirmed example

- Verification run `25038323238` refreshed the SOOP snapshot before the first
  homepage integrity report, but later chunked pipeline steps overwrote the
  artifact with a report generated from a snapshot that had become stale during
  the long run.
- The stale alert was noise from freshness drift, not proof that the roster or
  serving player count was wrong.

### What happened

1. The workflow had a fresh SOOP Live Sync earlier in the day.
2. The ops pipeline then ran long enough for the local generated snapshot to
   become stale relative to the homepage integrity freshness window.
3. Chunk-local homepage integrity reports reused that stale file.
4. The final uploaded artifact could therefore show stale live disagreement even
   though the top-level refresh had already made a fresh report.
5. A later manual run with Supabase sync (`25049764351`) reached the sync phase
   after the local generated snapshot was stale, logged `SOOP snapshot fresh:
   false`, and wrote `players.is_live=false` for all rows. `/tier` then had no
   current live broadcaster rows to display until SOOP Live Sync (`25053187989`)
   restored `players.is_live=true` rows.
6. A later SOOP scheduled-sync gap left old `players.is_live=true` rows visible
   for users after broadcasters had already gone offline. GitHub schedule
   cadence is not a hard 5-minute freshness guarantee, so public UI must not
   treat old DB live flags as current truth without a fresh `last_checked_at`.

### Root cause

The pipeline treated the generated SOOP snapshot as durable for the whole run.
For long chunked runs, freshness must be local to every consumer of the
snapshot, not only to the workflow start. That includes homepage integrity and
the Supabase staging sync that prepares `is_live`.

### Relevant code paths

- Top-level refresh: [scripts/tools/run-manual-refresh.js](/c:/Users/NZU/Desktop/nzu-homepage/scripts/tools/run-manual-refresh.js:1)
- Chunked runner: [scripts/tools/run-ops-pipeline.js](/c:/Users/NZU/Desktop/nzu-homepage/scripts/tools/run-ops-pipeline.js:1)
- Homepage integrity report: [scripts/tools/report-homepage-integrity.js](/c:/Users/NZU/Desktop/nzu-homepage/scripts/tools/report-homepage-integrity.js:1)

### Preventive harness actions

1. Refresh the SOOP snapshot immediately before `homepage_integrity_report` when `SOOP_CLIENT_ID` is available.
2. Apply the same refresh rule inside chunked ops runs, because chunks can overwrite the final artifact.
3. Verify artifact JSON, not only logs: require `snapshot_is_fresh=true`, `stale_snapshot_disagreement_count=0`, and no `stale_live_snapshot_disagreement` alert.
4. Interpret stale snapshot disagreement as freshness drift until the snapshot timestamp proves otherwise.
5. Refresh the SOOP snapshot immediately before `supabase_staging_sync` / `supabase_prod_sync` in the approved push wrapper, so a long collection phase cannot publish all-false live state.
6. After any real `with-sync` run, verify `players.is_live=true` count directly or run SOOP Live Sync before judging `/tier` live-broadcaster behavior.
7. Public live UI must fail closed when a DB live row is older than the live
   freshness window. `lib/player-live-overlay.ts` is the serving-side guard, and
   `scripts/tools/player-live-overlay-contract.test.js` keeps it in
   `verify:predeploy`.
