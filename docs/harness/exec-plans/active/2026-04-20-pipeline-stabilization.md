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

- [ ] Verify the next real sync run records successful cache revalidation when `SERVING_REVALIDATE_SECRET` and site URL envs are present.
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

- deployment readiness is now green after a successful real `with-sync` run, refreshed Discord roster snapshot, fresh SOOP live snapshot sync, and a regenerated homepage integrity report
- current repo state is also green on local verification: `npm.cmd run build` and `npm.cmd run lint` both pass
- `supabase-prod-sync.js` now fail-closes when stable CSV history is lower quality than existing `fact_matches` history, writes `tmp/reports/prod_sync_history_quality_latest.json`, and refuses prod sync when `match_history.opponent_name` coverage is catastrophically low
- `report-homepage-integrity.js` now reports `summary.match_history`, and `run-daily-pipeline.js` can escalate degraded opponent-name coverage as `match_history_quality_degraded`
- current live integrity snapshot after the repair reports `match_history_total_rows=132055`, `opponent_name_fill_rate=0.9998`, and `players_with_blank_opponent_rows=1`
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
