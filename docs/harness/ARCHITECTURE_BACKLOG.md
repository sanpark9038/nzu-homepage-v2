# Architecture Backlog

This file captures architecture and performance candidates that should not be
implemented just because they were mentioned in chat or a handoff note.

Use it to keep the project aimed at the final objective:

- simple data pipeline
- stable collection and serving
- accurate identity-first canonical source data
- actionable operational alerts

## Intake Rule

Each item must be classified before implementation:

- `now`: current operator-approved objective
- `next`: likely high-value follow-up after the current objective
- `later`: valid but not urgent
- `hold`: needs more evidence or a policy decision

Promote only one `now` item into an active execution plan at a time.

## 2026-05-20 CTO-Style Review Intake

Source: operator-provided sub-AI report summary on 2026-05-20.

### A1. Player Serving Metadata File IO

- Area: `lib/player-serving-metadata.ts`
- Question: repeated synchronous roster/override file reads may add Vercel Function latency.
- Current classification: `now`
- Reason: serving path is hot enough to justify a small mtime cache guard, and
  the change avoids repeated project roster JSON parsing without changing
  public player semantics.
- 2026-05-20 partial: project roster overrides and SOOP identity overrides now
  use a project roster file mtime key and return cached maps when no
  `players.<code>.v1.json` file changed.
- Remaining work: if route timing still shows pressure, move project roster
  metadata into a generated serving artifact rather than scanning project
  directories at runtime.

### A2. Large Warehouse CSV Runtime Parsing

- Area: `data/warehouse/fact_matches.csv`, warehouse stats routes/helpers
- Question: large CSV parsing and in-memory multi-loop aggregation should move toward pre-aggregation.
- Current classification: `next`
- Reason: high data-growth risk and directly aligned with simple/stable serving.
- Next evidence needed: identify current route/helper hot paths and the smallest aggregate artifact that removes repeated runtime scans.
- 2026-05-20 partial: `lib/warehouse-stats.ts` now keeps overview requests on
  `agg_daily_player.csv` / `agg_daily_team.csv` and lazily reads
  `fact_matches.csv` only for player detail breakdowns.
- 2026-05-20 partial: the warehouse builder now emits
  `agg_player_detail_breakdowns.csv` for map, opponent, and opponent-race
  breakdowns, and `lib/warehouse-stats.ts` serves player detail requests from
  that aggregate instead of reading `fact_matches.csv`.
- 2026-05-21 decision: warehouse runtime serving should require only aggregate
  snapshots, not the raw fact CSV. `fact_matches.csv` remains the local
  source/verification input; `agg_daily_player.csv`, `agg_daily_team.csv`, and
  `agg_player_detail_breakdowns.csv` are the minimal serving inputs.
- 2026-05-21 transport decision: use an R2/public-base snapshot flow for those
  three aggregate CSVs. Approved sync rebuilds aggregates and uploads them when
  configured; deployment prebuild can download them when
  `WAREHOUSE_AGGREGATES_PUBLIC_BASE_URL` or an R2 public root is available.
- 2026-05-21 deployment follow-up: Vercel prebuild showed generic
  `R2_PUBLIC_BASE_URL` can point at the board-image bucket, so warehouse
  aggregate sync no longer uses that generic public base. It uses dedicated
  `WAREHOUSE_AGGREGATES_*` envs or derives a sibling `/warehouse` public base
  from `PLAYER_HISTORY_PUBLIC_BASE_URL`; the aggregate CSVs were uploaded to the
  data bucket under `warehouse/`.
- Current classification: `next`
- Remaining work: configure the public aggregate base URL in deployment only
  when the warehouse stats route becomes an operator-approved production
  surface. Do not move this to Supabase just because it is possible.

### A3. Player H2H History Memory Pressure

- Area: `lib/player-service.ts`
- Question: loading large local JSON history for H2H should move toward indexed relational queries.
- Current classification: `next`
- Reason: already tracked as remaining name-based/history fallback risk in the pipeline plan.
- Next evidence needed: confirm current public H2H paths and the durable opponent identity coverage needed before DB-first H2H.
- 2026-05-21 evidence: current H2H code already prefers
  `opponent_entity_id` when present and only falls back to normalized
  name/nickname matching. Latest coverage report has `86.98%`
  `opponent_entity_id` coverage (`124964 / 143664`) and
  `ready_to_remove_name_fallback=false`, so removing name fallback is not safe
  yet.
- 2026-05-21 partial: opponent identity coverage reports now support the empty
  reviewed hint file `data/metadata/opponent_identity_aliases.v1.json`. A row in
  that file can add alias names only for an existing canonical roster
  `entity_id`; aliases for unknown entity IDs are ignored. This improves review
  evidence without auto-promoting external opponents or changing runtime H2H
  behavior.
- 2026-05-21 partial: the same report now emits a `fallback_dependency` summary
  and row-counted `recommended_action_row_counts`, so operator review can see
  how many match-history rows still depend on the name fallback. Current local
  report: `rows_requiring_name_fallback=18700` (`13.02%`),
  `metadata_review_rows=0`, `external_or_metadata_review_rows=15571`,
  `external_candidate_rows=2912`, and `ignored_low_frequency_rows=217`.
