create type public.app_role as enum ('coordinator', 'supervisor', 'director', 'admin');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  role public.app_role not null default 'coordinator',
  base_scope text[] not null default '{}',
  sigla_scope text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  imported_by uuid not null references public.profiles(id),
  name text not null,
  module text not null,
  competence text,
  fortnight text,
  status text not null default 'processing',
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

create table public.imported_files (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  original_name text not null,
  storage_path text,
  file_size bigint not null default 0,
  file_hash text not null,
  workbook_count integer not null default 1,
  created_at timestamptz not null default now(),
  unique (file_hash)
);

create table public.hierarchy_scopes (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.import_batches(id) on delete set null,
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

create table public.prefatura_records (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  shipment_id text not null,
  route_id text,
  operation text not null,
  period text,
  fortnight text,
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

create table public.pnr_records (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  shipment_id text not null,
  case_date date,
  status text,
  billing_period text,
  fortnight text,
  products text,
  purchase_value numeric(14,2) not null default 0,
  carrier text,
  origin_station text,
  base_key text,
  sigla text,
  route_id text,
  driver_id text,
  source_file text not null,
  source_sheet text not null,
  source_row integer not null,
  original_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.risk_lm_records (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  shipment_id text not null,
  failure_date date,
  fortnight text,
  driver_id text,
  facility_id text,
  failure_reason text,
  last_substatus text,
  route_id text,
  gmv_brl numeric(14,2) not null default 0,
  base_key text,
  sigla text,
  source_file text not null,
  source_sheet text not null,
  source_row integer not null,
  original_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.driver_records (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  driver_id text not null,
  name text not null,
  state text,
  shipped integer not null default 0,
  delivered integer not null default 0,
  undelivered integer not null default 0,
  incidents integer not null default 0,
  last_updated date,
  source_file text not null,
  source_sheet text not null,
  source_row integer not null,
  original_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.quality_issues (
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

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_table text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index import_batches_fortnight_idx on public.import_batches(fortnight);
create index hierarchy_scopes_scope_idx on public.hierarchy_scopes(sigla, base_key);
create index prefatura_records_scope_idx on public.prefatura_records(fortnight, sigla, base_key);
create index prefatura_records_shipment_idx on public.prefatura_records(shipment_id);
create index pnr_records_scope_idx on public.pnr_records(fortnight, sigla, base_key);
create index pnr_records_shipment_idx on public.pnr_records(shipment_id);
create index risk_lm_records_scope_idx on public.risk_lm_records(fortnight, sigla, base_key);
create index risk_lm_records_shipment_idx on public.risk_lm_records(shipment_id);
create index driver_records_driver_idx on public.driver_records(driver_id);

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and active = true
$$;

create or replace function public.has_full_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('director', 'admin'), false)
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

create policy "profiles read own or admin" on public.profiles
  for select using (id = auth.uid() or public.has_full_access());
create policy "profiles admin write" on public.profiles
  for all using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

create policy "imports full access read" on public.import_batches
  for select using (public.has_full_access());
create policy "imports full access write" on public.import_batches
  for all using (public.has_full_access())
  with check (public.has_full_access());

create policy "files full access" on public.imported_files
  for all using (public.has_full_access())
  with check (public.has_full_access());

create policy "hierarchy scoped read" on public.hierarchy_scopes
  for select using (public.has_full_access() or sigla = any(public.current_sigla_scope()) or base_key = any(public.current_base_scope()));
create policy "hierarchy full access write" on public.hierarchy_scopes
  for all using (public.has_full_access())
  with check (public.has_full_access());

create policy "prefatura scoped read" on public.prefatura_records
  for select using (public.can_read_scope(sigla, base_key));
create policy "prefatura full access write" on public.prefatura_records
  for all using (public.has_full_access())
  with check (public.has_full_access());

create policy "pnr scoped read" on public.pnr_records
  for select using (public.can_read_scope(sigla, base_key));
create policy "pnr full access write" on public.pnr_records
  for all using (public.has_full_access())
  with check (public.has_full_access());

create policy "risk scoped read" on public.risk_lm_records
  for select using (public.can_read_scope(sigla, base_key));
create policy "risk full access write" on public.risk_lm_records
  for all using (public.has_full_access())
  with check (public.has_full_access());

create policy "drivers authenticated read" on public.driver_records
  for select using (auth.uid() is not null);
create policy "drivers full access write" on public.driver_records
  for all using (public.has_full_access())
  with check (public.has_full_access());

create policy "quality scoped read" on public.quality_issues
  for select using (auth.uid() is not null);
create policy "quality full access write" on public.quality_issues
  for all using (public.has_full_access())
  with check (public.has_full_access());

create policy "audit admin read" on public.audit_events
  for select using (public.has_full_access());
create policy "audit admin insert" on public.audit_events
  for insert with check (public.has_full_access());
