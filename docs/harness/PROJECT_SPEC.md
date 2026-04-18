# NZU Homepage Project Specification

This document is written so an external AI system can understand the repository without prior chat history.

## 1. Project identity

- Project name: `hosaga-homepage`
- Local path: `c:\Users\NZU\Desktop\nzu-homepage`
- Primary purpose: public website plus data/ops pipeline for NZU/HOSAGA player, roster, match, and live-state information
- Operating mode: the website is user-facing; the pipeline is operator-facing and run both locally and via GitHub Actions

## 2. Product scope

The repository combines two systems:

1. A Next.js website that serves player, match, and live-state views.
2. A Node.js operations/data pipeline that collects roster and match metadata, validates it, produces reports, and can optionally sync approved data to Supabase.

## 3. Core business domains

### 3.1 Player metadata

Tracks player identity and serving attributes such as:

- entity IDs
- names and display names
- gender
- team affiliation
- tier
- race
- SOOP linkage
- identity alias or migration edge cases

### 3.2 Team roster state

Tracks roster membership by team project under `data/metadata/projects/<team>/players.<team>.v1.json`.

### 3.3 Match history and derived aggregates

Pipeline scripts collect, normalize, and validate match records and aggregates used by the site and downstream serving paths.

### 3.4 SOOP live state

The project maintains live/preview/generated SOOP snapshot artifacts and can sync live state into Supabase on a frequent cadence.

### 3.5 Operational reporting

The pipeline emits:

- latest reports
- alert summaries
- Discord messages
- freshness and readiness checks
- artifact snapshots for GitHub Actions review

## 4. Technical stack

### 4.1 Application stack

- Framework: Next.js `16.1.6`
- React: `19.2.3`
- React DOM: `19.2.3`
- TypeScript: `^5`
- Styling: Tailwind CSS `^4`
- Linting: ESLint `^9` with `eslint-config-next`

### 4.2 UI and utility libraries

- `lucide-react`
- `recharts`
- `clsx`
- `class-variance-authority`
- `tailwind-merge`
- `@base-ui/react`
- drag-and-drop libraries including `@dnd-kit/*` and `@hello-pangea/dnd`

### 4.3 Data and scraping stack

- Node.js scripts
- `axios` for HTTP requests
- `cheerio` for HTML parsing
- `iconv-lite` for encoding normalization
- local JSON artifacts as first-class intermediate outputs

### 4.4 Backend / serving data

- Supabase via `@supabase/supabase-js`
- SSR support via `@supabase/ssr`

### 4.5 Automation and ops

- GitHub Actions workflows
- Windows PowerShell scheduled scripts for local/Windows automation
- Discord webhook notifications for ops summaries

## 5. Repository layout

### Application code

- `app/`: Next.js App Router pages and route segments
- `components/`: reusable UI components
- `lib/`: shared application logic and local loaders/helpers
- `types/`: shared types
- `public/`: static assets

### Data and metadata

- `data/metadata/`: durable metadata artifacts and derived source-of-truth JSON
- `data/metadata/projects/`: team-scoped roster metadata documents

### Pipeline and tooling

- `scripts/tools/`: current operational scripts, validators, reports, sync logic, tests
- `scripts/archive/`: historical scripts kept for reference, not primary current logic
- `tmp/reports/`: generated report artifacts during local or workflow runs
- `tmp/`: other temporary pipeline state and caches

### Docs and operating context

- `README.md`: repo overview
- `docs/README.md`: docs index
- `docs/archive/`: historical notes
- `docs/harness/`: agent-first operating docs

### Automation

- `.github/workflows/`: GitHub Actions workflows
- `scripts/*.ps1`: Windows scheduling helpers

## 6. External systems and dependencies

### 6.1 Eloboard

Used as a primary upstream source for:

- team roster pages
- player profile pages
- match/history pages

This source is scrape-based and therefore subject to:

- encoding issues
- partial responses
- page-structure drift
- missing or temporarily inconsistent player listings

### 6.2 SOOP

Used for live broadcast state and channel mapping flows.

### 6.3 Supabase

Used as serving storage for public site data and operational sync targets.

### 6.4 GitHub Actions

Used for scheduled and manual pipeline execution, report artifact upload, and operational review.

### 6.5 Discord

Used for operator-facing summary notifications.

