# 파이프라인 구조 지도

한 선수의 정보가 **어디에 살고, 무엇이 이기고, 어떻게 사이트까지 가는지**를 적는다.
2026-07-20 하루 동안 이 구조를 몰라서 두 번 오판했고 사고 다섯 건이 이것 때문에 숨어 있었다.
설계 문서는 [PIPELINE_REDEFINITION.md](PIPELINE_REDEFINITION.md), 이 문서는 **현재 상태**다.

조사할 일이 생기면 문서보다 도구가 빠르다:
- `npm run pipeline:now` — 지금 상태와 대기 중인 결정
- `npm run player:truth -- <이름>` — 선수 한 명의 다섯 층과 어긋난 곳

---

## 1. 선수 정보가 사는 다섯 층

아래로 갈수록 나중에 적용된다. **아래가 위를 덮는다.**

| # | 층 | 어디 | 무엇을 정하나 |
|---|-----|------|--------------|
| 1 | 엘로보드 관측 | 외부 사이트 | 소속·티어·종족의 원천. 우리가 통제 못 함 |
| 2 | 로스터 파일 | `data/metadata/projects/<팀>/players.<팀>.v1.json` | **수집 대상**과 기본 소속. 관측을 받아 적은 결과 |
| 3 | 로컬 교정 | `data/metadata/roster_manual_overrides.v1.json` | 관측이 틀렸을 때의 수동 교정 |
| 4 | 원격 교정 | Supabase `roster_admin_corrections` | 같은 목적. **로컬을 덮는다** (커밋 없이 반영하려고) |
| 5 | 표시명 | 로스터 파일의 `display_name` | 사이트에 보일 이름 (방송명) |

**함정 1** — 교정을 지우면 "관측값이 적용"되는 게 아니라 **2층(로스터 파일)의 값이 드러난다.**
파일이 낡았으면 낡은 값이 나온다. 교정 해제와 파일 갱신은 짝으로 해야 한다.

**함정 2** — 3층과 4층이 서로 다를 수 있다. 파일만 보고 판단하면 틀린다.
(2026-07-20: 예실의 교정이 파일엔 `fa`, 원격엔 `bgm`이었다)

---

## 2. 값이 사이트에 나오기까지

```
엘로보드 관측
   ↓  sync-team-roster-metadata.js
로스터 파일  ← 파이프라인은 --report-only라 평소엔 안 쓴다(운영자 검토 후 갱신)
   ↓  supabase-staging-sync.js — 교정을 덮어씌우고 players_staging에 적재
   ↓  supabase-prod-sync.js   — serving_identity_key로 players에 upsert
서빙 DB (players)
   ↓
사이트
```

**서빙 행이 쓰는 값**
- 이름 → `display_name || name` (방송 표시명 우선)
- 소속 → `team_name` (팀 코드가 아니라 팀 이름)
- 매칭 키 → `serving_identity_key` (`성별:번호`, 예 `female:948`)

**함정 3** — 로스터 파일이 갱신되지 않으면 **수집 대상도 낡은 채로 굳는다.**
(2026-07-20: 신세계 파일에 2명뿐이라 나머지 10명이 수집도 표시도 안 됐다)

---

## 3. 수집에서 빠지는 경로 (조용한 미수집의 원인)

선수가 로스터에 있어도 아래 중 하나에 걸리면 수집되지 않는다.

| 출처 | 매칭 기준 | 위험 |
|------|----------|------|
| `pipeline_collection_exclusions.v1.json` | entity_id / wr_id+이름 / wr_id | 낮음 (신원 기반) |
| Supabase 교정의 `excluded` 필드 | entity_id | 낮음 |
| **상대선수 "외부인" 결정** | **이름만** | **높음 — 동명이인이 걸린다** |

