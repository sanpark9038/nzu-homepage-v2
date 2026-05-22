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
- Current classification: `done`
- Reason: serving path is hot enough to justify a small mtime cache guard, and
  the change avoids repeated project roster JSON parsing without changing
  public player semantics.
- 2026-05-20 partial: project roster overrides and SOOP identity overrides now
  use a project roster file mtime key and return cached maps when no
  `players.<code>.v1.json` file changed.
- 2026-05-22 recheck: `test:player-serving-metadata` verifies the mtime cache
  guard for project roster and SOOP identity overrides. No current production
  evidence shows remaining player-serving metadata file IO pressure.
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
- 2026-05-22 production recheck: `/api/stats/warehouse` returned `200`, the
  derived public aggregate URLs under `/warehouse/` returned all three CSVs,
  and Vercel/GitHub have the `PLAYER_HISTORY_PUBLIC_BASE_URL` /
  `PLAYER_HISTORY_R2_*` env path needed for the sibling warehouse public-base
  flow.
- 2026-05-22 follow-up: overview requests now lazy-load only
  `agg_daily_player.csv` and `agg_daily_team.csv`; the larger
  `agg_player_detail_breakdowns.csv` is read only for player-detail requests.
- Current classification: `done`
- Remaining work: keep `fact_matches.csv` as the local source/verification
  artifact and monitor production warehouse API latency as data volume grows.

### A3. Player H2H History Memory Pressure

- Area: `lib/player-service.ts`
- Question: loading large local JSON history for H2H should move toward indexed relational queries.
- Current classification: `hold`
- Reason: current public H2H serving avoids the earlier eager history reads,
  but removing the remaining name/nickname fallback is not safe while opponent
  entity coverage remains below 100%. Reopen when either coverage is materially
  improved or an indexed DB/query design is explicitly approved.
- Next evidence needed: keep monitoring durable opponent identity coverage and
  production H2H latency; do not remove fallback until every needed history row
  has a durable opponent identity or a reviewed query policy exists.
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
- 2026-05-21 follow-up: detailed public H2H no longer selects large
  `match_history` JSON in its initial player lookup. It now checks lightweight
  player identity/freshness fields first, uses direct serving `matches` when
  available, then loads the R2 player-history artifact. A DB `match_history`
  read is deferred until the artifact is missing or older than the player's
  `last_match_at` date. This reduces common H2H read pressure without removing
  the current name/nickname fallback.
- 2026-05-22 follow-up: player detail match fallback plus the legacy H2H helper
  methods now use the same lightweight metadata lookup and artifact-first lazy
  `match_history` resolver. This closes the remaining eager runtime
  `match_history` reads in `lib/player-service.ts` public-serving helpers
  without changing roster identity policy.
- 2026-05-22 production recheck: `test:h2h-route-performance-contract` confirms
  the ID-based route rejects name-only lookup, caches detailed stats briefly,
  and avoids eager `match_history` reads. Live production smoke returned `200`
  for an ID-based `/api/stats/h2h` request and `400` for the name-only request
  with `Both p1_id and p2_id canonical player ids are required.`
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
- 2026-05-22 production recheck: read-only anon RPC smoke for
  `prediction_visible_vote_totals(match_ids => null)` returned successfully
  (`error=false`, `rows=0`). The deployed code path already requests aggregate
  totals for public page/API reads and scopes current-voter reads to visible
  matches, so production does not need the full-vote fallback for normal public
  reads.
- Current classification: `done`
- Remaining work: keep the runtime fallback for non-production or future
  environments that have not applied the RPC yet.

### A5. University Metadata Static File Cache

- Area: `lib/university-metadata.ts`
- Question: static university metadata can use an mtime cache guard.
- Current classification: `later`
- Reason: valid low-risk cleanup, but lower impact than warehouse/H2H/prediction query shape.
- Next evidence needed: confirm this file is read in hot request paths.
- 2026-05-22 follow-up: public entry/tier pages and admin university views read
  this metadata through `getUniversityOptions()`. `readUniversityMetadata()`
  now uses a module-scoped mtime cache guard for warm server instances, and
  `writeUniversityMetadata()` refreshes the cache after writes.
- Current classification: `done`

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
- 2026-05-22 follow-up: live `/board` TTFB was about 1.4s while direct Supabase
  probes showed `board_posts.select("*")` was slower than the lightweight list
  projection. The board list now reads only summary columns and uses a short
  tag cache invalidated by board, comment, and schedule writes.
- Remaining work: monitor board list latency as comment volume grows.

### A7. R2 Client Reuse

- Area: `lib/r2.ts`
- Question: board image upload/delete should avoid constructing a new `S3Client` for every call.
- Current classification: `hold`
- Reason: the reported risk was valid, but the surgical optimization is already
  in place. Keep this out of `now` unless production upload/delete latency or
  socket errors show the current reuse is insufficient.
- 2026-05-20 partial: `uploadBoardImageToR2()` and
  `deleteBoardImageFromR2()` now share a module-scoped, config-keyed
  `S3Client` in warm server instances.
