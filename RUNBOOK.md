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

1. Read [LESSONS_LEARNED.md](LESSONS_LEARNED.md).
2. Check the latest GitHub Actions runs.
3. Review the Actions Summary and uploaded artifacts.
4. Check `tmp/reports/` only when local verification is needed.
5. Run local verification before any sync action.

## Environment Setup

Run these first in PowerShell so Korean text stays readable in command output and doc review:

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONUTF8 = "1"
```

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

### SOOP Snapshot Freshness Guard

Use this check whenever homepage integrity reports live-player disagreement or
`stale_live_snapshot_disagreement`.

- Do not trust an old repo snapshot as live SOOP truth during long ops runs.
- `run-manual-refresh.js` should refresh `data/metadata/soop_live_snapshot.generated.v1.json` before `homepage_integrity_report` when `SOOP_CLIENT_ID` is present.
- `run-ops-pipeline.js` should also refresh the SOOP snapshot inside each chunk before `homepage_integrity_report`; otherwise the final chunk can overwrite a fresh top-level report with stale data.
- A healthy verification run should show `homepage_integrity: fresh`, `snapshot_is_fresh=true`, and `stale_snapshot_disagreement_count=0`.
- Treat `stale_live_snapshot_disagreement` as an ops freshness problem first, not as a roster or player-count fact, until the snapshot timestamp is verified.

### Discord Roster Delta Guard

Use this check whenever Discord repeats the same roster delta across runs.

- Do not treat a repeated Discord roster delta as a new roster fact until it is compared with the previous `tmp/reports/current_roster_state.json`.
- `tmp/reports/team_roster_sync_report.json` can contain sync activity for the current collection, but Discord must suppress `added` or `moved` rows that were already present in the previous roster-state snapshot.
- A correct summary may still show real new joiners, but it should not repeat already-applied affiliation changes such as the 2026-04-28 루다/강민기/기나 case.
- After any fix, verify with:

```bash
npm run pipeline:verify:discord
node scripts/tools/send-manual-refresh-discord.test.js
```

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
- Treat player counts such as `318` or `319` as current snapshots, not fixed targets. The invariant is nonzero matching `players`/`players_staging`, zero missing/duplicate serving identities, successful sync, and completed cache revalidation.
- If the session starts drifting, go back to `docs/harness/SESSION_ENTRY.md`.
