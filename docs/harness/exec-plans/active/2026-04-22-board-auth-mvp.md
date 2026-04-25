# ACTIVE PLAN: board-auth-mvp

Created: 2026-04-22
Status: ready-for-commit

## Goal

Add a lightweight public board MVP and prepare a future-safe login path without breaking the current stable runtime baseline.

## Pre-work confirmation

### Conflict-risk files

- `lib/navigation-config.ts`
- `components/Navbar.tsx`
- shared Supabase/runtime files such as `lib/supabase.ts`, `lib/supabase-admin.ts`, and future auth helper files
- any new public route handlers under `app/api/*` that define board read/write contracts

### Independently editable files

- new board route files under `app/board/*` when they do not change shared payload contracts
- new board-specific components under `components/board/*`
- new SQL docs/migrations for board tables and RLS notes
- board-only docs or execution notes that do not redefine shared nav or auth rules

### Coordination basis

- Confirmed on 2026-04-22 after the runtime/H2H stabilization work was committed and the rollback checkpoint tag `checkpoint/pre-board-auth-2026-04-22` was created.
- Treat public navigation wording, auth boundaries, and shared Supabase access patterns as coordinated surfaces.

## Completed steps

- [x] Confirm the current stable rollback point and create a repo-visible restore checkpoint tag: `checkpoint/pre-board-auth-2026-04-22`.
- [x] Review the existing public nav/runtime structure and identify the natural nav hook points in `lib/navigation-config.ts` and `components/Navbar.tsx`.
- [x] Review the current repo auth baseline and confirm that `lib/admin-auth.ts` is admin-only and must not be reused as public user auth.
- [x] Compare board/auth options against the current stack and prefer the lowest-friction path that fits existing Supabase usage.
- [x] Check official docs for current platform constraints:
  - SOOP developer/OAuth path requires developer registration, partnership review, and client credentials.
  - Supabase already covers database, auth, and storage for a low-cost MVP path.
- [x] Add a minimal board MVP information architecture:
  - `/board`
  - `/board/write`
  - optional `/board/[id]` only after list/write are stable
- [x] Add public nav entry for `게시판` and keep `글쓰기` as a board-page CTA for MVP.
- [x] Define the first board schema and API contract:
  - `board_posts`
  - `GET /api/board`
  - `POST /api/board`
- [x] Decide the MVP editor scope:
  - start with plain title/content submission
  - defer heavy rich-text editor work unless a simple upload flow proves insufficient
- [x] Design public auth as a provider-agnostic layer before wiring any provider-specific login.
- [x] Add SOOP OAuth skeleton routes and session helpers:
  - `/api/auth/soop/start`
  - `/api/auth/soop/callback`
  - `/api/auth/soop/logout`
  - JWT payload inspection fallback for user identification when no public userinfo endpoint is confirmed
- [x] Verify the SOOP callback on localhost and surface public-session state in the global navbar after successful login.

## Next steps

- [x] Re-apply `scripts/sql/create-board-posts.sql` so the live `board_posts` table includes the new nullable `category` column.
- [x] Confirm the first real table-list -> detail -> gated-download loop on localhost after the FMKorea-style board UI rewrite.
- [x] Confirm a fresh post write/read loop on the live `board_posts` table with `category = null` for public users.

## Blockers

- Public user auth is implemented as a SOOP session layer, but it remains intentionally narrow and should not be reused as admin auth.
- The current board UI/API now includes a table-style list, a dedicated `/board/[id]` detail route, and a simplified board-style write form. Direct uploads, comments, likes, and edit/delete flows remain out of scope for this phase.

## Session recovery

### First three commands

```powershell
git status --short --branch
git log --oneline -8
Get-ChildItem docs\harness\exec-plans\active
```

### Last checked state

