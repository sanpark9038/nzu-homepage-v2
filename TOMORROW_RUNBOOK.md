# NZU Tomorrow Runbook

## 1) 새 터미널에서 시작할 때 입력할 문구
아래 문구를 그대로 입력:

`TOMORROW_RUNBOOK.md 기준으로 어제 작업 이어서 진행해줘. GitHub Actions NZU Ops Pipeline 최신 실행 결과와 디스코드 알림부터 점검하고 필요한 후속작업까지 처리해줘.`

## 2) 내일 첫 체크
1. 디스코드 알림 도착 여부 확인
2. GitHub Actions `NZU Ops Pipeline` 최신 런 상태 확인
3. Actions Summary 확인
4. 최신 아티팩트 확인
   - `pipeline-reports-<run_id>`
   - `daily_pipeline_snapshot_YYYY-MM-DD.json`
   - `daily_pipeline_alerts_YYYY-MM-DD.json`
5. 필요 시 로컬 검증
   - `npm run pipeline:verify:discord`

## 3) 실패/이상 시 즉시 실행
1. 수동 재실행
   - `npm run pipeline:manual:refresh`
2. 점검용 검증
   - `npm run test:pipeline:daily`
   - `npm run validate:pipeline-alert-rules`
3. 디스코드 요약 재검증
   - `npm run pipeline:verify:discord`

## 4) 현재 자동화 상태 (완료)
- 기본 실행기: GitHub Actions `NZU Ops Pipeline`
- workflow 파일: `.github/workflows/ops-pipeline-cache.yml`
- 트리거:
  - schedule
  - `workflow_dispatch`
- 핵심 선행 검증:
  - `npm run test:pipeline:daily`
  - `npm run validate:pipeline-alert-rules`
- 디스코드 알림:
  - workflow 내 `send-manual-refresh-discord.js`
  - `OPS_DISCORD_WEBHOOK_URL` 사용
- Actions Summary:
  - `npm run pipeline:verify:discord -- --markdown`

## 4-1) 스케줄러 재등록(권장)
- 현재 기본 운영에서는 불필요
- Windows 로컬 스케줄러는 fallback 또는 별도 수동 운영 시에만 고려

## 5) 반영된 핵심 보호장치
- 부분 팀 동기화 기본 차단 (`--teams` 단독 실행 방지)
- 원천 페이지 일시 장애 시 팀별 보호(guard) 적용
- FA 소스 미수집 시 자동 FA 이동 금지
- alias 충돌 수동 고정:
  - `eloboard:female:398` -> `c9 / 나무늘봉순`
  - `eloboard:female:777` -> `c9 / 히댕`
  - `eloboard:female:646` -> `yb / 빵지니`

## 6) 내일 우선순위 작업
1. 최신 GitHub Actions 실행 결과 정상 여부 확인
2. Actions Summary와 디스코드 알림 내용 대조
3. 변동사항(신규 경기/소속/티어/경고) 보고
4. 이상 없으면 홈페이지 기능/디자인 작업으로 전환

## 7) 보안 주의
- 디스코드 웹훅 URL은 절대 채팅에 원문 공유 금지
- 노출 시 즉시 폐기(재발급) 후 `.env.local` 교체
