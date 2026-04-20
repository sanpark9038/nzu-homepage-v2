# Remaining Worktree Bundles 2026-04-20

Purpose: preserve the post-deployment remainder as clean follow-up bundles instead of one noisy worktree.

Status note: `531788b` (`Harden pipeline sync and deployment readiness`) is already pushed. This file covers only the remaining post-deployment worktree changes.

## Recommended Next Order

1. `ADMIN_NAV_LINKS`
2. `SERVING_CACHE_INFRA`
3. `HERO_MEDIA_ADMIN_BACKEND`
4. `HOMEPAGE_HERO_UI`
5. `UNIVERSITY_METADATA_AND_ADMIN`
6. `MATCH_H2H_CORE`
7. `UNIVERSITY_AND_FILTER_UI_TEXT`
8. `MATCH_H2H_UI`
9. `PLAYER_PAGE_AND_SERVING_PRESENTATION`
10. `TEAMS_PAGE_FEATURE`
11. `HARNESS_ENTRY_AND_WORKFLOW_RULES`
12. `RUNBOOK_RENAME_AND_SHORTCUTS`

## Bundles

### ADMIN_NAV_LINKS

- `components/admin/AdminNav.tsx`

Note: shared admin navigation entry points. Do not ship this as a standalone “dead link” commit. Split the diff by feature when possible: include the hero-media link change with the hero-media commit, and the universities link change with the universities commit.

Current guidance: do not make this the next commit. First land `SERVING_CACHE_INFRA`, then come back and split this file by feature.

### HERO_MEDIA_ADMIN_BACKEND

- `app/admin/hero-media/`
- `app/api/admin/hero-media/`
- `lib/hero-media.ts`
- `lib/supabase-admin.ts`
- `lib/database.types.ts`
- `scripts/sql/create-hero-media.sql`
- `next.config.ts`

Note: homepage hero media management feature backend/admin flow. Keep separate from homepage hero presentation. `app/api/admin/revalidate-serving/route.ts` is better treated as serving-cache infra, not as a hero-only file.

### HOMEPAGE_HERO_UI

- `app/page.tsx`
- `public/home-hero-reference.png`

Note: homepage hero presentation only. This was intentionally split out from hero media admin/backend changes. If you want one fully complete hero feature commit instead of two, merge this bundle into `HERO_MEDIA_ADMIN_BACKEND`.

### UNIVERSITY_METADATA_AND_ADMIN

- `data/metadata/universities.v1.json`
- `lib/university-config.ts`
- `lib/university-metadata.ts`
- `app/admin/universities/`
- `app/api/admin/universities/`

Note: converts university lists from hardcoded config to managed metadata + admin UI.

### UNIVERSITY_AND_FILTER_UI_TEXT

- `app/entry/page.tsx`
- `app/tier/page.tsx`
- `components/players/Filters.tsx`
- `components/stats/H2HLookup.tsx`
- `components/ui/nzu-badges.tsx`
- `lib/constants.ts`
- `lib/navigation-config.ts`
- `lib/utils.ts`

Note: university ordering, filter labels, tier badge spacing, and related UI polish.

Current guidance: do not commit this before `MATCH_H2H_CORE`. The current `/entry` and `/tier` diffs now depend on broader matchup helper files that are not yet cleanly split.

### MATCH_H2H_CORE

- `app/api/stats/h2h/route.ts`

Note: H2H route hardening bundle. This is currently the smallest coherent follow-up commit because it only depends on helper APIs that are already in `main`.

Current guidance: keep `lib/matchup-helpers.ts` and `scripts/tools/matchup-helpers.test.mjs` out of this commit for now. Those files pull in broader `/match`, `/entry`, `/tier`, `constants`, and `utils` residue.

### MATCH_H2H_UI

- `app/match/page.tsx`
- `components/players/H2HSelectorBar.tsx`
- `lib/tier-order.ts`
- `lib/tier-page-helpers.ts`

Note: H2H and matchup UI bundle. Review after `MATCH_H2H_CORE`.

### PLAYER_PAGE_AND_SERVING_PRESENTATION

- `app/player/PlayerSearchResult.tsx`
- `app/player/player-page-view.tsx`
- `app/api/players/route.ts`
- `lib/player-matchup-summary.ts`
- `lib/player-serving-metadata.ts`

Note: player search/detail presentation bundle. `lib/player-matchup-summary.ts` belongs here rather than the core H2H bundle.

### TEAMS_PAGE_FEATURE

- `app/teams/`
- `components/home/TournamentTeamsView.tsx`

Note: new teams page feature bundle.

