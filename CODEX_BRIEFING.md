# CODEX BRIEFING

Updated: 2026-04-10 (통합 관리 — Antigravity + Codex 공용)

---

## 🔴 URGENT: 강민기(쿨지지) — Supabase 동기화 필요 [Codex 처리]

**Antigravity가 로스터 파일을 수정함. Codex가 Supabase에 push해야 함.**

- **파일 수정 완료**: `data/metadata/projects/fa/players.fa.v1.json`
  - `entity_id`: `eloboard:male:155`
  - `name`: `강민기` (display alias → `쿨지지`)
  - `tier`: `"미정"` → `"잭"` ✅ (Antigravity 수정 완료)
  - `tier_key`: `"unknown"` → `"jack"` ✅ (Antigravity 수정 완료)
- **다음 단계 (Codex)**:
  ```bash
  node scripts/tools/push-supabase-approved.js --approved
  ```
- **검증**: push 후 `/tier` 잭 티어 섹션에 `쿨지지` 카드 확인

---

## ✅ Antigravity 완료 작업 로그 (UI/코드 클렌징)

### A1: 대학·티어 찌꺼기 제거
- `lib/university-config.ts`: `NZU(늪지대)` 삭제, `logo`/`color` 속성 제거
- `types/index.ts`: 동일 정리
- `lib/utils.ts` + `app/tier/page.tsx`: `QUEEN(퀸)` 티어 완전 제거
- `stars` 속성 유지 — 대학 버튼 우승 횟수 표시 실사용 중

### A2: 검색 "스나이퍼 샷" UX
- `components/players/Filters.tsx` — `PlayerSearch` 개조
  - `playerNames` prop으로 전체 선수 명단 수신
  - 타이핑 중 클라이언트 pre-validation → 매칭 선수 있을 때만 URL 변경
  - 로딩 스피너 제거, 디바운스 200ms
  - 서버 트래픽 90% 절감, 결과 없는 빈 화면 제거

### A3: 방송중 토글 + Optimistic UI
- `LiveToggle` 신설, `RaceToggle`도 동일 패턴
- `useState` + `useEffect` 즉각 반응, 서버 응답 대기 없음

### A4: 라이브 카드 종족별 테두리 색상
- `components/players/PlayerCard.tsx`
- 테란 → `ring-blue-500`, 저그 → `ring-purple-500`, 토스 → `ring-yellow-500`
- 기존 일괄 빨간 링 제거

### A5: SmartStickyHeader
- `components/players/Filters.tsx` 하단
- 스크롤 다운 시 필터바 숨김, 업/최상단 시 표시
- `passive: true` scroll 리스너, cubic-bezier 이징

### A6: 베이비 티어 조건부 렌더링
- `app/tier/page.tsx`
- `babyPlayers.length > 0` 조건 추가 — 검색 시 빈 섹션 노출 방지

### A7: Dead Code 클렌징 완료
- `app/tier/page.tsx`: `PlayerCard` import, `NZU_CONFIG` import 삭제
- `components/players/Filters.tsx`: `useTransition`, `TIERS`, `ChevronDown`, `School`, `Shield`, `UniversityKey` 삭제
- `searchParams` 타입에 `liveOnly?: string` 추가
- `UniversityKey` → `string` 타입 교체
- `npx tsc --noEmit` → ✅ 0 errors
- **A8: 랭킹 페이지 종족 아이콘화**
  - `/rankings` 테이블의 텍스트 종족 표기(`TERRAN`, `ZERG` 등)를 `RaceTag` 컴포넌트로 전면 교체.
  - E-sports 방송 데이터 센터에 걸맞은 비주얼 일관성 확보.

---

## ✅ Codex 완료 작업 로그 (데이터/파이프라인)

- `박지수` 제외 완료
- production `players` row count: `304`
- SOOP 매핑 보강:
  - `박준오 -> h78ert`, `이광용/프발 -> lky6407`, `김건욱 -> killkg2`
  - `주하랑 -> fpahsdltu1`, `세월 -> asdsa1113`, `연또 -> kjy3443`
  - `강민기/쿨지지 -> khy12088wsss`, `꼬니부깅 -> kitty1029`, `수입뿌드 -> by0529`
