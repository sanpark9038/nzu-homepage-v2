-- Read-only checklist queries for serving identity migration prep.
--
-- Purpose:
-- - verify the live schema for public.players and public.players_staging
-- - check whether a durable serving identity key already exists
-- - confirm whether unique/index contracts conflict with the draft migration
--
-- Run these before applying add-serving-identity-key.sql or changing sync writes.

-- 1) Basic table shape
select
  table_name,
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('players', 'players_staging')
order by table_name, ordinal_position;

-- 2) Existing constraints
select
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  string_agg(kcu.column_name, ', ' order by kcu.ordinal_position) as columns
from information_schema.table_constraints tc
left join information_schema.key_column_usage kcu
  on tc.constraint_schema = kcu.constraint_schema
 and tc.constraint_name = kcu.constraint_name
 and tc.table_name = kcu.table_name
where tc.table_schema = 'public'
  and tc.table_name in ('players', 'players_staging')
group by tc.table_name, tc.constraint_name, tc.constraint_type
order by tc.table_name, tc.constraint_type, tc.constraint_name;

-- 3) Existing indexes
select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('players', 'players_staging')
order by tablename, indexname;

-- 4) Possible duplicate serving identity buckets if we collapse to gender:wr_id
with candidate_rows as (
  select
    'players' as table_name,
    name,
    eloboard_id,
    gender,
    case
      when coalesce(eloboard_id, '') ~* '^eloboard:(male|female)(:mix)?:[0-9]+$' then
        lower(
          coalesce(nullif(gender, ''), regexp_replace(eloboard_id, '^eloboard:(male|female)(:mix)?:([0-9]+)$', '\1', 'i'))
          || ':' ||
          regexp_replace(eloboard_id, '^eloboard:(male|female)(:mix)?:([0-9]+)$', '\3', 'i')
        )
      when coalesce(eloboard_id, '') <> '' then
        'entity:' || lower(eloboard_id)
      else
        null
    end as serving_identity_key
  from public.players

  union all

  select
    'players_staging' as table_name,
    name,
    eloboard_id,
    gender,
    case
      when coalesce(eloboard_id, '') ~* '^eloboard:(male|female)(:mix)?:[0-9]+$' then
        lower(
          coalesce(nullif(gender, ''), regexp_replace(eloboard_id, '^eloboard:(male|female)(:mix)?:([0-9]+)$', '\1', 'i'))
          || ':' ||
          regexp_replace(eloboard_id, '^eloboard:(male|female)(:mix)?:([0-9]+)$', '\3', 'i')
        )
      when coalesce(eloboard_id, '') <> '' then
        'entity:' || lower(eloboard_id)
      else
        null
    end as serving_identity_key
  from public.players_staging
)
select
  table_name,
  serving_identity_key,
  count(*) as row_count,
  string_agg(coalesce(name, '<null>') || ' [' || coalesce(eloboard_id, '<null>') || ']', '; ' order by name) as rows
from candidate_rows
where serving_identity_key is not null
group by table_name, serving_identity_key
having count(*) > 1
order by table_name, serving_identity_key;

-- 5) Rows still missing durable upstream identity
select
  'players' as table_name,
  count(*) as missing_eloboard_id_rows
from public.players
where eloboard_id is null

union all

select
  'players_staging' as table_name,
  count(*) as missing_eloboard_id_rows
from public.players_staging
where eloboard_id is null;
