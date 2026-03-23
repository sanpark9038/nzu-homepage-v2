# Main AI Execution Guardrails

Date: 2026-03-23
Project root: `C:\Users\NZU\Desktop\nzu-homepage`
Audience: main AI agent continuing work without full knowledge of the separate Codex workstream

## 1. Current Project Truth

This project is **not** currently in a “build a brand new data engine” phase.

It is currently in a:

- pipeline stabilized
- Supabase serving verified
- Discord ops reporting verified
- homepage-to-Supabase integration refinement

phase.

That distinction matters.

If you assume the system is still at the architecture-design stage, you will likely redo completed work and introduce regressions.

## 2. What Is Already Working

The following is already working and should be treated as the baseline:

- GitHub Actions workflow for the pipeline is running successfully
- cache-backed incremental execution is working
- chunked collection is working
- Supabase staging and production sync are working
- Discord notification delivery is working
- homepage data access already reads from Supabase

Key existing execution entrypoints:

- [scripts/tools/run-manual-refresh.js](C:/Users/NZU/Desktop/nzu-homepage/scripts/tools/run-manual-refresh.js)
- [scripts/tools/run-ops-pipeline-chunked.js](C:/Users/NZU/Desktop/nzu-homepage/scripts/tools/run-ops-pipeline-chunked.js)
- [scripts/tools/push-supabase-approved.js](C:/Users/NZU/Desktop/nzu-homepage/scripts/tools/push-supabase-approved.js)
- [scripts/tools/supabase-staging-sync.js](C:/Users/NZU/Desktop/nzu-homepage/scripts/tools/supabase-staging-sync.js)
- [scripts/tools/supabase-prod-sync.js](C:/Users/NZU/Desktop/nzu-homepage/scripts/tools/supabase-prod-sync.js)
- [scripts/tools/send-manual-refresh-discord.js](C:/Users/NZU/Desktop/nzu-homepage/scripts/tools/send-manual-refresh-discord.js)

Key existing website access points:

- [lib/supabase.ts](C:/Users/NZU/Desktop/nzu-homepage/lib/supabase.ts)
- [lib/player-service.ts](C:/Users/NZU/Desktop/nzu-homepage/lib/player-service.ts)

## 3. What You Should Do Next

### Priority 1: Fix the type/schema drift

The most important concrete task is to bring frontend typing in line with the current Supabase schema actually populated by the pipeline.

Problem:

- [lib/database.types.ts](C:/Users/NZU/Desktop/nzu-homepage/lib/database.types.ts) is behind the real DB field set

Pipeline-synced fields that must be accounted for:

- `last_checked_at`
- `last_match_at`
- `last_changed_at`
- `check_priority`
- `check_interval_days`

This should be fixed before deeper homepage integration work.

### Priority 2: Verify homepage data consumption against the real pipeline model

Audit the website’s use of Supabase player data in:

- [app/page.tsx](C:/Users/NZU/Desktop/nzu-homepage/app/page.tsx)
- [app/players/page.tsx](C:/Users/NZU/Desktop/nzu-homepage/app/players/page.tsx)
- [app/tier/page.tsx](C:/Users/NZU/Desktop/nzu-homepage/app/tier/page.tsx)
- [app/entry/page.tsx](C:/Users/NZU/Desktop/nzu-homepage/app/entry/page.tsx)
- [app/battle-grid/page.tsx](C:/Users/NZU/Desktop/nzu-homepage/app/battle-grid/page.tsx)

Goal:

- ensure the public site is consuming the current Supabase field semantics correctly
- avoid stale assumptions left over from earlier schema or architecture phases

### Priority 3: Normalize tier handling centrally

There are mixed assumptions in the UI around tier labels and ordering.

Potential formats currently in circulation:

- `갓`
- `킹`
- `잭`
- `조커`
- `스페이드`
- numeric tiers like `1`, `2`, `3`, ...
- some code also appears to expect English symbolic forms

Do not patch this screen-by-screen without a shared mapping strategy.

