# ACTIVE PLAN: pipeline-stabilization

Created: 2026-04-20
Status: in-progress

## Goal

Close the highest-risk pipeline stability gaps before deployment: silent name collisions, serving-data resets on missing source stats, stale public cache after successful sync, and hero media admin/serving stabilization.

## 작업 전 확인 완료

### 충돌 위험 파일

- `scripts/tools/supabase-staging-sync.js`
- `scripts/tools/supabase-prod-sync.js`
- `lib/player-service.ts`
- `docs/harness/SESSION_ENTRY.md`
- shared deployment/runtime decision files such as `scripts/tools/push-supabase-approved.js`, `scripts/tools/revalidate-public-cache.js`, and `docs/harness/DEPLOYMENT_SCOPE_2026-04-20.md`

### 독립 수정 가능한 파일

- `scripts/sql/check-serving-identity-schema.sql`
- `docs/harness/SERVING_IDENTITY_NOTES.md` when the change is note-only and does not alter rollout decisions
- test files such as `scripts/tools/supabase-staging-sync.test.js` and `scripts/tools/supabase-prod-sync.test.js` when they only extend existing guarded behavior

### 마지막으로 확인한 기준 시점/근거

- Confirmed from this plan's current `Files in play`, blockers, and latest status note on 2026-04-22.
- Treat staging/prod sync writes, deployment gating, and session-start rules as one coordination surface.

## Completed steps

- [x] Re-run session entry and confirm current pipeline context, reports, and workflow state.
- [x] Re-audit the current risk paths in `supabase-staging-sync.js`, `supabase-prod-sync.js`, and `lib/player-service.ts`.
- [x] Block harmful name-based identity collisions before staging sync can silently flatten distinct players.
- [x] Preserve existing serving stats/history when the current sync has no fresh source stats for a player.
- [x] Add a post-sync public cache revalidation path for `public-players-list`.
- [x] Run targeted sync tests and isolate the remaining build blocker.
- [x] Reduce player-side serving stats seeding from name-only lookup to identity-first lookup in `supabase-prod-sync.js`.
- [x] Stabilize hero media admin flow: `hero_media` DDL/helper, admin upload/delete, immediate revalidation, and Korean copy cleanup.
- [x] Tighten `check-site-integration-readiness.js` so deployment gating now requires `supabase_sync=completed`, `cache_revalidation=completed`, `summary.live.snapshot_is_fresh=true`, and `stale_snapshot_disagreement_count=0`.
- [x] Reduce `lib/player-service.ts` H2H fallback risk by removing broad alias matching and limiting fallback comparison to normalized `name` / `nickname` only.
- [x] Add a fail-closed prod-sync guard so stale delete stops when candidate rows only have name-fallback or unknown identities.
- [x] Add a fail-closed staging-sync guard so upsert is refused when rows only have name-fallback or unknown identities.
- [x] Fix `export-player-matches-csv.js` so placeholder player names like `??` cannot generate invalid default CSV/report filenames during chunked pipeline collection.

## Next steps

- [x] Verify the next real sync run records successful cache revalidation when `SERVING_REVALIDATE_SECRET` and site URL envs are present.
- [x] Fix the pre-existing `app/api/stats/h2h/route.ts` tuple typing error that was blocking `next build`.
- [x] Add guarded prod-sync identity checks so same-name different-identity rows fail closed instead of silently merging.
- [x] Confirm the canonical durable serving key for `players` / `players_staging` and document how mix/non-mix variants should collapse.
- [x] Verify whether Supabase already has a unique constraint/index for the canonical serving key. If not, define the migration needed before any `onConflict` flip.
- [x] Add repo-visible staging-table typing or schema notes so identifier-based sync work is not happening against an implicit table contract.
- [x] Verify the live Supabase rollout for hero media: table/policy present, storage bucket configured, and active media serves cleanly on homepage/admin after upload/delete.
- [x] Only after the above: decide whether `onConflict: 'name'` can move to an identifier-based key safely.
- [x] Add optional opponent durable identity support to repo-visible contracts (`opponent_entity_id`) without making it a deployment blocker.
- [x] Fix the scheduled ops-pipeline regression where ops alert team labels drifted across encodings and caused `test:pipeline:daily` to fail before manual refresh started.
- [x] Make Discord failure summaries distinguish workflow preflight failures from real collection/apply failures so scheduled alerts do not misreport the broken stage.
- [x] Add Vercel deployment safeguards so public/read-only admin views can ship while local-file admin writes and manual pipeline execution fail closed in deployment.
- [ ] Replace `player-service` history/H2H fallback with opponent durable identity once warehouse / serving contracts expose it consistently; current fallback is now narrower but still name-based.
- [x] Re-run `check-site-integration-readiness.js --markdown` after the next real sync and make sure the new readiness blockers clear.
- [x] Re-run `npm run pipeline:manual:refresh:with-sync` after the placeholder-filename fix and confirm the previous `ku / pipeline_failure / fetch_fail=1` blocker is gone.
- [ ] Decide whether `/admin/tournament` should stay deployment-visible as read-only UI, or be folded into the same Vercel read-only pattern as `/admin/roster`.
- [x] Re-scope the deployment commit so current admin/Vercel stabilization work is explicitly tracked instead of drifting outside the deployment scope doc.

