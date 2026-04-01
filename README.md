# NZU Homepage

NZU 홈페이지와 운영 파이프라인이 함께 있는 저장소입니다.

현재 구조의 핵심은 다음과 같습니다.

- 수집/검증의 소스 오브 트루스: `data/metadata/`, `scripts/tools/`
- 웹사이트 서빙 레이어: Supabase `players`, `matches`, `eloboard_matches`
- 운영 자동화: GitHub Actions `NZU Ops Pipeline`

## Current Architecture

1. Pipeline collects and validates roster / match changes.
2. Local metadata evolves under `data/metadata/`.
3. Approved sync pushes serving data into Supabase.
4. The public site reads from Supabase, not from runtime scraping.

## Important Directories

- `app/`
  - Next.js App Router pages
- `components/`
  - UI and page components
- `lib/`
  - Supabase client, typed DB contract, service layer
- `scripts/tools/`
  - Pipeline, metadata, sync, validation scripts
- `data/metadata/`
  - Reusable metadata DB for current and future projects
- `.github/workflows/`
  - GitHub Actions workflow definitions

## Key Commands

```bash
npm install
npm run dev
```

Validation / pipeline:

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

- `docs/README.md`
- `PIPELINE_ONE_PAGE.md`
- `PIPELINE_SUCCESS_CRITERIA.md`
- `PIPELINE_INCIDENT_PLAYBOOK.md`
- `TOMORROW_RUNBOOK.md`
- `data/metadata/README.md`
- `PIPELINE_DATA_CONTRACT.md`
- `DOCS_CLEANUP_PLAN.md`
