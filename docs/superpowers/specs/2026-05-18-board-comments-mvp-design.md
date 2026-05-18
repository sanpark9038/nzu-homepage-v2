# Board Comments MVP Design

Date: 2026-05-18

## Goal

Add a quiet, lightweight comment feature to the public board detail page.
The first version should support normal post reactions without expanding into
notifications, replies, reactions, moderation queues, or rich media.

## Scope

Included:

- Comments are available on every `/board/[id]` post.
- Only SOOP-authenticated users can write comments.
- Users can view comments, write comments, and delete their own comments.
- Admins can delete any comment from the board detail page.
- `/board` shows the live comment count next to the post title as `[3]`.
- A zero comment count is hidden.

Excluded from the MVP:

- Comment editing.
- Nested replies.
- Likes or reactions.
- Comment reports.
- Comment notifications.
- A separate admin comment-management page.

## Comment Content Rules

- Text only.
- Maximum length: 300 characters.
- Newlines are allowed.
- Empty or whitespace-only comments are rejected.
- Comment content is rendered as safe text, not HTML.

## Ordering And Deletion

- Comments are shown oldest first.
- Deletes are soft deletes.
- Deleted comments remain in the database with `deleted_at` populated.
- Deleted comments are hidden from normal user-facing lists.
- Comment counts include only rows where `deleted_at` is null.

## Identity And Permissions

- Display name uses the SOOP profile name or nickname.
- Permission checks use a stable `author_id`, not the display name.
- Comment creation requires a valid public SOOP session.
- Comment deletion is allowed when the current user is either:
  - the comment author, or
  - an admin.
- All permission checks happen on the server API.

## Storage

Add a Supabase table named `board_comments`.

Minimum columns:

- `id`: comment identifier.
- `post_id`: owning board post id.
- `author_id`: stable author identity for permissions.
- `author_name`: display name captured when the comment is written.
- `content`: text content, limited to 300 characters.
- `created_at`: creation timestamp.
- `deleted_at`: soft-delete timestamp.
- `deleted_by`: stable identity of the deleting user or admin.

Indexes:

- `post_id, created_at` for detail-page comment listing.
- `post_id` with `deleted_at is null` considered for fast visible-comment
  counts.

## Server API

Use server API routes rather than direct client-side Supabase writes.

Routes:

- `GET /api/board/[id]/comments`
  - Returns visible comments for one post, oldest first.
- `POST /api/board/[id]/comments`
  - Requires SOOP login.
  - Validates text content and 300-character limit.
  - Enforces a 30-second write limit per user using the latest database row.
- `DELETE /api/board/[id]/comments/[commentId]`
  - Requires author or admin permission.
  - Sets `deleted_at` and `deleted_by`.

## Board List Count

The board list should not fetch full comment bodies.
It should fetch or derive visible comment counts and render them beside titles:

```text
Post title [3]
```

Counts must exclude soft-deleted comments.

## Board Detail UI

The comment section appears below post content and attachments, above the
return-to-list action.

UI behavior:

- Section heading: `댓글`.
- Count label: `댓글 3`.
- Empty state: `아직 댓글이 없습니다.`
- Logged-out state: a short SOOP-login prompt instead of an editor.
- Logged-in state: textarea, 300-character counter, submit button.
- Rows show author name, absolute timestamp, content, and a delete button only
  when deletion is allowed.
- Deletion uses a small browser confirm.
- Successful create/delete updates the visible list without noisy success
  messaging.
- Errors use short inline messages only.

## Error Handling

Board reading must remain resilient if the comment system is unavailable.

- Missing `board_comments` table or Supabase schema-cache lag:
  - Keep the board post visible.
  - Show `댓글 기능을 준비 중입니다.` in the comment area.
- Comment list load failure:
  - Show a short inline load error.
- Create failure:
  - `댓글을 등록하지 못했습니다. 잠시 후 다시 시도해 주세요.`
- Rate limit:
  - `잠시 후 다시 작성해 주세요.`
- Unauthorized delete:
  - `삭제 권한이 없습니다.`
- Delete failure:
  - `댓글을 삭제하지 못했습니다.`

## Testing

Add focused contract/unit coverage for:

- Comment input normalization and 300-character validation.
- Empty content rejection.
- Soft-delete filtering for lists and counts.
- Author/admin delete permission checks.
- 30-second per-user write limit.
- Board detail page keeps rendering if comment storage is missing.
- Board list renders `[N]` only when visible comment count is greater than zero.

## Rollout Notes

- Apply the `board_comments` SQL before relying on comment writes in production.
- The UI should tolerate the table being absent so deploy order does not break
  board post reading.
- This MVP should be committed and verified separately from the pipeline
  stabilization work.