### Current note on the serving identity blocker

- Resolved for the active serving pipeline as of 2026-05-16.
- The Supabase schema migration and follow-up partial-index replacement were already applied and verified in the earlier real sync runs documented below.
- Current staging/prod sync code writes `serving_identity_key` when the column is available and falls back to `name` only for non-migrated environments.
- Current read-only REST readiness check on 2026-05-16 found both `players` and `players_staging` columns present, `318` rows in both tables, `0` missing Eloboard IDs, and `0` duplicate serving-identity buckets.
- Keep `scripts/sql/check-serving-identity-schema.sql` as the SQL-capable proof path for future schema drift checks, because the REST readiness check still cannot inspect pg indexes directly.

## Blockers

- No current blocker remains for the canonical player metadata source or serving roster alignment.
- `hero_media` table, `hero_media_single_active_idx`, `hero_media_public_read`, and `hero-media` public bucket were manually verified in Supabase.
- Homepage integrity now reports `summary.hero_media`, and `check-daily-status` surfaces it without escalating it into daily ops alerts.
- The former serving-identity blocker is closed: active staging/prod sync can use `serving_identity_key`, stale delete compares durable serving identities first, and the latest live serving roster diff is clean.
- Remaining plan work is narrower and separate from the player metadata source: replace the remaining public history/H2H name fallback once opponent durable identity is consistently served, and decide whether `/admin/tournament` should use the same deployment read-only pattern as `/admin/roster`.

### Latest status note

