---
description: Behavioral guidelines to reduce common LLM coding mistakes. Use when writing, reviewing, or refactoring code to avoid overcomplication, make surgical changes, surface assumptions, and define verifiable success criteria
---

# Karpathy Rule — LLM 코딩 실수 방지 원칙


## 핵심 원칙

### 1. 기존 패턴을 따라라 (Don't Invent New Patterns)
- 프로젝트에 이미 존재하는 방식을 먼저 찾고 따른다
- **NZU 프로젝트 적용**: 타입/서비스 import는 실제 현재 코드 기준으로 확인하고, 가능하면 `@/types`, `@/lib/*-service`, `@/lib/database.types.ts` 패턴에 점진적으로 정렬한다
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
| `Player` 타입 import 경로를 추측 | 실제 현재 코드와 `types/index.ts`를 먼저 확인 |
| `H2HStats` 타입 import 경로를 추측 | 실제 현재 코드와 `types/index.ts`를 먼저 확인 |
| `EloMatch`, `Match` 타입 경로를 추측 | 실제 현재 코드와 `types/index.ts`를 먼저 확인 |
| `supabase` 클라이언트를 새로 생성 | `@/lib/supabase`에서 import |
| Tailwind v4 `@theme`, `@custom-variant` 경고 | 빌드 에러 아님, 무시 |

## 해석 메모

- 이 문서는 현재 코드를 점진적으로 더 일관되게 만들기 위한 참고 원칙입니다.
- 현재 코드베이스에 이미 혼재된 패턴이 있으면, 리팩토링 요청이 없는 한 기존 파일의 흐름을 우선합니다.
