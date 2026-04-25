# Board Table UI Design

**Date:** 2026-04-24

**Scope:** Rework the current board MVP from a card-feed presentation into a table-driven community board flow inspired by classic forum layouts, while preserving the current HOSAGA dark visual language and the existing SOOP login/download gate behavior.

## Goal

Ship a more efficient board experience with:

- a table-style `/board` list view
- a dedicated `/board/[id]` detail page
- a board-style `/board/write` form
- a comment area shell on the detail page without live comment storage yet

This should feel closer to community boards such as FMKorea's StarCraft board in information structure so that users familiar with that ecosystem can adapt quickly, but it should remain visually consistent with the existing HOSAGA dark site instead of copying an external site's full styling.

## Product Constraints

- Reading board posts remains public.
- Writing board posts remains SOOP-login-gated.
- Download actions remain SOOP-login-gated and must return the user to the original board location.
- Images remain external URL embeds only.
- Images remain external URL embeds only in the current phase. Direct image upload via Cloudflare R2 is planned for the next phase and is defined in the Future Upload Guidelines section below.
- Videos remain YouTube/SOOP URL embeds only.
- Download buttons remain external-link redirects only.
- No direct file upload, file storage, comment persistence, likes, or recommendation storage in this phase.
- Keep the overall experience intentionally simpler than FMKorea: familiar structure, fewer controls, stronger write CTA.

## Future Upload Guidelines

These limits define the first direct-upload phase once image uploads are introduced.

### Image upload rules

- allowed extensions: `jpg`, `jpeg`, `png`, `gif`, `webp`
- max size per file: `5MB`
- max attachments per post action: `3`
- total upload cap per action: `15MB`

### Video upload rules

- direct video upload is out of scope for this stage
- only YouTube or SOOP URL embeds are allowed

### Write-form guidance copy

When direct image upload is introduced, the write form should surface guidance equivalent to:

- `허용 확장자: jpg, jpeg, gif, png, webp`
- `파일당 최대 용량: 5MB, 최대 3장`
- `이미지는 파일 선택 또는 붙여넣기(Ctrl+V)로 첨부 가능`
- `동영상은 유튜브 또는 SOOP URL을 입력해주세요`

### Planned staged expansion

1. Stage 1 (free-first)
   - image upload only
   - `5MB` per file
   - `3` files max

2. Stage 2 (after paid transition)
   - image upload up to `10MB`
   - up to `5` files
   - evaluate direct video upload separately

## Why This Structure

Compared with the current card-feed layout, a table-style board is a better fit for the current MVP because it:

- loads lighter on list pages
- avoids heavy media rendering until the user enters a post
- scales more naturally as post counts grow
- matches the user's mental model of a classic game community board
- keeps infrastructure cost lower because most list rows are simple text metadata

## Design Direction

### List Page: `/board`

The board list should be restructured into a table-like layout with these sections:

1. Top board header
   - board title such as `전체글`
   - short supporting description
   - `글쓰기` action
   - `글쓰기` should stand out visually

2. Board toolbar
   - light tab/filter shell inspired by forum boards
   - initial tabs can stay mostly presentational
   - no expensive sort/filter backend logic in this phase unless already available

3. Table-style post list
   - columns:
     - `말머리`
     - `제목`
     - `글쓴이`
     - `날짜`
     - `조회`
     - `추천`
   - optional right-side count chip for comment/reaction shell when available in UI only
   - title cell should link to `/board/[id]`
   - `추천` is UI shell only in this phase
   - 말머리는 MVP에서 아래처럼 단순화한다:
     - `공지` - 관리자 전용
     - `일정` - 관리자 전용
     - 일반 글 - 말머리 없음
   - 말머리 색상 구분은 `공지`와 `일정`에만 적용한다
   - 제목 옆에는 작은 인라인 미디어 아이콘을 붙일 수 있다:
     - 이미지 URL이 있으면 이미지 아이콘
     - 영상 URL이 있으면 재생 버튼 형태의 영상 아이콘
   - 이 아이콘은 FMKorea식 게시판의 제목 옆 첨부 표시처럼 작고 가볍게 보인다

4. Empty state
   - still supports logged-in and logged-out variants
   - should look like an empty board table instead of a feed card