- 2026-04-26 recovery follow-up:
- GitHub Actions run `24936550085` (`NZU Ops Pipeline`, `workflow_dispatch`, `main`, `845e188`) completed successfully at `2026-04-25T18:20:22Z`.
- The run log confirms `[OK] supabase_staging_sync`, `[OK] supabase_prod_sync`, `Done: Supabase staging+prod sync completed.`, and `CACHE_REVALIDATION_RESULT {"status":"completed"}`.
- The production sync wrote `318` valid staging records to `players`, found `0` stale players, and reported `match_history opponent_name fill rate: 134851/134851 (1)`.
- Direct production Supabase verification on 2026-04-26 found `players=318`, `players_with_history=315`, `total_match_history_rows=134851`, `max_match_history_date=2026-04-25`, and `blank_opponent_players=0`.
- Direct production verification for `김정우` (`id=2ca02f54-45d6-486a-beab-acf34fcba5b1`, `eloboard_id=eloboard:male:40`) found `history_rows=796` with latest rows on `2026-04-25`.
- The deployed player page at `/player/김정우--2ca02f54` returned HTTP 200 and rendered `어윤수 / 폴스타 / 26.04.25`.
- Local `.env.local` currently has Supabase envs but does not define `NEXT_PUBLIC_SITE_URL`, `SITE_URL`, `VERCEL_URL`, `SERVING_REVALIDATE_URL`, or `SERVING_REVALIDATE_SECRET`; this matches the earlier run log line `[SKIP] revalidate_public_cache missing base_url, secret` before the wrapper reported completed.
- Vercel production env inspection after `vercel link --project nzu-homepage-v2 --scope sanparks-projects` found Supabase/admin/SOOP envs present, but no `SERVING_REVALIDATE_SECRET`, `SERVING_REVALIDATE_URL`, `NEXT_PUBLIC_SITE_URL`, or `SITE_URL`.
- A deployed probe to `/api/admin/revalidate-serving` returned `401 admin auth required`, showing the proxy was also blocking the secret-protected revalidation endpoint. `proxy.ts` now allowlists that endpoint, `.github/workflows/ops-pipeline-cache.yml` now passes `SERVING_REVALIDATE_SECRET` and `SERVING_REVALIDATE_URL` into the job, and `scripts/tools/admin-revalidation-proxy-contract.test.js` is added to `verify:predeploy`.
- 2026-04-26 follow-up env setup: generated one new `SERVING_REVALIDATE_SECRET`, set it in GitHub Actions secrets and Vercel production env, and set GitHub Actions variable `SERVING_REVALIDATE_URL=https://nzu-homepage-v2.vercel.app`. Vercel env metadata and GitHub secret/variable metadata verified by name only.
- Commit `a7d54cf` (`Enable serving cache revalidation`) was pushed to `main`, deployed to Vercel production, and a deployed probe then returned route-level `401 {"ok":false,"error":"unauthorized"}`, proving the admin proxy no longer intercepts the revalidation endpoint and the runtime secret is present.
- Manual verification run `24954064205` completed successfully on 2026-04-26. The log confirms `[OK] supabase_staging_sync`, `[OK] supabase_prod_sync`, `[OK] revalidate_public_cache {"ok":true,"revalidated":["public-players-list"]}`, and `CACHE_REVALIDATION_RESULT {"status":"completed"}`.
- Run `24954064205` production sync reported `318` valid staging records, `318` players upserted, `0` stale players, and `match_history opponent_name fill rate: 134965/134965 (1)`.
- Direct production Supabase verification after run `24954064205` found `players=318`, `players_with_history=315`, `total_match_history_rows=134965`, and `max_match_history_date=2026-04-26`.
- Serving identity readiness follow-up on 2026-04-26:
- Added `scripts/tools/check-serving-identity-readiness.js` and `npm run check:serving-identity-readiness` as a REST-based read-only check that can be run without a direct Postgres SQL connection.
- Live REST check reports data readiness is good: `players=318`, `players_staging=318`, `missing_eloboard_id_rows=0` for both tables, and `duplicate_serving_identity_buckets=0` for both tables.
- Live REST check also confirms schema is not ready yet: `players.serving_identity_key` and `players_staging.serving_identity_key` do not exist (`42703`), and unique/index contracts still cannot be verified without running `scripts/sql/check-serving-identity-schema.sql` through a SQL-capable channel.
- Decision: do not flip `onConflict: 'name'` or stale delete yet. Next concrete unblocker is applying/verifying `scripts/sql/add-serving-identity-key.sql` through Supabase SQL/psql, then rerunning the SQL check and REST readiness check.
- 2026-04-26 implementation follow-up: current local environment still has no SQL-capable Supabase channel (`psql`/Supabase CLI/Postgres URL absent), so the schema migration was not applied from Codex.
- Added a shared `scripts/tools/lib/serving-identity-key.js` helper and wired staging/prod sync to probe for `serving_identity_key` before writing. If the column is absent, sync payloads stay on the current schema; after the column exists, sync payloads automatically include the canonical `serving_identity_key` while `onConflict: 'name'` remains unchanged.
- Latest REST readiness check on 2026-04-26T11:35:25Z: `players=318`, `players_staging=318`, `missing_eloboard_id_rows=0`, `duplicate_serving_identity_buckets=0`, but both `serving_identity_key` columns are still missing (`42703`). `ready_for_on_conflict_flip=false`.
- Local verification after the conditional-write change passed: `npm.cmd run test:serving-identity-key`, `npm.cmd run test:serving-identity-readiness`, `npm.cmd run test:staging-sync`, `npm.cmd run test:prod-sync`, live `npm.cmd run check:serving-identity-readiness`, and full `npm.cmd run verify:predeploy`.
- 2026-04-26 schema migration follow-up: operator applied `scripts/sql/add-serving-identity-key.sql` through Supabase SQL Editor after the duplicate/missing prechecks passed. SQL index check showed `idx_players_serving_identity_key` and `idx_players_staging_serving_identity_key` present.
- Manual with-sync verification run `24957089655` completed successfully. Logs confirm `WORKFLOW_MODE_LABEL=manual dispatch with Supabase sync`, `[OK] supabase_staging_sync`, staging `serving_identity_key write enabled: true`, `[OK] supabase_prod_sync`, prod `serving_identity_key write enabled: true`, `Fetched 318 valid records from players_staging`, `Upserted 318 records to players`, `[OK] revalidate_public_cache {"ok":true,"revalidated":["public-players-list"]}`, and `CACHE_REVALIDATION_RESULT {"status":"completed"}`.
- Post-run REST readiness on 2026-04-26T13:53:57Z confirmed both columns exist, `players=318`, `players_staging=318`, `missing_eloboard_id_rows=0`, and `duplicate_serving_identity_buckets=0`. REST still cannot prove the SQL index contract, but the operator SQL check above did.
- 2026-04-26 follow-up: switched staging/prod upsert conflict target to `serving_identity_key` when the column is present, with fallback to `name` for non-migrated environments. Prod stale delete now compares durable serving identities first, so renamed rows for the same player are preserved instead of being treated as stale. Same-name/different-identity conflict detection remains fail-closed.
- Local verification for the conflict-target switch passed: `npm.cmd run test:prod-sync`, `npm.cmd run test:staging-sync`, `npm.cmd run test:serving-identity-key`, `npm.cmd run test:serving-identity-readiness`, live `npm.cmd run check:serving-identity-readiness`, and full `npm.cmd run verify:predeploy`.
- Verification run `24958441185` failed in `supabase_staging_sync` after truncating staging because PostgREST rejected `onConflict=serving_identity_key` with `42P10 there is no unique or exclusion constraint matching the ON CONFLICT specification`. Root cause: the live indexes are partial unique indexes (`where serving_identity_key is not null`), which enforce uniqueness but cannot be used as the upsert conflict target. Apply `scripts/sql/replace-serving-identity-partial-indexes.sql`, then rerun with-sync to restore `players_staging` and verify prod sync.
- Recovery verification run `25035532431` completed successfully on 2026-04-28 after commit `b67ff06` (`Fix repeated roster delta alerts`) was pushed to `main`. Logs confirm `WORKFLOW_MODE_LABEL=manual dispatch with Supabase sync`, `[OK] supabase_staging_sync`, staging `serving_identity_key write enabled: true`, `[OK] supabase_prod_sync`, prod `serving_identity_key write enabled: true`, `Fetched 319 valid records from players_staging`, `Upserted 319 records to players`, `[OK] revalidate_public_cache {"ok":true,"revalidated":["public-players-list"]}`, and `CACHE_REVALIDATION_RESULT {"status":"completed"}`.
- Post-run REST readiness on 2026-04-28T06:17:27Z confirmed `players=319`, `players_staging=319`, `missing_eloboard_id_rows=0`, and `duplicate_serving_identity_buckets=0` for both tables. Treat `319` as the current snapshot count, not a fixed invariant; future runs may change as roster membership and collection exclusions change. The invariant is that staging/prod counts stay nonzero and consistent, identity columns exist, missing/duplicate identity checks stay zero, sync succeeds, and cache revalidation completes.
- The `318 -> 319` count change is expected after removing 루다 (`entity_id=eloboard:female:932`) from `data/metadata/pipeline_collection_exclusions.v1.json`; 루다 is now collected like other active players.
- The Discord repeated roster-delta fix was verified in the same run: the final summary no longer repeated the prior 루다/강민기/기나 affiliation-change section, while legitimate joiner output still appeared.
- 2026-04-28 SOOP freshness follow-up: commits `f670cac` and `c803fdd` refresh the generated SOOP live snapshot before homepage integrity at both the top-level manual refresh and each chunk-local ops run. Collect-only verification run `25040648610` completed successfully on commit `c803fdd`; final artifacts show `manual_status=pass`, `ops_status=pass`, `snapshot_is_fresh=true`, `stale_snapshot_disagreement_count=0`, and no `stale_live_snapshot_disagreement` alert.
- 2026-04-29 Discord joiner follow-up: the same three `added` rows could still repeat after the first FM-006 mitigation because suppressed roster-sync joiners fell back to `manual_refresh_baseline` vs current roster comparison. `buildDiscordSummaryCheck` now compares previous `current_roster_state.json` players against current roster whenever that previous state exists, and `send-manual-refresh-discord.test.js` covers this fallback path.
- 2026-04-29 SOOP live UI follow-up: a scheduled-sync gap left the latest `players.last_checked_at` about 95 minutes old, so `/tier?liveOnly=true` correctly failed closed under the 15-minute public freshness guard. The overlay now ignores stale generated snapshots as live-state truth while still clearing stale DB live rows, and the SOOP Live Sync workflow revalidates `public-players-list` immediately after Supabase live-state sync.
- deployment readiness is now green after a successful real `with-sync` run, refreshed Discord roster snapshot, fresh SOOP live snapshot sync, and a regenerated homepage integrity report
- current repo state is also green on local verification: `npm.cmd run build` and `npm.cmd run lint` both pass
- `supabase-prod-sync.js` now fail-closes when stable CSV history is lower quality than existing `fact_matches` history, writes `tmp/reports/prod_sync_history_quality_latest.json`, and refuses prod sync when `match_history.opponent_name` coverage is catastrophically low
- `report-homepage-integrity.js` now reports `summary.match_history`, and `run-daily-pipeline.js` can escalate degraded opponent-name coverage as `match_history_quality_degraded`
- current live integrity snapshot after the repair reports `match_history_total_rows=132055`, `opponent_name_fill_rate=0.9998`, and `players_with_blank_opponent_rows=1`
- current branch is now cleanly split into follow-up commits after `6adb505`:
- `24d99bb` prod-sync / integrity guard
- `0117fc5` public H2H recovery
- `a033ffc` homepage lint suppression only
- `2901260` roster metadata content refresh
- the remaining practical blocker before shipping is no longer runtime readiness; it is deciding which current worktree changes belong in the deployment-scoped commit versus which should be deferred
- deployment-visible admin copy has now been normalized again across hero media, rankings, prediction, ops, universities, and roster split pages
- `/admin/roster` is now split into general corrections and manual-team management
- general roster corrections now have a repo-visible durable path draft:
- `scripts/sql/create-roster-admin-corrections.sql`
- `lib/roster-admin-store.ts`
- `scripts/tools/lib/roster-admin-store.js`
- `/api/admin/roster` now writes general corrections to the Supabase overlay first, with local JSON fallback preserved for non-migrated environments
- daily pipeline and serving sync now consume the same merged correction overlay in `sync-team-roster-metadata.js`, `export-team-roster-detailed.js`, `supabase-staging-sync.js`, and `supabase-prod-sync.js`
- remaining roster deployment gap is narrower now: manual team create/delete still owns local project JSON, so only general player corrections should be treated as the Vercel-safe path after the Supabase table is applied
- 2026-05-03 scheduled ops follow-up: run `25262873072` failed after successful collection, staging sync, and prod upsert because Supabase REST returned Cloudflare 521/522-style errors during final production count verification. The failed log printed `[object Object]` because `supabase-prod-sync.js` threw a plain Supabase error object. Current local mitigation adds readable Supabase error formatting and transient retry for the final `players` count verification, covered by `npm.cmd run test:prod-sync`; do not rerun the sync workflow until read-only Supabase probes stop returning Cloudflare 5xx HTML.

