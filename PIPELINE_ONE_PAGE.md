# NZU Pipeline (One Page)

## 목적
- 정확한 선수 데이터 수집
- 정확한 변동 알림
- Supabase 본반영은 승인 후에만 수행

## 핵심 원칙
1. **수집/검증과 본반영을 분리**
2. **승인 전에는 절대 prod sync 금지**
3. **일일 작업은 변동 확인 중심**

## 실행 흐름 (매일)
1. 수집 + 로컬 검증만 실행
   - `npm run pipeline:collect-only`
   - 의미: 데이터 수집/검증/리포트 생성까지만 수행, Supabase 반영 안 함
   - 기본 증분 정책:
     - `--use-existing-json` 사용
     - `--inactive-skip-days 14` 사용
     - 최근 활동이 없는 선수는 기존 JSON/CSV 재사용

2. 결과 확인
   - `tmp/reports/ops_pipeline_latest.md`
   - `tmp/reports/daily_pipeline_snapshot_YYYY-MM-DD.json`
   - `tmp/reports/metadata_review_current.csv` (필요 시 재생성)

3. 승인 후 Supabase 반영
   - `npm run pipeline:push:approved`
   - 의미: staging -> prod 순서 반영

## 안전장치
- 승인 게이트 스크립트:
  - `scripts/tools/push-supabase-approved.js`
  - `--approved` 없으면 강제 실패

## 문제 발생 시
1. 수집 단계 실패:
   - `node scripts/tools/run-ops-pipeline.js --dry-run`
2. DB 반영 단계 실패:
   - `node scripts/tools/supabase-staging-sync.js`
   - `node scripts/tools/supabase-prod-sync.js`

## 데이터 저장 위치
- 선수 메타데이터: `data/metadata/projects/*/players.*.v1.json`
- 선수 상세전적(JSON): `tmp/exports/*/json/*_matches.json`
- 선수 상세전적(CSV): `tmp/exports/*/csv/*_상세전적*.csv`
- 일일 리포트: `tmp/reports/*`
