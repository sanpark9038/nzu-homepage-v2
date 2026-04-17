# Supabase Automation Handoff (for Main AI Agent)

## Context
- Goal: daily accurate player data update without GitHub Actions billing dependency.
- Current policy: do not run `supabase_prod_sync` until metadata verification is approved by user.
- GitHub Actions artifacts were removed from this repo.

## Required Outcome
1. Use Supabase-native scheduling (cron) to trigger automation daily.
2. Keep pipeline incremental-oriented (collect changed targets first, not full re-scan).
3. Alert only validated deltas.

## Recommended Architecture
1. **Edge Function A: `ops-trigger`**
   - Receives cron trigger from Supabase.
   - Executes minimal daily orchestration:
     - local/internal API endpoint call or worker trigger
     - run freshness check after expected completion window
2. **Edge Function B: `ops-freshness-check`**
   - Validates latest run timestamp/status.
   - Sends Discord warning when stale/missing/fail.
3. **Supabase cron jobs**
   - 06:10 KST: trigger `ops-trigger`
   - 07:30 KST: trigger `ops-freshness-check`

## Implementation Notes
- Keep secrets only in Supabase project secrets:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `OPS_DISCORD_WEBHOOK_URL`
- Do not print secrets in logs.
- Preserve current identity logic:
  - distinguish `women/bj_list`, `women/bj_m_list`, `men/bj_list`
  - treat entity identity as `gender + wr_id`
- Exclusion matching must stay `entity_id`-first.

## Verification Checklist
1. Dry-run succeeds without writing production.
2. Freshness-check warns when run is stale/missing.
3. Daily run creates expected reports and Discord summary.
4. Spot-check players:
   - 히댕 (female:777) included
   - 빵지니 (female:646) included
   - 토스봇 (male:398) correctly separated

## User Communication Rule
- Before any prod sync, request user confirmation with snapshot summary.
- Report ETA at start of each major task.

