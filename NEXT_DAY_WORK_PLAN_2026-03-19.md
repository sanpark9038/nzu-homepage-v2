# Next Day Work Plan (2026-03-19)

## 1) What Was Completed Today
- Built and stabilized the roster record pipeline in:
  - `scripts/tools/report-nzu-2025-records.js`
- Added robust men-page pagination handling:
  - `view_list.php` chained `last_id` traversal
  - fallback extraction for `next_last_id` from `input`, `a.more[id]`, and `div.morebox`
  - empty-page skip logic when next id exists
- Fixed outcome and dedup accuracy:
  - removed ambiguous row-text winner inference
  - dedup key includes set score
- Added detailed match export capability:
  - `--include-matches` in report script
  - player-specific CSV exporter in:
    - `scripts/tools/export-player-matches-csv.js`
- Added efficiency improvements:
  - controlled concurrency (`--concurrency`)
  - retry/backoff for network calls
  - incremental cache merge strategy
  - cache file:
    - `tmp/.cache/roster_report_cache.json`

## 2) Data Assets Generated
- Team metadata JSONs:
  - `tmp/nzu_roster_record_metadata.json`
  - `tmp/와플대_roster_record_metadata.json`
  - `tmp/yb_roster_record_metadata.json`
  - `tmp/수술대_roster_record_metadata.json`
- Player detailed exports (example):
  - `tmp/늪지대_연블비_matches.json`
  - `tmp/연블비_상세전적_2025-01-01_2026-03-19.csv`

## 3) Suggested Priority for Tomorrow
1. Add `player_source_rules.json` (special-case registry)
- Move hardcoded player exceptions out of code.
- Include endpoint mode per player (`view_list.php` / `mix_view_list.php`).

2. Add full-team detailed export mode
- Extend metadata exporter to optionally include per-match arrays.
- Output split:
  - `summary` dataset
  - `detailed` dataset

3. Add change-detection report
- Compare latest run vs previous snapshot.
- Report:
  - roster added/removed players
  - tier changes
  - record delta (wins/losses/total)

4. Hardening for large-scale ingestion (400 players target)
- Batch execution (team or chunk based)
- failure queue and rerun file
- per-player execution stats log (latency, retries, pages scanned)

## 4) Recommended Commands
```powershell
# Team summary run
node scripts/tools/report-nzu-2025-records.js --univ YB --json-only --concurrency 4

# Player detailed run
node scripts/tools/report-nzu-2025-records.js --univ 늪지대 --player 연블비 --json-only --include-matches

# Player CSV export
node scripts/tools/export-player-matches-csv.js --univ 늪지대 --player 연블비 --from 2025-01-01 --to 2026-03-19
```

## 5) Notes for Main Agent Commit/Push
- Commit only intentional code/data assets.
- Keep large debug HTML/log files out of commit.
- Keep metadata JSON and pipeline scripts in commit scope.
