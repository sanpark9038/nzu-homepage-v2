# Supabase 연동 작업 전달문 (메인 AI용)

## 작업 목적
- 로컬 파이프라인으로 정제한 최신 데이터를 Supabase에 반영해, 배포 사이트가 정확한 데이터를 사용하도록 전환한다.

## 현재 상태 요약
- 로컬 파이프라인 안정화 완료.
- FA(무소속) 처리 로직 정리:
  - 원천 소스는 `연합팀` 페이지 기준.
  - FA roster 동기화 기준 인원: 63명.
- 수집 제외 규칙 반영:
  - `data/metadata/pipeline_collection_exclusions.v1.json`
  - 현재 제외 7명: 김수환(118), 김민교(162), 박한별(185), 이상호(402), 농떼르만(646), 엘사(777), 옥수수(1022)
- 수동 보정 보호(manual lock) 기능 반영:
  - `data/metadata/roster_manual_overrides.v1.json`
  - admin에서 저장 시 lock 유지 가능
  - 자동 sync가 lock 값을 우선 적용하도록 코드 반영됨
- 관련 최신 커밋:
  - `dd164af` feat(admin): add manual lock overrides to protect roster edits
  - `6036d88` feat(admin): add quick roster editor for team and tier updates
  - `ac52809` fix(pipeline): lock FA sync source and expand temporary exclusion list
  - `7f3ce06` feat(pipeline): ingest FA roster from alliance source and apply player exclusions
  - `e8d4ec3` feat(pipeline): stabilize daily incremental ingestion and refresh team metadata

## 핵심 요청
- Supabase의 기존 부정확 데이터 정리 후, 로컬 정제 데이터를 재적재(동기화)해달라.
- MCP로 Supabase 접근 가능한 메인 AI가 실행해달라.

## 중요 안전 원칙 (반드시 준수)
1. 전체 삭제 전 백업
- 운영 테이블 백업 생성(예: `players_backup_YYYYMMDD`, `eloboard_matches_backup_YYYYMMDD` 또는 dump)
- 롤백 가능 상태를 먼저 확보

2. 대상 한정 정리
- 재적재할 서비스 데이터 테이블만 정리
- 스키마/권한/운영 메타 테이블은 비파괴 유지

3. 정제 데이터 기준 재적재
- 로컬 최신 산출물 기준으로 업서트/insert
- 중복 키/충돌 키 기준 명확히 적용
- FA 제외 7명 정책 반영 상태 유지

4. 검증 후 전환
- 행 수 비교 (팀별/선수별/기간별)
- 샘플 선수(예: 찌킹) 전적 일치 확인
- H2H/팀 합계 검증
- 이상 없으면 서비스 조회 경로 확정

## 원하는 실행 플로우 (제안)
- A. Supabase 현행 데이터 스냅샷 백업
- B. 대상 테이블 truncate/delete (트랜잭션 가능하면 트랜잭션)
- C. 로컬 정제 데이터 업서트
- D. 검증 쿼리 실행
- E. 결과 리포트 제출(카운트/샘플/오류)

## 검증 체크리스트
- FA roster 기준 인원/구성 확인
- 제외 7명은 수집/적재 제외 정책 유지 확인
- 찌킹(wr_id 704) 주요 값 점검:
  - tier=4, race=Zerg
  - period_total/wins/losses가 로컬 산출물과 일치하는지
- 팀별 총전적 합계가 로컬 snapshot과 큰 오차 없는지

## 참고 파일
- `data/metadata/projects/fa/players.fa.v1.json`
- `data/metadata/pipeline_collection_exclusions.v1.json`
- `data/metadata/roster_manual_overrides.v1.json`
- `scripts/tools/sync-team-roster-metadata.js`
- `scripts/tools/export-nzu-roster-detailed.js`
- `scripts/tools/run-daily-pipeline.js`
- `data/warehouse/*` (fact/agg)
- `tmp/reports/*` (latest snapshot/alerts/team sync report)

## 추가 요청
- 실행 전에 “백업 완료 여부” 먼저 보고
- 실행 후 “삭제/적재/검증 결과”를 표 형태로 요약 보고
