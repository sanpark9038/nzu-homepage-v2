# Expert Help Brief

## Purpose

This document is for explaining the current technical problems of the NZU homepage project to an external expert who understands modern web architecture, data pipelines, and operational systems.

The goal is not to introduce the project at a high level, but to clearly show where help is needed.

## Project Context

The project currently combines:

1. Next.js public website
2. local ingestion and validation pipeline
3. Supabase serving layer
4. admin and ops tooling
5. GitHub Actions scheduled automation

The architecture direction is generally sound.

The main problems are not "what the system is trying to be," but rather the gap between the intended architecture and the currently uneven completion level across subsystems.

## Current Technical Problems

### 1. Serving-layer completeness is uneven

Current documented serving reality:

- `players`: synced and verified
- `matches`: empty
- `eloboard_matches`: empty

Source:

- `SITE_SMOKE_TEST_CHECKLIST.md`

Implication:

The player-centric part of the site can be validated, but match-history-driven pages are not fully ready for acceptance.

This creates a split product state:

1. some pages are realistically serviceable
2. other pages still depend on data that is not fully present in the serving layer

### 2. Public product readiness is inconsistent by surface

Pages closer to player roster data are in better shape:

- `/tier`
- `/player`
- `/player/[id]`

Pages that are more match-driven or richer in orchestration are still deferred or transitional:

- `/`
- `/match`
- `/entry`
- `/battle-grid`
- `/live`

This is important because the product does not currently have a single uniform readiness level.

### 3. Live page is only partially real

The current live page:

1. uses player `is_live` data
2. derives mock viewer counts locally
3. still references future intent for SOOP TV / partner API integration

Implication:

The live experience is not yet a fully mature real-time external integration.

The UI direction exists, but the backend truth model is not complete.

### 4. Match / entry-board workflow is still a prototype shell

The match page currently contains strong UI/UX direction, but it is not yet a completed production workflow.

Observed characteristics:

1. dummy player data is still present
2. interface is more advanced than the real orchestration backend
3. it should still be treated as a prototype or shell

This means the project currently has a feature where product ambition is ahead of the underlying data workflow.

### 5. Analytics architecture is hybrid and fragmented

The project currently uses:

1. Supabase for public serving
2. local warehouse CSV / reports for some analytical and ops functions

Relevant files:

- `lib/warehouse-stats.ts`
- `app/api/stats/warehouse/route.ts`
- `app/admin/data-lab/page.tsx`

Implication:

The system has not yet fully decided whether analytics should remain file-backed, move fully into Supabase, or live in a clearer split architecture.

This creates friction in:

1. consistency
2. observability
3. operational simplicity
4. future scaling

### 6. Admin auth is functional but intentionally basic

The current admin model is based on:

1. `ADMIN_ACCESS_KEY`
2. cookie session
3. route protection via proxy

This is acceptable for internal/private usage, but weak for broader team or long-term product expansion.

This is not the most urgent product blocker, but it is a structural limitation.

### 7. Pipeline safety is good, but operational complexity remains high

The project correctly separates:

1. collection
2. validation
3. approved sync

This is a strength.

However, the operating model still has real complexity:

1. multiple reports and snapshot files
2. alert-rule interpretation
3. manual sync gates
4. artifact review requirements
5. fallback paths between local/manual runs and GitHub Actions

In other words:

The pipeline is safer because it is guarded, but that also means it is more operationally complex.

### 8. Build / environment stability is not fully normalized

Recorded issue in project docs:

- local root build could reproduce `spawn EPERM`
- build succeeded in agent/remote environment

Source:

- `PHASE2_WALKTHROUGH.md`

Implication:

The codebase may be functionally buildable, but build reproducibility across environments is not fully trustworthy yet.

That is a real concern for maintainability and external collaboration.

## What Help Is Most Needed

An expert who knows this stack well would be most useful in these areas:

### 1. Serving data strategy

Decide how to close the gap between:

- player-serving readiness
- match-serving incompleteness

This is currently the biggest product-level architectural bottleneck.

### 2. Live and match workflow architecture

Help define how prototype UI surfaces should be converted into real production workflows.

This includes:

1. real live-data model
2. event/match orchestration model
3. integration boundaries

### 3. Analytics architecture decision

Clarify whether the project should:

1. continue hybrid analytics
2. migrate analytics deeper into Supabase
3. introduce a cleaner separate analytics layer

### 4. Environment reproducibility

Investigate and normalize local build/runtime behavior, especially around the recorded `spawn EPERM` instability.

### 5. Product readiness staging

Help define a clean staged launch model such as:

1. player-centric public launch first
2. match-driven surfaces after serving sync maturity

This would reduce ambiguity in current delivery expectations.

## Bottom-Line Summary

The project's architecture direction is strong.

The real issue is not lack of technical intent.

The real issue is that the system currently has:

1. mature pipeline and metadata concepts
2. usable player-serving flows
3. meaningful admin/ops tooling
4. but uneven completion across live, match, analytics, and environment stability

That unevenness is the main reason expert help is valuable right now.

