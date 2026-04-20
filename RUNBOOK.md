# HOSAGA Runbook

Use this when resuming `nzu-homepage` work.

## Short Alias

You can start most sessions with:

```text
RB 기준으로 진행해줘.
```

Meaning:

- `RB` = `RUNBOOK.md`
- the agent should still follow `AGENTS.md` and `docs/harness/SESSION_ENTRY.md`

If you want to allow parallel help:

```text
RB 기준으로 진행해줘. 필요하면 서브에이전트도 알아서 써줘.
```

## Quick Start

1. Check the latest GitHub Actions runs.
2. Review the Actions Summary and uploaded artifacts.
3. Check `tmp/reports/` only when local verification is needed.
4. Run local verification before any sync action.

## Good Uses For Parallel Help

- UI review plus separate verification
- GitHub Actions log review plus local code tracing
- pipeline bug triage where one thread reads reports and another reads code

Avoid parallel write work when files overlap.

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

Use this when the system looks stable and you only want to watch for regressions.

1. Confirm the latest `SOOP Live Sync` run is `success`.
2. Confirm the latest `NZU Ops Pipeline` run is `success`.
3. Check Discord summary wording and ordering.
4. Spot-check `/tier`, `/player`, and `/match`.

## Manual Recovery

```bash
npm run pipeline:manual:refresh
```

Use the sync variant only when service-role credentials are present and the run is already verified.

```bash
npm run pipeline:manual:refresh:with-sync
```

## Serving Identity Verification

If the current work touches `players`, `players_staging`, or identifier-based sync:

- read [docs/harness/SERVING_IDENTITY_NOTES.md](docs/harness/SERVING_IDENTITY_NOTES.md)
- run [scripts/sql/check-serving-identity-schema.sql](scripts/sql/check-serving-identity-schema.sql) in Supabase
- use the `Operator Check` section there before changing `onConflict: 'name'`

## Local Hygiene

Use this when `tmp/reports/` has accumulated too many timestamped files.

```bash
npm run maintenance:check
npm run reports:prune:artifact-dirs
npm run reports:prune
npm run reports:prune:artifact-dirs -- --apply
npm run reports:prune -- --apply
```

## Notes

- Keep the main workflow as the primary live ops path.
- Do not treat `tmp/` artifacts as permanent truth.
- If the session starts drifting, go back to `docs/harness/SESSION_ENTRY.md`.
