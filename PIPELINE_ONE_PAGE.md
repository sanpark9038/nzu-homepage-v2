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
   - 긴 작업 권장: `npm run pipeline:collect:chunked`
   - 06:10 자동실행 명령:
     - `scripts/tools/run-ops-pipeline.cmd`
     - 실제 실행: `node scripts/tools/run-ops-pipeline-chunked.js --chunk-size 3 --inactive-skip-days 14`
   - 의미: 데이터 수집/검증/리포트 생성까지만 수행, Supabase 반영 안 함
   - 대략 소요시간:
     - 전체 팀: 약 15~40분 (네트워크/변동량에 따라)
     - 단일 팀 점검: 약 3~8분
   - 기본 증분 정책:
     - `--use-existing-json` 사용
     - `--inactive-skip-days 14` 사용
     - 최근 활동이 없는 선수는 기존 JSON/CSV 재사용
   - 빠른 재점검(단일 팀):
     - `node scripts/tools/run-ops-pipeline.js --skip-supabase --teams c9 --inactive-skip-days 14`
   - 청크 실행 결과:
     - `tmp/reports/ops_pipeline_chunked_latest.json`
     - 각 청크별 PASS/FAIL, 경과시간, stderr tail 확인 가능
     - 참고: 청크 모드는 `daily_pipeline_snapshot_YYYY-MM-DD_HHMMSS-chunkN.json` 형태로 저장(덮어쓰기 방지)
     - 실행 끝나면 자동으로 `daily_pipeline_snapshot_YYYY-MM-DD.json` 통합본 생성

2. 결과 확인
   - `tmp/reports/ops_pipeline_latest.md`
   - `tmp/reports/daily_pipeline_snapshot_YYYY-MM-DD.json`
   - `tmp/reports/metadata_review_current.csv` (필요 시 재생성)

3. 승인 후 Supabase 반영
   - `npm run pipeline:push:approved`
   - 의미: staging -> prod 순서 반영

## 수동 운영
- PC를 켠 뒤 한 번에 갱신:
  - `npm run pipeline:manual:refresh`
- 결과만 빠르게 확인:
  - `npm run pipeline:status`
- 권장 방식:
  - 평소에는 홈페이지가 Supabase 데이터만 읽도록 유지
  - 수집은 필요할 때만 수동 실행

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
