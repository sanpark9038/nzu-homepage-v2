# NZU Homepage Technical Report

## Purpose

This document is a technical handoff for an external AI or collaborator who will later convert the project into a PPT or executive presentation.

The goal is to explain:

1. What the NZU homepage project actually is
2. How the current system is structured end-to-end
3. Which parts are production-oriented and which parts are still transitional
4. What assumptions a future AI should preserve when extending or redesigning the system

## 1. Project Definition

The NZU homepage is not just a static team website.

It is currently a combined system made of:

1. A public-facing Next.js website
2. A local data pipeline that collects and validates player/match data
3. A Supabase serving layer used by the website
4. Admin and ops tools for manual correction and monitoring
5. GitHub Actions-based scheduled automation

The most important architectural principle is:

`Public pages must read validated serving data, not scrape external sources at runtime.`

This principle is explicitly reflected in:

- `README.md`
- `PIPELINE_DATA_CONTRACT.md`
- `lib/player-service.ts`

## 2. High-Level Architecture

The current system is best understood as a 3-layer architecture.

### Layer A. Collection and normalization

Local scripts collect, normalize, validate, and report player/match changes.

Main locations:

- `scripts/tools/`
- `data/metadata/`
- `tmp/reports/`
- `tmp/exports/`

### Layer B. Serving layer

After validation, approved data is pushed to Supabase.

The public website reads from Supabase tables such as:

- `players`
- `matches`
- `eloboard_matches`

Supabase is treated as a delivery/serving layer, not the canonical identity source.

### Layer C. Web and operations

The Next.js app renders the public site and also exposes admin/ops surfaces.

Main locations:

- `app/`
- `components/`
- `lib/`
- `app/admin/*`
- `app/api/admin/*`

## 3. Core Technical Stack

Current confirmed stack:

### Frontend

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4

### Data / backend integration

- Supabase JS client

### Pipeline / automation

- Node.js custom scripts
- GitHub Actions
- Discord webhook notifications

### Reference

- `package.json`

## 4. Source of Truth Model

This project deliberately separates source-of-truth data from serving data.

### Canonical metadata layer

The local metadata directory is the actual source of truth for identity and roster logic.

Important files:

- `data/metadata/players.master.v1.json`
- `data/metadata/projects/*/players.*.v1.json`

### Serving layer

Supabase is used for website reads, but not as the canonical identity source.

This distinction matters because:

1. Player identity must remain stable across future projects
2. Team/roster state can change independently from identity
3. The website should remain fast and stable without runtime scraping

### Stable join key

The durable player join key is designed around:

- `entity_id` in metadata
- `eloboard_id` in serving tables

This is the expansion point for future reuse beyond NZU.

## 5. Metadata Design

The metadata model is intentionally two-layered.

### A. Master identity DB

`players.master.v1.json`

Role:

- Cross-project canonical identity database
- Stable identity contract for players
- Shared key source for future projects

### B. Project/team roster DB

`projects/<code>/players.<code>.v1.json`

Role:

- Team-specific roster view
- Team membership, tier, race, display name, freshness fields
- Per-project operational snapshot

### Why this matters

This is a stronger structure than a single flat `players` table because it separates:

1. Who the player is
2. Which team/project currently claims the player
3. What display and operational fields belong to the current project

Reference:

- `data/metadata/README.md`
- `PIPELINE_DATA_CONTRACT.md`

## 6. Public Website Data Flow

The public site reads from Supabase through a dedicated service layer.

Main file:

- `lib/player-service.ts`

This service currently handles:

1. Player list reads
2. Player detail reads
3. Live player reads
4. Match history reads
5. Recent match reads
6. University/team filtering
7. Search

The contract is:

1. Public pages use Supabase
2. Public pages do not parse local metadata directly
3. Public pages do not scrape external sources at render time

This is one of the most important rules an external AI must preserve.

## 7. Current Public Product Surfaces

### A. Home page

File:

- `app/page.tsx`

Current role:

- Dashboard-like landing page
- Shows recent matches
- Shows live players
- Shows top-ranked players
- Uses ISR-style revalidation (`revalidate = 60`)