- 2026-05-22 v5 review: rechecked `lib/r2.ts` and
  `test:board-r2-upload-contract`; the warm-instance `S3Client` reuse contract
  passes.
- Remaining work: only revisit if upload/delete latency remains high after
  production observation.

### A8. Roster Admin Store Load Shape

- Area: `lib/roster-admin-store.ts`
- Question: admin roster state should avoid unbounded remote correction reads and repeated local full-file merging as data grows.
- Current classification: `hold`
- Reason: valid concern, but admin correctness and review visibility matter more than premature pagination.
- Next evidence needed: inspect current admin workflows, expected correction volume, and whether filtering/pagination would hide operator-critical context.
- 2026-05-22 v5 review: rechecked the concern. The code still reads three
  local JSON files synchronously and then reads all `roster_admin_corrections`
  rows, so the performance risk is real but admin-scoped. Do not paginate or
  filter this path until the operator workflow defines which historical
  corrections can be hidden safely. If this is promoted later, first add an
  mtime cache for the local JSON inputs, then design a remote query shape that
  preserves current correction visibility.

### A9. SOOP OAuth Fetch Timeout

- Area: `lib/soop-auth.ts`
- Question: third-party OAuth token/userinfo calls should not wait indefinitely
  on SOOP upstream delays.
- Current classification: `hold`
- Reason: external platform latency risk was valid, but the bounded fetch
  behavior is already implemented. Keep this out of `now` unless real OAuth
  timeout frequency shows the user-facing retry/error path needs more polish.
- 2026-05-20 partial: SOOP token exchange and station-info calls now go through
  a shared fetch wrapper with an explicit 8-second `AbortController` timeout.
- 2026-05-22 v5 review: rechecked `lib/soop-auth.ts` and
  `test:soop-auth-timeout`; both token exchange and station-info fetches use
  the shared abort-timeout wrapper.
- Remaining work: if real OAuth failures become frequent, add user-facing
  retry/error messaging and structured operational logging.

## 2026-05-22 Public UX Performance Intake

Source: operator-provided sub-AI UX/performance report summary on 2026-05-22.

### U1. Navbar Session Fetch On Public Navigation

- Area: `components/Navbar.tsx`, `app/layout.tsx`,
  `app/api/auth/session/route.ts`
- Question: public page transitions may refetch `/api/auth/session` on every
  menu navigation.
- Current classification: `hold`
- Reason: the concern is not supported by the current App Router layout shape.
  `Navbar` is rendered from the shared root layout and the session fetch lives
  in a `useEffect(..., [])`, so normal public `Link` transitions should rerender
  active nav state without remounting the navbar or refetching the session.
  The session route itself only parses the signed cookie and does not hit the
  database.
- 2026-05-22 verification: `test:navbar-glass-header` now asserts the shared
  root-layout placement and guards against changing the session fetch into a
  pathname-dependent effect.
- Remaining work: only revisit if browser resource timing shows repeated
  `/api/auth/session` fetches during client-side public navigation.

### U2. Prediction Initial Client Refetch Flicker

- Area: `components/prediction/TournamentPredictionClient.tsx`,
  `app/api/prediction/route.ts`
- Question: the prediction page server-renders `initialMatches`, then the
  client immediately refetches the full `/api/prediction` payload and overwrites
  the card list.
- Current classification: `done`
- Reason: this was a real UX/performance risk because first paint could be
  followed by a second full match hydration request and visible vote-card
  updates. The client now keeps server-rendered matches as the initial card
  source and refreshes only viewer state (`session` / `myVotes`) through
  `/api/prediction?scope=viewer`. The full match payload is still returned after
  a successful vote POST so optimistic vote state can be reconciled.
- 2026-05-22 verification: `test:prediction-cache-contract` covers the viewer
  refresh path and verifies the lightweight API branch returns before loading
  cached players, aggregate vote totals, or the full matches payload.
  `test:prediction-store-contract` also guards that viewer-scoped reads load
  only the current voter's rows for visible matches instead of falling back to a
  full vote-table scan when aggregate totals are disabled.
- Remaining work: if live vote totals need real-time refresh later, add a
  dedicated totals-only endpoint rather than reintroducing full match polling.

### U3. Public Route Transition Loading Boundaries

- Area: `app/*/loading.tsx`, `components/PublicRouteLoading.tsx`
- Question: data-heavy public pages can feel stuck during menu transitions when
  the next route waits on server work before replacing the current view.
- Current classification: `done`
- Reason: public data routes now expose small route-level `loading.tsx`
  boundaries for board, player, schedule, prediction, teams, and tier. The
  loading UI is shared, skeleton-based, and copy-neutral so it does not change
  locked labels or route data behavior.
- 2026-05-22 verification: `test:public-route-loading` guards the route
  boundary files and the shared loading component shape.
- Remaining work: `/match` is a client-heavy page and should be handled as a
  separate server-shell/client-island split rather than by adding a generic
  loading boundary.

## Current Not-A-Source Notes

- Root-level `CODEX_BRIEFING.md` is untracked and encoding-corrupted in the current workspace view.
- Do not treat it as canonical harness guidance until it is normalized, moved under `docs/harness/`, or removed by operator decision.
