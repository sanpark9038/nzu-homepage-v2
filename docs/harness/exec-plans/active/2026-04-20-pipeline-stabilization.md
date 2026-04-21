# ACTIVE PLAN: pipeline-stabilization

Created: 2026-04-20
Status: in-progress

## Goal

Close the highest-risk pipeline stability gaps before deployment: silent name collisions, serving-data resets on missing source stats, stale public cache after successful sync, and hero media admin/serving stabilization.

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
- [ ] Replace `player-service` history/H2H fallback with opponent durable identity once warehouse / serving contracts expose it consistently; current fallback is now narrower but still name-based.
- [x] Re-run `check-site-integration-readiness.js --markdown` after the next real sync and make sure the new readiness blockers clear.
- [x] Re-run `npm run pipeline:manual:refresh:with-sync` after the placeholder-filename fix and confirm the previous `ku / pipeline_failure / fetch_fail=1` blocker is gone.

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
- the remaining practical blocker before shipping is no longer runtime readiness; it is deciding which current worktree changes belong in the deployment-scoped commit versus which should be deferred

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