### Mixed-scope triage note

- Keep for the deployment commit:
- roster correction overlay path and its consumers in serving/sync/report files
- admin read-only/runtime safeguards and the split `/admin/roster` / `/admin/roster/teams` flow
- green-readiness admin support fixes such as `app/admin/tournament/page.tsx` and `app/admin/roster/TeamNameEditor.tsx`
- Split or defer before the deployment commit:
- session-start hardening docs such as `AGENTS.md`, `RUNBOOK.md`, `LESSONS_LEARNED.md`, and plan-template cleanup
- public-site carryover from the home/entry plan unless explicitly promoted into this deployment scope
- lint-only shared UI cleanup unless it is required to keep the deployment-scoped commit green
- current H2H UI recovery files such as `components/stats/H2HLookup.tsx`, `components/players/H2HSelectorBar.tsx`, `app/api/stats/h2h/route.ts`, and `lib/h2h-service.ts` unless this deployment explicitly absorbs the public H2H follow-up
- pipeline-generated project roster JSON refreshes under `data/metadata/projects/*` unless they are intentionally shipped as a separate content/data update
- Special review bucket before commit:
- `app/admin/tournament/page.tsx`
- `components/ThemeProvider.tsx`
- `app/page.tsx`
- These files are currently modified but should be consciously classified as keep/split/defer, not carried silently.
- Current classification from local diff review:
- keep `app/admin/tournament/page.tsx` because it is a real admin build/lint support fix, not product-scope drift
- split or defer `components/ThemeProvider.tsx`, `app/page.tsx`, `components/SidebarNav.tsx`, and `components/battle-grid/TeamSelector.tsx` unless the deployment-scoped commit needs them to stay lint-green by itself
- The exact current-worktree `stage now` vs `split/defer` file list now lives in `docs/harness/DEPLOYMENT_SCOPE_2026-04-20.md#current-worktree-triage`.

