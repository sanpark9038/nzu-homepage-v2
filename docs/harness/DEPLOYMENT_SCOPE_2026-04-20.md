# Deployment Scope 2026-04-20

Purpose: keep the deployment-scoped commit focused on pipeline stabilization and green readiness only.

## Include Now

- `.github/workflows/ops-pipeline-cache.yml`
- `PIPELINE_DATA_CONTRACT.md`
- `app/admin/hero-media/HeroMediaAdmin.tsx`
- `app/admin/hero-media/page.tsx`
- `app/admin/ops/OpsControls.tsx`
- `app/admin/ops/RosterEditor.tsx` (delete legacy shared editor)
- `app/admin/ops/page.tsx`
- `app/admin/prediction/PredictionMatchAdmin.tsx`
- `app/admin/prediction/page.tsx`
- `app/admin/rankings/StandingAdmin.tsx`
- `app/admin/rankings/page.tsx`
- `app/admin/roster/page.tsx`
- `app/admin/roster/TeamNameEditor.tsx`
- `app/admin/roster/teams/page.tsx`
- `app/admin/tournament/page.tsx`
- `app/admin/universities/UniversityAdmin.tsx`
- `app/admin/universities/page.tsx`
- `app/api/admin/pipeline/rules/route.ts`
- `app/api/admin/pipeline/run/route.ts`
- `app/api/admin/roster/route.ts`
- `app/api/admin/universities/route.ts`
- `app/battle-grid/page.tsx`
- `components/admin/AdminNav.tsx`
- `components/admin/AdminReadonlyNotice.tsx`
- `components/admin/roster/ManualTeamManager.tsx`
- `components/admin/roster/RosterCorrectionEditor.tsx`
- `components/admin/roster/types.ts`
- `components/admin/roster/useRosterAdminData.ts`
- `data/metadata/pipeline_collection_exclusions.v1.json`
- `data/metadata/roster_manual_overrides.v1.json`
- `data/metadata/projects/ku/players.ku.v1.json`
- `lib/database.types.ts`
- `lib/player-serving-metadata.ts`
- `lib/roster-admin-store.ts`
- `lib/admin-runtime.ts`
- `lib/player-service.ts`
- `lib/warehouse-stats.ts`
- `scripts/tools/check-daily-status.js`
- `scripts/tools/check-site-integration-readiness.js`
- `scripts/tools/check-site-integration-readiness.test.js`
- `scripts/tools/export-team-roster-detailed.js`
- `scripts/tools/export-player-matches-csv.js`
- `scripts/tools/export-player-matches-csv.test.js`
- `scripts/tools/push-supabase-approved.js`
- `scripts/tools/revalidate-public-cache.js`
- `scripts/tools/report-fa-tier-review.js`
- `scripts/tools/report-homepage-integrity.js`
- `scripts/tools/run-daily-pipeline.js`
- `scripts/tools/run-manual-refresh.js`
- `scripts/tools/run-manual-refresh.test.js`
- `scripts/tools/send-manual-refresh-discord.js`
- `scripts/tools/lib/roster-admin-store.js`
- `scripts/tools/lib/discord-summary.js`
- `scripts/sql/create-roster-admin-corrections.sql`
- `scripts/tools/supabase-prod-sync.js`
- `scripts/tools/supabase-prod-sync.test.js`
- `scripts/tools/supabase-staging-sync.js`
- `scripts/tools/supabase-staging-sync.test.js`
- `scripts/tools/sync-team-roster-metadata.js`
- `scripts/tools/sync-team-roster-metadata.test.js`
- `scripts/tools/verify-discord-summary.js`
- `docs/RELIABILITY.md`
- `docs/harness/DEPLOYMENT_SCOPE_2026-04-20.md`
- `docs/harness/SERVING_IDENTITY_NOTES.md`
- `docs/harness/SESSION_ENTRY.md`
- `docs/harness/exec-plans/active/2026-04-20-pipeline-stabilization.md`

## Status Snapshot