## 7. Important workflows

### 7.1 Main ops pipeline

Primary GitHub Actions workflow:

- `.github/workflows/ops-pipeline-cache.yml`

Characteristics:

- scheduled daily
- manual dispatch supported
- collect-only by default
- optional Supabase sync path if secrets are present and dispatch requests it
- uploads report artifacts
- sends Discord summary

### 7.2 SOOP live sync

Secondary workflow:

- `.github/workflows/soop-live-sync.yml`

Characteristics:

- frequent cron
- generates SOOP snapshot
- syncs live state to Supabase

## 8. Operational script groups

Representative script clusters from `package.json`:

- site lifecycle: `dev`, `build`, `start`, `lint`
- metadata validation: `validate:*`, `check:*`
- pipeline execution: `pipeline:*`
- SOOP live flows: `soop:*`
- reports and audits: `report:*`
- maintenance and pruning: `maintenance:*`, `reports:*`
- roster sync and export: `sync:team:roster`, `export:*`

## 9. Current pipeline philosophy

The current architecture is roughly:

1. collect and validate source data
2. update local metadata artifacts
3. generate operational reports and alerts
4. optionally push approved serving data to Supabase
5. let the public site read from serving data instead of runtime scraping

## 10. Environment variables

### Required for local site usage

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Required for approved sync paths

- `SUPABASE_SERVICE_ROLE_KEY`

### Used by workflows / ops

- `SUPABASE_SERVICE_KEY` in some flows
- `OPS_DISCORD_WEBHOOK_URL`
- `SOOP_CLIENT_ID` for SOOP workflow paths

## 11. Current known reliability constraints

### 11.1 Roster observation is not equal to roster truth

The pipeline may use fallback logic when source observations are incomplete.
That means a player's computed current team can sometimes be an inference, not a directly observed fact.

### 11.2 Discord summaries can overstate certainty

At least one confirmed incident showed that a fallback-generated FA move was communicated like a real affiliation change.

### 11.3 Docs are partly centralized, partly historical

The repo has strong operational notes, but some historical knowledge still lives in archive files or previous session context.

### 11.4 Long-running work benefits from explicit checkpoint recovery

This project already depends on:

- git status awareness
- recent Actions status
- latest report artifacts
- understanding of current "watch/observe mode"

## 12. Immediate harness priorities for this project

These are the highest-leverage improvements for future AI work:

1. separate confirmed roster changes from fallback-inferred changes
2. keep active operational knowledge in repo-visible docs
3. preserve resumable execution plans inside the repo
4. add tests for partial-roster false positives
5. make Discord alert wording confidence-aware

## 13. Non-goals for now

An external AI should avoid assuming that the project currently wants:

- a wholesale repo restructure
- a new backend platform
- a migration away from existing Next.js/Supabase architecture
- a total rewrite of historical scripts

The near-term goal is reliability and operational clarity, not platform replacement.

## 14. Recommended first reads for an external AI

1. [README.md](/c:/Users/NZU/Desktop/nzu-homepage/README.md)
2. [docs/README.md](/c:/Users/NZU/Desktop/nzu-homepage/docs/README.md)
3. [PIPELINE_ONE_PAGE.md](/c:/Users/NZU/Desktop/nzu-homepage/PIPELINE_ONE_PAGE.md)
4. [PIPELINE_SUCCESS_CRITERIA.md](/c:/Users/NZU/Desktop/nzu-homepage/PIPELINE_SUCCESS_CRITERIA.md)
5. [PIPELINE_DATA_CONTRACT.md](/c:/Users/NZU/Desktop/nzu-homepage/PIPELINE_DATA_CONTRACT.md)
6. [docs/harness/README.md](/c:/Users/NZU/Desktop/nzu-homepage/docs/harness/README.md)
7. [docs/harness/FAILURE_MODES.md](/c:/Users/NZU/Desktop/nzu-homepage/docs/harness/FAILURE_MODES.md)

## 15. Recommended first commands for an external AI

```powershell
git status --short --branch
git log --oneline -5
gh run list --repo sanpark9038/nzu-homepage-v2 --limit 8
```

Then inspect:

```powershell
Get-ChildItem tmp\reports
Get-Content PIPELINE_ONE_PAGE.md
Get-Content docs\harness\FAILURE_MODES.md
```
