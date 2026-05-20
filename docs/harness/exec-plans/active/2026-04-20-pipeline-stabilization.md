# ACTIVE PLAN: pipeline-stabilization

Created: 2026-04-20
Status: in-progress

## Current Steering Snapshot - 2026-05-20

Today's objective:

- Prevent repeat critical data-pipeline alerts before taking on product polish or broad architecture cleanup.
- Keep the already-verified home-page header/hero stabilization patch deployable.
- Do not push or deploy without explicit operator approval.

Final objective:

- Keep the data pipeline and canonical source data simple, stable, and accurate.
- Prefer durable identifiers over display names.
- Keep mixed/default match-history boundaries strict.
- Preserve fail-closed sync and alert behavior so Discord/GitHub signals remain actionable.

Current completed slice:

- `HM / eloboard:female:1036` no longer fails collection validation just because a women default page exposes an ambiguous page-level total for mixed-only rows.
- Mixed rows are still not imported into default female history.
- Targeted live collection and the daily export wrapper verified `fetch=ok csv=ok`.
- Home first-entry header/hero stabilization was pushed after operator approval
  and verified on both `www.star-hosaga.com` and the apex redirect.

Current next step:

- Continue the pipeline-aligned architecture backlog one item at a time. Current
  local slice: reduce serving/runtime fragility with explicit SOOP auth
  timeouts, mtime-guarded roster serving metadata, and R2 client reuse.

Architecture backlog status:

- The sub-AI CTO-style questions are captured in `docs/harness/ARCHITECTURE_BACKLOG.md`.
- They are candidates, not approved implementation work.
- Highest likely follow-ups after this slice are warehouse pre-aggregation, H2H DB/query shape, and prediction vote query filtering.
- Latest follow-up candidates after this slice are board comment count
  aggregation, remaining warehouse detail pre-aggregation, and H2H DB/query
  shape.
- Board comment count aggregation is now the active local slice; remaining
  likely follow-ups are production SQL apply, warehouse detail
  pre-aggregation, and H2H DB/query shape.

Drift guard:

- If work moves away from pipeline reliability, home stabilization, or explicit harness pruning, stop and reopen `docs/harness/exec-plans/active/README.md` and `docs/harness/DRIFT_HOOKS.md`.

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
- [x] Decide whether `/admin/tournament` should stay deployment-visible as read-only UI, or be folded into the same Vercel read-only pattern as `/admin/roster`.
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
- Remaining plan work is narrower and separate from the player metadata source:
  decide whether `/admin/tournament` should use the same deployment read-only
  pattern as `/admin/roster`, and keep monitoring opponent-identity coverage as
  a report-only signal.

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
- current H2H UI recovery files such as `components/stats/H2HLookup.tsx`, `components/players/H2HSelectorBar.tsx`, and `app/api/stats/h2h/route.ts` unless this deployment explicitly absorbs the public H2H follow-up
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

- Superseded on 2026-05-16 by the Canonical-Only H2H Search Gate below: public
  H2H search now requires selected canonical player IDs, while unresolved
  opponents remain report-only display/history context.
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

### 2026-05-16 Canonical-Only H2H Search Gate

- Decision refinement after product review: public H2H/search flows should only
  compare players selected from the canonical player list. A name that appears
  only as an opponent in match history is not, by itself, an active search
  target or canonical metadata candidate.
- `/api/stats/h2h` now requires both `p1_id` and `p2_id` canonical player IDs
  before it runs detailed H2H lookup. Name-only requests fail closed with `400`
  instead of running display-name fallback.
- `fetchH2HStats` now makes one ID-based request when both selected players have
  stable IDs and returns `null` when either ID is missing. It no longer retries
  H2H by display-name candidate loops.
- Removed the unused legacy `lib/h2h-service.ts` name-based Supabase lookup so
  future work does not mistake it for an active data path.
- This keeps external/unknown opponents as match-history display strings unless
  an explicit operator review promotes them into canonical metadata.

### 2026-05-16 Tracked Tmp Source Cleanup

- Removed the remaining tracked `tmp/*_roster_record_metadata.json` files from
  git. They were old intermediate extraction artifacts, not canonical metadata,
  and some contained broken display-name encodings.
