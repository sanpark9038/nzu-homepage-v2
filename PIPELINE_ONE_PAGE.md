# NZU Pipeline (One Page)

## 목적
- 정확한 선수 데이터 수집
- 정확한 변동 알림
- Supabase 본반영은 명시적 opt-in 후에만 수행

## 핵심 원칙
1. **수집/검증과 본반영을 분리**
2. **승인 전에는 절대 prod sync 금지**
3. **일일 작업은 GitHub Actions 자동 실행 기준**

## 실행 흐름 (매일)
1. GitHub Actions `NZU Ops Pipeline` 실행
   - workflow: `.github/workflows/ops-pipeline-cache.yml`
   - cron: `10 21 * * *` UTC = 매일 06:10 KST
   - 실행 순서:
     - `npm ci`
     - `npm run test:pipeline:daily`
     - `npm run validate:pipeline-alert-rules`
     - `npm run pipeline:manual:refresh`
     - `npm run pipeline:status`
     - Discord 요약 발송
     - Discord summary 검증 결과를 Actions Summary에 기록
     - artifact 업로드 + cache save

2. 실제 수집/반영 진입점
   - `npm run pipeline:manual:refresh`
   - 내부 동작:
     - `run-ops-pipeline-chunked.js`
   - 기본값:
     - collect-only
     - Supabase sync 없음
   - Supabase sync가 필요할 때만:
     - `npm run pipeline:manual:refresh:with-sync`

3. 결과 확인
   - GitHub Actions Summary
   - artifact `pipeline-reports-<run_id>`
   - `tmp/reports/daily_pipeline_snapshot_YYYY-MM-DD.json`
   - `tmp/reports/daily_pipeline_alerts_YYYY-MM-DD.json`

## 수동 운영
- 수동 fallback 실행:
  - `npm run pipeline:manual:refresh`
- 수동 + Supabase sync:
  - `npm run pipeline:manual:refresh:with-sync`
- 결과만 빠르게 확인:
  - `npm run pipeline:status`
- Discord 요약 재검증:
  - `npm run pipeline:verify:discord`
- 권장 방식:
  - 기본은 GitHub Actions 자동 실행
  - 수동 실행은 재검증/재실행/fallback 용도

## 안전장치
- 회귀 테스트:
  - `npm run test:pipeline:daily`
- alert rules 검증:
  - `npm run validate:pipeline-alert-rules`
- 승인 게이트:
  - `push-supabase-approved.js --approved`
- 서비스 롤 키 필수:
  - `SUPABASE_SERVICE_ROLE_KEY` 또는 `SUPABASE_SERVICE_KEY`
- 운영 기준:
  - `PIPELINE_SUCCESS_CRITERIA.md`

## 문제 발생 시
1. 먼저 GitHub Actions Summary 확인
2. 그다음 artifact의 snapshot / alerts 확인
3. 로컬 검증:
   - `npm run pipeline:verify:discord`
   - `npm run pipeline:status`

## 데이터 저장 위치
- 선수 메타데이터: `data/metadata/projects/*/players.*.v1.json`
- 선수 상세전적(JSON): `tmp/exports/*/json/*_matches.json`
- 선수 상세전적(CSV): `tmp/exports/*/csv/*_상세전적*.csv`
- 일일 리포트: `tmp/reports/*`