### ROSTER_METADATA_BROAD_REGEN

- `data/metadata/projects/bgm/players.bgm.v1.json`
- `data/metadata/projects/black/players.black.v1.json`
- `data/metadata/projects/c9/players.c9.v1.json`
- `data/metadata/projects/dm/players.dm.v1.json`
- `data/metadata/projects/fa/players.fa.v1.json`
- `data/metadata/projects/hm/players.hm.v1.json`
- `data/metadata/projects/jsa/players.jsa.v1.json`
- `data/metadata/projects/mbu/players.mbu.v1.json`
- `data/metadata/projects/ncs/players.ncs.v1.json`
- `data/metadata/projects/ssu/players.ssu.v1.json`
- `data/metadata/projects/tsucalm/players.tsucalm.v1.json`
- `data/metadata/projects/wfu/players.wfu.v1.json`
- `data/metadata/projects/yb/players.yb.v1.json`
- `scripts/player_metadata.json`

Note: broad roster/metadata regeneration. Do not mix with UI or admin commits without explicit review.

### LIVE_SNAPSHOT_REFRESH_NOISE

- `data/metadata/soop_live_snapshot.generated.v1.json`

Note: generated snapshot refresh residue. Recheck intent before committing.

### PIPELINE_ALERT_RULES_TUNING

- `data/metadata/pipeline_alert_rules.v1.json`

Note: operations policy change. Keep as a small isolated policy commit.

### PIPELINE_TEST_NOISE

- `scripts/tools/run-daily-pipeline.test.js`
- `scripts/tools/send-manual-refresh-discord.test.js`

Note: test expectation drift bundle. Keep separate from runtime changes.

### SERVING_IDENTITY_SQL_DRAFTS

- `scripts/sql/add-serving-identity-key.sql`
- `scripts/sql/check-serving-identity-schema.sql`

Note: design/reference SQL only. Not a runtime deployment change yet.

### SERVING_CACHE_INFRA

- `app/api/admin/revalidate-serving/route.ts`

Note: generic serving cache invalidation helper. Keep separate from hero-media-specific feature commits unless you intentionally want a broader serving/admin infra bundle.

Recommended minimal follow-up commit:

- `app/api/admin/revalidate-serving/route.ts`

Why first: the client/orchestration side (`scripts/tools/revalidate-public-cache.js` and `scripts/tools/push-supabase-approved.js`) is already in `main`, so this route is the smallest remaining server-side cache-invalidation follow-up.

### HARNESS_ENTRY_AND_WORKFLOW_RULES

- `AGENTS.md`
- `docs/harness/README.md`
- `docs/harness/SESSION_ENTRY.md`
- `docs/harness/MULTI_AGENT_WORKFLOW.md`
- `docs/harness/DRIFT_HOOKS.md`
- `docs/harness/RELIABILITY_RULES.md`

Note: harness rule/documentation bundle. Useful, but not required for runtime deployment.

### HARNESS_PLAN_HISTORY

- `docs/harness/exec-plans/active/2026-04-18-harness-foundation.md`
- `docs/harness/exec-plans/active/2026-04-19-home-teams-entry-refresh.md`
- `docs/exec-plans/tech-debt-tracker.md`
- `DOCS_CLEANUP_PLAN.md`

Note: plan history / cleanup notes. Defer unless specifically updating docs history. These files are historical even if their current path still says `active`.

### DOCS_INDEX_AND_GUIDANCE

- `README.md`
- `docs/README.md`
- `docs/PRODUCT_SENSE.md`

Note: guidance/index bundle. Separate from product/runtime work.

### BRIEFING_OR_NOISE_DOCS

- `CODEX_BRIEFING.md`

Note: session/helper briefing document. Keep separate from repo index/guidance docs.

### RUNBOOK_RENAME_AND_SHORTCUTS

- `RUNBOOK.md`
- `TOMORROW_RUNBOOK.md`
- `.vscode/nzu.code-snippets`

Note: operator convenience bundle. Safe to defer. This includes the rename/removal pair (`RUNBOOK.md` add + `TOMORROW_RUNBOOK.md` delete), so avoid mixing it into feature/runtime commits.

### WORKTREE_INVENTORY_DOC

- `docs/harness/REMAINING_WORKTREE_BUNDLES_2026-04-20.md`

Note: scope-tracking document for the post-deployment residue. Keep separate from runtime or product feature commits.

### LEGACY_HARNESS_FILE_REMOVAL

- `.agents/workflows/orchestration-protocol.md`

Note: deletion intent is unclear. Hold until explicitly confirmed.
