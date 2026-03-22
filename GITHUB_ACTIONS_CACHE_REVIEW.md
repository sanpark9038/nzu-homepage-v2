# GitHub Actions Cache Review

## Review Question
Can the current pipeline be run in GitHub Actions while preserving local incremental behavior by caching these paths between runs?

```yaml
path: |
  tmp/
  data/metadata/
```

## Short Answer
Yes.

For the current pipeline structure, caching `tmp/` and `data/metadata/` is a practical way to preserve much of the local run-to-run state that the pipeline currently relies on.

It does not make the workflow identical to local execution in every respect, but it addresses the main technical problem:
- state loss between GitHub Actions runs

## Why This Helps
The current pipeline is not fully stateless.

It benefits from persisted runtime artifacts and updated metadata files.

### 1. `tmp/` cache helps preserve exported runtime artifacts
The pipeline writes important intermediate and reusable files under `tmp/`, including:
- detailed match JSON
- detailed match CSV
- report snapshots
- local scraping cache

Without restoring `tmp/`:
- more players get fetched again
- `reused_players` decreases
- runtime gets heavier
- previous snapshot comparisons become weaker

Caching `tmp/` directly helps preserve:
- `tmp/.cache`
- `tmp/exports`
- `tmp/reports`

### 2. `data/metadata/` cache helps preserve evolving player metadata
The current priority update step modifies files under:

```text
data/metadata/projects/*/players.*.v1.json
```

These files accumulate fields such as:
- `last_checked_at`
- `last_match_at`
- `last_changed_at`
- `check_priority`
- `check_interval_days`

If that directory is restored across runs, the pipeline can continue using its current player-level incremental logic much more effectively.

## Important Caveat: Do Not Use One Fixed Cache Key
The proposed idea is directionally correct, but the exact example below is not ideal:

```yaml
key: pipeline-state-${{ runner.os }}
```

Reason:
- GitHub cache treats an exact key hit as a cache hit.
- Existing cache contents are not updated in place on an exact key hit.
- So a single fixed key can lead to stale state that stops evolving correctly.

## Correct Pattern
Use:
- `restore` with a prefix
- `save` with a unique key per run

This allows:
- restoring the most recent compatible cache
- saving fresh state at the end of each successful run

## Practical Assessment for This Pipeline
For this repository, the cache approach is practical because it helps preserve the exact state categories the pipeline currently depends on:

1. prior exported player JSON
2. prior match CSV outputs
3. prior daily snapshots and alerts
4. scraper cache
5. updated player metadata JSON files

That means it directly improves:
- incremental reuse
- priority-window behavior
- previous snapshot diffing
- alert quality

## What This Still Does Not Solve Automatically

### Discord alerts
The current manual command path does not send Discord notifications.

Reason:
- `pipeline:manual:refresh` calls the chunked runner
- the chunked runner invokes inner ops runs with `--no-discord`

So even if GitHub Actions runs the existing command successfully, Discord alert delivery is not automatically enabled by this cache approach alone.

### Full equivalence with local execution
This approach improves persistence substantially, but it still depends on GitHub Actions cache behavior and cache availability.

So it should be understood as:
- a strong approximation of local incremental behavior
- not a mathematically perfect replacement for a permanently mounted local filesystem

## Workflow Added for This Approach
Created workflow:
- [ops-pipeline-cache.yml](/C:/Users/NZU/Desktop/nzu-homepage/.github/workflows/ops-pipeline-cache.yml)

## What The Workflow Does
1. Runs daily at `06:10 KST`
2. Allows manual trigger with `workflow_dispatch`
3. Restores cached pipeline state
4. Runs:

```bash
npm run pipeline:manual:refresh
```

5. Prints:

```bash
npm run pipeline:status
```

6. Uploads `tmp/reports/` as workflow artifacts
7. Saves updated state back to cache

## Cache Strategy Used
The workflow uses a safer cache pattern:
- restore from prefix
- save with `github.run_id`

This avoids the stale fixed-key problem.

## Secrets Expected
The workflow expects these GitHub Secrets:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `OPS_DISCORD_WEBHOOK_URL`

## Final Conclusion
For the current pipeline structure, caching these paths in GitHub Actions is a reasonable and technically sound strategy:

- `tmp/`
- `data/metadata/`

This is likely the most practical way to preserve the current incremental pipeline behavior without redesigning the pipeline into a fully stateless system.

However, it should be understood clearly:
- it solves the major state persistence problem
- it does not by itself enable Discord alerts
- it is suitable for execution continuity, not for making the pipeline fully stateless