## Session recovery

### First three commands

```powershell
git status --short --branch
git log --oneline -5
gh run list --repo sanpark9038/nzu-homepage-v2 --limit 8
```

### Last checked state

- Actions run id: `24653939461`
- Report artifact: `tmp/reports/manual_refresh_latest.json`
- git HEAD: `85a5eb7`

## Files in play

- `docs/harness/SESSION_ENTRY.md`
- `docs/RELIABILITY.md`
- `docs/harness/DEPLOYMENT_SCOPE_2026-04-20.md`
- `docs/harness/SERVING_IDENTITY_NOTES.md`
- `docs/harness/exec-plans/active/2026-04-20-pipeline-stabilization.md`
- `scripts/sql/create-hero-media.sql`
- `scripts/tools/supabase-staging-sync.js`
- `scripts/tools/supabase-prod-sync.js`
- `scripts/tools/supabase-staging-sync.test.js`
- `scripts/tools/supabase-prod-sync.test.js`
- `scripts/tools/push-supabase-approved.js`
- `scripts/tools/revalidate-public-cache.js`
- `scripts/sql/add-serving-identity-key.sql`
- `scripts/sql/check-serving-identity-schema.sql`
- `app/api/admin/hero-media/route.ts`
- `app/api/admin/revalidate-serving/route.ts`
- `app/admin/hero-media/page.tsx`
- `app/admin/hero-media/HeroMediaAdmin.tsx`
- `lib/hero-media.ts`
- `lib/player-service.ts`

## New failure modes found

- FM-007: stale SOOP snapshot reused by long chunked ops runs. See `docs/harness/FAILURE_MODES.md`.
- 2026-04-28 follow-up under FM-007: 전태규 (`70jeontaekyu`) exposed a second SOOP live-state gap where the snapshot was fresh but incomplete because `broad/list` scanning stopped at the default 60 pages. Immediate scope is to raise the default snapshot/live-sync scan depth, add a contract test for the minimum page limit, and verify the same-page-limit miss list before syncing live state.

## 2026-05-12 Legacy Sync Path Cleanup Slice

### Goal

Retire or fail-close the legacy direct Supabase sync path so production serving sync only flows through the approved wrapper with SOOP snapshot refresh, readiness checks, player-history artifact export, prod sync, and cache revalidation.

### Scope