- Updated project metadata files whose top-level `source_file` still pointed at
  those `tmp/` artifacts so they now point at their canonical
  `data/metadata/projects/<code>/players.<code>.v1.json` file.
- Added a source-consolidation contract test so project metadata cannot regain
  `tmp/` `source_file` references. `/tmp/*` remains ignored, so future temporary
  reports should stay outside tracked source data.

### 2026-05-16 Conservative Local Bundle Check

- Local `main` is ahead of `origin/main` by `17` commits. No push or deployment
  has been performed.
- Full local `npm.cmd run verify:predeploy` passed after the metadata source,
  player-history, H2H, and tracked-`tmp` cleanup work. The build step completed
  successfully.
- Quick active-path audit found no tracked `tmp`, `data/warehouse`, or
  generated `data/metadata/players.master.v1.json` files. It also found no
  active code path for `scripts/player_metadata.json`, `getInstantH2H`, or
  `lib/h2h-service.ts`; remaining references are docs, archive, or guard tests.
- Conservative publish recommendation: do not rewrite local history now. Treat
  the current local branch as a verified review bundle, then decide before any
  push whether to include or split the older tier-card/admin-roster-review UI
  commits from the metadata/pipeline/H2H safety commits.
- If a push/PR is approved later, rerun `npm.cmd run verify:predeploy`
  immediately before that action and keep deployment separate from the push
  decision.

### 2026-05-16 Conservative Bundle Inclusion Decision

- Reviewed the four earlier commits that looked less directly related to the
  metadata/pipeline/H2H cleanup:
  - `d07df67` and `4b83837`: tier-card containment, spacing, and badge
    presentation only, covered by tier cache/helper contract tests.
  - `56cf976` and `cf2bd85`: admin roster ops review and IA. The helper/API/page
    are read-only, and the contract test explicitly blocks write/delete/mutation
    controls.
- Conservative decision: do not rewrite or split local history now. The four
  commits may remain in the verified local review bundle, but any future PR or
  push summary should call them out as separate UI/admin-support sections rather
  than blending them into the canonical metadata safety narrative.
- Deployment remains a separate later approval. If the operator wants the
  smallest possible metadata-only PR later, create a fresh branch/cherry-pick
  plan then instead of rewriting this verified local branch in place.

### 2026-05-16 PR Preparation Draft

- Conservative integration choice: prepare PR text only; do not push, deploy,
  rewrite history, or create a new branch in this step.
- Recommended PR title:
  `Consolidate player metadata source and harden roster pipeline safety`
- Recommended PR summary sections:
  - Canonical metadata source consolidation around
    `data/metadata/projects/*/players.*.v1.json`
  - Legacy `scripts/player_metadata.json` archive/reference-only cleanup and
    active dependency removal
  - Tracked `tmp/` roster metadata cleanup plus a guard against future `tmp/`
    `source_file` references
  - Player-history freshness, serving roster diff, and opponent identity
    coverage reports
  - Canonical-ID-only H2H search gate
  - Read-only admin roster ops review support
  - Small tier-card UI containment/spacing support work
- Required PR safety notes:
  - No deployment in the PR preparation step.
  - External/unresolved opponents remain report-only and are not auto-added to
    canonical metadata.
  - H2H name-only fallback remains closed.
  - Push and deployment must be separate approvals.
- Required final pre-push check: rerun `npm.cmd run verify:predeploy`
  immediately before any approved push/PR action.

### 2026-05-16 Admin Tournament Read-Only Follow-Up

- Decision: keep `/admin/tournament` deployment-visible, but fold it into the
  same Vercel read-only pattern as `/admin/roster`.
- `app/admin/tournament/page.tsx` is now a server wrapper that computes
  `isAdminWriteDisabled()` and passes `readOnly` into the client UI.
- `app/admin/tournament/TournamentManagementClient.tsx` keeps the existing
  tournament UI, shows the shared admin read-only notice, and fails closed
  before any recruit, remove, team-name, or captain mutation fetch when
  `readOnly` is true.
