create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'app_role'
  ) then
    create type public.app_role as enum ('coordinator', 'supervisor', 'director', 'admin');
  end if;
end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text not null default '',
  role text not null default 'coordinator',
  base_scope text[] not null default '{}',
  sigla_scope text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists email text,
  add column if not exists full_name text not null default '',
  add column if not exists role text not null default 'coordinator',
  add column if not exists base_scope text[] not null default '{}',
  add column if not exists sigla_scope text[] not null default '{}',
  add column if not exists active boolean not null default true,
  add column if not exists global_access boolean not null default false,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  imported_by uuid references public.profiles(id) on delete set null,
  name text not null,
  module text not null default 'painel',
  competence text,
  fortnight text,
  month text,
  status text not null default 'concluído',
  file_hash text,
  row_count integer not null default 0,
  valid_count integer not null default 0,
  persisted_count integer not null default 0,
  ignored_count integer not null default 0,
  error_count integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.import_batches
  add column if not exists imported_by uuid references public.profiles(id) on delete set null,
  add column if not exists module text not null default 'painel',
  add column if not exists competence text,
  add column if not exists fortnight text,
  add column if not exists month text,
  add column if not exists status text not null default 'concluído',
  add column if not exists file_hash text,
  add column if not exists row_count integer not null default 0,
  add column if not exists valid_count integer not null default 0,
  add column if not exists persisted_count integer not null default 0,
  add column if not exists ignored_count integer not null default 0,
  add column if not exists error_count integer not null default 0,
  add column if not exists started_at timestamptz not null default now(),
  add column if not exists finished_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.imported_files (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  original_name text not null,
  storage_path text,
  file_size bigint not null default 0,
  file_hash text not null,
  workbook_count integer not null default 1,
  created_at timestamptz not null default now()
);

alter table public.imported_files
  add column if not exists storage_path text,
  add column if not exists file_size bigint not null default 0,
  add column if not exists file_hash text not null default '',
  add column if not exists workbook_count integer not null default 1,
  add column if not exists created_at timestamptz not null default now();

create table if not exists public.hierarchy_scopes (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.import_batches(id) on delete cascade,
  coordinator_id uuid references public.profiles(id) on delete set null,
  supervisor_id uuid references public.profiles(id) on delete set null,
  coordinator_name text not null,
  supervisor_name text not null,
  sigla text not null,
  base_name text not null,
  base_key text not null,
  source_file text,
  source_sheet text,
  source_row integer,
  created_at timestamptz not null default now()
);

