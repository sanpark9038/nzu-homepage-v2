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
- Current classification: `later`
- Reason: plausible micro-optimization, but no current critical alert or measured latency proof.
- Next evidence needed: route-level timing or repeated call profile showing this path is hot.

### A2. Large Warehouse CSV Runtime Parsing

- Area: `data/warehouse/fact_matches.csv`, warehouse stats routes/helpers
- Question: large CSV parsing and in-memory multi-loop aggregation should move toward pre-aggregation.
- Current classification: `next`
- Reason: high data-growth risk and directly aligned with simple/stable serving.
- Next evidence needed: identify current route/helper hot paths and the smallest aggregate artifact that removes repeated runtime scans.
- 2026-05-20 partial: `lib/warehouse-stats.ts` now keeps overview requests on
  `agg_daily_player.csv` / `agg_daily_team.csv` and lazily reads
  `fact_matches.csv` only for player detail breakdowns.
- Remaining work: move the detail breakdowns themselves to a pre-aggregated
  artifact or indexed DB query when that page/API path becomes the active
  objective.

### A3. Player H2H History Memory Pressure

- Area: `lib/player-service.ts`
- Question: loading large local JSON history for H2H should move toward indexed relational queries.
- Current classification: `next`
- Reason: already tracked as remaining name-based/history fallback risk in the pipeline plan.
- Next evidence needed: confirm current public H2H paths and the durable opponent identity coverage needed before DB-first H2H.

### A4. Prediction Vote Query Filtering

- Area: `lib/prediction-store.ts`
- Question: unfiltered vote loading may become a network and CPU bottleneck as votes grow.
- Current classification: `next`
- Reason: likely high-value because the prediction product is active and vote data can grow quickly.
- Next evidence needed: inspect current Supabase query shape and add focused contract tests before changing storage behavior.

### A5. University Metadata Static File Cache

- Area: `lib/university-metadata.ts`
- Question: static university metadata can use an mtime cache guard.
- Current classification: `later`
- Reason: valid low-risk cleanup, but lower impact than warehouse/H2H/prediction query shape.
- Next evidence needed: confirm this file is read in hot request paths.

### A6. Board Comment Count Aggregation

- Area: `lib/board-comments.ts`
- Question: visible comment counts should avoid fetching one row per comment just to count by post.
- Current classification: `next`
- Reason: board usage can grow, and list pages need cheap count summaries.
- Next evidence needed: verify the best Supabase-compatible count/RPC shape and preserve missing-storage fallback behavior.

### A7. R2 Client Reuse

- Area: `lib/r2.ts`
- Question: board image upload/delete should avoid constructing a new `S3Client` for every call.
- Current classification: `next`
- Reason: small, surgical optimization with clear server-side connection reuse benefits.
- Next evidence needed: add a focused contract around client reuse/config changes before refactoring.

### A8. Roster Admin Store Load Shape

- Area: `lib/roster-admin-store.ts`
- Question: admin roster state should avoid unbounded remote correction reads and repeated local full-file merging as data grows.
- Current classification: `hold`
- Reason: valid concern, but admin correctness and review visibility matter more than premature pagination.
- Next evidence needed: inspect current admin workflows, expected correction volume, and whether filtering/pagination would hide operator-critical context.

## Current Not-A-Source Notes

- Root-level `CODEX_BRIEFING.md` is untracked and encoding-corrupted in the current workspace view.
- Do not treat it as canonical harness guidance until it is normalized, moved under `docs/harness/`, or removed by operator decision.