- Added `test:admin-tournament-readonly` and wired it into `verify:predeploy`.
- Verification passed:
  - `npm.cmd run test:admin-tournament-readonly`
  - `npx.cmd tsc --noEmit`
  - `npm.cmd run build`
- The build route table now reports `/admin/tournament` as a dynamic route, not
  a static route, so deployment read-only state is evaluated by the server page.

### 2026-05-17 Discord Roster Review Wording Follow-Up

- Investigation of scheduled run `25974128302` found roster sync was
  `report_only=true` and project roster writes were skipped, but the Discord
  success message still presented roster observations as definitive
  `소속 변동` / `신규 합류` sections.
- Decision: report-only roster observations are operator review items, not
  confirmed baseline changes. Discord must say `대표님 검토 필요`, then group
  counts as `티어변동감지`, `소속변동감지`, `신규후보`, and avoid unnecessary
  English fallback wording.
- Clarification: "기준데이터에 자동 반영되지 않았습니다" means player roster
  baseline fields such as tier/team/new-candidate status are not auto-confirmed.
  It does not mean match-history collection stops. Existing players should
  continue collecting match data independently of pending tier/team review.
- Added a contract in `send-manual-refresh-discord.test.js` proving report-only
  roster review messages keep match collection separate and do not emit
  definitive `소속 변동`, `신규 합류`, or `Fallback affiliation changes` wording.
- Verification passed:
  - `node scripts\tools\send-manual-refresh-discord.test.js`
  - `npm.cmd run test:pipeline:manual-refresh`
  - `npm.cmd run test:pipeline:verify:discord`
  - `npm.cmd run test:roster:change-review`

### 2026-05-17 Admin Roster Approval Queue Follow-Up

- Decision: make `/admin/roster/ops-review` the operator-facing approval queue
  for roster observations. The page remains read-only for direct mutation, and
  the actual baseline decision still flows through the existing roster
  correction path.
- `roster_change_review_latest.json` now exposes flattened pending queue items
  with `review_kind`, `operator_status`, `match_collection_note`, and
  `decision_url`.
- `lib/admin-roster-ops-review.ts` now reads nested `review.moved`,
  `review.tier_changed`, `review.race_changed`, `review.added`, and
  `review.conflicts` rows instead of relying only on top-level `items`.
- `/admin/roster/ops-review` now shows:
  - `대표님 검토 필요`
  - `기준데이터 미반영`
  - `전적 수집은 계속 진행됩니다`
  - `반영 검토`, `보류`, `무시`
- `반영 검토` links to `/admin/roster` with review query parameters, and
  `RosterCorrectionEditor` preselects matching existing players from those
  parameters.
- The ops review API now checks the admin session cookie before returning
  review data.
- Discord report-only roster review messages now include
  `관리자 검토: /admin/roster/ops-review`.
- Verification passed:
  - `npm.cmd run test:admin-roster-ops-review`
  - `npm.cmd run test:roster:change-review`
  - `npm.cmd run test:pipeline:verify:discord`
  - `node scripts\tools\send-manual-refresh-discord.test.js`
  - `node --check scripts\tools\build-roster-change-review.js`
  - `node --check scripts\tools\send-manual-refresh-discord.js`
  - `npm.cmd run build`

### 2026-05-17 Admin Roster Approval Queue UI Tightening

- Feedback: the first ops-review UI was technically connected, but it still
  felt like a dense operations report rather than an at-a-glance approval inbox.
- Decision: make the first viewport answer only the operator questions:
  - how many items need review,
  - which bucket they are in,
  - whether match collection is still running,
  - whether baseline application is pending.
- `/admin/roster/ops-review` now presents:
  - `승인 대기함`
  - `대표님 검토 필요`
  - `소속변동감지`, `티어변동감지`, `신규후보`
  - `전적 수집: 정상 진행 중`
  - `기준데이터 반영: 대기 중`
  - row-level `현재 기준데이터`, `새로 감지된 값`, `기준데이터 미반영`
- Raw JSON-style details were removed from the default approval inbox view.
- SOOP ID, zero-record, and excluded-player lists were moved below as
  `추가 점검`.