- Runtime readiness is green: `npm.cmd run build` and `npm.cmd run lint` are both passing in the current worktree.
- The remaining pre-ship risk is mixed-scope worktree review, not a known runtime blocker.
- Deployment-supporting changes in the current worktree are concentrated in:
- admin read-only/runtime safeguards and roster overlay flow
- `app/admin/ops/*`, `app/admin/roster/*`, `app/admin/tournament/page.tsx`, `app/api/admin/roster/route.ts`
- `components/admin/roster/*`, `components/admin/AdminReadonlyNotice.tsx`
- `lib/admin-runtime.ts`, `lib/roster-admin-store.ts`, `lib/player-serving-metadata.ts`
- `scripts/tools/sync-team-roster-metadata.js`, `scripts/tools/supabase-staging-sync.js`, `scripts/tools/export-team-roster-detailed.js`, `scripts/tools/send-manual-refresh-discord.js`, `scripts/tools/report-fa-tier-review.js`, `scripts/sql/create-roster-admin-corrections.sql`
- Borderline support-only files currently modified for repo-green build/lint are:
- `components/ThemeProvider.tsx`
- `components/SidebarNav.tsx`
- `app/page.tsx`
- `components/battle-grid/TeamSelector.tsx`
- Special-review decision for the next commit split:
- `app/admin/tournament/page.tsx`: keep
- reason: the current diff is typed/guarded admin build support for green readiness, not product-scope expansion
- `components/ThemeProvider.tsx`: keep if the deployment-scoped commit must stay lint-green by itself
- reason: this is global UI cleanup, but the current diff removed repo-green lint friction
- `app/page.tsx`: defer or split
- reason: this is homepage-only `<img>` lint suppression from public-site carryover
- `components/SidebarNav.tsx`: keep if the deployment-scoped commit must stay lint-green by itself
- reason: this is shared navigation cleanup, but the current diff removed repo-green lint friction
- `components/battle-grid/TeamSelector.tsx`: keep if the deployment-scoped commit must stay lint-green by itself
- reason: this is small battle-grid cleanup, but the current diff removed repo-green lint friction

## Current Deployment Bundle Recommendation

- Recommended runtime-safety deployment bundle:
- `6adb505` `Stabilize deployment-scoped admin roster flow`
- `24d99bb` `Guard prod sync match history quality`
- `0117fc5` `Improve public H2H recovery paths`

- Optional low-risk follow-up:
- `a033ffc` `Suppress homepage img lint warning`

- Separate content update unless the deployment explicitly wants the latest roster snapshot:
- `2901260` `Refresh project roster metadata`

- Keep out of the immediate runtime bundle:
- `9713bcd` `Document session startup hardening and lessons learned`
- reason: useful repo hardening, but not required for user-facing runtime recovery

- Rationale:
- `24d99bb` prevents a repeat of the blank `match_history.opponent_name` regression and surfaces integrity/ops warnings if it starts drifting again
- `0117fc5` is the user-facing H2H recovery that made `/entry` and `/match` show real records again
- `2901260` is coherent as a content/roster refresh, but it changes public roster state and should be included only if that roster snapshot is intended for this rollout

## Current Worktree Triage