- `package.json`
- `scripts/tools/run-ops-pipeline.js`
- `scripts/tools/run-ops-pipeline.test.js`
- `scripts/tools/run-daily-pipeline.js`
- `scripts/tools/report-pipeline-runtime-flow.test.js`
- `PIPELINE_ONE_PAGE.md`
- `PIPELINE_SUCCESS_CRITERIA.md`
- `README.md`
- `docs/README.md`
- `data/metadata/pipeline_runtime_flow.v1.json`
- this active plan

### RB / Rollback Criteria

- No production data writes are allowed during this cleanup.
- If a focused test fails for reasons outside this scope, stop and report before widening the change.
- Roll back non-safety edits by restoring the relevant docs/runtime metadata or helper cleanup only; do not restore the legacy direct sync path.
- Keep the `run-ops-pipeline.js --with-supabase-sync` fail-closed guard and the `pipeline:ops:with-sync` compatibility alias to `pipeline:manual:refresh:with-sync` unless the operator explicitly chooses a new approved sync design.
- The safe runtime invariant is: any command path that can sync staging/prod must call `scripts/tools/push-supabase-approved.js --approved` or fail closed with operator guidance.

### Planned Steps

- [x] Add a failing contract test proving `run-ops-pipeline.js --with-supabase-sync` no longer runs `supabase-staging-sync.js` / `supabase-prod-sync.js` directly.
- [x] Add a failing contract test proving `package.json` no longer advertises the legacy direct sync path.
- [x] Implement the smallest fail-closed change.
- [x] Update pipeline docs/runtime metadata to point operators at `pipeline:manual:refresh:with-sync` and `pipeline:push:approved`.
- [x] Remove unreachable legacy helper code in `run-daily-pipeline.js` only if the sync-path tests are green and the edit stays isolated.
- [x] Run focused verification: pipeline push test, run-ops-pipeline test, runtime-flow/inventory checks, and package/doc grep.

### Implementation Notes

- `npm run pipeline:ops:with-sync` remains as a compatibility command, but now points at `node scripts/tools/run-manual-refresh.js --with-supabase-sync`.
- Direct `node scripts/tools/run-ops-pipeline.js --with-supabase-sync` now exits before collection or sync work and prints approved-wrapper guidance.
- `single_chunk_pipeline` in `data/metadata/pipeline_runtime_flow.v1.json` is now documented as collect-only, while `approved_serving_sync` owns staging/prod writes and cache revalidation.
- Removed the unreachable `buildHomepageIntegrityOperationalAlertsLegacy` body from `scripts/tools/run-daily-pipeline.js`.

### Direct Sync Branch Removal Follow-up

- [x] Add a red contract proving `scripts/tools/run-ops-pipeline.js` no longer embeds direct `supabase-staging-sync.js` / `supabase-prod-sync.js` script calls or legacy sync step names.
- [x] Remove the unreachable direct staging/prod sync ensure/dry-run/run branches from `scripts/tools/run-ops-pipeline.js`; the command remains collect-only and always reports `skip_supabase=true`.
- [x] Verify dry-run collect-only output contains only `daily_pipeline` and `warehouse_verify`, while `--with-supabase-sync` still exits `1` with approved-wrapper guidance.
- [x] Add `test:pipeline:ops` and include the ops/runtime-flow retirement contracts in `pipeline:health` and `verify:predeploy`.
- [x] Add a contract proving `run-manual-refresh.js --with-supabase-sync` delegates to `push-supabase-approved.js --approved` and does not call staging/prod sync scripts directly.

### Skip Supabase Flag Cleanup Follow-up

- [x] Add red contracts proving collect-only callers no longer pass the no-op `--skip-supabase` flag.
- [x] Remove `--skip-supabase` from `pipeline:collect-only`, chunk-local `run-ops-pipeline.js` calls, and runtime-flow metadata.
- [x] Preserve the `skip_supabase=true` report field in `run-ops-pipeline.js` for report compatibility while the command remains collect-only.
- [x] Update the scheduled ops workflow preflight to run `npm run pipeline:health` before any prod-capable manual refresh path.

### Chunk Preflight Dedupe Follow-up

- [x] Add red contracts proving chunk-local `run-ops-pipeline.js` calls opt out of duplicated homepage integrity / SOOP snapshot preflight.
- [x] Add `--no-homepage-integrity` handling to `run-ops-pipeline.js` while preserving normal single-run preflight behavior when Supabase envs are present.
- [x] Pass `--preflight-already-run` from `run-manual-refresh.js` only after top-level homepage integrity succeeds; `run-ops-pipeline-chunked.js` only forwards `--no-homepage-integrity` to chunk-local ops calls when that wrapper-only flag is present.
- [x] Preserve direct `pipeline:collect:chunked` / Windows scheduled chunked runs as normal preflight-capable paths instead of silently skipping homepage integrity.

### 2026-05-13 Manual Refresh Preflight Gating Follow-up

