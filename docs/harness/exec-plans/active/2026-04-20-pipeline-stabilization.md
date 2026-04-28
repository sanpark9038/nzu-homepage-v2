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
- [ ] Verify whether Supabase already has a unique constraint/index for the canonical serving key. If not, define the migration needed before any `onConflict` flip.
- [x] Add repo-visible staging-table typing or schema notes so identifier-based sync work is not happening against an implicit table contract.
- [x] Verify the live Supabase rollout for hero media: table/policy present, storage bucket configured, and active media serves cleanly on homepage/admin after upload/delete.
- [ ] Only after the above: decide whether `onConflict: 'name'` can move to an identifier-based key safely.
- [x] Add optional opponent durable identity support to repo-visible contracts (`opponent_entity_id`) without making it a deployment blocker.
- [x] Fix the scheduled ops-pipeline regression where ops alert team labels drifted across encodings and caused `test:pipeline:daily` to fail before manual refresh started.
- [x] Make Discord failure summaries distinguish workflow preflight failures from real collection/apply failures so scheduled alerts do not misreport the broken stage.
- [x] Add Vercel deployment safeguards so public/read-only admin views can ship while local-file admin writes and manual pipeline execution fail closed in deployment.
- [ ] Replace `player-service` history/H2H fallback with opponent durable identity once warehouse / serving contracts expose it consistently; current fallback is now narrower but still name-based.
- [x] Re-run `check-site-integration-readiness.js --markdown` after the next real sync and make sure the new readiness blockers clear.
- [x] Re-run `npm run pipeline:manual:refresh:with-sync` after the placeholder-filename fix and confirm the previous `ku / pipeline_failure / fetch_fail=1` blocker is gone.
- [ ] Decide whether `/admin/tournament` should stay deployment-visible as read-only UI, or be folded into the same Vercel read-only pattern as `/admin/roster`.
- [x] Re-scope the deployment commit so current admin/Vercel stabilization work is explicitly tracked instead of drifting outside the deployment scope doc.

### Current note on the remaining identity blocker

- a draft migration now exists at `scripts/sql/add-serving-identity-key.sql`
- a read-only live-schema check now exists at `scripts/sql/check-serving-identity-schema.sql`
- pass/fail interpretation now lives in `docs/harness/SERVING_IDENTITY_NOTES.md#operator-check`
- post-check implementation order now lives in `docs/harness/SERVING_IDENTITY_NOTES.md#implementation-order-after-pass`
- it is not proof of live schema
- do not switch sync writes to `serving_identity_key` until the real Supabase state is verified

## Blockers

- no repo-visible proof yet of a unique constraint or index for the canonical serving identity on `players` / `players_staging`
- `hero_media` table, `hero_media_single_active_idx`, `hero_media_public_read`, and `hero-media` public bucket were manually verified in Supabase
- homepage integrity now reports `summary.hero_media`, and `check-daily-status` surfaces it without escalating it into daily ops alerts
- stale delete is now more conservative, but `upsert(..., { onConflict: 'name' })` and delete-by-name remain the primary live-schema blocker
- the latest real `with-sync` attempt failed before serving sync because `ku` hit `pipeline_failure (fetch_fail=1, csv_fail=0)` from an invalid placeholder-based CSV filename; the export script is now patched, but the run has not been retried yet
- after the placeholder-filename fix, the next real `with-sync` run advanced into `supabase_staging_sync` and then failed closed on a legacy/current profile collision for `연또`; the repo now treats the legacy profile as retired and keeps only the current canonical profile in active sync paths

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

- none
