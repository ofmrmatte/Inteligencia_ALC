alter table public.operational_xpts
  add column if not exists coordinator_name text,
  add column if not exists supervisors text[] not null default '{}'::text[];