- [x] Add a red focused contract for the review finding: if top-level `homepage_integrity_report` does not pass, `run-manual-refresh.js` must not cause chunk-local homepage integrity to be skipped before a possible sync.
- [x] Preserve the existing dedupe path only when the top-level homepage integrity preflight succeeds.
- [x] Wire the manual-refresh contract into `pipeline:health` and `verify:predeploy`.
- [x] Verify with focused tests first, then `pipeline:health`, then `verify:predeploy`.

Outcome: `run-manual-refresh.js` now builds chunked collection args after the allow-failure homepage integrity step has returned. `--preflight-already-run` is only forwarded when that top-level step has `ok === true`; failed or skipped top-level integrity leaves chunk-local homepage integrity enabled.

### 2026-05-14 Player History Freshness Follow-up

- Investigated a production report where `eloboard:male:37` still showed recent
  records ending at `2026-04-20` while a forced no-cache source check found
  matches through `2026-05-13`.
- Root cause is FM-009: stale existing JSON could be reused for inactive
  players, then `update-player-check-priority.js` used the JSON file mtime as
  `last_checked_at`, making a stale cache look recently checked.
- Mitigation scope:
  - `report-team-records.js` now emits explicit `generated_at` in fresh JSON.
  - `update-player-check-priority.js` no longer uses file mtime as
    `last_checked_at`.
  - `export-team-roster-detailed.js` no longer lets inactive JSON reuse bypass
    players that are due by `check_interval_days`.
  - `scripts/tools/player-collection-freshness-contract.test.js` is wired into
    `pipeline:health` and `verify:predeploy`.
- No production data write was performed in this investigation slice.

### 2026-05-15 Roster Ownership Simplification

- Decision: treat `data/metadata/projects/*/players.*.v1.json` as the current
  operator-confirmed roster baseline.
- Scheduled/manual refresh pipelines must not auto-apply Eloboard roster, tier,
  race, or FA movement decisions to that baseline.
- `run-ops-pipeline-chunked.js` now calls `sync-team-roster-metadata.js` with
  `--report-only`, so roster differences still produce
  `tmp/reports/team_roster_sync_report.json` but do not rewrite project roster
  files during collection.
- `build-roster-change-review.js` converts that raw sync report into
  `tmp/reports/roster_change_review_latest.md/json`, showing only the
  operator-facing move, tier, race, new-player, conflict, and guarded-team
  review items.
- Staging sync has a focused contract proving admin-confirmed roster corrections
  can override team, tier, race, and name before serving rows are prepared.
- Manual correction remains an operator action through the admin roster flow or
  an explicitly approved local edit path.
- Operator expectation: admin corrections are not instant public-site changes.
  They become visible after the next approved Supabase sync and cache
  revalidation completes.
- 2026-05-15 cadence decision: GitHub Actions Supabase serving sync is limited
  to the single daily scheduled run (`10 21 * * *`, 06:10 KST). Manual workflow
  dispatch remains collect-only, so extra production syncs require a separate
  explicit operator approval path instead of a checkbox in the scheduled
  workflow.
- 2026-05-15 player-history pipeline follow-up: the freshness audit showed
  current team export files had newer matches than serving/player-history
  artifacts. Root cause was the warehouse builder still recognizing legacy CSV
  filename/header shapes instead of the current `eloboard_*_matches.csv`
  exports. `build-aggregates-incremental.js` now accepts the current normalized
  export format, groups source candidates by durable Eloboard identity before
  display name, and has `test:warehouse:aggregates` wired into durable gates.
  Local rebuild verified `fact_matches=145930`, `verify:warehouse` pass, and
  the previously stale audit sample now reaches source latest dates in local
  player-history artifacts. No production write was performed.
- 2026-05-15 tmp cleanup guard: `tmp/exports` is now explicitly preserved by
  `cleanup-tmp-root.js` because current warehouse rebuilds read the latest
  Eloboard CSV exports from that directory. `test:tmp:cleanup` is wired into
  `pipeline:health` and `verify:predeploy` so the source export directory is
  not accidentally reintroduced as a removable tmp-root target. Dry-run cleanup
  found no root cleanup targets after this guard, and duplicate cleanup found
  only two small legacy match JSON duplicates. No deletion was performed.

### 2026-05-16 Player Metadata And Serving Stability Checkpoint

- Canonical player metadata source is now
  `data/metadata/projects/*/players.*.v1.json`. The legacy
  `scripts/player_metadata.json` file is archived and active dependency checks
  report `legacy_dependency_paths=0`.
- Latest source-consolidation report is stable: `project_rows=334`,
  `legacy_rows=370`, `safe candidates=0`, `manual candidates=0`, and
  `excluded candidates=14`.
- The approved production sync after the player-history recovery succeeded:
  `26` changed serving records were upserted, `292` unchanged records were
  skipped, player-history artifacts were uploaded, and the freshness sentinel
  passed for `male:37`.
- Current read-only serving diff on 2026-05-16 is clean:
  `comparison_source=supabase:players`, `canonical_rows=318`,
  `serving_rows=318`, `added=0`, `removed=0`, `changed=0`.
