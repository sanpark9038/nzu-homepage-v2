# GitHub Actions Debug Chunk1 Success

> Historical debug note.
> This document records a successful debug run for an older debug workflow configuration.
> It should not be treated as proof that the current debug workflow or current production workflow are identical.

## Purpose
This note records the successful outcome of the second `chunk1` debug run after applying the mix URL normalization fix.

The purpose of the debug run was to verify whether the GitHub Actions runner could collect correct results for the previously problematic players:
- `라히`
- `두폴조합`
- `빵훈`

## What Was Changed Before This Debug Run
The following fix was applied:
- `bo_table=bj_m_list` URLs are now normalized to the `women/bbs` namespace

This was implemented in:
- [eloboard-special-cases.js](/C:/Users/NZU/Desktop/nzu-homepage/scripts/tools/lib/eloboard-special-cases.js)
- [report-nzu-2025-records.js](/C:/Users/NZU/Desktop/nzu-homepage/scripts/tools/report-nzu-2025-records.js)
- [sync-team-roster-metadata.js](/C:/Users/NZU/Desktop/nzu-homepage/scripts/tools/sync-team-roster-metadata.js)

## Debug Workflow Used
Workflow:
- [ops-pipeline-debug-chunk1.yml](/C:/Users/NZU/Desktop/nzu-homepage/.github/workflows/ops-pipeline-debug-chunk1.yml)

Scope:
- only `bgm`, `black`, `c9`
- `--no-strict` (at the time of this debug run)
- `--no-team-table`
- `--no-organize`

This isolated the actual collection behavior from unrelated reporting steps.

Current note:
- the debug workflow has since been adjusted
- if re-validating today, read the current workflow file first instead of assuming this exact flag set still applies

## Result
The debug run succeeded at the data-quality level.

### Team results
- `BGM`: `zero_record_players = 0`
- `흑카데미`: `zero_record_players = 0`
- `씨나인`: `zero_record_players = 0`

### Alerts
- `critical = 0`
- `high = 0`
- `medium = 0`
- `low = 0`
- total alerts = `0`

### Recovery status
Previously problematic players were recovered successfully:
- `라히`
- `두폴조합`
- `빵훈`

The recovery summary now shows:
- no unrecovered players

## Interpretation
This confirms that the earlier GitHub Actions issue was not a general failure of the runner or the whole pipeline.

It was specifically tied to the handling of `bj_m_list` / mix-profile URLs.

After correcting that URL normalization:
- chunk1 collection quality matched expectations
- blocking zero-record anomalies disappeared
- the previously failing players were collected correctly

## Operational Meaning
The GitHub Actions path is now in a much better state.

At least for the debug chunk:
- the collection logic is functioning correctly
- the known runner-specific failure pattern has been addressed

## Recommended Next Step
Run the main workflow again:
- [ops-pipeline-cache.yml](/C:/Users/NZU/Desktop/nzu-homepage/.github/workflows/ops-pipeline-cache.yml)

And verify:
1. full 14-team workflow completion
2. Discord summary delivery
3. Supabase sync completion
4. final pipeline status output

## Conclusion
The chunk1 GitHub Actions debug run should now be considered a success.

The previously identified blocker has been fixed, and the next valid step is to retest the full workflow.
