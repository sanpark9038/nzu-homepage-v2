# NZU Pipeline Incident Playbook

이 문서는 일반 운영 참고 문서입니다.
`.agents/workflows` 규칙 문서가 아니며, 자동 지시서로 해석하지 않습니다.

## 목적

- 디스코드 알림 이상
- GitHub Actions 일일 파이프라인 이상
- 신규 전적/신규 합류/경고 집계 불일치

위 상황에서 어디부터 확인할지 빠르게 정리합니다.

## 기본 확인 순서

1. GitHub Actions 런 상태 확인
2. Actions Summary 확인
3. 디스코드 알림 문구 확인
4. 아티팩트 `pipeline-reports-<run_id>` 확인
5. 필요 시 로컬 검증 스크립트 실행

## 먼저 볼 것

### 1. 워크플로 성공/실패

- 워크플로: `NZU Ops Pipeline`
- 핵심 선행 검증:
  - `npm run test:pipeline:daily`
  - `npm run validate:pipeline-alert-rules`

여기서 실패하면 수집 단계 전에 막힌 것입니다.

### 2. Actions Summary

현재 워크플로는 Summary에 디스코드 검증 요약을 남깁니다.

중요 항목:
- `Comparable`
- `New Matches Total`
- `Joiners`
- `Alerts Count`
- `Top Team Match Deltas`

### 3. 디스코드 알림

정상 성공 알림 예시 구조:
- 제목: `산박대표님.일일 업데이트보고입니다.`
- `신규 합류`
- `신규 전적`
- 필요 시 `주의 알림`
- `실행 링크`

## 아티팩트에서 우선 확인할 파일

### 필수

- `daily_pipeline_snapshot_YYYY-MM-DD.json`
- `daily_pipeline_alerts_YYYY-MM-DD.json`
- `team_roster_sync_report.json`

### 자주 같이 보는 파일

- `ops_pipeline_chunked_latest.json`
- `manual_refresh_latest.json`

## 대표적인 증상별 확인 포인트

### A. 제목이나 문구가 이상함

확인 파일:
- `scripts/tools/send-manual-refresh-discord.js`

확인 내용:
- 제목 문자열
- 성공/실패 메시지 분기
- 경고 포함 조건

### B. `신규 전적`이 `직전 스냅샷 비교 불가`로 나옴

확인 파일:
- `daily_pipeline_snapshot_YYYY-MM-DD.json`
- `scripts/tools/run-daily-pipeline.js`

확인 필드:
- `previous_snapshot`
- `delta_reference.comparable`
- `delta_reference.prior_period_from`
- `delta_reference.prior_period_to`
- `period_from`
- `period_to`

의심 원인:
- 같은 날짜 snapshot을 이전 snapshot으로 잘못 선택
- `period_from`/`period_to` 비교 조건 불일치
- 캐시나 아티팩트 보존 문제

### C. `신규 전적` 숫자가 갑자기 커짐

먼저 볼 것:
- `daily_pipeline_snapshot_YYYY-MM-DD.json`
- `team_roster_sync_report.json`

확인 방법:
- 팀별 `delta_total_matches` 상위 팀 확인
- `team_roster_sync_report.json`의 `added` 확인
- `fetched_players` 증가 여부 확인

해석 예시:
- 신규 합류 선수 1명이 과거 누적 전적을 많이 갖고 있으면 총 신규 전적이 크게 뛸 수 있음

### D. 경고가 붙었는데 원인을 모르겠음

확인 파일:
- `daily_pipeline_alerts_YYYY-MM-DD.json`
- `data/metadata/pipeline_alert_rules.v1.json`

우선 볼 필드:
- `counts`
- `alerts`
- `applied_rules`

자주 보는 규칙:
- `zero_record_players_allowlist`
- `roster_size_changed_team_allowlist`
- `blocking_severities`

### E. 규칙 수정했는데 경고가 그대로임

확인 순서:
1. 최신 커밋이 `main`에 올라갔는지
2. 해당 런이 그 커밋 SHA를 사용했는지
3. Actions에서 사용한 아티팩트의 `applied_rules`가 기대값인지

주의:
- 과거에는 캐시가 metadata를 덮어써서 규칙이 되돌아간 적이 있음
- 현재는 캐시 범위를 줄였지만, 아티팩트의 `applied_rules`로 최종 반영값을 다시 확인하는 것이 안전함

## 로컬 검증 명령

### 디스코드 요약 검증

```bash
npm run pipeline:verify:discord
```

아티팩트 폴더 기준:

```bash
node scripts/tools/verify-discord-summary.js --reports-dir C:\Users\NZU\Downloads\pipeline-reports-<run_id> --markdown
```

### 일일 파이프라인 회귀 테스트

```bash
npm run test:pipeline:daily
```

### alert rules 검증

```bash
npm run validate:pipeline-alert-rules
```

## 자주 보는 코드 파일

- `scripts/tools/run-daily-pipeline.js`
- `scripts/tools/send-manual-refresh-discord.js`
- `scripts/tools/verify-discord-summary.js`
- `scripts/tools/lib/discord-summary.js`
- `.github/workflows/ops-pipeline-cache.yml`
- `data/metadata/pipeline_alert_rules.v1.json`

## 이번 운영에서 이미 반영된 안정장치

- 디스코드 제목 표준화
- snapshot 비교 로직 수정
- 같은 날짜 snapshot 오선택 방지
- FA 로스터 증감 경고 제외
- 캐시 범위 축소
- Summary 자동 기록
- snapshot 회귀 테스트 자동 실행
- alert rules 검증 자동 실행

## 운영 원칙

- 먼저 Summary를 보고, 그다음 아티팩트를 본다
- 숫자가 이상하면 팀별 delta부터 본다
- 규칙이 이상하면 `applied_rules`를 먼저 본다
- 경고 원인은 디스코드 문구보다 `daily_pipeline_alerts_*.json`이 기준이다
- 메타데이터/캐시 문제는 추측하지 말고 실제 아티팩트 값으로 확인한다
