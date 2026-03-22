# GitHub Actions Pipeline Review

## Review Scope
Question:

Can the existing manual command below be moved to GitHub Actions as-is, scheduled daily, with secrets stored in GitHub Secrets, and without changing the current pipeline code?

```bash
npm run pipeline:manual:refresh
```

## Short Answer
- Execution itself: **possible**
- Same behavior as current local operation: **not fully**
- Zero code change and same incremental quality: **no**

The main reason is that the current pipeline depends on local file state under `tmp/` and on local metadata files that persist across runs. GitHub Actions runners are ephemeral by default.

## What Will Work in GitHub Actions
The pipeline is fundamentally Node-based, so it can run in GitHub Actions.

Relevant scripts:
- [scripts/tools/run-manual-refresh.js](/C:/Users/NZU/Desktop/nzu-homepage/scripts/tools/run-manual-refresh.js)
- [scripts/tools/run-ops-pipeline-chunked.js](/C:/Users/NZU/Desktop/nzu-homepage/scripts/tools/run-ops-pipeline-chunked.js)
- [scripts/tools/run-daily-pipeline.js](/C:/Users/NZU/Desktop/nzu-homepage/scripts/tools/run-daily-pipeline.js)
- [scripts/tools/push-supabase-approved.js](/C:/Users/NZU/Desktop/nzu-homepage/scripts/tools/push-supabase-approved.js)

These scripts use normal Node execution and filesystem paths, not Windows-only scheduling features.

GitHub Secrets can provide:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `OPS_DISCORD_WEBHOOK_URL`

So `.env.local` is not strictly required if workflow environment variables are set correctly.

## Why "As-Is" Does Not Fully Match Local Behavior

### 1. `tmp/` state is ephemeral in GitHub Actions
Current pipeline writes important runtime artifacts under `tmp/`, including:
- detailed match JSON
- detailed match CSV
- report snapshots
- local cache files

Current ignore rule:
- [\.gitignore](/C:/Users/NZU/Desktop/nzu-homepage/.gitignore)

It excludes most of `tmp/`, so those files are not persisted in git.

GitHub Actions runners start from a fresh checkout, so this state does not exist by default on the next run.

### 2. Incremental reuse becomes weaker
[scripts/tools/export-nzu-roster-detailed.js](/C:/Users/NZU/Desktop/nzu-homepage/scripts/tools/export-nzu-roster-detailed.js)
reuses existing JSON only when prior exported files are already present.

Without previous `tmp` artifacts:
- more players will be fetched again
- `reused_players` will decrease
- runtime and external requests will increase

### 3. Local roster cache is lost every run
[scripts/tools/report-nzu-2025-records.js](/C:/Users/NZU/Desktop/nzu-homepage/scripts/tools/report-nzu-2025-records.js)
uses:

```text
tmp/.cache/roster_report_cache.json
```

That cache improves repeated scans.

In GitHub Actions, this cache disappears unless explicitly restored.

### 4. Previous snapshot comparison becomes weaker
[scripts/tools/run-daily-pipeline.js](/C:/Users/NZU/Desktop/nzu-homepage/scripts/tools/run-daily-pipeline.js)
looks for prior local files such as:

```text
tmp/reports/daily_pipeline_snapshot_YYYY-MM-DD.json
```

These are used for:
- `delta_total_matches`
- `delta_players`
- previous-vs-current comparisons
- alert generation quality

If previous snapshots are absent, the diff logic becomes weaker or empty.

### 5. Priority metadata does not persist naturally
[scripts/tools/update-player-check-priority.js](/C:/Users/NZU/Desktop/nzu-homepage/scripts/tools/update-player-check-priority.js)
updates files under:

```text
data/metadata/projects/*/players.*.v1.json
```

This means local operation benefits from accumulated fields such as:
- `last_checked_at`
- `last_match_at`
- `last_changed_at`
- `check_priority`
- `check_interval_days`

But GitHub Actions uses a fresh checkout each run, so those changes do not naturally carry into the next run unless you commit them back or store/restore them elsewhere.

### 6. Current manual command does not send Discord alerts
[scripts/tools/run-manual-refresh.js](/C:/Users/NZU/Desktop/nzu-homepage/scripts/tools/run-manual-refresh.js)
calls the chunked runner.

Inside the chunked runner, each chunk calls:
- [scripts/tools/run-ops-pipeline.js](/C:/Users/NZU/Desktop/nzu-homepage/scripts/tools/run-ops-pipeline.js)

with:

```text
--no-discord
```

So if GitHub Actions runs `npm run pipeline:manual:refresh` exactly as-is, Discord alerts will **not** be sent from that command path.

## What Is Not the Main Problem

### Environment variables
This part is manageable.

Even though scripts call `dotenv` and expect `.env.local`, GitHub Actions can provide the same values through workflow `env:`.

### OS path handling
The core scripts use Node `path` APIs and do not appear inherently blocked by Linux runners.

### Runtime length
The latest measured manual refresh was roughly 37 minutes locally.

If the repository is public and Actions minutes are not the limiting concern, this duration alone does not make the workflow impossible.

However, losing local cache and reuse likely makes runs heavier than local operation.

## Accurate Conclusion

### Can GitHub Actions run the pipeline?
Yes.

### Can it run the exact current command?
Yes.

### Will it behave like the current local manual pipeline without any adjustment?
No.

### Why not?
Because the current pipeline depends on persisted local state:
- `tmp/.cache`
- `tmp/exports`
- `tmp/reports`
- updated player metadata JSON files

GitHub Actions does not keep that state by default between runs.

## Minimum Areas That Would Need Attention
To make GitHub Actions a reliable replacement for current local behavior, at least some of the following are needed:

1. Restore/persist runtime artifacts:
- `tmp/.cache`
- `tmp/exports`
- `tmp/reports`

2. Persist evolving metadata state:
- `data/metadata/projects/*/players.*.v1.json`

3. Adjust the Discord path if scheduled alerts are required:
- current manual path disables Discord

## Recommended Interpretation
GitHub Actions is technically viable as an execution environment.

But the current pipeline is not a stateless batch job.

It is better understood as a stateful local ETL pipeline that currently benefits from:
- accumulated exported JSON
- local cache
- previous snapshots
- persistent player metadata updates

Therefore, "move the exact command to GitHub Actions with no code change" is possible only in a limited sense:
- it will run
- it will not preserve the full current incremental behavior unless state persistence is added