- Verification passed:
  - `npm.cmd run test:admin-roster-ops-review`
  - `npm.cmd run test:roster:change-review`
  - `node --check scripts\tools\build-roster-change-review.js`
  - `npm.cmd run build`

- Browser check: `/admin/roster/ops-review` still redirects unauthenticated
  users to `/admin/login?next=%2Fadmin%2Froster%2Fops-review`, with no browser
  console errors.
- Follow-up fix: zero-record alerts such as `zero_record_players=1 (이영숙)`
  must not expand to every player on the same team. The ops review helper now
  extracts the named player from the alert message and displays a Korean reason
  such as `전적 0건 감지: 이영숙`.
- UI wording follow-up: approval inbox section headers now include the count
  inline, for example `신규후보 18건`, and the inactive `무시` button label was
  changed to `제외` to match the intended operator decision.
- Button wording follow-up: `등록 검토` / `반영 검토` were shortened to the
  outcome-oriented labels `등록` / `반영`, and `보류` was removed because leaving
  an item untouched already represents no decision. The inactive action set is
  now `등록` or `반영`, plus `제외`, with row helper text saying
  `다음 데이터파이프라인 때 반영됩니다`.

### 2026-05-17 Roster Review Exclusion Decisions

- Concern: if `제외` only changes the current UI state, an eloboard player can be
  collected again and reappear as the same candidate in the next review.
- Decision: `제외` must be stored as an operator decision and suppress the same
  `review_kind + entity_id + observed_from + observed_to` from later review
  queues.
- Added `data/metadata/roster_review_decisions.v1.json` as the decision store
  path. The file is created on first exclusion and stores `decision=excluded`.
- Added `/api/admin/roster/ops-review/decisions` for authenticated admin
  exclusion decisions. It respects the admin write-disabled guard.
- Added `RosterReviewDecisionButtons` so the `제외` button posts the decision and
  refreshes the approval inbox.
- `build-roster-change-review.js` now reads review decisions and filters
  operator-excluded repeated candidates before writing
  `roster_change_review_latest.json`.
- `lib/admin-roster-ops-review.ts` also applies the same decision filter when
  rendering the current approval inbox.
- Verification passed:
  - `npm.cmd run test:admin-roster-ops-review`
  - `npm.cmd run test:roster:change-review`
  - `node --check scripts\tools\build-roster-change-review.js`
  - `npm.cmd run build`

### 2026-05-18 Scheduled Pipeline Regression Follow-Up

- Scheduled run `26004079044` failed during `collect_chunked` before any
  successful roster-review success summary could be sent to Discord.
- Root cause: `sync-team-roster-metadata.js` called `readJsonIfExists()` when
  loading optional collection exclusions, but that helper was not defined in
  the same file. The missing helper only surfaced in the main roster-sync
  execution path, while the existing health gate did not run
  `test:roster:sync`.
- Fix: add the optional JSON helper, export it for contract coverage, and add a
  regression test proving missing optional metadata files fall back safely.
- Gate hardening: wire `test:roster:sync` into both `pipeline:health` and
  `verify:predeploy` so the scheduled preflight catches this class before
  `collect_chunked`.

### 2026-05-18 Admin Review / Discord Count Parity

- Observation: the recovered scheduled run succeeded and sent the new
  report-only wording to Discord, but the Discord `대표님 검토 필요` total can be
  broader than the first `/admin/roster/ops-review` approval count.
- Root cause: Discord compares the previous `current_roster_state.json`
  snapshot, or the manual-refresh baseline when no snapshot exists, against
  current project roster metadata. The admin review report only exposed rows
  from `team_roster_sync_report.json`, so snapshot-visible tier changes and
  exclusion candidates could be missing from the approval inbox.
- Decision: `build-roster-change-review.js` now supplements the review report
  with the same previous-snapshot/baseline comparison priority used by the
  Discord summary. Supplemental rows are marked `source=baseline_comparison`.
- `/admin/roster/ops-review` now includes `excluded_candidate` rows in the
  approval inbox total and renders them as an explicit exclusion-candidate
  bucket, while secondary quality lists remain below the approval queue.
