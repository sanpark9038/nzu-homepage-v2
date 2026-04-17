# TASK

## Next Session

- stale SOOP snapshot 불일치(`stale_snapshot_disagreement_count`)를 운영 지표로 더 분리할지 검토
- 별칭형 예외 규칙이 더 필요한지 주기적으로 검토
- 필요 시 integrity 리포트 actionable 항목만 더 줄이기

## Notes

- 대회 관리(`/admin/tournament`)는 1회성 운영 레이어다
- 대회 팀 데이터는 기존 대학/파이프라인 로스터와 완전히 분리한다
- 대회 관련 수정은 대회 전용 파일과 UI 범위 안에서만 한다
- SOOP 라이브 스냅샷은 선수 신원 필드를 덮어쓰지 않도록 이미 수정함
- stale snapshot은 현재 라이브 상태를 덮어쓰지 않으며, 불일치 건수는 관측용 지표다

## Done Recently

- 메타데이터 안정화 작업 시작 및 검증 루틴 정리
- `player-service.ts`에서 신원 보정, 대학 정규화, 라이브 오버레이, 검색 alias 책임 분리
- `name`, `display_name`, `nickname`, `soop_id` 의미와 우선순위 고정
- `유즈/히요코` 같은 신원 오염 재발 방지
- `soop_id` 충돌 자동 검증 스크립트 추가
- `wr_id`와 로스터 이름 충돌 자동 검증 추가
- 별칭형 예외 규칙 정리: `전흥식/킁식`, `박종승/빡죠스`, `박단원/탱크`
- 배포 전 점검 루틴 정리: `tsc`, `build`, 메타 충돌 검사
- 홈페이지 integrity 리포트에서 stale snapshot override 위험도와 불일치 건수 분리
- FA/WFU 누락 display alias 적용: `강민기 -> 쿨지지`, `이광용 -> 프발`, `허유진 -> 허유`
- `유즈` 상세에서 `히요코`가 보이던 문제 원인 확인 및 차단
- `xzqwe1` 충돌 정리: `김태향` 제거, `황단비` 기준 유지
- `/admin/tournament`에서 방출 시 팀장 ID 정리, 검색 문구 정리, 중복 로그아웃 버튼 제거
- `/tier` 대학 필터 누락 보정: `늪지대`, `NZU`, `연합팀` -> `FA`
