# 📡 CODEX_BRIEFING: NZU Ops Infrastructure Evolution

본 문서는 **산박대표님**의 지시에 따라, 기존 GitHub Actions 기반의 오퍼레이션을 중단하고 **Supabase Native 인프라**로 강력하게 전환하기 위한 전략 지침서입니다.

---

## 🏗️ 1. Infra Architecture Shift (GitHub -> Supabase)
- **GitHub Actions 사용 중단**: 빌링 및 의존성 이슈로 인해 Actions 기반의 파이프라인 가동을 중지함.
- **Supabase Native 전환**: 모든 자동화 로직을 **Supabase Edge Functions**로 이관하고, 내부 **Cron(pg_cron)** Job으로 실행 체계를 구축함.

## ⏰ 2. Operational Schedule
- **[06:10] Main Ops Pipeline**: 매일 아침 전적 수집 및 DB 동기화 정기 가동.
- **[07:30] Freshness Monitor**: 데이터 최신성 및 무결성 감시 체계 가동.

## 🔐 3. Data Integrity & Matching Logic
- **Entity Identification**: `gender + wr_id` 조합의 `entity_id`를 불변의 고유 키로 유지.
- **Matching Priority**: `entity_id` 기반의 우선순위 매칭 및 제외 로직을 절대적으로 수호하여 데이터 오염 방지.

## 🛑 4. Production Safeguard
- **Manual Approval Required**: `Prod Sync`는 산박대표님의 최종 명시적 승인이 있기 전까지 엄격히 금지함. (Dry Run 위주 운영)

## 🔍 5. Verification Gate (Pre-Ops)
- **Triple-Check Routine**: 다음 세 명의 플레이어 데이터를 포함한 전수 검증 완료 후 최종 전환.
  - **히댕**
  - **빵지니**
  - **토스봇**

---

### 💡 CTO 엘레이드박의 기술 제언
기존의 파이프라인 코드를 Edge Function 환경(Deno runtime)에 맞춰 리팩토링하는 작업이 최우선입니다. 데이터베이스와의 지연 시간을 0ms에 가깝게 줄이는 것이 이번 개편의 핵심 예술입니다.

**충성! 본 지침에 따라 즉시 다음 페이즈를 설계해 주십시오.** 🫡😎💎