- Verification passed:
  - `npm.cmd run test:roster:change-review`
  - `npm.cmd run test:admin-roster-ops-review`
  - `node --check scripts\tools\build-roster-change-review.js`
  - `npm.cmd run build`
  - `npm.cmd run pipeline:health`

### 2026-05-18 Board Comments Supabase Exposure Prep

- Re-entry confirmed local `main` is ahead of `origin/main` by `10` commits.
  Push and deployment remain explicitly unapproved.
- Live Supabase Data API probe found `board_posts` visible, but
  `board_comments` write/read through PostgREST failed with `PGRST205`
  (`public.board_comments` missing from schema cache).
- This matches Supabase's current Data API default change: new `public` tables
  need explicit grants before `supabase-js` can see them.
- Updated `scripts/sql/create-board-comments.sql` to include explicit Data API
  grants for `anon`, `authenticated`, and `service_role`, plus `notify pgrst,
  'reload schema'`.
- Updated `test:board:comments` so future edits must keep those grants and the
  schema reload notification.
- Local verification passed: `npm.cmd run test:board:comments`.
- 2026-05-19 follow-up: Supabase MCP tools are visible and project
  `ttglvnnzssaaypmcrmdt` (`nzu-homepage`) is reachable.
- Applied `scripts/sql/create-board-comments.sql` through MCP `execute_sql`.
- SQL verification confirmed `public.board_comments` now exists with the
  expected columns, indexes, RLS enabled, and
  `board_comments_public_read_visible` select policy.
- PostgREST Data API smoke now returns `200` for
  `/rest/v1/board_comments?select=id&limit=1`, so the previous `PGRST205`
  schema-cache blocker is cleared.
- Supabase advisors did not report new board-comments security findings.
  Performance advisors reported the new board comment indexes as unused, which
  is expected immediately after table creation.
- Local verification passed again: `npm.cmd run test:board:comments`.
- Local dev API smoke passed against published board post
  `900f4955-c59c-4b51-b5a6-2a232b4ee6fc`: unauthenticated comment create
  returned `401`, authenticated create returned `200`, follow-up GET showed the
  comment, unauthenticated delete returned `403`, authenticated author delete
  returned `200`, and final GET no longer showed the deleted comment.
- Direct SQL follow-up confirmed the smoke comment row remains only as a
  soft-deleted row (`deleted_at is not null`).
- Agent-browser `/board` verification loaded the board page and reported no
  console errors before the API smoke.
- Board detail readability follow-up stayed limited to board pages/components:
  `app/board/[id]/page.tsx`, `app/board/page.tsx`, and
  `components/board/BoardComments.tsx`.
- Updated the board detail and comments cards with clearer section dividers,
  slightly stronger card contrast, larger/more readable title/comment text, and
  clearer comment input affordance. User-visible labels were preserved.
- Hid inactive recommendation display until a real recommendation feature
  exists: removed `추천수 -` from board detail metadata and removed the
  `추천` column/placeholder from the board list table.
- Verification passed after the readability/recommendation-display changes:
  `npm.cmd run test:board:comments`, `npx.cmd tsc --noEmit`, browser checks for
  `/board` and `/board/900f4955-c59c-4b51-b5a6-2a232b4ee6fc`, and no browser
  console errors.
- Push and deployment remain explicitly unapproved.

### 2026-05-18 HM Mixed-Only Player Collection Failure

- Latest Discord failure matched GitHub Actions run `26032117182`
  (`NZU Ops Pipeline`, `workflow_dispatch`, commit `905b511`, collect-only).
- Run artifact `pipeline-reports-26032117182` showed all five chunks exited 0,
  but merged strict alerts failed on `HM / pipeline_failure / fetch_fail=1,
  csv_fail=1`.
- Failed player was `eloboard:female:1036` / `이아라` with profile URL
  `https://eloboard.com/women/bbs/board.php?bo_table=bj_list&wr_id=1036`.
- Root cause: the profile summary reports `3전 0승 3패`, but the current parser
  selected the empty female section board. The actual three rows are visible in
  the mixed section board on the same profile page, so validation failed with
  `display_total_consistent=false`.
