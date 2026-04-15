# HOSAGA Data Pipeline Brief

## Purpose

- Collect accurate player metadata and match records from source sites.
- Keep the website fast by serving validated stored data instead of runtime scraping.
- Support both scheduled execution and manual operator refresh.

## Current Operating Model

- Primary execution runs in GitHub Actions for the HOSAGA ops pipeline.
- Manual refresh exists as an operator fallback and verification path.
- The pipeline collects updates, validates them, updates local metadata, and can push approved data to Supabase.
- The public site reads from Supabase.

## Primary Commands

```bash
npm run pipeline:manual:refresh
npm run pipeline:status
npm run pipeline:verify:discord
```

## Main Workflow Pieces

- Roster sync: `scripts/tools/sync-team-roster-metadata.js`
- Chunked collection: `scripts/tools/run-ops-pipeline-chunked.js`
- Manual refresh wrapper: `scripts/tools/run-manual-refresh.js`
- Approved push: `scripts/tools/push-supabase-approved.js`

## Main Outputs

- `tmp/reports/daily_pipeline_snapshot_YYYY-MM-DD.json`
- `tmp/reports/daily_pipeline_alerts_YYYY-MM-DD.json`
- `tmp/reports/team_roster_sync_report.json`
