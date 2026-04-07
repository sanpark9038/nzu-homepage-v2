# Main AI PPT Revision Note

Use this note to revise `docs/NZU_TECH_PPT_DRAFT.md`.

## Required Corrections

### 1. Remove the typo / mixed-language artifact

Current problematic text:

- `автомати화된 수집`

Replace it with:

- `자동화된 수집`

### 2. Lower the maturity claim

Current wording is too strong:

- `상용 서비스에 준하는 수준으로 견고`

Replace it with a safer expression such as:

- `핵심 구조는 비교적 성숙한 상태`
- `핵심 아키텍처는 이미 안정적인 방향을 갖추고 있음`

Reason:

The repository still contains transitional areas such as:

- live page mock behavior
- match/entry-board prototype behavior
- simple admin auth
- partial file-backed analytics

### 3. Do not present analytics migration as a decided roadmap

Current wording is too definitive:

- `파일 기반 통계를 Supabase 중심으로 딥 통합`

Replace it with something like:

- `분석 계층을 계속 파일 기반으로 유지할지, Supabase 중심으로 옮길지 아키텍처 결정을 명확히 할 필요가 있음`

Reason:

This is still an open technical decision, not a finalized roadmap item.

## Additional Requested Change

Add one slide or one section that clearly explains the project's current technical problems and bottlenecks.

It should include at least the following:

1. `players` is synced, but `matches` and `eloboard_matches` are still not ready for full public acceptance
2. some public surfaces are player-data-ready, but match-driven surfaces are still deferred
3. live page still contains mock or transitional behavior
4. match/entry-board flow is still a prototype UI, not a completed data-backed workflow
5. analytics currently uses a hybrid structure:
   - Supabase for serving
   - local files for some ops/analysis views
6. admin authentication is still simple and internal-use oriented
7. local build/runtime environment had a recorded `spawn EPERM` instability in some environments

## Tone Requirement

Keep the revision:

1. technically accurate
2. non-defensive
3. honest about current limitations
4. still favorable to the project by emphasizing architectural strengths without overselling completion

