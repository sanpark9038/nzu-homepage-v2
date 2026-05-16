# Scripts Archive

This directory contains historical one-off exploration, migration, and recovery scripts.

Do not use these files as live pipeline or metadata sources. The canonical player metadata source is:

- `data/metadata/projects/*/players.*.v1.json`

The former `scripts/player_metadata.json` file is archived at
`scripts/archive/player-metadata-source-consolidation/player_metadata.legacy_reference.v1.json`
as migration evidence only. If an archived script points at it, treat that
script as historical context and rewrite the workflow against project metadata
before using it.
