# HOSAGA Pipeline (One Page)

## Goals

- Stable roster and match collection
- Consistent local metadata updates
- Explicit, controlled Supabase sync

## Daily Flow

1. GitHub Actions runs the HOSAGA ops pipeline.
2. The pipeline refreshes team roster metadata.
3. Chunked collection gathers updated player and match artifacts.
4. Reports are written under `tmp/reports/`.
5. Approved sync can push serving data to Supabase.

## Primary Commands

```bash
npm run pipeline:manual:refresh
npm run pipeline:manual:refresh:with-sync
npm run pipeline:status
npm run pipeline:verify:discord
npm run ops:watchlist
```

## Core Scripts

- `scripts/tools/run-manual-refresh.js`
- `scripts/tools/run-ops-pipeline-chunked.js`
- `scripts/tools/sync-team-roster-metadata.js`
- `scripts/tools/push-supabase-approved.js`

## Main Outputs

- `tmp/reports/daily_pipeline_snapshot_YYYY-MM-DD.json`
- `tmp/reports/daily_pipeline_alerts_YYYY-MM-DD.json`
- `tmp/reports/team_roster_sync_report.json`
- `data/metadata/pipeline_outputs.manifest.v1.json`
- `data/metadata/pipeline_script_inventory.v1.json`
- `data/metadata/pipeline_runtime_flow.v1.json`
- `data/metadata/pipeline_collection_sources.v1.json`
- `data/metadata/pipeline_discord_alerts.v1.json`
- `tmp/reports/pipeline_collection_sources_health_latest.json`
- `tmp/reports/pipeline_collection_sources_health_latest.md`

## Temporary Artifact Policy

- `tmp/` is for short-lived debugging, report inspection, and pipeline scratch outputs only.
- Do not treat `tmp/` files as long-term source-of-truth data.
- Promote anything durable into `data/metadata/` or a documented pipeline output.
- Keep artifact uploads focused on latest reports rather than the full `tmp/reports/` history.

## Health Checks

- `npm run test:pipeline:daily`
- `npm run pipeline:health`
- `npm run pipeline:collection-sources`
- `npm run pipeline:collection-sources:health`
- `npm run pipeline:discord-alerts`
- `npm run pipeline:inventory`
- `npm run pipeline:runtime-flow`
- `npm run validate:pipeline-alert-rules`
- `npm run pipeline:status`
- `npm run pipeline:verify:discord`

## Observation Mode

- Prefer monitoring over intervention when recent builds, tests, and workflows are green.
- Watch `SOOP Live Sync` and `NZU Ops Pipeline` first.
- Only inspect local reports when the Discord summary or a UI page looks wrong.
- Use `npm run ops:watchlist` for the current watch checklist.

## Local Maintenance

- `npm run maintenance:check`
  - one-shot dry-run summary for `tmp/reports` size, root prune candidates, artifact directory prune candidates, and manifest presence
- `npm run reports:footprint`
  - summarize `tmp/reports/` file count, total size, nested artifact buckets, and prune candidates
- `npm run reports:prune:artifact-dirs`
  - dry-run cleanup for old `gha_*`, `gh-run-*`, and `run_*_job_logs` artifact directories under `tmp/reports`
- `npm run reports:prune:artifact-zips`
  - dry-run cleanup for old root `gha_*_artifact.zip` and `*_logs.zip` files under `tmp/reports`
- `npm run reports:prune`
  - dry-run report cleanup for `tmp/reports`
- `npm run reports:prune -- --apply`
  - delete stale report files while keeping latest aliases and pinned operational reports
- `npm run reports:prune:artifact-dirs -- --apply`
  - delete stale artifact directories while leaving non-ephemeral folders such as manual exports alone
- `npm run reports:prune:artifact-zips -- --apply`
  - delete stale root artifact zip files while leaving non-ephemeral zip exports alone