### B. Tier page

File:

- `app/tier/page.tsx`

Current role:

- Tier-based player listing
- Filters by name, race, university, tier
- Uses normalized tier logic for grouping

### C. Player detail routing

File:

- `app/player/[id]/page.tsx`

Current role:

- Canonicalizes slug/id access
- Redirects non-canonical player URLs
- Connects to shared player detail view

### D. Battle grid

File:

- `app/battle-grid/page.tsx`

Current role:

- Compares two universities/teams
- Uses shared player data to generate comparison views

### E. Live page

File:

- `app/live/page.tsx`

Current state:

- Partially real, partially transitional
- Uses `is_live` from player data
- Builds mock viewer counts locally
- Indicates future intent to connect to SOOP TV/partner API

This means the live page is not yet a fully mature real-time streaming data product.

### F. Match / entry board page

File:

- `app/match/page.tsx`

Current state:

- Strong UI prototype
- Uses dummy player data
- Good for workflow/UX direction
- Not yet connected to production-grade real match orchestration

This page should be described as a product shell or interface prototype, not a completed ops module.

## 8. Admin and Ops Layer

One of the strongest parts of the project is that it already includes an operational layer.

### Main admin surfaces

- `app/admin/ops/page.tsx`
- `app/admin/roster/page.tsx`
- `app/admin/data-lab/page.tsx`

### What the admin layer currently does

1. Shows latest pipeline snapshot
2. Shows alert counts and team health
3. Allows pipeline runs from the admin surface
4. Allows roster correction and manual overrides
5. Allows exclusion/resume handling for collection control
6. Exposes temporary verification/data-lab pages

This means the project already operates more like a lightweight internal data tool plus public site, rather than a simple brochure site.

## 9. Roster Correction Logic

The roster admin API is especially important.

Main file:

- `app/api/admin/roster/route.ts`

It currently supports:

1. Team creation/deletion for manual-managed teams
2. Player movement between teams
3. Tier changes
4. Manual override locks
5. Exclusion from collection
6. Resume requests after exclusion is cleared

This is significant because it shows the pipeline is not assumed to be perfect.

Instead, the system is designed with:

1. automated ingestion
2. human correction
3. locked overrides
4. later reconciliation

That is a pragmatic production-oriented pattern.

## 10. Admin Authentication

Current admin authentication is intentionally simple.

Main files:

- `lib/admin-auth.ts`
- `app/api/admin/session/route.ts`
- `proxy.ts`

Mechanism:

1. `ADMIN_ACCESS_KEY` is configured in environment variables
2. Login verifies the provided password against that key
3. A cookie session is created
4. `/admin/*` and `/api/admin/*` routes are protected through proxy middleware

Interpretation:

- Good enough for internal/private ops use
- Not a long-term enterprise auth model
- Future hardening is possible if the project grows

## 11. Pipeline Operating Principle

The current pipeline design intentionally separates:

1. collection/validation
2. serving-layer sync

This is one of the most mature decisions in the repository.

Reference docs:

- `PIPELINE_ONE_PAGE.md`
- `PIPELINE_DATA_CONTRACT.md`

The rule is:

`Collect first, validate first, sync to serving only when approved or explicitly enabled.`

That reduces the risk of pushing bad ingestion results directly into the live website.

## 12. Pipeline Execution Flow

Main scripts:

- `scripts/tools/run-manual-refresh.js`
- `scripts/tools/run-ops-pipeline.js`
- `scripts/tools/run-daily-pipeline.js`
- `scripts/tools/push-supabase-approved.js`

### Manual refresh flow

`run-manual-refresh.js` performs:

1. Baseline roster capture
2. Chunked ops pipeline execution
3. Optional approved Supabase push
4. Report generation in JSON and Markdown

### Ops pipeline flow

`run-ops-pipeline.js` performs:

1. Daily pipeline execution
2. Warehouse verification
3. Optional Supabase staging/prod sync
4. Report generation
5. Discord reporting

This means the project already has a real operational lifecycle, not just local developer scripts.

## 13. Scheduled Automation

Automation is handled through GitHub Actions.

