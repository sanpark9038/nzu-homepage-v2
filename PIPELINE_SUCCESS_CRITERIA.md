# HOSAGA Pipeline Success Criteria

## Goal
- Stable collection
- Accurate reports
- No unintended production writes

## Safe Default
- Default manual refresh is collect-only:
  - `npm run pipeline:manual:refresh`
- Default ops pipeline is collect-only:
  - `npm run pipeline:ops`
- Supabase sync is explicit opt-in only:
  - `npm run pipeline:manual:refresh:with-sync`
  - `npm run pipeline:ops:with-sync`

## A Run Counts As Healthy Only If
1. `npm run test:pipeline:daily` passes
2. `npm run validate:pipeline-alert-rules` passes
3. `npm run pipeline:manual:refresh` exits `0`
4. `npm run pipeline:status` shows:
   - current snapshot exists
   - no `critical` alerts
   - no `high` alerts
   - no `fetch_fail`
   - no `csv_fail`
5. `npm run pipeline:verify:discord -- --markdown` shows:
   - snapshot path present
   - alerts path present
   - joiners/deltas consistent with snapshot

## Rules
1. Do not treat a run as healthy only because collection finished
2. Do not run production sync with anon key
3. Do not run production sync unless `SUPABASE_SERVICE_ROLE_KEY` is configured
4. If row counts are unexpectedly low, fail immediately

## Current Operating Mode
- Collection/reporting: allowed
- Discord summary verification: allowed
- Supabase sync: blocked unless service-role environment is present and explicitly requested
