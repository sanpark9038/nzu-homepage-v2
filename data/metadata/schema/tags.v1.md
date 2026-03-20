# Metadata Tags v1

This document defines the canonical tag keys for player/match statistics segmentation.

## Tag Format

- Pattern: `key:value`
- Allowed chars: lowercase letters, numbers, `_`, `-`, `:`
- Example: `team:늪지대` is allowed in higher-level JSON fields, but `meta_tags` should prefer ASCII-safe slugs such as `team:nzu`.

## Recommended Player Tags

- `provider:eloboard`
- `gender:male|female`
- `team:<slug>` (example: `team:nzu`)
- `race:zerg|protoss|terran|unknown`
- `tier:<slug>` (example: `tier:spade`, `tier:6`)
- `identity:verified|unverified`

## Recommended Match Tags

- `event:<slug>`
- `match_type:official|scrim|ladder|unknown`
- `format:bo1|bo3|bo5|unknown`
- `map:<slug>`
- `season:<yyyy>` or `season:<yyyyq#>`
- `source:eloboard`
- `confidence:high|medium|low`

## Rules

1. Do not encode numeric stats in tags. Keep tags for filtering dimensions only.
2. Keep one semantic value per key when possible.
3. If confidence is uncertain, keep the row and set `confidence:low` rather than dropping it blindly.
