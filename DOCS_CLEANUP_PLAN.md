# Docs Cleanup Plan

This repository has accumulated many one-off handoff and review documents.

The right order is:

1. keep a small set of living operational docs
2. classify the rest
3. archive or delete only after the current pipeline + homepage direction is fixed

## Keep As Active Docs

- `README.md`
- `PIPELINE_ONE_PAGE.md`
- `PIPELINE_SUCCESS_CRITERIA.md`
- `PIPELINE_INCIDENT_PLAYBOOK.md`
- `RUNBOOK.md`
- `PIPELINE_DATA_CONTRACT.md`
- `data/metadata/README.md`

## Likely Archive Candidates

These still need classification, but do not have to stay top-level forever.

- none at the repo root right now

## Archived On 2026-04-17

The first archive pass moved these root-level notes into `docs/archive/`:

- `GITHUB_ACTIONS_CACHE_REVIEW.md`
- `GITHUB_ACTIONS_DEBUG_CHUNK1_SUCCESS.md`
- `GITHUB_ACTIONS_DISCORD_INTEGRATION.md`
- `GITHUB_ACTIONS_FIRST_RUN_FAILURE.md`
- `GITHUB_ACTIONS_PIPELINE_REVIEW.md`
- `GITHUB_ACTIONS_RECONSIDERATION_NOTE.md`
- `HANDOFF_PHASE2_SUPABASE_INTEGRATION_2026-03-23.md`
- `MAIN_AI_SUPABASE_AUTOMATION_HANDOFF.md`
- `MAIN_AI_UI_BRIEFING.md`
- `MAIN_AI_UI_ONLY_INSTRUCTION.md`
- `MATCH_FEATURE_IDEAS.md`
- `MATCH_NEXT_SESSION_BRIEF.md`
- `SITE_SMOKE_TEST_CHECKLIST.md`
- `TASK.md`
- `PHASE2_WALKTHROUGH.md`
- `SUPABASE_HANDOFF.md`

## Likely Delete Candidates Later

Only remove these after confirming they are fully superseded.

- stale temporary planning notes
- duplicate handoff memos that are covered by active docs
- AI-only instruction files that no longer affect execution

## Recommended Next Cleanup Step

The next cleanup pass should:

- review whether any new temporary notes start accumulating at the repo root again
- fold any still-useful guidance into active docs before further moves
- remove or archive duplicate notes only after references are verified
- remove obsolete debug-only workflow paths once the main workflow fully supersedes them