### Priority 4: Use ops metadata where it creates real product value

Potential safe uses:

- freshness indicator from `last_match_at`
- recently changed player visibility from `last_changed_at`
- admin-only diagnostics from `check_priority`

Keep raw operational metadata out of public UX unless it clearly improves the product.

## 4. What You Must Not Do

### Do not build a new SSUSTAR-style engine as the main task

[implementation_plan.md](C:/Users/NZU/Desktop/nzu-homepage/implementation_plan.md) is not the current project execution plan.

It reflects an earlier planning stage and should not be treated as the primary roadmap.

Specifically, do **not** treat these as current top priorities:

- adding `eloboard_id` as if it does not already exist
- replacing the current pipeline with a brand-new master sync architecture
- building a separate new “SSUSTAR engine” first

Those assumptions are outdated relative to the current codebase state.

### Do not replace public-site Supabase reads with direct local JSON reads

For public rendering, the website should continue to use Supabase as the serving layer.

Local metadata files are important, but mainly for:

- pipeline logic
- metadata evolution
- admin or debugging reference

Not for replacing the public serving source.

### Do not casually modify the pipeline execution chain

Avoid redesigning or replacing:

- [scripts/tools/run-manual-refresh.js](C:/Users/NZU/Desktop/nzu-homepage/scripts/tools/run-manual-refresh.js)
- [scripts/tools/run-ops-pipeline-chunked.js](C:/Users/NZU/Desktop/nzu-homepage/scripts/tools/run-ops-pipeline-chunked.js)
- [scripts/tools/push-supabase-approved.js](C:/Users/NZU/Desktop/nzu-homepage/scripts/tools/push-supabase-approved.js)
- [scripts/tools/supabase-staging-sync.js](C:/Users/NZU/Desktop/nzu-homepage/scripts/tools/supabase-staging-sync.js)
- [scripts/tools/supabase-prod-sync.js](C:/Users/NZU/Desktop/nzu-homepage/scripts/tools/supabase-prod-sync.js)

unless you have a very specific, localized reason.

These paths are already operational.

### Do not assume no-op metadata diffs are feature work

Current local changes under:

- `data/metadata/projects/*/players.*.v1.json`

are mostly pipeline-generated metadata updates such as:

- `generated_at`
- `last_checked_at`
- `last_changed_at`

Treat these as operational data artifacts unless explicitly told to productize or publish them.

## 5. Files You Should Read First

Read in this order:

1. [MAIN_AI_HOMEPAGE_SUPABASE_INTEGRATION_HANDOFF_2026-03-23.md](C:/Users/NZU/Desktop/nzu-homepage/MAIN_AI_HOMEPAGE_SUPABASE_INTEGRATION_HANDOFF_2026-03-23.md)
2. [PIPELINE_EXTERNAL_BRIEF.md](C:/Users/NZU/Desktop/nzu-homepage/PIPELINE_EXTERNAL_BRIEF.md)
3. [PIPELINE_ONE_PAGE.md](C:/Users/NZU/Desktop/nzu-homepage/PIPELINE_ONE_PAGE.md)
4. [lib/database.types.ts](C:/Users/NZU/Desktop/nzu-homepage/lib/database.types.ts)
5. [lib/player-service.ts](C:/Users/NZU/Desktop/nzu-homepage/lib/player-service.ts)
6. the main public pages under `app/`

Only after that should you decide what code to change.

## 6. Best First Deliverable

The best immediate deliverable is:

1. update `database.types.ts` to match the actual `players` schema used by the pipeline
2. verify all `Player` consumers compile and still render correctly
3. add small, coherent UI usage of freshness metadata only where it clearly helps
4. keep the homepage’s serving model centered on Supabase

## 7. Final Instruction

You are continuing an already-operational system.

Your job is:

- integrate correctly
- normalize typing and field usage
- avoid re-architecting verified pipeline behavior

If you are unsure whether a task belongs to “integration” or “rebuild”, prefer the integration interpretation first.

