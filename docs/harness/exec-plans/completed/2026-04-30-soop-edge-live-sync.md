# ACTIVE PLAN: soop-edge-live-sync

Created: 2026-04-30
Status: completed

## Goal

Move frequent SOOP live-state sync from GitHub Actions schedule to Supabase Cron + Supabase Edge Function while keeping GitHub Actions as manual fallback only.

## Basis

- User-approved direction from the 2026-04-30 SOOP live sync review report.
- Existing repo evidence:
  - `.github/workflows/soop-live-sync.yml` still runs on `schedule`.
  - `lib/player-live-overlay.ts` still reads local SOOP JSON snapshot files.
  - `scripts/tools/lib/soop-open-api.js` already owns `broad/list` row collection and normalization.
  - `players.is_live`, `players.broadcast_title`, `players.live_thumbnail_url`, and `players.last_checked_at` already exist in serving types.
- Current external-doc assumptions:
  - GitHub Actions schedule is best-effort and may be delayed or dropped under high load.
  - Supabase Cron can invoke Edge Functions through `pg_net`.
  - Supabase Edge Function Free plan invocation quota is large enough for 5-10 minute cadence, but function timeout/page scanning still needs guards.

## Conflict-Risk Files

- `.github/workflows/soop-live-sync.yml`
- `lib/player-live-overlay.ts`
- `lib/player-service.ts`
- `scripts/tools/sync-soop-live-state-to-supabase.js`
- `scripts/tools/sync-soop-live-state-to-supabase.test.js`
- `scripts/tools/player-live-overlay-contract.test.js`
- `scripts/tools/soop-live-page-limit-contract.test.js`
- `lib/database.types.ts`
- `package.json`

## Independently Editable Files

- `supabase/functions/soop-live-sync/index.ts`
- `scripts/sql/create-soop-live-sync-runs.sql`
- `scripts/tools/soop-edge-function-contract.test.js`
- `docs/harness/SOOP_LIVE_SYNC_EDGE.md`

## Role Split

- Codex: main implementer, final editor, and plan owner.
- Subagents: read-only codebase audits or explicitly scoped implementation/review tasks.
- No second editor may touch a file already owned by another task unless Codex integrates it.

## Completed Steps

- [x] Read session entry, active pipeline plan, reliability docs, and current SOOP code paths.
- [x] Confirmed current `SOOP Live Sync` workflow still has scheduled runs.
- [x] Created this active plan before implementation.
- [x] Collected read-only subagent findings for workflow, Edge Function, live overlay, and tests.
- [x] Added failing contract tests for workflow schedule removal, Edge Function shape/security/logging, and snapshot-free overlay behavior.
- [x] Implemented the Supabase Edge Function with SOOP `broad/list` parsing, page/time guards, changed-row-only updates, run logging, and optional cache revalidation.
- [x] Added SQL for `soop_live_sync_runs` plus cleanup and Supabase Cron setup notes.
- [x] Simplified GitHub Actions SOOP workflow to `workflow_dispatch` manual fallback that calls the Edge Function securely.
- [x] Removed local JSON snapshot dependency from `lib/player-live-overlay.ts` while preserving the stale DB live-state guard.
- [x] Updated staging/prod sync so the daily serving pipeline no longer overwrites SOOP live truth fields.
- [x] Updated docs, environment example, type definitions, and package verification scripts.
- [x] Ran targeted tests, TypeScript, lint, and full predeploy verification.

## Next Steps

- [x] Apply `scripts/sql/create-soop-live-sync-runs.sql` in Supabase.
- [x] Deploy `supabase/functions/soop-live-sync/index.ts` with the required secrets.
- [x] Install the Supabase Cron job on a 10-minute cadence.
- [x] Configure GitHub `SOOP_SYNC_SECRET` for the manual workflow fallback.
- [x] Verify Supabase Cron success logs, GitHub manual fallback, production response, and local live UI.

## Blockers

- None at completion. Operator-owned Supabase SQL, Edge Function deployment, secret installation, Vault setup, and Cron registration were completed outside the repo.

## Verification Evidence

- `npm.cmd run test:player-live-overlay` passed.
- `npm.cmd run test:soop-live-sync` passed.
- `npm.cmd run test:soop-edge-function-contract` passed.
- `npm.cmd run test:admin-revalidation-proxy` passed.
- `npm.cmd run test:staging-sync` passed.
- `npm.cmd run test:prod-sync` passed.
- `npx.cmd tsc --noEmit` passed.
- `npm.cmd run lint` passed.
- `npm.cmd run build` passed.
- `npm.cmd run verify:predeploy` passed.
- Supabase SQL table `public.soop_live_sync_runs` was applied.
- Supabase Edge Function `soop-live-sync` was deployed with required secrets.
- Supabase Vault entries for `project_url`, `anon_key`, and `soop_sync_secret` were installed.
- Supabase Cron run logs showed `source=supabase-cron`, `status=success`, and `error_message=NULL`.
- GitHub Actions manual fallback run `25162888394` completed successfully.
- Vercel production deployment reached `Ready`; `/tier?liveOnly=true` returned HTTP 200.
- Local dev server PID `13336` returned HTTP 200 for `/tier?liveOnly=true`.
- Browser verification on local `/tier?liveOnly=true`, `/tier`, and `/player/%EC%82%AC%ED%85%8C--2d277d7b` showed live UI content with no framework error overlay and no reported console errors.

## Review Notes

- Read-only implementation review found three follow-ups:
  - Page-limit exhaustion must not clear unresolved live rows.
  - `soop_live_sync_runs` should not be public REST-readable/writable.
  - Public cache revalidation must fail closed unless an explicit local skip flag is set.
- All three review items were addressed before final handoff and contract tests were extended.

## Session Recovery

### First Three Commands

```powershell
git status --short --branch
git log --oneline -5
gh run list --repo sanpark9038/nzu-homepage-v2 --limit 8
```

### Last Checked State

- Branch: `main`
- git HEAD: `a02dc3e`
- Recent Actions: `SOOP Live Sync` workflow_dispatch run `25162888394` succeeded on 2026-04-30.
- Workflow schedule was removed; GitHub Actions remains as manual fallback only.

## Files In Play

- `.github/workflows/soop-live-sync.yml`
- `lib/player-live-overlay.ts`
- `lib/player-service.ts`
- `lib/database.types.ts`
- `scripts/tools/lib/soop-open-api.js`
- `scripts/tools/sync-soop-live-state-to-supabase.js`
- `scripts/tools/sync-soop-live-state-to-supabase.test.js`
- `scripts/tools/player-live-overlay-contract.test.js`
- `scripts/tools/soop-live-page-limit-contract.test.js`
- `scripts/tools/soop-edge-function-contract.test.js`
- `scripts/sql/create-soop-live-sync-runs.sql`
- `supabase/functions/soop-live-sync/index.ts`
- `docs/harness/SOOP_LIVE_SYNC_EDGE.md`
- `package.json`

## New Failure Modes Found

- none yet
