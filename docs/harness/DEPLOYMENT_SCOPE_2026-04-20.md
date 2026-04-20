# Deployment Scope 2026-04-20

Purpose: keep the deployment-scoped commit focused on pipeline stabilization and green readiness only.

## Include Now

- `.github/workflows/ops-pipeline-cache.yml`
- `PIPELINE_DATA_CONTRACT.md`
- `data/metadata/pipeline_collection_exclusions.v1.json`
- `data/metadata/roster_manual_overrides.v1.json`
- `data/metadata/projects/ku/players.ku.v1.json`
- `lib/database.types.ts`
- `lib/player-service.ts`
- `lib/warehouse-stats.ts`
- `scripts/tools/check-daily-status.js`
- `scripts/tools/check-site-integration-readiness.js`
- `scripts/tools/check-site-integration-readiness.test.js`
- `scripts/tools/export-player-matches-csv.js`
- `scripts/tools/export-player-matches-csv.test.js`
- `scripts/tools/push-supabase-approved.js`
- `scripts/tools/revalidate-public-cache.js`
- `scripts/tools/report-homepage-integrity.js`
- `scripts/tools/run-daily-pipeline.js`
- `scripts/tools/run-manual-refresh.js`
- `scripts/tools/run-manual-refresh.test.js`
- `scripts/tools/send-manual-refresh-discord.js`
- `scripts/tools/lib/discord-summary.js`
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

## Defer Now

- Hero/admin media flow files
- Universities admin/metadata files
- Homepage and other UI polish files (`/entry`, `/match`, `/tier`, `/player`, `/teams`)
- Non-essential runbook/README cleanup
- Legacy/noisy docs and unrelated workflow deletions
- Broad roster JSON rewrites outside `ku`
- Experimental SQL drafts not required for this green-readiness deployment

## Notes

- Current readiness is green after:
- successful `npm run pipeline:manual:refresh:with-sync`
- refreshed Discord roster snapshot
- successful `npm run soop:snapshot:deploy:sync`
- regenerated `homepage_integrity_report.json`
- Remaining pre-ship risk is commit scope, not runtime readiness.
