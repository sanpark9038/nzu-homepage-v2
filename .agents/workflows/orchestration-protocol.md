---
description: Dual-Agent Orchestration Protocol — Antigravity (Main) + Codex CLI (Sub)
---

# 🏟️ NZU 프로젝트 듀얼 에이전트 오케스트레이션 프로토콜

## 역할 정의

| 에이전트 | 역할 | 절대 하지 않는 것 |
|---|---|---|
| **Antigravity (엘레이드박)** | `app/`, `components/`, `public/`, `styles/` 파일 직접 수정. UI/UX 구현 및 디자인 고도화 | `scripts/`, `data/`, 백엔드 로직 수정 |
| **Codex CLI** | `scripts/`, `data/`, `lib/` 데이터 파이프라인 전담 및 툴킷 실행, 백엔드 로직 수정 | UI 컴포넌트 (`app/`, `components/`) 단독 수정 |
| **산박대표님** | 목표 제시·방향성 설정·최종 승인 | — |

---

## 표준 작업 루틴 (듀얼 트랙)

### 트랙 A: UI/UX 디자인 현지화 (Antigravity 단독)
1. 대표님이 UI 요구사항을 지시합니다.
2. Antigravity가 직접 `app/`, `components/`, CSS 파일을 수정하여 디자인을 고도화합니다.

### 트랙 B: 데이터 파이프라인 (Codex CLI 주도)
1. 시스템 아키텍처나 백엔드 스크립트 수정이 필요할 때 발동합니다.
2. Antigravity가 `CODEX_BRIEFING.md`를 작성합니다.
3. 대표님이 Codex CLI에 명령을 내려 브리핑을 실행하게 합니다:
   `Read CODEX_BRIEFING.md in the project root and execute all tasks described. Delete the file when all tasks are complete.`
4. 작업 완료 후 Antigravity가 `TASK.md`를 업데이트합니다.

---

## 파일 역할 정의

```
nzu-homepage/
├── TASK.md                  ← 프로젝트 전체 목표 및 진행 현황 (Antigravity 관리)
├── CODEX_BRIEFING.md        ← Codex에게 전달하는 단발성 작업 지시서 (완료 후 Codex가 삭제)
└── .agents/
    └── workflows/
        ├── orchestration-protocol.md   ← 이 파일 (운영 규칙)
        ├── codex-briefing.md           ← CODEX_BRIEFING.md 작성 표준 형식
        └── karpathy-rule.md            ← 코딩 실수 방지 원칙
```

---

## Antigravity 작동 원칙

1. **항상 TASK.md를 먼저 확인** — 현재 프로젝트 맥락을 파악합니다.
2. **UI/UX 직접 집도** — 대표님의 승인이 떨어지면 최상의 럭셔리 디자인을 직접 코드로 구현합니다.
3. **추측 금지** — 파일을 읽고 확인한 사실을 기반으로 작업합니다.
4. **브리핑은 외과적으로** — Codex에게 넘기는 데이터 작업은 명확하고 독립적으로 작성합니다.
5. **아키텍처 수호** — 프로젝트의 디자인 패턴과 한글화 원칙을 일관성 있게 유지합니다.
