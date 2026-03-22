# GitHub Actions Discord Integration

## Goal
Enable Discord notifications when the GitHub Actions pipeline runs automatically.

Current concern:
- `pipeline:manual:refresh` uses a path where Discord was effectively disabled for chunk execution

## Short Answer
Discord was integrated, but not by simply removing `--no-discord`.

The safer design is:
- keep Discord disabled inside each chunk execution
- send **one final summary notification** after the full refresh and Supabase sync complete

## Why Removing `--no-discord` Directly Is Not Ideal
Current execution flow:

```text
pipeline:manual:refresh
-> run-manual-refresh.js
-> run-ops-pipeline-chunked.js
-> run-ops-pipeline.js (once per chunk)
```

Inside the chunk runner, each chunk invokes:

```text
run-ops-pipeline.js --no-discord
```

If `--no-discord` were simply removed:
- Discord notifications could be sent once per chunk
- the channel could receive multiple partial messages per run
- this is not desirable for the current batch structure

## Recommended Design
Use this notification strategy:

1. chunk-level execution keeps Discord disabled
2. full refresh runs to completion
3. Supabase sync completes
4. one final Discord summary is sent

This fits the current pipeline structure much better.

## What Was Added

### 1. Final Discord summary script
Added:
- [send-manual-refresh-discord.js](/C:/Users/NZU/Desktop/nzu-homepage/scripts/tools/send-manual-refresh-discord.js)

Purpose:
- read the latest generated reports
- build a final success/failure summary
- send one Discord webhook message

Summary fields include:
- success or failure
- source
- generated timestamp
- team count
- player count
- total matches
- fetched player count
- reused player count
- fetch failure count
- csv failure count
- alert counts
- zero-record player count
- GitHub Actions run URL

### 2. Workflow update
Updated:
- [ops-pipeline-cache.yml](/C:/Users/NZU/Desktop/nzu-homepage/.github/workflows/ops-pipeline-cache.yml)

The workflow now:
1. restores cache
2. runs manual refresh
3. prints pipeline status
4. sends a Discord summary once
5. uploads reports artifact
6. saves updated cache

## Current Workflow Notification Behavior
Discord notification is now triggered with:
- `if: always()`

That means:
- on success: a success summary is sent
- on failure: a failure summary is sent

This is intentional, so the workflow still reports something even if the run fails.

## Required GitHub Secret
To use Discord notification in GitHub Actions, register:

- `OPS_DISCORD_WEBHOOK_URL`

Other required workflow secrets remain:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Important Limitation
This integration does **not** make Discord fire during each collection chunk.

That is deliberate.

The current pipeline is chunked, so chunk-level Discord would create noisy and potentially confusing notifications.

The adopted approach is:
- one message per workflow run
- final summary only

## Final Conclusion
Discord integration is now compatible with the current GitHub Actions design.

But the correct implementation for this pipeline is:
- not "remove `--no-discord` everywhere"
- instead "send one final summary after the entire pipeline finishes"

This is the cleanest fit for the current chunked pipeline structure.