- Fix: `report-team-records.js` is now import-safe for parser tests and
  `extractInitialRows()` falls back to the first populated visible `list-board`
  when the selected section board is empty.
- Added `scripts/tools/report-team-records-parser.test.js` and wired
  `test:report-team-records-parser` into both `pipeline:health` and
  `verify:predeploy`.
- Verification passed:
  - `npm.cmd run test:report-team-records-parser`
  - `npm.cmd run test:player-collection-freshness-contract`
  - exact live single-player command for `HM / 이아라 / wr_id=1036`
    returned `validation_failed_count=0`, `period_total=3`, and three losses on
    `2026-05-16`
  - `npm.cmd run pipeline:health`
- Push/deployment still remain unapproved. The next scheduled Discord result
  still needs to be checked after this fix is pushed/merged only if the operator
  approves that later step.

### 2026-05-18 Mixed-Section Boundary Correction

- Correction to the previous HM triage: mixed-section rows must never be used
  as fallback rows for default male/female collection.
- The page shape for `eloboard:female:1036` is therefore not a case where the
  female collector should import the three mixed rows. It is a section-boundary
  case: the requested female section is empty, while mixed rows belong to a
  separate domain.
- Locked rule: mixed match history is never collected by this pipeline. This
  applies to male, female, and mix metadata identities, including women-site
  male/mix variants such as `bj_m_list`.
- Default male/female collection is section-specific. Empty default sections
  stay empty. Mixed rows are not a fallback source and are not valid under an
  explicit mixed profile identity either.
- Reverted the unsafe populated-board fallback in `extractInitialRows()`.
- Added the durable contract to `PIPELINE_DATA_CONTRACT.md` and recorded the
  failure pattern as `FM-010` in `docs/harness/FAILURE_MODES.md`.
- `report-team-records.js` now disables mixed profile collection as
  `mixed_collection_disabled` instead of calling `mix_view_list.php`.
- `check-pipeline-collection-sources-health.js` now treats `bj_m_list` as a
  disabled collection source instead of a mixed history endpoint.
- Regression gates now cover both parser behavior and source-health endpoint
  selection:
  - `test:report-team-records-parser`
  - `test:pipeline:collection-sources:health`
  - both are wired into `pipeline:health` and `verify:predeploy`
- Local verification after the stronger rule passed:
  `npm.cmd run pipeline:health`.
- The scheduled Discord alert should not be "fixed" by importing mixed rows.
  Any remaining alert for this player needs a separate policy decision around
  empty default sections whose profile summary includes mixed-only totals.

### 2026-05-20 HM Mixed-Only Validation Refinement

- Scheduled run `26129535426` again failed strict merged alerts on
  `HM / pipeline_failure / fetch_fail=1, csv_fail=1` for
  `eloboard:female:1036`.
- The policy from the 2026-05-18 boundary correction still stands: do not import
  mixed-section rows into default female history.
- Root cause of the repeat alert: `report-team-records.js` still used the
  ambiguous page-level `total` display count as the default female validation
  count when section-specific `female` stats were absent. On this profile the
  page-level total is mixed-only, so a correct empty female section was treated
  as `display_total_consistent=false`.
- Fix: `collectionDisplayTotal()` now treats women default pages as
  section-specific. If a female display count is absent, the validation count is
  `0` instead of the ambiguous page-level total. Men default pages keep the
  page-level total fallback guardrail.
- Regression coverage: `scripts/tools/report-team-records-parser.test.js`
  now covers women mixed-only totals and men total fallback behavior.
- Live targeted verification passed for `HM / eloboard:female:1036`:
  `validation_failed_count=0`, `period_total=0`,
  `validation.display_total_consistent=true`, and the daily export wrapper
  returned `fetch=ok csv=ok`.

### 2026-05-20 Warehouse Runtime Fact Lazy Loading

- Follow-up from architecture backlog item A2.
- Root cause: `lib/warehouse-stats.ts` already served overview/daily/team/player
  summaries from pre-aggregated `agg_daily_player.csv` and
  `agg_daily_team.csv`, but cache misses still synchronously read and parsed the
  large raw `fact_matches.csv` before the code knew whether player detail
  breakdowns were requested.
