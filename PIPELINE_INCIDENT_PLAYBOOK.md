# HOSAGA Pipeline Incident Playbook

Use this playbook when the daily or manual pipeline looks unhealthy.

## First Checks

1. Confirm the latest workflow run status.
2. Review GitHub Actions Summary output.
3. Inspect the uploaded report artifacts.
4. Check local report files under `tmp/reports/`.

## Files To Inspect

- `daily_pipeline_snapshot_YYYY-MM-DD.json`
- `daily_pipeline_alerts_YYYY-MM-DD.json`
- `team_roster_sync_report.json`

## Local Verification

```bash
npm run pipeline:verify:discord
npm run test:pipeline:daily
npm run validate:pipeline-alert-rules
```

For downloaded report bundles:

```bash
node scripts/tools/verify-discord-summary.js --reports-dir C:\Users\NZU\Downloads\pipeline-reports-<run_id> --markdown
```

## Common Failure Areas

- Missing or stale snapshot output
- Alert counts inconsistent with report files
- Discord summary missing expected paths
- Roster sync changes that do not match collection deltas

## Operator Rule

Do not run Supabase sync until collection, alerts, and summary verification all look consistent.
