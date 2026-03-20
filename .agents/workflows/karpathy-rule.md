---
description: Behavioral guidelines to reduce common LLM coding mistakes. Use when writing, reviewing, or refactoring code to avoid overcomplication, make surgical changes, surface assumptions, and define verifiable success criteria
---

# Karpathy Rule — LLM 코딩 실수 방지 원칙

Andrej Karpathy의 원칙을 NZU 프로젝트에 맞게 적용한 규칙입니다.
Codex에게 브리핑할 때 이 원칙 위반 여부를 항상 체크합니다.

---

## 핵심 원칙

### 1. 기존 패턴을 따라라 (Don't Invent New Patterns)
- 프로젝트에 이미 존재하는 방식을 먼저 찾고 따른다
- **NZU 프로젝트 적용**: 타입은 `@/types`에서, 서비스는 `@/lib/*-service`에서, DB 타입은 `@/lib/database.types.ts`에서
- 새 패턴을 만들기 전에 반드시 기존 코드를 먼저 탐색

### 2. 최소한으로 수정하라 (Surgical Changes Only)
- 요청받은 것만 수정하고, 연관된 것처럼 보여도 건드리지 않는다
- 리팩토링이 목적이 아니라면 코드 스타일을 바꾸지 않는다
- 파일 전체를 다시 쓰지 않는다

### 3. 추측하지 마라 (Never Assume, Always Verify)
- 타입의 정의가 어디 있는지 확인하기 전에 import하지 않는다
- API의 반환 타입을 추측하지 않는다
- 확인 불가한 내용은 주석으로 표시하고 Antigravity에게 보고

### 4. 성공 기준을 정의하라 (Define Verifiable Success)
- 작업 완료 조건을 구체적으로 명시한다
- TypeScript 에러가 0개인지, 빌드가 통과하는지 등 측정 가능한 기준 사용

---

## NZU 프로젝트 특이사항 (Codex 주의 목록)

| 실수 패턴 | 올바른 방법 |
|---|---|
| `Player` 타입을 `@/lib/player-service`에서 import | `@/types`에서 import |
| `H2HStats` 타입을 `@/lib/h2h-service`에서 import | `@/types`에서 import |
| `EloMatch`, `Match` 타입도 서비스 파일에서 import | 모두 `@/types`에서 import |
| `supabase` 클라이언트를 새로 생성 | `@/lib/supabase`에서 import |
| Tailwind v4 `@theme`, `@custom-variant` 경고 | 빌드 에러 아님, 무시 |