- 2026-05-21 partial: the report now includes an `operator_review_queue` that
  excludes low-frequency ignore rows and gives each high-value unresolved name a
  decision prompt. Current local queue: `total_names=126`,
  `total_rows=18483`; top rows require `classify_as_canonical_or_external`.
- 2026-05-21 partial: `writeReport()` now also emits separate operator-review
  queue artifacts at
  `tmp/reports/player_history_opponent_identity_review_queue_latest.json` and
  `tmp/reports/player_history_opponent_identity_review_queue_latest.csv`. The
  queue rows include race-count, player-sample, and candidate-preview evidence;
  the CSV includes a UTF-8 BOM for operator spreadsheet review.
- 2026-05-21 partial: added
  `data/metadata/opponent_identity_review_decisions.v1.json` as the empty
  operator decision input and
  `scripts/tools/validate-opponent-identity-review-decisions.js` to validate
  only explicit `canonical_candidate` and `external_opponent` decisions. Names
  omitted from the file are unreviewed. The helper can build a queue-sourced
  empty decision template with
  `npm run report:player-history:opponent-review-template`, but no decisions are
  applied to roster metadata by this step.
- 2026-05-21 operator decision: the current top 50 unresolved opponent names
  were marked `external_opponent`. The report reads reviewed decisions and
  excludes reviewed external opponents from the next operator-review queue while
  still counting their rows as unresolved external history.
- 2026-05-21 follow-up: `export-team-roster-detailed.js` now treats
  `external_opponent` decisions as collection exclusions by player name, so a
  reviewed external opponent is not collected as a standalone roster player.
  `build-roster-change-review.js` also suppresses matching `new_candidate`
  items from the operator review queue. Existing match-history rows can still
  keep the name as opponent context.
- 2026-05-21 follow-up: operator confirmed `이광용` is the Protoss canonical
  player displayed as `프발` (`eloboard:male:93`). Added it as a reviewed
  opponent alias and updated warehouse aggregate resolution to consume reviewed
  aliases for existing canonical entities. Rebuilt warehouse aggregates and
  player-history artifacts; all 81 `이광용` opponent rows now resolve to
  `opponent_entity_id=eloboard:male:93`, raising local artifact coverage from
  `86.98%` to `87.04%`.
- 2026-05-21 follow-up: operator continued classifying unresolved high-frequency
  opponent names as `external_opponent`. Current local decision file has `74`
  decisions (`73` external opponents, `1` canonical candidate), and the
  regenerated operator queue is down to `50` names / `1698` rows. Next highest
  unresolved name: `따뜻`.
- 2026-05-21 follow-up: operator classified the next 10 unresolved names as
  `external_opponent`. Current local decision file has `84` decisions (`83`
  external opponents, `1` canonical candidate), and the regenerated operator
  queue is down to `42` names / `1071` rows. Next highest unresolved name:
  `비그리`.
- 2026-05-21 follow-up: operator confirmed `장영근` is the Protoss canonical
  player displayed as `난수` (`eloboard:male:80`). Added it as a reviewed
  opponent alias and canonical candidate; all 40 `장영근` opponent rows now
  resolve to `opponent_entity_id=eloboard:male:80`. Current local decision file
  has `85` decisions (`83` external opponents, `2` canonical candidates), and
  the regenerated operator queue is down to `41` names / `1031` rows.
- 2026-05-21 follow-up: operator confirmed `박종승` is the Protoss canonical
  player displayed as `빡죠스` (`eloboard:male:176`). Added it as a reviewed
  opponent alias and canonical candidate; all 36 `박종승` opponent rows now
  resolve to `opponent_entity_id=eloboard:male:176`. Current local decision file
  has `86` decisions (`83` external opponents, `3` canonical candidates), and
  the regenerated operator queue is down to `40` names / `995` rows. Local
  player-history opponent identity coverage is now `87.07%`.
- 2026-05-21 follow-up: operator classified the next 20 unresolved queue names
  as `external_opponent` (`비그리`, `성예량`, `김준혁`, `하연진`, `옥이`,
  `유성민`, `제쥬순`, `순자`, `허지율`, `은아가`, `브희`, `송혜림`,
  `김상수`, `미니언`, `다소냥.`, `김석현`, `채비`, `히갱`, `하이유`,
  `다소냥`). Current local decision file has `106` decisions (`103` external
  opponents, `3` canonical candidates), and the regenerated operator queue is
  down to `20` names / `329` rows. Local player-history opponent identity
  coverage is now `87.09%`.