세 번째가 2026-07-20 사고의 원인이다.
`opponent_identity_review_decisions.v1.json`에서 `external_opponent`로 표시된 이름이
그대로 수집 제외 규칙이 되고, 같은 이름의 우리 선수가 함께 빠진다.
김설·앵지·박정일이 이렇게 두 달간 누락됐고, 아무 신호도 없었다.

지금은 이 상황이 발생하면 아침 보고에 경보가 뜬다
(`roster_player_excluded_by_opponent_name`, severity=medium — 동기화를 막지는 않는다).

**닫힌 고리 주의**: 우리 선수가 외부인으로 잘못 분류되면 → 수집 제외 → 본인 기록 없음
→ 상대 이름을 본인과 연결 못 함 → 계속 외부인으로 남는다. 스스로는 못 빠져나온다.

---

## 4. 자동 판정이 하는 일과 못 하는 일

임시(`temporary`) 교정만 매일 엘로보드와 대조한다.

- 교정 == 관측 → **해제** (교정이 불필요해졌으므로 지운다)
- 교정 != 관측 → **유지 + "확인 필요" 보고**
- 관측 tier/race가 빈값·`-`·`미정` → **정보 없음**으로 보고 비교에서 제외
  (소속은 항상 관측되므로 이 완화를 적용하지 않는다)
- 엘로보드에 아예 없음 → 대조 불가. 영원히 "확인 필요"로 남는다
  → 사람이 확인한 건은 `fixed`로 바꿔 자동 판정에서 뺀다 (YB팀이 쓰는 방식)

`fixed` 교정은 소속만 적용되고 **티어·종족은 적용되지 않는다.**

---

## 5. 믿으면 안 되는 것

| 대상 | 왜 |
|------|-----|
| `tmp/` 아래 모든 산출물 | 마지막 로컬 실행 시점에 멈춰 있다. 날짜를 반드시 확인 |
| `npm run pipeline:status` | 위 파일들을 읽는다. 최신처럼 보이지만 아닐 수 있다 |
| 로스터의 `last_checked_at` | 비어 있어도 수집된 선수가 있다 |
| 엘로보드 티어 `-` | 값이 아니라 "표기 없음"이다 (정규화해서 쓴다) |

**수집 여부를 판단하는 올바른 기준**: Supabase `players.match_history` 행 수와 `last_synced_at`.

---

## 6. 선수 대장 통합 (진행 중)

같은 사실이 여러 파일에 복제된 문제의 근본 해결책은
[PIPELINE_REDEFINITION.md](PIPELINE_REDEFINITION.md)의 **선수 대장 통합**이다.
예외/교정을 파일 하나(`data/metadata/player_ledger.v1.json`)로 합치고,
파이프라인 스크립트는 공유 로더 `scripts/tools/lib/player-ledger.js` 하나로만 읽는다.

**1일차 완료 (2026-07-21) — 파이프라인 전용 영역:**
- 삭제: `identity_alias_exceptions.v1.json`(0건, 역할 소멸) + 그 체커/`check:metadata:identity-aliases`
  (predeploy 체인 포함) + `check-soop-id-collisions.js`의 죽은 참조.
- 대장으로 흡수 후 삭제: `opponent_identity_review_decisions.v1.json`(외부인/후보 결정 126건),
  `opponent_identity_aliases.v1.json`(상대 별명 3건). 리더 8곳 + validator를 로더로 전환.
- 검증: 옛/새 report-only diff 동일(`pipeline:now`·opponent coverage) + 계약 테스트(`test:player-ledger`) +
  파이프라인 테스트 전체 통과.

**남은 단계:** 2일차 = 서빙 영역(로스터 교정·숲ID·표시별명, `lib/player-serving-metadata.ts`) 흡수.
수집 제외(`pipeline_collection_exclusions`)는 관리자 화면도 읽어 별도 처리.
최종형은 §5대로 Supabase 테이블 — 대장 파일은 그 전까지의 단일 소스 겸 오프라인 스냅샷.
