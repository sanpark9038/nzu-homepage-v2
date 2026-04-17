# HOSAGA Tomorrow Runbook

Use this when resuming work the next day.

## Priority Order

1. Check the latest GitHub Actions pipeline run.
2. Review Actions Summary and uploaded artifacts.
3. Inspect `tmp/reports/` outputs if local verification is needed.
4. Run local verification commands before any sync action.

## Standard Commands

```bash
npm run pipeline:health
npm run pipeline:status
npm run pipeline:verify:discord
npm run ops:watchlist
npm run test:pipeline:daily
npm run validate:pipeline-alert-rules
```

## Observation Mode

Use this when the system is stable and the goal is to watch for regressions rather than make changes.

1. Confirm the latest `SOOP Live Sync` run is `success`.
2. Confirm the latest `NZU Ops Pipeline` run is `success`.
3. Check Discord summary tone and ordering.
4. Spot-check `/tier`, `/player`, and `/match`.
5. Review latest local reports only if an anomaly appears.

## Manual Recovery Path

```bash
npm run pipeline:manual:refresh
```

Use the sync variant only when service-role credentials are present and the run is already verified.

```bash
npm run pipeline:manual:refresh:with-sync
```

## Local Hygiene

Use this when `tmp/reports/` accumulates too many timestamped files.

```bash
npm run maintenance:check
npm run reports:prune:artifact-dirs
npm run reports:prune
npm run reports:prune:artifact-dirs -- --apply
npm run reports:prune -- --apply
```

## Maintenance Notes

- GitHub Actions runners now warn that `actions/*@v4` are still using the deprecated Node 20 runtime internally.
- This does not break the current workflow, but the workflow should be reviewed before GitHub's Node 24 switch becomes mandatory.
- Keep the main workflow as the only live ops path unless a new debug workflow is intentionally reintroduced.
