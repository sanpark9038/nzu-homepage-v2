# 🚀 NZU 프로젝트 작업 현황 및 로드맵 (TASK.md)

> **관리**: Antigravity (엘레이드박) | **실행**: Codex CLI | **최종결정**: 산박대표님
> 이 파일은 듀얼 에이전트 오케스트레이션 시스템의 단일 진실 공급원(Source of Truth)입니다.

---

## ✅ 완료된 작업 (Completed)

### [2026-03-20] 듀얼 에이전트 오케스트레이션 시스템 구축 & UI/UX 개편
- `.agents/workflows/` SOP 폴더 생성 (Protocol, Briefing, Karpathy Rule)
- **홈 화면(page.tsx) 리팩토링**: LCK 스타일 미니멀리즘 도입, 정보 위계 정립 완료 ✨
- **선수 페이지(players/page.tsx)**: Sticky Filter UI 도입 및 레이아웃 개선 완료
- **엔트리 페이지(/entry) 대개조**: 
    - **가변형 분할 콕핏(Resizable Split-Cockpit)** 구축 (네온 리사이즈 핸들 탑재) 🦾📐
    - **전략적 분석 대시보드(Detailed Analysis)** 복원 및 선택 워크플로우 최적화 완료
- **타입 에러 박멸**: `MatchForm.tsx`, `H2HLookup.tsx`, `page.tsx` 내 Supabase 타입 모호성 및 Import 경로 수정 완료
- **공용 UI 컴포넌트 강화**: `TierBadge` 전역 사이즈(xs/sm/md/lg) 확장성 확보 (`nzu-badges.tsx`)
- **VSCode 최적화**: `.vscode/settings.json` 생성하여 Tailwind v4 `@theme` 경고 제거 완료

---

## 🏗️ 현재 진행 중 (In Progress)

### 📊 데이터 파이프라인 고도화 (Codex CLI 집도 중)
- [x] NZU 14인 상세전적 일괄 생성 배치 스크립트 추가 (`export:nzu:detailed`)
- [ ] **임시 데이터 검증 페이지(Verification Page)** 구축 중 (Codex CLI 담당) 🛰️
- [ ] **증분 집계(Incremental Aggregation)** 시스템 구축
    - `fact_matches`, `dim_player_roster_history` 구조 설계 진행
    - `build-aggregates-incremental.js` 구현 및 스키마 정의 진행 중
- [ ] 3개 주요 CSV 스키마 정의 및 연동

---

## 📋 다음 우선 작업 (Backlog)

### 🎨 UI/UX 프리미엄 폴리싱 (기획 완료 / 실행 대기)
- [ ] `CODEX_BRIEFING.md` 작성 완료 (UI-ONLY)
- [ ] 전역 스페이싱 시스템 정비 (`globals.css`)
- [ ] 네비게이션바 & 선수 카드 디테일 강화

### 🔐 보안 심폐소생술 (신규 발견)
- [ ] **RLS 활성화**: `eloboard_matches` 테이블 보안 정책 누락 해결 (URGENT) 🚨
- [ ] **정책 정교화**: `players`, `sync_logs` 등 `USING(true)` 만능 정책을 권한 기반으로 수정

---

## 📂 핵심 파일 맵

```
app/
├── globals.css              ← Tailwind v4 표준 스타일 (경고 0개)
├── page.tsx                 ← 홈 화면 (리팩토링 완료)
├── players/page.tsx         ← 선수 목록 (Sticky Filter 완료)
└── entry/page.tsx           ← 가변형 전략 사령부 (Resizable UI 완료)
```

---

*마지막 업데이트: 2026-03-20 18:05 (Antigravity / 엘레이드박)*
