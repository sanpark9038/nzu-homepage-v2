# AGENTS

This file is the short map for working in `nzu-homepage`.

Do not treat this file as an encyclopedia. Read it first, then follow the linked docs.

## Session Start

1. Read [docs/harness/SESSION_ENTRY.md](docs/harness/SESSION_ENTRY.md).
2. Run the required orient commands.
3. Check [docs/harness/exec-plans/active/](docs/harness/exec-plans/active/).
4. If the work can affect roster state, alerts, or reports, read [docs/RELIABILITY.md](docs/RELIABILITY.md).
5. If using `Codex CLI` or `Gemini`, read [docs/harness/MULTI_AGENT_WORKFLOW.md](docs/harness/MULTI_AGENT_WORKFLOW.md) and restate the role split before delegating.
6. Keep [docs/harness/DRIFT_HOOKS.md](docs/harness/DRIFT_HOOKS.md) in mind whenever the work starts expanding, branching, or losing a clear next step.

## Repo Map

- [README.md](README.md): high-level repo overview
- [ARCHITECTURE.md](ARCHITECTURE.md): layered system map
- [docs/README.md](docs/README.md): living docs index
- [docs/DESIGN.md](docs/DESIGN.md): design and harness philosophy
- [docs/PLANS.md](docs/PLANS.md): execution-plan rules and tech debt tracking
- [docs/RELIABILITY.md](docs/RELIABILITY.md): confidence, failure modes, and ops safety
- [docs/references/index.md](docs/references/index.md): normalized external references

## Current Ground Truth

- Product and technical scope: [docs/harness/PROJECT_SPEC.md](docs/harness/PROJECT_SPEC.md)
- Pipeline contract: [PIPELINE_DATA_CONTRACT.md](PIPELINE_DATA_CONTRACT.md)
- Daily pipeline overview: [PIPELINE_ONE_PAGE.md](PIPELINE_ONE_PAGE.md)
- Current harness rules: [docs/harness/README.md](docs/harness/README.md)
- Multi-agent role split: [docs/harness/MULTI_AGENT_WORKFLOW.md](docs/harness/MULTI_AGENT_WORKFLOW.md)
- Drift prevention hooks: [docs/harness/DRIFT_HOOKS.md](docs/harness/DRIFT_HOOKS.md)

## Operating Rules

- Keep guidance layered and short. Do not create one giant instruction document.
- Encode important decisions into repo-visible markdown. Hidden chat context is not durable.
- Prefer identifier-based reasoning over name-based reasoning for players and rosters.
- Treat fallback or inferred roster state as lower-confidence output until verified.
- Do not rename existing visible page, button, or filter labels unless the user explicitly asks for that wording change.
- Use active execution plans for multi-step work.

## LOCKED UI LABELS

These labels are locked.

- Do not rename, rewrite, translate, shorten, expand, or restyle these user-visible labels unless the user explicitly asks for a wording change.
- Treat navigation labels, CTA buttons, filter labels, placeholders, and major section headings as product copy, not cleanup targets.
- If a task changes behavior but not wording, preserve the exact existing label text.
- Source of truth for this section: `lib/navigation-config.ts` and the current public page components.

### Primary Navigation

- 홈
- 승부예측
- 티어표
- 선수
- 상대전적
- 엔트리
- 참가팀
- 팀 및 선수 순위

### Hidden Or Utility Navigation

- 대회일정
- 통합검색
- 메시지 알림
- 운영 알림
- LOGIN

### Home CTA Labels

- 엔트리 바로 시작
- 참가팀 확인

### Public Page And Section Labels

- 참가팀 명단
- 팀 랭킹
- 선수 랭킹
- 자동 매치 결과
- 상세 분석 리포트

### Match / Entry / Player Filters And Buttons

- 선수 이름을 입력하세요
- 왼쪽 학교 선택
- 오른쪽 학교 선택
- 대전용필터
- 자동 매치
- 현재 매치에 추가
- 기세 분석
- 닫기
- 매치 추가
- A팀 선수
- B팀 선수
- 선수 보기
- 선수 수
- 선수 상세는 카드를 선택해 확인

### Tier / Search / Empty State Labels

- 조건에 맞는 선수가 없습니다
- 검색어나 필터를 조금 더 넓게 조정해 보세요.

### Schedule Status Labels

- 마감
- 마감 임박
- 투표 중
- 공식 경기 일정 안내
- 예정된 경기가 없습니다.

## Drift Recovery

If the session gets noisy, stop and reset:

1. Re-run [docs/harness/SESSION_ENTRY.md](docs/harness/SESSION_ENTRY.md).
2. Re-open the active plan.
3. Check [docs/harness/FAILURE_MODES.md](docs/harness/FAILURE_MODES.md).
4. Continue only after the next step is explicit in repo docs.
