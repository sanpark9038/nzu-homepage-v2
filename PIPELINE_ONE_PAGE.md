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

## Health Checks

- `npm run test:pipeline:daily`
- `npm run validate:pipeline-alert-rules`
- `npm run pipeline:status`
- `npm run pipeline:verify:discord`
