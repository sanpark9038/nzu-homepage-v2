# 2026-05-03 Serving Projection Incremental Sync

## Goal

Make the daily pipeline match the durable data model we actually want:

1. Historical match facts remain in the warehouse/static artifacts as append-only source truth.
2. Supabase writes only rows whose serving payload changed.
3. Supabase push fails before write steps when the project is not healthy enough for read-only probes.
4. Supabase `players.match_history` becomes a lightweight recent projection only after the public player page has a full-history replacement path.

## Current Evidence

- The warehouse path already keeps durable facts in `data/warehouse/fact_matches.csv`.
- `supabase-prod-sync.js` currently rebuilds player serving stats from warehouse data, then writes every valid staging player to `players`.
- `players.match_history` currently receives the full player history; the latest live incident reported about 137k `match_history` rows being pushed across player rows.
- The 2026-05-03 scheduled run failed after collection/staging/prod upsert, during final production count verification, while Supabase returned Cloudflare 521/522 HTML.
- Supabase dashboard shows the project on Nano as unhealthy with Disk IO budget exhausted.

## Decision

First stop unnecessary writes, then split full history from the hot serving row:

- Phase 1: keep the current `players.match_history` contract intact, but upsert only changed player rows.
- Phase 1: gate Supabase writes with a read-only readiness probe so an unhealthy project fails before staging/prod writes.
- Phase 2: add a full-history lookup path for player detail/H2H fallback.
- Phase 3: reduce `players.match_history` to a recent serving window, default 100 rows per player.
- `players.detailed_stats`: continue deriving aggregate stats from the full local history.
- `data/warehouse/fact_matches.csv`: full historical source of truth.

## Work Items

- [x] Add prod-sync tests for unchanged-row skipping.
- [x] Implement production payload comparison that ignores `last_synced_at` but preserves the existing full `match_history` contract.
- [x] Add a read-only Supabase readiness step before staging/prod sync.
- [x] Run targeted verification: `npm.cmd run test:prod-sync`, `npm.cmd run test:pipeline:push`.
- [ ] Do not run live Supabase sync until read-only probes stop returning Cloudflare 521/522 or dashboard health recovers.
- [x] Design/implement full-history replacement before reducing `players.match_history` to a recent-only projection.
- [x] Add `export-player-history-artifacts.js` to generate durable per-player JSON from `fact_matches.csv`.
- [x] Make public player detail/H2H fallbacks prefer player-history artifacts before `players.match_history`.
- [x] Make `push-supabase-approved.js` upload artifacts to R2 when configured and only then enable recent `players.match_history` projection.

## Notes

- This is an IO reduction and correctness change, not a billing workaround.
- Free/Nano can still become unhealthy if the daily write path pushes large JSON blobs; the new target is to make the daily write path proportional to actual changes.
- Read-only exploration on 2026-05-03 confirmed `players.match_history` is still a fallback for player detail all-time summaries and H2H when the `matches` table has no rows. Reducing it before a replacement path would be a public-data regression.
- Local artifact export on 2026-05-03 generated 313 player files and 131,335 match rows under `tmp/player-history-artifacts`.
- The recent projection is gated: if R2/public artifact upload is skipped, prod sync keeps the full `players.match_history` payload to avoid public-data regression. If upload succeeds, prod sync sets `PLAYER_HISTORY_ARTIFACTS_ENABLED=true` and limits Supabase `match_history` to `SUPABASE_MATCH_HISTORY_LIMIT` rows, default 100.
