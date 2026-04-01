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
- `TOMORROW_RUNBOOK.md`
- `PIPELINE_DATA_CONTRACT.md`
- `data/metadata/README.md`

## Likely Archive Candidates

These look useful as historical notes, but should not remain top-level forever.

- `GITHUB_ACTIONS_CACHE_REVIEW.md`
- `GITHUB_ACTIONS_DEBUG_CHUNK1_SUCCESS.md`
- `GITHUB_ACTIONS_DISCORD_INTEGRATION.md`
- `GITHUB_ACTIONS_FIRST_RUN_FAILURE.md`
- `GITHUB_ACTIONS_PIPELINE_REVIEW.md`
- `GITHUB_ACTIONS_RECONSIDERATION_NOTE.md`
- `HANDOFF_PHASE2_SUPABASE_INTEGRATION_2026-03-23.md`
- `MAIN_AI_DIRECT_INSTRUCTION_2026-03-23.md`
- `MAIN_AI_EXECUTION_GUARDRAILS_2026-03-23.md`
- `MAIN_AI_HOMEPAGE_SUPABASE_INTEGRATION_HANDOFF_2026-03-23.md`
- `MAIN_AI_SUPABASE_AUTOMATION_HANDOFF.md`
- `MAIN_AI_UI_BRIEFING.md`
- `MAIN_AI_UI_ONLY_INSTRUCTION.md`
- `MAIN_AI_UI_REDESIGN_BRIEF_2026-03-23.md`
- `NEXT_DAY_WORK_PLAN_2026-03-19.md`
- `NZU_TOMORROW_PLAN.md`
- `PHASE2_WALKTHROUGH.md`
- `SUPABASE_HANDOFF.md`

## Likely Delete Candidates Later

Only remove these after confirming they are fully superseded.

- stale temporary planning notes
- duplicate handoff memos that are covered by active docs
- AI-only instruction files that no longer affect execution

## Recommended Next Cleanup Step

Do not delete documents yet.

First move archive candidates into a single folder such as:

- `docs/archive/`

After that, update internal references and then remove anything truly obsolete.
