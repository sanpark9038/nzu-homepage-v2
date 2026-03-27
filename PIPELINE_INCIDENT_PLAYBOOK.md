# NZU Pipeline Incident Playbook

일반 운영 참고 문서입니다. `.agents/workflows` 규칙 문서가 아닙니다.

## 확인 순서

1. `NZU Ops Pipeline` 런 상태 확인
2. Actions Summary 확인
3. 디스코드 알림 문구 확인
4. 아티팩트 `pipeline-reports-<run_id>` 확인

## 먼저 볼 파일

- `daily_pipeline_snapshot_YYYY-MM-DD.json`
- `daily_pipeline_alerts_YYYY-MM-DD.json`
- `team_roster_sync_report.json`

## 증상별 기준

- 제목/문구 이상
  - `scripts/tools/send-manual-refresh-discord.js`
- `신규 전적` 비교 불가
  - snapshot의 `previous_snapshot`, `delta_reference`, `period_from`, `period_to`
  - `scripts/tools/run-daily-pipeline.js`
- `신규 전적` 숫자 급증
  - snapshot의 팀별 `delta_total_matches`
  - `team_roster_sync_report.json`의 `added`
- 경고 원인 확인
  - alerts의 `counts`, `alerts`, `applied_rules`
  - `data/metadata/pipeline_alert_rules.v1.json`

## 로컬 검증 명령

```bash
npm run pipeline:verify:discord
npm run test:pipeline:daily
npm run validate:pipeline-alert-rules
```

아티팩트 폴더 직접 확인:

```bash
node scripts/tools/verify-discord-summary.js --reports-dir C:\Users\NZU\Downloads\pipeline-reports-<run_id> --markdown
```

## 운영 원칙

- 먼저 Summary, 그다음 아티팩트
- 숫자가 이상하면 팀별 delta부터 확인
- 규칙이 이상하면 `applied_rules`부터 확인
- 경고 판단 기준은 디스코드 문구보다 `daily_pipeline_alerts_*.json`