Main workflow:

- `.github/workflows/ops-pipeline-cache.yml`

The workflow currently does:

1. `npm ci`
2. pipeline regression test
3. alert rule validation
4. manual refresh execution
5. status output
6. Discord summary send
7. artifact upload
8. cache save for `tmp/`

Important operational behavior:

1. It runs on schedule
2. It also supports manual dispatch
3. Supabase sync is opt-in and secret-gated
4. Artifact-based review is part of the design

This is important for any future AI because the system is already partially designed around daily operations and observability.

## 14. Warehouse / Analytical Side Layer

There is also a secondary analytical layer that reads warehouse CSV outputs.

Main files:

- `lib/warehouse-stats.ts`
- `app/api/stats/warehouse/route.ts`
- `app/admin/data-lab/page.tsx`

This layer is used for:

1. date-range statistics
2. team-level aggregations
3. player-level aggregations
4. map/race/opponent breakdowns

Interpretation:

The project currently uses both:

1. Supabase for public serving
2. local warehouse/report files for analytical and ops views

That hybrid model should be explained clearly in any external presentation.

## 15. Rendering / Deployment Characteristics

Important web-layer details:

### Next.js App Router

The app uses the App Router under `app/`.

### Revalidation

Some public pages use `revalidate = 60`, meaning they are not purely static and not fully request-dynamic either.

### Root layout structure

Main file:

- `app/layout.tsx`

The layout provides:

1. Sidebar navigation
2. Top navbar
3. Scroll container
4. Theme wrapper

### Image host allowlist

Main file:

- `next.config.ts`

Remote image hosts are explicitly controlled, which is a small but meaningful production-readiness detail.

## 16. What Is Already Mature

The following parts are relatively mature in architectural intent:

1. Separation of source-of-truth metadata from serving data
2. Supabase-only read contract for public pages
3. Local validation and reporting pipeline
4. GitHub Actions automation
5. Admin roster correction workflow
6. Alert/snapshot/report-based ops visibility

These are real backend/ops architecture decisions, not cosmetic frontend work.

## 17. What Is Still Transitional

The following parts should be presented honestly as transitional:

1. Live page is not fully real-time or fully external-API backed
2. Match/entry-board page is still largely a UI shell with dummy data
3. Some ops/analytics views still depend on local file outputs
4. Admin auth is simple and internal-use oriented
5. Documentation is improving, but historical transition artifacts still exist in the repo

An external AI should not misrepresent these sections as fully complete production modules.

## 18. Strategic Interpretation

The best one-line description of the current project is:

`NZU Homepage is a data-driven sports/team information platform built on Next.js, backed by a local ingestion and validation pipeline, served through Supabase, and supported by internal admin and ops tooling.`

More bluntly:

This is already halfway between a homepage and an internal sports-data operating system.

## 19. Constraints an External AI Must Preserve

Any future redesign, refactor, or PPT narrative should preserve the following technical truths:

1. Public pages should keep reading from validated serving data, not runtime scraping
2. Local metadata remains the identity source of truth
3. Supabase remains a serving/delivery layer unless the architecture is intentionally redefined
4. Admin/manual correction workflows are part of the product, not an accident
5. Pipeline validation and approval boundaries are central to system stability
6. Transitional features should be labeled honestly

## 20. Recommended PPT Structure

For presentation purposes, the project can be converted into the following slide order:

1. Project definition and problem scope
2. Why this is more than a normal homepage
3. Full system architecture
4. Data flow: collection -> normalization -> validation -> sync -> serving
5. Metadata and identity design
6. Public website service architecture
7. Admin and ops architecture
8. Automation and GitHub Actions workflow
9. Mature areas vs transitional areas
10. Next technical priorities

## 21. Suggested Next Priorities

If a future AI is asked to continue the project technically, the most reasonable next priorities are:

1. Formalize live-data integration beyond the current mock layer
2. Move match/entry-board features from prototype UI to real data-backed workflow
3. Decide whether analytics should remain file-backed or move deeper into Supabase
4. Harden admin auth if external/team usage expands
5. Consolidate active documentation and archive transitional notes

