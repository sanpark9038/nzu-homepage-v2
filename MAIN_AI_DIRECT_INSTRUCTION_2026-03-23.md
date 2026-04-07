# Main AI Direct Instruction

아래 두 문서를 먼저 읽고 그 기준으로 작업해 주세요.

1. [MAIN_AI_EXECUTION_GUARDRAILS_2026-03-23.md](C:/Users/NZU/Desktop/nzu-homepage/MAIN_AI_EXECUTION_GUARDRAILS_2026-03-23.md)
2. [MAIN_AI_HOMEPAGE_SUPABASE_INTEGRATION_HANDOFF_2026-03-23.md](C:/Users/NZU/Desktop/nzu-homepage/MAIN_AI_HOMEPAGE_SUPABASE_INTEGRATION_HANDOFF_2026-03-23.md)

중요:

- 현재 프로젝트는 새 데이터 엔진을 만드는 단계가 아니라, 이미 검증된 파이프라인/메타데이터/Supabase/홈페이지를 정확히 연결하는 통합 단계입니다.
- `implementation_plan.md`는 현재 실행계획으로 사용하지 말고 참고용 과거 문서로만 봐 주세요.

우선순위:

1. `lib/database.types.ts`를 실제 Supabase `players` 스키마에 맞게 업데이트
2. `lib/player-service.ts`와 주요 페이지들이 현재 Supabase 필드를 올바르게 소비하는지 점검
3. 홈페이지는 계속 Supabase를 serving source로 유지
4. tier 표현과 정렬 로직을 일관되게 정리

하지 말아야 할 것:

- 파이프라인 실행 체인을 새로 재설계
- public 페이지를 local JSON 직독 구조로 변경
- `implementation_plan.md` 기준으로 SSUSTAR형 신규 엔진을 우선 개발

작업은 먼저 작은 범위에서 안전하게 진행하고, 타입/필드 매핑 정합성부터 맞춰 주세요.

