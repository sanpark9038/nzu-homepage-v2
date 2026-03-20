---
description: Dual-Agent Orchestration Protocol — Antigravity (Main) + Codex CLI (Sub)
---

# 🏟️ NZU 프로젝트 듀얼 에이전트 오케스트레이션 프로토콜

## 역할 정의

| 에이전트 | 역할 | 절대 하지 않는 것 |
|---|---|---|
| **Antigravity (엘레이드박)** | 분석·감독·브리핑 작성·검토·아키텍처 결정 | 코드 직접 수정 (단, TASK.md·CODEX_BRIEFING.md 제외) |
| **Codex CLI** | 코드 수정·스크립트 실행·파일 편집 | 아키텍처 결정 |
| **산박대표님** | 목표 제시·Codex 트리거 입력·최종 승인 | — |

---

## 표준 작업 루틴

### 1단계: 대표님 → Antigravity (목표 전달)
대표님이 목표, 에러, 아이디어를 Antigravity에게 설명합니다.

### 2단계: Antigravity → 분석
Antigravity가 관련 파일을 읽고 문제를 정확히 파악합니다.

### 3단계: Antigravity → CODEX_BRIEFING.md 작성
브리핑 파일을 프로젝트 루트에 생성합니다.
브리핑 형식은 `/codex-briefing` 워크플로우를 따릅니다.

### 4단계: 대표님 → Codex CLI (트리거)
Codex CLI 터미널에 아래 **표준 명령어**를 입력합니다:

```
Read CODEX_BRIEFING.md in the project root and execute all tasks described. Delete the file when all tasks are complete.
```

### 5단계: Codex CLI → 작업 실행
Codex가 CODEX_BRIEFING.md를 읽고 명시된 작업을 수행합니다.

### 6단계: 대표님 → Antigravity (결과 보고)
작업 완료 후 에러나 결과를 Antigravity에게 알립니다.

### 7단계: Antigravity → 검토 및 TASK.md 업데이트
결과를 검토하고 필요 시 추가 브리핑을 작성하거나 TASK.md를 갱신합니다.

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
2. **코드 수정 금지** — "작업을 진행"이라는 명시적 지시 없이는 코드를 수정하지 않습니다.
3. **추측 금지** — 파일을 읽고 확인한 사실만 보고합니다.
4. **브리핑은 외과적으로** — Codex에게 넘기는 작업은 Before/After 코드 블록으로 명확하게 작성합니다.
5. **아키텍처 수호** — 프로젝트의 기존 패턴(타입 경로, 폴더 구조, 네이밍 등)을 학습하고 Codex가 이를 위반하지 않도록 감시합니다.