create table if not exists public.prefatura_records (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  shipment_id text not null,
  route_id text,
  operation text not null,
  period text,
  fortnight text,
  month text,
  route_date date,
  base_label text,
  base_name text,
  base_key text,
  sigla text,
  driver_name text,
  plate text,
  description text,
  value numeric(14,2) not null default 0,
  source_file text not null,
  source_sheet text not null,
  source_row integer not null,
  original_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.prefatura_records add column if not exists month text;

create table if not exists public.pnr_records (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  shipment_id text not null,
  case_date date,
  status text,
  billing_period text,
  fortnight text,
  month text,
  products text,
  purchase_value numeric(14,2) not null default 0,
  carrier text,
  origin_station text,
  base_key text,
  sigla text,
  route_id text,
  driver_id text,
  custom text,
  source_file text not null,
  source_sheet text not null,
  source_row integer not null,
  original_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.pnr_records
  add column if not exists month text,
  add column if not exists custom text;

create table if not exists public.risk_lm_records (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  shipment_id text not null,
  failure_date date,
  fortnight text,
  month text,
  item_description text,
  driver_id text,
  facility_id text,
  destination_type text,
  carrier_name text,
  failure_reason text,
  last_substatus text,
  route_id text,
  route_status text,
  destination_facility_id text,
  vehicle_type text,
  quantity integer not null default 0,
  stopped_days integer not null default 0,
  gmv_usd numeric(14,2) not null default 0,
  gmv_brl numeric(14,2) not null default 0,
  base_key text,
  sigla text,
  source_file text not null,
  source_sheet text not null,
  source_row integer not null,
  original_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.risk_lm_records
  add column if not exists month text,
  add column if not exists item_description text,
  add column if not exists destination_type text,
  add column if not exists carrier_name text,
  add column if not exists route_status text,
  add column if not exists destination_facility_id text,
  add column if not exists vehicle_type text,
  add column if not exists quantity integer not null default 0,
  add column if not exists stopped_days integer not null default 0,
  add column if not exists gmv_usd numeric(14,2) not null default 0;

create table if not exists public.driver_records (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  driver_id text not null,
  name text not null,
  experience text,
  incidents integer not null default 0,
  last_updated date,
  state text,
  shipped integer not null default 0,
  delivered integer not null default 0,
  undelivered integer not null default 0,
  unvisited integer not null default 0,
  penalized integer not null default 0,
  contradictory_pnr integer not null default 0,
  empty_boxes integer not null default 0,
  lost integer not null default 0,
  stolen integer not null default 0,
  source_file text not null,
  source_sheet text not null,
  source_row integer not null,
  original_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.driver_records
  add column if not exists experience text,
  add column if not exists unvisited integer not null default 0,
  add column if not exists penalized integer not null default 0,
  add column if not exists contradictory_pnr integer not null default 0,
  add column if not exists empty_boxes integer not null default 0,
  add column if not exists lost integer not null default 0,
  add column if not exists stolen integer not null default 0;

create table if not exists public.quality_issues (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.import_batches(id) on delete cascade,
  severity text not null,
  rule text not null,
  dataset text not null,
  field_name text,
  original_value text,
  suggestion text,
  status text not null default 'open',
  source_file text,
  source_sheet text,
  source_row integer,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_table text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists import_batches_fortnight_idx on public.import_batches(fortnight);
create index if not exists import_batches_month_idx on public.import_batches(month);
create index if not exists hierarchy_scopes_scope_idx on public.hierarchy_scopes(sigla, base_key);
create index if not exists prefatura_records_scope_idx on public.prefatura_records(fortnight, sigla, base_key);
create index if not exists prefatura_records_month_idx on public.prefatura_records(month);
create index if not exists prefatura_records_shipment_idx on public.prefatura_records(shipment_id);
create index if not exists pnr_records_scope_idx on public.pnr_records(fortnight, sigla, base_key);
create index if not exists pnr_records_month_idx on public.pnr_records(month);
create index if not exists pnr_records_shipment_idx on public.pnr_records(shipment_id);
create index if not exists risk_lm_records_scope_idx on public.risk_lm_records(fortnight, sigla, base_key);
create index if not exists risk_lm_records_month_idx on public.risk_lm_records(month);
create index if not exists risk_lm_records_shipment_idx on public.risk_lm_records(shipment_id);
create index if not exists driver_records_driver_idx on public.driver_records(driver_id);

drop policy if exists "profiles read own or admin" on public.profiles;
drop policy if exists "profiles admin write" on public.profiles;
drop policy if exists "imports full access read" on public.import_batches;
drop policy if exists "imports authenticated read" on public.import_batches;
drop policy if exists "imports full access write" on public.import_batches;
drop policy if exists "files full access" on public.imported_files;
drop policy if exists "hierarchy scoped read" on public.hierarchy_scopes;
drop policy if exists "hierarchy full access write" on public.hierarchy_scopes;
drop policy if exists "prefatura scoped read" on public.prefatura_records;
drop policy if exists "prefatura full access write" on public.prefatura_records;
drop policy if exists "pnr scoped read" on public.pnr_records;
drop policy if exists "pnr full access write" on public.pnr_records;
drop policy if exists "risk scoped read" on public.risk_lm_records;
drop policy if exists "risk full access write" on public.risk_lm_records;
drop policy if exists "drivers authenticated read" on public.driver_records;
drop policy if exists "drivers full access write" on public.driver_records;
drop policy if exists "quality scoped read" on public.quality_issues;
drop policy if exists "quality full access write" on public.quality_issues;
drop policy if exists "audit admin read" on public.audit_events;
drop policy if exists "audit admin insert" on public.audit_events;

drop function if exists public.current_user_role();

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role::text from public.profiles where id = auth.uid() and active = true
$$;

create or replace function public.has_full_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and active = true
        and (global_access = true or role::text in ('director', 'admin'))
    ),
    false
  )
$$;

create or replace function public.current_base_scope()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(base_scope, '{}') from public.profiles where id = auth.uid() and active = true
$$;

create or replace function public.current_sigla_scope()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sigla_scope, '{}') from public.profiles where id = auth.uid() and active = true
$$;

create or replace function public.can_read_scope(record_sigla text, record_base_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_full_access()
    or coalesce(record_sigla, '') = any(public.current_sigla_scope())
    or coalesce(record_base_key, '') = any(public.current_base_scope())
$$;

alter table public.profiles enable row level security;
alter table public.import_batches enable row level security;
alter table public.imported_files enable row level security;
alter table public.hierarchy_scopes enable row level security;
alter table public.prefatura_records enable row level security;
alter table public.pnr_records enable row level security;
alter table public.risk_lm_records enable row level security;
alter table public.driver_records enable row level security;
alter table public.quality_issues enable row level security;
alter table public.audit_events enable row level security;

drop policy if exists "profiles read own or admin" on public.profiles;
drop policy if exists "profiles admin write" on public.profiles;
drop policy if exists "imports full access read" on public.import_batches;
drop policy if exists "imports authenticated read" on public.import_batches;
drop policy if exists "imports full access write" on public.import_batches;
drop policy if exists "files full access" on public.imported_files;
drop policy if exists "hierarchy scoped read" on public.hierarchy_scopes;
drop policy if exists "hierarchy full access write" on public.hierarchy_scopes;
drop policy if exists "prefatura scoped read" on public.prefatura_records;
drop policy if exists "prefatura full access write" on public.prefatura_records;
drop policy if exists "pnr scoped read" on public.pnr_records;
drop policy if exists "pnr full access write" on public.pnr_records;
drop policy if exists "risk scoped read" on public.risk_lm_records;
drop policy if exists "risk full access write" on public.risk_lm_records;
drop policy if exists "drivers authenticated read" on public.driver_records;
drop policy if exists "drivers full access write" on public.driver_records;
drop policy if exists "quality scoped read" on public.quality_issues;
drop policy if exists "quality full access write" on public.quality_issues;
drop policy if exists "audit admin read" on public.audit_events;
drop policy if exists "audit admin insert" on public.audit_events;

create policy "profiles read own or admin" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.has_full_access());
create policy "profiles admin write" on public.profiles
  for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

create policy "imports authenticated read" on public.import_batches
  for select to authenticated
  using ((select auth.uid()) is not null);
create policy "imports full access write" on public.import_batches
  for all to authenticated
  using (public.has_full_access())
  with check (public.has_full_access());

create policy "files full access" on public.imported_files
  for all to authenticated
  using (public.has_full_access())
  with check (public.has_full_access());

create policy "hierarchy scoped read" on public.hierarchy_scopes
  for select to authenticated
  using (public.has_full_access() or sigla = any(public.current_sigla_scope()) or base_key = any(public.current_base_scope()));
create policy "hierarchy full access write" on public.hierarchy_scopes
  for all to authenticated
  using (public.has_full_access())
  with check (public.has_full_access());

create policy "prefatura scoped read" on public.prefatura_records
  for select to authenticated
  using (public.can_read_scope(sigla, base_key));
create policy "prefatura full access write" on public.prefatura_records
  for all to authenticated
  using (public.has_full_access())
  with check (public.has_full_access());

create policy "pnr scoped read" on public.pnr_records
  for select to authenticated
  using (public.can_read_scope(sigla, base_key));
create policy "pnr full access write" on public.pnr_records
  for all to authenticated
  using (public.has_full_access())
  with check (public.has_full_access());

create policy "risk scoped read" on public.risk_lm_records
  for select to authenticated
  using (public.can_read_scope(sigla, base_key));
create policy "risk full access write" on public.risk_lm_records
  for all to authenticated
  using (public.has_full_access())
  with check (public.has_full_access());

create policy "drivers authenticated read" on public.driver_records
  for select to authenticated
  using ((select auth.uid()) is not null);
create policy "drivers full access write" on public.driver_records
  for all to authenticated
  using (public.has_full_access())
  with check (public.has_full_access());

create policy "quality scoped read" on public.quality_issues
  for select to authenticated
  using ((select auth.uid()) is not null);
create policy "quality full access write" on public.quality_issues
  for all to authenticated
  using (public.has_full_access())
  with check (public.has_full_access());

create policy "audit admin read" on public.audit_events
  for select to authenticated
  using (public.has_full_access());
create policy "audit admin insert" on public.audit_events
  for insert to authenticated
  with check (public.has_full_access());

grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.import_batches,
  public.imported_files,
  public.hierarchy_scopes,
  public.prefatura_records,
  public.pnr_records,
  public.risk_lm_records,
  public.driver_records,
  public.quality_issues,
  public.audit_events
to authenticated;
grant select, update on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'alc-imports',
  'alc-imports',
  false,
  83886080,
  array[
    'application/zip',
    'application/x-zip-compressed',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel.sheet.macroenabled.12',
    'application/vnd.ms-excel',
    'text/csv',
    'application/octet-stream'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "alc imports read" on storage.objects;
drop policy if exists "alc imports insert" on storage.objects;
drop policy if exists "alc imports update" on storage.objects;
drop policy if exists "alc imports delete" on storage.objects;

create policy "alc imports read" on storage.objects
  for select to authenticated
  using (bucket_id = 'alc-imports' and public.has_full_access());
create policy "alc imports insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'alc-imports' and public.has_full_access());
create policy "alc imports update" on storage.objects
  for update to authenticated
  using (bucket_id = 'alc-imports' and public.has_full_access())
  with check (bucket_id = 'alc-imports' and public.has_full_access());
create policy "alc imports delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'alc-imports' and public.has_full_access());