- Stage now for the deployment-scoped commit from the current worktree:
- `app/admin/hero-media/HeroMediaAdmin.tsx`
- `app/admin/hero-media/page.tsx`
- `app/admin/ops/OpsControls.tsx`
- `app/admin/ops/page.tsx`
- `app/admin/prediction/PredictionMatchAdmin.tsx`
- `app/admin/prediction/page.tsx`
- `app/admin/rankings/StandingAdmin.tsx`
- `app/admin/rankings/page.tsx`
- `app/admin/roster/TeamNameEditor.tsx`
- `app/admin/roster/page.tsx`
- `app/admin/tournament/page.tsx`
- `app/admin/universities/UniversityAdmin.tsx`
- `app/admin/universities/page.tsx`
- `app/api/admin/pipeline/rules/route.ts`
- `app/api/admin/pipeline/run/route.ts`
- `app/api/admin/roster/route.ts`
- `app/api/admin/universities/route.ts`
- `components/admin/AdminNav.tsx`
- `components/admin/AdminReadonlyNotice.tsx`
- `components/admin/roster/`
- `docs/harness/DEPLOYMENT_SCOPE_2026-04-20.md`
- `docs/harness/exec-plans/active/2026-04-20-pipeline-stabilization.md`
- `lib/admin-runtime.ts`
- `lib/database.types.ts`
- `lib/player-serving-metadata.ts`
- `lib/roster-admin-store.ts`
- `scripts/sql/create-roster-admin-corrections.sql`
- `scripts/tools/export-team-roster-detailed.js`
- `scripts/tools/lib/roster-admin-store.js`
- `scripts/tools/report-fa-tier-review.js`
- `scripts/tools/send-manual-refresh-discord.js`
- `scripts/tools/supabase-staging-sync.js`
- `scripts/tools/sync-team-roster-metadata.js`
- `app/admin/roster/teams/`
- `app/admin/ops/RosterEditor.tsx` (delete)
- `app/battle-grid/page.tsx` (delete)
- Split or defer from the current worktree before making the deployment-scoped commit:
- `AGENTS.md`
- `RUNBOOK.md`
- `LESSONS_LEARNED.md`
- `docs/harness/SESSION_ENTRY.md`
- `docs/harness/exec-plans/active/2026-04-19-home-teams-entry-refresh.md`
- `docs/harness/exec-plans/active/TEMPLATE.md`
- `app/page.tsx`
- Keep with the deployment-scoped commit only if self-contained lint verification shows the staged subset still needs:
- `components/ThemeProvider.tsx`
- `components/SidebarNav.tsx`
- `components/battle-grid/TeamSelector.tsx`

## Defer Now

- Remaining homepage and public-page polish outside the current admin/Vercel scope (`/entry`, `/match`, `/tier`, `/player`, `/teams`)
- Non-essential runbook/README cleanup
- Legacy/noisy docs and unrelated workflow deletions
- Broad roster JSON rewrites outside `ku`
- Experimental SQL drafts not required for this green-readiness deployment
- Full Vercel-write migration for manual team create/delete and other remaining local-file roster ownership paths
- Cross-plan carryover/noise unless explicitly pulled into the deployment commit:
- `AGENTS.md`
- `RUNBOOK.md`
- `LESSONS_LEARNED.md`
- `docs/harness/exec-plans/active/2026-04-19-home-teams-entry-refresh.md`
- `docs/harness/exec-plans/active/TEMPLATE.md`

## Notes

- Current readiness is green after:
- successful `npm run pipeline:manual:refresh:with-sync`
- refreshed Discord roster snapshot
- successful `npm run soop:snapshot:deploy:sync`
- regenerated `homepage_integrity_report.json`
- Admin deployment scope now includes:
- public-safe Vercel admin/runtime safeguards
- hero media / rankings / prediction admin copy cleanup
- roster correction vs manual-team split at `/admin/roster` and `/admin/roster/teams`
- `/battle-grid` removal
- Remaining pre-ship risk is commit scope and roster write policy expectations, not runtime readiness.
- Current roster-admin note:
- general player corrections (`team/tier/exclusion/resume`) now target a Supabase-backed overlay contract first, with local JSON fallback kept for non-migrated environments
- the next pipeline paths now read that same overlay in `sync-team-roster-metadata.js`, `export-team-roster-detailed.js`, `supabase-staging-sync.js`, and `supabase-prod-sync.js`
- manual team create/delete still owns local project JSON and is not part of the Vercel-safe write path yet
- do not treat this as fully live until `scripts/sql/create-roster-admin-corrections.sql` is applied in Supabase and deployment envs include admin Supabase credentials
- Current commit-triage note:
- keep deployment-supporting admin/runtime/overlay files together
- split or defer session-start doc hardening and public-site carryover work unless the commit intentionally broadens scope
- classify `app/admin/tournament/page.tsx`, `components/ThemeProvider.tsx`, and `app/page.tsx` explicitly before commit instead of letting them ride along silently
