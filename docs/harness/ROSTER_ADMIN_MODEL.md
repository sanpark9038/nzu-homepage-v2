# Roster Admin Model

This document records the current operator-approved model for basic university-team roster management.

It is intentionally short. It defines ownership and workflow, not implementation details.

## Scope

This model covers **basic university affiliation** only.

Examples:

- `bgm`
- `hm`
- `dm`
- `wfu`

It does not cover event teams. Event teams are temporary competition groupings and do not change a player's basic university affiliation. Event teams should only matter in prediction or tournament-specific features.

## Core Ownership

The operator-controlled admin state is the source of truth for basic university affiliation.

Eloboard is a collection source, not the authority for homepage affiliation.

If Eloboard shows a player on `bgm`, but the operator moves that player to `hm` or a new basic team in the admin page, the homepage should follow the operator decision.

The pipeline may report that Eloboard differs from the admin state, but it must not automatically apply that difference.

## Player Identity

Player identity and match continuity are based on the player's Eloboard identity.

Basic university affiliation is display/grouping metadata. It is not the player's identity.

Moving a player between basic university teams must not break match history, because match collection follows the player's Eloboard ID.

## Player Names

Use two distinct name fields:

- `name`: canonical Eloboard source name
- `display_name`: homepage display name

Rules:

- `name` is used for source matching, collection, and identity checks.
- `name` should not be manually rewritten just to change public copy.
- `display_name` is what the homepage shows to users.
- `display_name` defaults to `name` when no broadcast alias is known.
- If the operator knows a broadcast alias, store it as `display_name`.
- Existing alias files may remain as fallback while the durable metadata moves toward `display_name` on each player row.

Example:

```json
{
  "entity_id": "eloboard:male:155",
  "name": "eloboard_source_name",
  "display_name": "broadcast_alias"
}
```

## New Basic Teams

The operator may create new basic university teams in the admin page.

Required fields:

- `team_code`
- `team_name`

Rules:

- `team_code` is the internal identifier.
- `team_code` should be saved as lowercase English text, for example `wfu` or `team_a`.
- `team_code` should be treated as stable after creation.
- `team_name` is the public display name.
- A new team does not need a separate bulk player assignment UI.
- Players can be moved into the new team one at a time through the normal player edit flow.
- A team with players must not be deleted.
- Team deletion is only valid after all players have been moved elsewhere.

## Existing Player Moves

When the operator moves an existing player to another basic university team:

- keep the player's Eloboard ID
- keep match history continuity
- keep `display_name`
- keep SOOP ID
- keep tier by default
- allow tier to be edited separately if needed

Eloboard affiliation or tier changes should be shown as review information only.

## New Player Candidates

The admin page should not create brand-new player identity records without Eloboard.

New basic players begin as Eloboard-detected candidates.

Candidate meaning:

- Eloboard has an ID for the player.
- The homepage durable roster metadata does not yet include an approved player row for that identity.

Candidate states:

- `pending`: detected but not decided
- `approved`: accepted into the homepage roster metadata
- `excluded`: ignored for homepage and collection until restored

Rules:

- Pending candidates should not appear on the public homepage.
- Approved candidates appear after the next approved serving sync.
- Excluded candidates should not be collected from Eloboard.
- Excluded candidates should remain recoverable.
- Restoring an excluded candidate makes them eligible for approval and future collection.

## Candidate Approval

Approving a new player candidate requires:

- basic university team
- tier

Optional fields:

- `display_name`
- SOOP user ID

Automatic or preserved fields:

- Eloboard ID
- Eloboard source name
- gender
- race

Eloboard-detected team and tier are reference information. They must not be treated as automatically approved homepage metadata.

## Operations Review Page

The admin area should separate review work from edit work.

Operations review page:

- shows what needs attention
- does not directly mutate roster metadata
- links to the team/player management edit flow through a `process` action

Team/player management page:

- creates teams
- moves players
- edits tier
- edits `display_name`
- edits SOOP ID
- approves or excludes new candidates

Initial operations review groups:

1. new player candidates
2. missing SOOP IDs
3. zero-record players needing review
4. Eloboard affiliation or tier mismatches
5. excluded candidates, as a secondary recovery view

The review page should show count summaries first and let the operator expand each list when needed.

Applied review suppression:

- A new-player candidate is considered handled once its durable `entity_id`
  already exists in the approved roster baseline, even if the operator assigned
  it to a different team than the detected `to` value.
- A new-player candidate is also considered handled when the same identity is
  already in the collection exclusion state.
- Affiliation, tier, and race change rows still require the current approved or
  manual-correction value to match the detected target value before they are
  suppressed.

## Pipeline Contract

The pipeline should:

- collect latest individual match history from Eloboard for approved, non-excluded players
- preserve existing match history continuity by Eloboard identity
- report Eloboard affiliation or tier mismatches
- report missing SOOP IDs
- report zero-record players that still need operator review
- report new Eloboard candidates

The pipeline should not:

- automatically approve new players
- automatically move a player between basic university teams
- automatically change a player's tier
- collect match history for excluded candidates
- treat event teams as basic university affiliation
