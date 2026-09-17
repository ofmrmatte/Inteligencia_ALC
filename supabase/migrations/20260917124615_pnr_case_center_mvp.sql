alter table public.pnr_records
  add column if not exists case_id text,
  add column if not exists route_code text,
  add column if not exists driver_name text,
  add column if not exists currency text,
  add column if not exists main_status text,
  add column if not exists sub_status text,
  add column if not exists reviewed_status text,
  add column if not exists case_type text,
  add column if not exists route_status text,
  add column if not exists priority text,
  add column if not exists capture_change text,
  add column if not exists source_system text not null default 'spreadsheet';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pnr_records_source_system_check'
      and conrelid = 'public.pnr_records'::regclass
  ) then
    alter table public.pnr_records
      add constraint pnr_records_source_system_check
      check (source_system in ('spreadsheet', 'case_center'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'pnr_records_batch_case_id_key'
      and conrelid = 'public.pnr_records'::regclass
  ) then
    alter table public.pnr_records
      add constraint pnr_records_batch_case_id_key unique (batch_id, case_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'pnr_records_capture_change_check'
      and conrelid = 'public.pnr_records'::regclass
  ) then
    alter table public.pnr_records
      add constraint pnr_records_capture_change_check
      check (capture_change is null or capture_change in ('new', 'updated', 'unchanged'));
  end if;
end
$$;

create index if not exists pnr_records_case_id_idx
  on public.pnr_records(case_id)
  where case_id is not null;

create index if not exists pnr_records_batch_capture_change_idx
  on public.pnr_records(batch_id, capture_change)
  where capture_change is not null;

create table if not exists public.pnr_case_center_cases (
  id uuid primary key default gen_random_uuid(),
  case_id text not null unique,
  shipment_id text not null,
  competence text not null,
  case_date date not null,
  route_id text,
  route_code text,
  svc_name text,
  driver_id text,
  driver_name text,
  purchase_value numeric(14,2) not null default 0,
  currency text,
  main_status text,
  sub_status text,
  reviewed_status text,
  case_type text,
  route_status text,
  priority text,
  billing_period text,
  claim_id text,
  pre_invoice_number text,
  base_key text,
  sigla text,
  case_capture_status text not null default 'LIST_ONLY',
  detail_sync_status text not null default 'DETAIL_PENDING',
  timeline_synced_at timestamptz,
  first_captured_at timestamptz not null default now(),
  last_captured_at timestamptz not null default now(),
  source_last_seen_at timestamptz not null default now(),
  latest_batch_id uuid references public.import_batches(id) on delete set null,
  source_system text not null default 'case_center',
  raw_snapshot_jsonb jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pnr_case_center_cases_capture_status_check check (case_capture_status in ('LIST_ONLY', 'COMPLETE', 'ERROR')),
  constraint pnr_case_center_cases_detail_status_check check (detail_sync_status in ('DETAIL_PENDING', 'COMPLETE', 'ERROR')),
  constraint pnr_case_center_cases_source_check check (source_system = 'case_center')
);

create index if not exists pnr_case_center_cases_scope_idx
  on public.pnr_case_center_cases(competence, sigla, base_key);
create index if not exists pnr_case_center_cases_shipment_idx
  on public.pnr_case_center_cases(shipment_id);
create index if not exists pnr_case_center_cases_detail_status_idx
  on public.pnr_case_center_cases(detail_sync_status, competence);

drop trigger if exists global_data_revision_trigger on public.pnr_case_center_cases;
create trigger global_data_revision_trigger
after insert or update or delete or truncate on public.pnr_case_center_cases
for each statement execute function app_private.bump_global_data_revision();

create table if not exists public.pnr_case_events (
  id uuid primary key default gen_random_uuid(),
  case_id text not null,
  event_id text not null,
  event_type text not null,
  date_created timestamptz not null,
  operational_label text not null,
  actor_name text,
  cached_by uuid references public.profiles(id) on delete set null,
  first_captured_at timestamptz not null default now(),
  last_captured_at timestamptz not null default now(),
  cached_at timestamptz not null default now(),
  unique (case_id, event_id),
  foreign key (case_id) references public.pnr_case_center_cases(case_id) on delete restrict
);

create index if not exists pnr_case_events_case_date_idx
  on public.pnr_case_events(case_id, date_created);

alter table public.pnr_case_center_cases enable row level security;
alter table public.pnr_case_events enable row level security;

revoke all on table public.pnr_case_center_cases from anon, authenticated;
grant select on table public.pnr_case_center_cases to authenticated;
grant all on table public.pnr_case_center_cases to service_role;
revoke all on table public.pnr_case_events from anon, authenticated;
grant select on table public.pnr_case_events to authenticated;
grant all on table public.pnr_case_events to service_role;

drop policy if exists "pnr case center cases scoped read" on public.pnr_case_center_cases;
create policy "pnr case center cases scoped read"
on public.pnr_case_center_cases
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.active = true
      and (
        profile.role::text in ('director', 'developer', 'loss_supervisor', 'loss_admin', 'super_admin')
        or 'gestao-pnr' = any(profile.module_scope)
      )
  )
  and ((select app_private.can_manage_imports()) or app_private.can_read_scope(sigla, base_key))
);

drop policy if exists "pnr case events scoped read" on public.pnr_case_events;
create policy "pnr case events scoped read"
on public.pnr_case_events
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.active = true
      and (
        profile.role::text in ('director', 'developer', 'loss_supervisor', 'loss_admin', 'super_admin')
        or 'gestao-pnr' = any(profile.module_scope)
      )
  )
  and exists (
    select 1
    from public.pnr_case_center_cases record
    where record.case_id = pnr_case_events.case_id
      and ((select app_private.can_manage_imports()) or app_private.can_read_scope(record.sigla, record.base_key))
  )
);

comment on column public.pnr_records.source_system is 'Origem do registro PNR: planilha ou Case Center.';
comment on table public.pnr_case_center_cases is 'Estado histórico durável dos casos capturados no Case Center PNR.';
comment on table public.pnr_case_events is 'Histórico permanente e idempotente da timeline operacional do Case Center PNR.';