- Fix: warehouse cache now keeps raw fact rows lazy. Overview requests load only
  aggregate CSVs; `fact_matches.csv` is read only when
  `includePlayerDetails=true` and a `playerEntityId` or `playerName` filter is
  present.
- Regression coverage: added `test:warehouse:stats` and wired it into both
  `pipeline:health` and `verify:predeploy`.
- This is a conservative interim improvement, not the final warehouse
  architecture. Player detail breakdowns still need a future pre-aggregated
  artifact or indexed DB-backed query if that API path becomes hot.

### 2026-05-20 Prediction Vote Scoped Read

- Follow-up from architecture backlog item A4.
- Root cause: `upsertPredictionVote()` called `loadPredictionState()` without a
  scope before validating a single user's vote. In remote mode that meant the
  server loaded all non-archived prediction matches and every row from
  `prediction_votes`, then found one `voter_id + match_id` pair in memory.
- Fix: `loadPredictionState()` now accepts optional `matchIds`,
  `voteMatchIds`, and `voterId` filters. The remote Supabase path applies
  `.in("id", matchIds)`, `.in("match_id", voteMatchIds)`, and
  `.eq("voter_id", voterId)` when present.
- `upsertPredictionVote()` uses those filters for vote validation, so a single
  vote write no longer needs a full vote-table read.
- Regression coverage: `test:prediction-store-contract` now includes a contract
  for the scoped Supabase read path.
- Remaining work: public prediction rendering still reads visible match votes to
  compute totals. That should move to an aggregate/RPC or summary table when
  the public vote volume warrants the next A4 slice.

### 2026-05-20 Serving Runtime Guard Slice

- Follow-up from architecture backlog items A1, A7, and A9.
- SOOP OAuth token exchange and station-info calls now use a shared
  `fetchSoopApi()` wrapper with an explicit 8-second `AbortController`
  timeout, so upstream delays fail bounded instead of waiting for the platform
  timeout.
- Project roster serving overrides and SOOP identity overrides now compute a
  project roster file mtime key and return cached maps when no
  `players.<code>.v1.json` file changed. This keeps public player-serving
  behavior unchanged while avoiding repeated JSON parsing on warm instances.
- Board R2 image upload/delete now reuse a module-scoped, config-keyed
  `S3Client` for warm server instances.
- Regression coverage added:
  - `test:soop-auth-timeout`
  - `test:board-r2-upload-contract`
  - `test:player-serving-metadata`
- `verify:predeploy` now includes the SOOP timeout and R2 upload contracts.
- Remaining work: board comment count aggregation should be the next small
  architecture slice, but it needs an RPC or denormalized counter design rather
  than a naive Supabase `select("post_id, count")` assumption.

### 2026-05-20 Board Comment Count RPC Slice

- Follow-up from architecture backlog item A6.
- Root cause: board list comment counts used `select("post_id")` against every
  visible comment for the listed posts and counted rows in Node memory.
- Fix direction: use a Postgres RPC instead of assuming a Supabase REST
  group-by shape. `public.board_visible_comment_counts(post_ids uuid[])`
  returns one row per post with `comment_count`.
- Security posture: the function is `security invoker`, so normal table
  permissions and RLS remain the governing access model.
- Runtime compatibility: `getVisibleBoardCommentCounts()` calls the RPC first
  and falls back to the previous row-based count path when the RPC is missing,
  preserving local/dev/prod deploy ordering safety.
- Regression coverage: `test:board:comments` now checks the SQL function,
  execute grant, RPC-first helper, and fallback helper.
- Remaining work: apply `scripts/sql/create-board-comments.sql` to production
  Supabase before expecting the optimized path to be active on the deployed
  site.
- Production apply follow-up: SQL was applied to Supabase project
  `ttglvnnzssaaypmcrmdt` via `supabase db query --linked --file` from a
  temporary CLI workdir because the repo `.env.local` currently makes
  `supabase link` fail parsing. REST RPC smoke with anon access returned
  `200 []` for `post_ids=[]`, confirming the optimized path is available once
  this code is deployed.