- Stable restore checkpoint: `checkpoint/pre-board-auth-2026-04-22`
- Preferred deployment-safe runtime branch: `deploy/rb-runtime-candidate`
- Last planning basis: local repo inspection plus official SOOP/Supabase docs review on 2026-04-22
- 2026-04-24 implementation status: `/board`, `/board/write`, `GET /api/board`, `POST /api/board`, `lib/public-auth.ts`, and `scripts/sql/create-board-posts.sql` are in repo; the board table has been applied and localhost board read is working.
- 2026-04-24 auth status: localhost SOOP OAuth callback succeeded end-to-end with `stationinfo` lookup plus `profile_image`-pattern fallback for `providerUserId`; navbar now reflects active public session and exposes logout.
- 2026-04-24 board UI status: `/board` has been reshaped into a table-style board, `/board/[id]` now exists, `/board/write` is simplified around title/content/URL fields only, and public writes force `category = null`.
- 2026-04-25 RB continuation status: live `board_posts` read confirmed `category` is selectable and existing public post `a641e8d0-66c1-4ed3-ba5a-208ec82951be` has `category = null`; localhost `/board` rendered the table list, title click opened `/board/a641e8d0-66c1-4ed3-ba5a-208ec82951be`, and `/api/board/download` returned a logged-out SOOP gate redirect preserving the detail-page `next` path.
- 2026-04-25 fresh write/read status: a temporary API-created post was written through localhost with a signed SOOP public session, read back from live `board_posts`, verified with `category = null`, invalid image/video URLs stripped to `null`, and deleted after verification. The route now ignores body-supplied `author_name` and uses the session display name.
- 2026-04-25 hardening status: download redirects are now bound to a stored board post id instead of an arbitrary `url` query parameter; `/board/write` now shows a friendly SOOP-login requirement before redirect; public board reads use the anon/RLS client instead of requiring service-role env.
- 2026-04-25 follow-up hardening status: SOOP/download `next` paths now reject backslash/open-redirect forms and normalize through URL parsing; `/api/auth/session` now returns only the minimal public navbar session fields instead of the durable provider user id.
- 2026-04-25 subagent review follow-up: read-only security review found that video host matching was too broad and image URLs only checked protocol. `lib/board.ts` now only accepts SOOP hosts under `sooplive.com` / `sooplive.co.kr` and image URLs ending in `jpg`, `jpeg`, `png`, `gif`, or `webp`. Runtime API verification created a temporary post with spoofed category/author and invalid media URLs; the stored row had `category = null`, session author, and `image_url` / `video_url = null`, then the row was deleted.
- 2026-04-25 final smoke status: browser verification confirmed `/board` renders the table board with `전체글`, top/bottom `글쓰기`, table headers, and a title link; clicking the title opened `/board/[id]`; `/board/write` shows the logged-out SOOP login requirement and return links. Mobile viewport `390x844` kept document width at `390` with the table contained in its own scroll area. Fresh `npm.cmd run lint` and `npm.cmd run build` passed; `/` remained static/ISR in the build output.
- 2026-04-25 residual download risk: `download_url` remains any stored `http` / `https` URL by product design for this phase (`Download buttons remain external-link redirects only`). The route avoids arbitrary query-parameter redirects by requiring a stored board post id and SOOP login before redirecting. A future moderation/interstitial/host-policy pass can narrow this further without changing the MVP contract.

- 2026-04-25 write UX follow-up: `components/board/BoardPostComposer.tsx` now moves the writing guide into the content textarea area, keeps a subtle rose warning tone, hides it on overlay click/focus/typing, exposes `안내 보기` again while the body is empty, and shortens the media helper copy. Read-only subagent checks found no `.env.local` tracking or unrelated nav/API changes; fresh `npm.cmd run lint`, `npm.cmd run build`, `git diff --check`, localhost `3000` `/board/write` HTTP 200, and agent-browser checks passed.

- 2026-04-25 download-link simplification follow-up: new public board posts no longer collect or submit a download URL from `components/board/BoardPostComposer.tsx`, and `POST /api/board` now forces `download_url = null` even if a direct client sends it. Existing `download_url` schema/type/detail-page/download-route support remains in place for old posts. Added `npm run test:board-write-contract` to guard the new write contract.

## Files in play

- `lib/navigation-config.ts`
- `components/Navbar.tsx`
- `components/SidebarNav.tsx` only if nav scope expands unexpectedly
- `lib/supabase.ts`
- `lib/supabase-admin.ts`
- `lib/admin-auth.ts`
- `lib/public-auth.ts`
- `lib/soop-auth.ts`
- `lib/board.ts`
- `app/board/page.tsx`
- `app/board/write/page.tsx`
- `app/board/[id]/page.tsx`
- `app/api/board/route.ts`
- `components/board/*`
- `scripts/sql/create-board-posts.sql`
- `docs/harness/exec-plans/active/2026-04-22-board-auth-mvp.md`

## New failure modes found

- Reusing admin secret-cookie auth for public users would create a security and product-model regression.
- Starting with a heavy editor, attachments, comments, likes, and multi-board taxonomy at once would turn a low-risk MVP into a mixed-scope feature spike.
- Binding public account identity to mutable SOOP display names instead of durable provider IDs would repeat the repo's existing name/alias fragility in a more sensitive auth surface.
- Board storage can appear “implemented” in the UI while writes still fail if `board_posts` has not been applied in Supabase; surface that state explicitly until the table exists.
- If SOOP access tokens do not expose a durable user identifier in JWT payload and no userinfo endpoint exists, login can appear technically successful while user identity remains unusable for session ownership.
