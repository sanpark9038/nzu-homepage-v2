# HOSAGA Homepage

HOSAGA public site and operations pipeline live in this repository.

This repo contains:

- Next.js website code under `app/`, `components/`, and `lib/`
- Metadata, roster, and sync tooling under `data/metadata/` and `scripts/tools/`
- Supabase-backed serving data for `players`, `matches`, and related tables
- GitHub Actions workflows for the HOSAGA ops pipeline

## Current Architecture

1. Pipeline collects and validates roster and match changes.
2. Local metadata evolves under `data/metadata/`.
3. Approved sync pushes serving data into Supabase.
4. The public site reads from Supabase instead of runtime scraping.

## Important Directories

- `app/`
- `components/`
- `lib/`
- `scripts/tools/`
- `data/metadata/`
- `.github/workflows/`

## Key Commands

```bash
npm install
npm run dev
```

Validation and pipeline:

```bash
npm run test:pipeline:daily
npm run validate:pipeline-alert-rules
npm run validate:metadata
npm run validate:metadata:projects
npm run pipeline:manual:refresh
npm run pipeline:manual:refresh:with-sync
```

## Environment Variables

Required for local website usage:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Required for approved sync paths:

```bash
SUPABASE_SERVICE_ROLE_KEY=...
```

## Reference Docs

- `AGENTS.md`
- `ARCHITECTURE.md`
- `docs/README.md`
- `docs/DESIGN.md`
- `docs/PLANS.md`
- `docs/RELIABILITY.md`
- `docs/harness/README.md`
- `PIPELINE_ONE_PAGE.md`
- `PIPELINE_SUCCESS_CRITERIA.md`
- `PIPELINE_INCIDENT_PLAYBOOK.md`
- `RUNBOOK.md`
- `data/metadata/README.md`
- `PIPELINE_DATA_CONTRACT.md`
- `DOCS_CLEANUP_PLAN.md`