- 2026-05-21 follow-up: operator classified the remaining 20 operator-review
  queue names as `external_opponent` (`옥수수`, `밍도릿..`, `수핸`,
  `안정우`, `송현덕`, `짜미`, `치쨩`, `새밍`, `초롱빡`, `바미`, `홍쥬`,
  `허니콩`, `김승현`, `박영덕`, `비너스`, `이인극`, `욱하는형`, `눈또`,
  `박정일`, `파이`). Current local decision file has `126` decisions (`123`
  external opponents, `3` canonical candidates), and the regenerated operator
  queue is empty (`0` names / `0` rows). Local player-history opponent identity
  coverage remains `87.09%`.
- Remaining work: improve opponent identity coverage or introduce an indexed
  DB/query path without weakening the existing canonical ID-first route.

### A4. Prediction Vote Query Filtering

- Area: `lib/prediction-store.ts`
- Question: unfiltered vote loading may become a network and CPU bottleneck as votes grow.
- Current classification: `next`
- Reason: likely high-value because the prediction product is active and vote data can grow quickly.
- Next evidence needed: inspect current Supabase query shape and add focused contract tests before changing storage behavior.
- 2026-05-20 partial: `upsertPredictionVote()` now loads remote state with
  `match_id + voter_id` scoped vote reads and target `match_id` scoped match
  reads before validating a user's vote change.
- 2026-05-21 partial: `scripts/sql/create-prediction-tables.sql` now defines
  `public.prediction_visible_vote_totals(match_ids uuid[])`, a stable
  `security invoker` RPC that groups visible prediction votes by match/team/MVP
  pick. Public prediction page/API reads now request aggregate totals, and API
  reads also request only the current voter's row scoped to visible matches;
  admin/default reads still keep full vote rows for review.
- 2026-05-21 production read-only check: anon RPC smoke returned PostgREST
  `PGRST202` (`function not found in schema cache`), confirming
  `prediction_visible_vote_totals` is not active in production yet.
- 2026-05-21 production apply follow-up: operator applied the SQL through the
  Supabase Dashboard SQL Editor. A read-only anon RPC smoke with `match_ids=[]`
  returned `ok=true` and `rows=0`, confirming the RPC is active for deployed
  prediction vote-total reads.
- Current classification: `next`
- Remaining work: deploy the code path that prefers the RPC. Runtime fallback
  remains in place if another environment is missing the function.

### A5. University Metadata Static File Cache

- Area: `lib/university-metadata.ts`
- Question: static university metadata can use an mtime cache guard.
- Current classification: `later`
- Reason: valid low-risk cleanup, but lower impact than warehouse/H2H/prediction query shape.
- Next evidence needed: confirm this file is read in hot request paths.

### A6. Board Comment Count Aggregation

- Area: `lib/board-comments.ts`
- Question: visible comment counts should avoid fetching one row per comment just to count by post.
- Current classification: `later`
- Reason: board usage can grow, and list pages need cheap count summaries.
- 2026-05-20 partial: `scripts/sql/create-board-comments.sql` now defines
  `public.board_visible_comment_counts(post_ids uuid[])`, a stable
  `security invoker` RPC that groups visible comments in Postgres. The board
  comment helper calls the RPC first and falls back to the previous row-based
  count path when the RPC has not been applied yet.
- 2026-05-20 production apply: applied the SQL to project
  `ttglvnnzssaaypmcrmdt` via Supabase CLI from a temporary workdir, then
  verified Data API RPC access with a `200 []` response for an empty
  `post_ids` call.
- Remaining work: monitor board list latency as comment volume grows.

### A7. R2 Client Reuse

- Area: `lib/r2.ts`
- Question: board image upload/delete should avoid constructing a new `S3Client` for every call.
- Current classification: `next`
- Reason: small, surgical optimization with clear server-side connection reuse benefits.
- 2026-05-20 partial: `uploadBoardImageToR2()` and
  `deleteBoardImageFromR2()` now share a module-scoped, config-keyed
  `S3Client` in warm server instances.
- Remaining work: only revisit if upload/delete latency remains high after
  production observation.

### A8. Roster Admin Store Load Shape

- Area: `lib/roster-admin-store.ts`
- Question: admin roster state should avoid unbounded remote correction reads and repeated local full-file merging as data grows.
- Current classification: `hold`
- Reason: valid concern, but admin correctness and review visibility matter more than premature pagination.
- Next evidence needed: inspect current admin workflows, expected correction volume, and whether filtering/pagination would hide operator-critical context.

### A9. SOOP OAuth Fetch Timeout

- Area: `lib/soop-auth.ts`
- Question: third-party OAuth token/userinfo calls should not wait indefinitely
  on SOOP upstream delays.
- Current classification: `now`
- Reason: external platform latency is outside NZU control and can hold Vercel
  request handlers open until platform timeout.
- 2026-05-20 partial: SOOP token exchange and station-info calls now go through
  a shared fetch wrapper with an explicit 8-second `AbortController` timeout.
- Remaining work: if real OAuth failures become frequent, add user-facing
  retry/error messaging and structured operational logging.

## Current Not-A-Source Notes

- Root-level `CODEX_BRIEFING.md` is untracked and encoding-corrupted in the current workspace view.
- Do not treat it as canonical harness guidance until it is normalized, moved under `docs/harness/`, or removed by operator decision.
