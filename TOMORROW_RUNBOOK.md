# HOSAGA Tomorrow Runbook

Use this when resuming work the next day.

## Priority Order

1. Check the latest GitHub Actions pipeline run.
2. Review Actions Summary and uploaded artifacts.
3. Inspect `tmp/reports/` outputs if local verification is needed.
4. Run local verification commands before any sync action.

## Standard Commands

```bash
npm run pipeline:status
npm run pipeline:verify:discord
npm run test:pipeline:daily
npm run validate:pipeline-alert-rules
```

## Manual Recovery Path

```bash
npm run pipeline:manual:refresh
```

Use the sync variant only when service-role credentials are present and the run is already verified.

```bash
npm run pipeline:manual:refresh:with-sync
```