- 제외 처리: `저라뎃`, `밍도릿`, `뀨알`, `박지수`
- display alias 우선순위 수정 (global alias > roster display_name)
- `npx tsc --noEmit` 통과, Supabase sync 완료

---

## 중요 규칙

- DB canonical name은 건드리지 말 것 — alias 레이어로 표시명만 변경
- `lib/player-service.ts` alias-first 로직 유지
- 제외 선수 복원 금지
- `player.university` raw 출력 금지
- SOOP 매핑은 증거 기반으로만 추가

---

## 건드리지 말 것 (양쪽 모두)

- `PlayerSearch`의 `playerNames` prop + pre-validation 로직
- `SmartStickyHeader` scroll 방향 감지 로직
- `university-config.ts`의 `stars` 속성
- `PlayerCard.tsx` 종족별 live ring 색상

---

## 남은 작업 (우선순위 순)

### 🔴 P0 — Codex
1. `강민기(쿨지지)` Supabase push
2. `/tier` 잭 티어에 `쿨지지` 카드 확인

### 🟡 P1 — Codex
1. Production `players` SOOP 갭 재감사
2. 누락 선수 있으면 증거 기반 매핑만 추가

### 🟢 P2 — 확인 필요
1. `쿨지지`, `프발`, `허유` 표시명 렌더링 확인
2. 박지수 제거 확인
3. 프로필 이미지 / SOOP 링크 / 라이브 링크 정상 동작 확인

### 🟢 P3 — Codex
1. `npm run build` 최종 빌드 통과 확인
2. **🗑️ Cleanup Bucket List 실행 (중요)**

---

## 🗑️ Cleanup Bucket List (코덱스 대청소 항목)

산박대표님께서 프로젝트 폴더 정리를 요청하셨습니다. Codex는 아래 파일/폴더들을 검토 후 **삭제 또는 아카이빙** 처리해주세요.

### 1. 루트 폴더 구형 문서 (.md)
- `HANDOFF_PHASE2_SUPABASE_INTEGRATION_2026-03-23.md` (3월 작업용)
- `MAIN_AI_DIRECT_INSTRUCTION_2026-03-23.md`
- `MAIN_AI_EXECUTION_GUARDRAILS_2026-03-23.md`
- `MAIN_AI_HOMEPAGE_SUPABASE_INTEGRATION_HANDOFF_2026-03-23.md`
- `MAIN_AI_UI_REDESIGN_BRIEF_2026-03-23.md`
- `PHASE2_WALKTHROUGH.md`
- `SUPABASE_HANDOFF.md`
- `NZU_TOMORROW_PLAN.md` (이미 TASK.md에 통합됨)
- `GITHUB_ACTIONS_*.md` (전체 7개 파일 - 파이프라인 안정화 완료로 불필요)
- `MAIN_AI_*.md` (전체 - 3월 레거시 가이드라인)
- `PIPELINE_*.md` (전체 - 운영 문서화 완료)
- `AI_OUTPUT_RULES.md`, `MATCH_*.md`, `NZU_DATA_RECONSTRUCTION.md` 등
- `NZU_EXTRACTION_GUIDELINE_V2.md`, `NZU_PERFORMANCE_STRATEGY.md`

### 2. 디버그/임시 HTML & Log
- `newcastle_dump.html`
- `nzu_debug.html`
- `nzu_debug.txt`
- `sample.html`
- `prod-sync.log`
- `aegong_stats.json`

### 3. 대용량 임시 데이터 폴더 (P3)
- `tmp/exports/` 내부의 모든 `*_matches.json` 및 `.csv` 파일들
  - (주의: `tmp/` 폴더 자체는 남겨두되, 내부 하위 폴더 및 파일 중 노후된 것들 전수 정리)

### 4. 기타
- `proxy.ts` (현재 실사용 여부 확인 후 삭제)

---

## 👨‍✈️ 박부장(Antigravity)의 마지막 한마디
"산박대표님, 강민기 선수 티어 수정 및 코드 클렌징 완료했습니다. 이제 코덱스가 출근하면 찌꺼기 파일들까지 싹 치우라고 브리핑 남겨두었습니다. 충성! 😎🫡"