5. Bottom CTA area
   - list footer also includes a visible `글쓰기` action
   - both top and bottom write actions should guide posting naturally

### Detail Page: `/board/[id]`

The detail page should follow a classic board reading flow:

1. breadcrumb/meta strip
   - board name
   - return path

2. post header
   - title
   - author
   - created time
   - view count shell
   - recommendation shell

3. post body
   - plain text content
   - external image embed
   - embedded video
   - download action with existing login gate

4. action footer
   - `게시판으로 돌아가기`
   - optional shell buttons for later actions

5. comment section shell
   - visual area for comments
   - "준비중" or equivalent non-persistent state
   - no server-side comment creation yet

### Write Page: `/board/write`

The write page should move from a card-style form toward a board-style editor shell:

- title field
- content textarea
- external image URL
- video URL
- external download URL
- lightweight rules/help area

Admin-only extension:

- if an admin write path is added later, it can expose a 말머리 selector for `공지` and `일정`

This should remain intentionally light:

- no heavy WYSIWYG editor yet
- no lightweight toolbar in this phase
- no file attachment uploads
- no category backend unless needed by the current schema
- no HTML editor
- no full font/size/color toolbar
- no poll insertion
- no draft-save flow in this phase

The write page should also include a small rules/notice box before writing starts. That notice can auto-hide when the user clicks into the content area or starts typing, and it can be reopened with a small `안내 보기` action.

When a logged-out user tries to write, the board should make the requirement clear in friendly language before the SOOP login redirect. The actual flow still returns the user to `/board/write` after successful login.

For normal public users, the write form should not expose any 말머리 selector in this phase.

## Technical Direction

### Existing code to preserve

- `app/api/board/route.ts`
- `app/api/board/download/route.ts`
- `lib/board.ts`
- `lib/public-auth.ts`
- `app/api/auth/soop/*`

### Main implementation changes

- Update `app/board/page.tsx` to render a table-style list instead of feed cards.
- Add `app/board/[id]/page.tsx` for single-post display.
- Add board helpers in `lib/board.ts` for reading a single post and, if needed, a minimal view-count update path.
- Update `app/board/write/page.tsx` and/or `components/board/BoardPostComposer.tsx` to match the new board-style composition UI.
- Add a lightweight post label path only if the current table needs explicit support for admin-only `공지` / `일정` rendering.

### Data handling

- Reuse the existing `board_posts` table.
- Add a nullable `category varchar` column to `board_posts`.
- Continue storing:
  - `title`
  - `content`
  - `author_name`
  - `author_provider`
  - `author_provider_user_id`
  - `category`
  - `image_url`
  - `video_url`
  - `download_url`
- `category` rules for this phase:
  - `'notice'` = 공지
  - `'schedule'` = 일정
  - `null` = 일반글
- Only admin-authored posts should ever set `category` to `'notice'` or `'schedule'`.
- Normal public user posts should always store `category` as `null`.
- In the board list, `category = null` means the `말머리` cell stays visually empty.
- If `view_count` is needed for the UI shell, prefer graceful fallback or a lightweight schema extension only if the current table cannot support the list/detail shape cleanly.
- If `추천` is shown before backend support exists, it should render as a harmless placeholder value rather than implying live aggregation.

## Performance Notes

This approach is expected to stay efficient under free-tier constraints because:

- the list page is primarily text rows
- large media is pushed to detail views
- media hosting remains external
- board reads remain simple Supabase queries
- detail routes can stay server-rendered on demand without introducing expensive client-side state
- the simplified write form avoids large editor bundles and upload processing

## Explicit Non-Goals For This Phase

- live comments
- recommendations/likes persistence
- hot/popular ranking logic
- moderation workflows
- edit/delete post flows
- rich text editor
- direct uploads
- full FMKorea visual replication

## Success Criteria

The phase is complete when:

- `/board` reads like a traditional table-style board
- `/board` presents top and bottom `글쓰기` actions clearly
- clicking a title opens `/board/[id]`
- `/board/[id]` shows content, media, and gated download behavior
- `/board/write` visually matches the board pattern better than the current card form
- comment area shell exists on detail pages without implying unfinished backend behavior
- SOOP login gating still works for write/download flows
