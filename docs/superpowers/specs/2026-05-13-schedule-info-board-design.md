# Schedule Info Board Design

**Date:** 2026-05-13

**Status:** Approved for implementation planning

**Scope:** Build a minimal, administrator-managed schedule experience where one `정보/일정` board post can appear both in the board and in the public schedule page.

## Goal

Create a simple schedule flow that lets the administrator publish reliable event information without asking normal users to choose event types or write schedule data.

The public result should be:

- a schedule page that opens on a today-focused list
- optional calendar view for scanning dates
- inline expandable details on each schedule card
- schedule content sourced from administrator-created board posts

## Product Decision

Use one board prefix only:

- `정보/일정`

Do not split the MVP into `방송`, `스타`, `공지`, or other public schedule categories. If more categories become useful later, add them after the first version is proven.

## User And Permission Model

Normal users:

- can read schedule posts
- can read the schedule page
- cannot create `정보/일정` posts
- continue using the normal board write flow for non-schedule posts, if public board writing remains enabled

Administrator:

- is the only writer for schedule posts
- creates schedule entries through an admin-only route under `/admin/schedule`
- edits, unpublishes, and deletes schedule posts through admin-only actions
- controls which posts appear on the schedule page

This keeps inaccurate or incomplete user-submitted schedule data out of the public schedule.

## Source Of Truth

The board post is the source of truth.

One admin-created `정보/일정` post should be reusable in two places:

- board list/detail pages
- schedule page list/calendar views

The schedule page should not have a separate duplicated body field. The post body is reused as the inline expanded schedule detail.

## Required Fields

For an admin `정보/일정` post to be saved as a schedule entry:

- title: required
- body/content: required
- display name: required
- schedule date: required

Optional fields:

- start time
- image
- video URL
- broadcast or external link

Fields not used in the MVP:

- end time
- separate short detail field
- public schedule category beyond `정보/일정`

## Display Name

The display name appears in the square badge at the start of a schedule card.

It may be a player name or a representative label:

- `해링`
- `싸나인`
- `ASL`
- `8강`
- `KCM`

This replaces the earlier split between “broadcast player name” and “star representative name.” One required `display name` field is simpler and covers both cases.

## Date And Time Rules

The schedule date is required.

The start time is optional:

- if start time exists, the card shows `HH:mm 시작`
- if start time is empty, the card appears under a `시간 미정` group for that date

End time is intentionally not collected because most broadcast-style events do not have a reliable end time.

Sorting within a day:

1. timed events, ascending by start time
2. untimed events under `시간 미정`

## Public Schedule Page

The public `/schedule` page should use administrator `정보/일정` board posts as its source of truth.

For the MVP, do not merge in prediction-derived match fixtures from `buildTournamentPredictionMatches()`. Official match or star-event items that should appear on `/schedule` should be entered as admin `정보/일정` posts. This removes local placeholder/test schedule data from the public schedule path.

Default view:

- today-focused list
- quick date filters such as today, tomorrow, this week, all
- list cards grouped by time

Calendar view:

- secondary view
- shows which dates have schedule entries
- selecting a date filters the list

Schedule card:

- square display-name badge
- title
- `정보/일정` label
- date/start-time state
- inline expand control

Expanded detail:

- opens on the same page under the card
- displays the board post body/content
- renders text content inline
- shows lightweight link buttons for attached broadcast or board-detail links
- does not embed images, iframes, or video players inline in the MVP
- should preserve the user’s place in the schedule list
- can link to the full board detail page for media-heavy reading

## Board Experience

The board should show `정보/일정` as a readable prefix on schedule posts.

Normal user posts stay visually distinct from administrator schedule posts. Normal public users should not see controls that let them create `정보/일정` posts.

The admin schedule write UI should feel like the existing board write form:

- wide title input
- large body textarea
- image/video/link inputs
- additional schedule information section near the top
- image upload must work for admin-authenticated users, either by extending the existing board image upload endpoint to accept admin auth or by adding an admin-specific upload endpoint

Avoid a small side-panel form for real use. It was useful for mockups, but it is too cramped for actual schedule authoring.

Existing non-schedule board labels and behavior can remain in the board. The MVP schedule work only changes the display for `category = "schedule"` posts to `정보/일정` and keeps normal user posts from setting that category.

## Data Direction

Prefer extending the existing board-post model over creating a separate schedule content system.

For the MVP, reuse the existing internal `schedule` board category value and display it to users as `정보/일정`.

Use the smallest additive schema path: nullable schedule fields on board posts:

- `category = "schedule"` as the internal schedule marker
- `schedule_date date`
- `schedule_start_time time without time zone null`
- `schedule_display_name text null`
- `external_link_url text null`

Only posts with the schedule marker, date, and display name should be returned to the schedule page.

Date/time storage:

- `schedule_date` is a KST calendar date, stored without timezone.
- `schedule_start_time` is a KST local time, stored without timezone.
- sorting uses `schedule_date ASC`, `schedule_start_time ASC NULLS LAST`, then `created_at ASC`.

Indexing:

- add an index covering `published`, `category`, `schedule_date`, and `schedule_start_time`
- schedule reads should be bounded by date range and limit

Do not reuse `download_url` for broadcast or external schedule links. `download_url` has existing login-gated download semantics, so schedule links need `external_link_url`.

## Validation

Admin schedule post validation:

- reject missing title
- reject missing body/content
- reject missing display name
- reject missing schedule date
- allow missing start time
- validate `external_link_url` as `http` or `https` when present

Admin schedule post editing:

- title, body/content, display name, schedule date, start time, image, video, and external link are editable by the administrator
- unpublishing a schedule post removes it from both board public reads and the schedule page
- deleting a schedule post removes it from both places
- normal board edit APIs must not let public users change schedule fields

Public user validation:

- public users cannot submit schedule marker fields
- public users cannot create schedule posts through normal board write

Schedule page read validation:

- ignore unpublished posts
- ignore posts without schedule date
- ignore posts without display name
- do not render local placeholder/test fixtures

## Mobile And Desktop Behavior

Mobile:

- list-first layout
- square display-name badge remains compact
- display-name badge truncates long values to one line, with a maximum visual width
- expanded detail appears directly under the selected card
- calendar is a secondary view, not the default first screen

Desktop:

- list remains the primary work area
- calendar can sit behind a view toggle or a side companion
- admin write form should use the available width like the current board composer

## Performance

The schedule page should stay lightweight:

- server-render the initial today list
- avoid loading heavy media in every collapsed card
- render media only on the board detail page in the MVP
- render inline schedule details as text plus lightweight links
- use cached/public board reads when possible
- cap the `all` view to a bounded range and result limit, such as the next 60 days and 100 schedule posts

## Explicit Non-Goals

- normal-user schedule submissions
- multiple public schedule categories
- separate schedule-only rich text editor
- end-time collection
- recurring events
- reminders or notifications
- production DNS or Vercel changes
- inline image or video embedding in expanded schedule cards

## Success Criteria

The feature is successful when:

- the administrator can create a schedule post with title, body, display name, date, and optional start time
- the post appears in the board with the `정보/일정` prefix
- the same post appears on the schedule page
- `/schedule` no longer renders prediction placeholder/test fixtures
- the schedule page defaults to today-focused list view
- clicking a schedule card expands the post body inline
- untimed entries appear under `시간 미정`
- normal users cannot create schedule posts
- existing locked navigation labels are preserved
