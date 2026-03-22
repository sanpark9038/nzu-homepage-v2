# NZU Tomorrow Runbook

## 1) 새 터미널에서 시작할 때 입력할 문구
아래 문구를 그대로 입력:

`TOMORROW_RUNBOOK.md 기준으로 어제 작업 이어서 진행해줘. 06:10 자동실행 결과부터 점검하고 필요한 후속작업까지 처리해줘.`

## 2) 내일 첫 체크 (06:10 이후)
1. 디스코드 알림 도착 여부 확인
2. 최신 리포트 확인
   - `tmp/reports/ops_pipeline_latest.md`
   - `tmp/reports/ops_pipeline_latest.json`
3. 06:20 누락 감시 결과 확인 (신규)
   - `node scripts/tools/check-ops-pipeline-freshness.js`

## 3) 실패/이상 시 즉시 실행
1. 수동 재실행
   - `node scripts/tools/run-ops-pipeline.js`
2. 점검용(실행 없이 단계 확인)
   - `node scripts/tools/run-ops-pipeline.js --dry-run`
3. 로컬 파이프라인만 점검
   - `node scripts/tools/run-ops-pipeline.js --skip-supabase`

## 4) 현재 자동화 상태 (완료)
- 작업 스케줄러: `NZU_Ops_Pipeline_0610` (매일 06:10)
- 누락 감시 스케줄러: `NZU_Ops_Pipeline_0620_HealthCheck` (매일 06:20)
- 실행 파일: `scripts/tools/run-ops-pipeline.cmd`
- 메인 실행기: `scripts/tools/run-ops-pipeline.js`
- 감시 실행기: `scripts/tools/check-ops-pipeline-freshness.js`
- 디스코드 알림: `.env.local`의 `OPS_DISCORD_WEBHOOK_URL` 사용

## 4-1) 스케줄러 재등록(권장)
- `npm run schedule:ops:win`

## 5) 반영된 핵심 보호장치
- 부분 팀 동기화 기본 차단 (`--teams` 단독 실행 방지)
- 원천 페이지 일시 장애 시 팀별 보호(guard) 적용
- FA 소스 미수집 시 자동 FA 이동 금지
- alias 충돌 수동 고정:
  - `eloboard:female:398` -> `c9 / 나무늘봉순`
  - `eloboard:female:777` -> `c9 / 히댕`
  - `eloboard:female:646` -> `yb / 빵지니`

## 6) 내일 우선순위 작업
1. 06:10 실행 결과 정상 여부 확인
2. `ops_pipeline_latest.md` 요약 보고
3. 변동사항(신규 경기/소속/티어) 보고
4. 이상 없으면 홈페이지 기능/디자인 작업으로 전환

## 7) 보안 주의
- 디스코드 웹훅 URL은 절대 채팅에 원문 공유 금지
- 노출 시 즉시 폐기(재발급) 후 `.env.local` 교체