- Current read-only freshness sentinel on 2026-05-16 is clean:
  `male:37` has `source_latest_date=2026-05-15` and
  `serving_latest_date=2026-05-15`.
- Current read-only serving identity readiness on 2026-05-16 confirms both
  `players` and `players_staging` have `serving_identity_key`, both have
  `318` rows, and both have `0` missing Eloboard IDs and `0` duplicate
  serving-identity buckets. REST still cannot inspect pg indexes, so keep the
  SQL check script for future schema drift checks.
- Conclusion: player metadata source consolidation and serving roster alignment
  are stable. The plan stays active only for separate follow-ups: public
  history/H2H opponent durable identity and the `/admin/tournament`
  deployment-read-only decision.

### 2026-05-16 H2H Opponent Identity Coverage Checkpoint

- Do not remove the public history/H2H name fallback yet. That would be
  premature and would likely reduce H2H results rather than improve identity
  safety.
- Added `report:player-history:opponent-identity` so the fallback-removal
  decision is based on current artifact coverage instead of assumption.
- Current local report from `tmp/player-history-artifacts` found
  `artifact_files=343`, `players_with_history=343`, `match_rows=146423`,
  `rows_with_opponent_entity_id=0`, `rows_with_opponent_name=146423`,
  `opponent_entity_id_coverage_pct=0`, and
  `ready_to_remove_name_fallback=false`.
- Added `test:player-history-opponent-identity-coverage` and wired it into
  `verify:predeploy` so the coverage report stays maintained.
- Next meaningful implementation step is not route fallback removal. It is to
  populate `opponent_entity_id` in warehouse/player-history artifacts first,
  then rerun this report and only remove name fallback after coverage is high
  enough to preserve H2H behavior.

### 2026-05-16 Warehouse Opponent Identity Enrichment

- `build-aggregates-incremental.js` now writes `opponent_entity_id` into
  `fact_matches.csv` when `opponent_name` resolves to exactly one canonical
  project-metadata player. Ambiguous or unknown opponent names remain blank.
- `export-player-history-artifacts.js` now removes stale JSON artifacts from
  the output directory before writing the current artifact set, so reports do
  not accidentally read retired player-history files.
- Local rebuild plus export verified the current artifact set is internally
  consistent: `players_written=329`, `match_rows_written=143664`, and
  `verify:warehouse` passed with `fact_rows=143664`.
- Opponent identity coverage improved from `0%` to `86.98%`
  (`124964/143664` rows). `ready_to_remove_name_fallback=false`, so the
  public H2H fallback remains necessary until the remaining unknown/ambiguous
  opponent names are resolved safely.

### 2026-05-16 Unresolved Opponent Identity Triage

- Extended `report:player-history:opponent-identity` so the same report now
  includes unresolved opponent-name classification.
- Current unresolved shape is clear: `missing_rows=18700`,
  `unique_names=205`, `no_candidate_names=205`,
  `ambiguous_candidate_names=0`, and `unique_candidate_names=0`.
- Interpretation: the remaining rows are not safe automatic alias candidates
  against current canonical project metadata. They look like external, old,
  inactive, or otherwise not-yet-modeled opponents.
- Next meaningful work is an operator-facing review decision: decide which of
  those 205 unresolved names should become canonical/project metadata entries,
  which should remain external opponents, and whether any belong in an explicit
  alias map. Do not auto-apply them into the canonical roster without review.

### 2026-05-16 Unresolved Opponent Review Fields

- The unresolved opponent section now includes `latest_match_date`,
  `opponent_race_counts`, deduplicated player samples, and a conservative
  `recommended_action` for each top unresolved name.
- Current top unresolved names are still all `no_candidate`; high-frequency
  names are labeled `external_or_metadata_review_needed`, not auto-onboarded.
- This keeps the pipeline simple: one report shows coverage, unresolved impact,
  and review priority, while canonical metadata remains unchanged until an
  explicit operator review decides what belongs there.

### 2026-05-16 Unresolved Opponent Review Grouping

- Extended the existing `report:player-history:opponent-identity` output instead
  of creating another registry, metadata file, or exception list.
- The report now summarizes unresolved opponent names by `recommended_action`
  and prints grouped review sections, so external candidates, metadata-review
  candidates, and low-frequency ignored names are separated without changing
  canonical player metadata.
- Current local report from `tmp/player-history-artifacts` remains
  `match_rows=143664`, `rows_with_opponent_entity_id=124964`,
  `opponent_entity_id_coverage_pct=86.98`, and
  `ready_to_remove_name_fallback=false`.
- Current unresolved action counts are `ignore_low_frequency=79`,
  `external_candidate=69`, and `external_or_metadata_review_needed=57`.
  No unresolved names are safe automatic alias/metadata candidates yet.
- Decision: keep the canonical source surface small. Do not add unresolved
  opponents to `data/metadata/projects/*/players.*.v1.json` until an explicit
  review confirms they are real in-scope players rather than external opponents.
