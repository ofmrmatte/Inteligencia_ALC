alter table public.pnr_case_center_cases
  add column if not exists detail_parser_version integer not null default 0,
  add column if not exists detail_last_attempt_at timestamptz,
  add column if not exists detail_last_success_at timestamptz,
  add column if not exists detail_next_sync_at timestamptz,
  add column if not exists detail_sync_attempts integer not null default 0,
  add column if not exists detail_last_error text;

update public.pnr_case_center_cases
set
  detail_parser_version = case
    when raw_snapshot_jsonb ->> 'timelineParserVersion' ~ '^\d+$'
      then (raw_snapshot_jsonb ->> 'timelineParserVersion')::integer
    else 0
  end,
  detail_last_success_at = timeline_synced_at
where detail_sync_status = 'COMPLETE';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pnr_case_center_cases_sync_attempts_check'
      and conrelid = 'public.pnr_case_center_cases'::regclass
  ) then
    alter table public.pnr_case_center_cases
      add constraint pnr_case_center_cases_sync_attempts_check
      check (detail_sync_attempts >= 0);
  end if;
end
$$;

create index if not exists pnr_case_center_cases_detail_queue_idx
  on public.pnr_case_center_cases(
    detail_sync_status,
    detail_parser_version,
    detail_next_sync_at nulls first,
    detail_last_success_at nulls first
  );

create table if not exists public.pnr_case_detail_snapshots (
  id uuid primary key default gen_random_uuid(),
  case_id text not null,
  parser_version integer not null,
  payload_jsonb jsonb not null,
  payload_hash text not null,
  captured_at timestamptz not null,
  cached_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint pnr_case_detail_snapshots_payload_hash_check check (payload_hash ~ '^[a-f0-9]{64}$'),
  constraint pnr_case_detail_snapshots_case_id_payload_hash_key unique (case_id, payload_hash),
  constraint pnr_case_detail_snapshots_case_id_fkey
    foreign key (case_id) references public.pnr_case_center_cases(case_id) on delete restrict
);

create index if not exists pnr_case_detail_snapshots_case_captured_idx
  on public.pnr_case_detail_snapshots(case_id, captured_at desc);

create index if not exists pnr_case_detail_snapshots_cached_by_idx
  on public.pnr_case_detail_snapshots(cached_by)
  where cached_by is not null;

alter table public.pnr_case_detail_snapshots enable row level security;

revoke all on table public.pnr_case_detail_snapshots from anon, authenticated;
grant select on table public.pnr_case_detail_snapshots to authenticated;
grant all on table public.pnr_case_detail_snapshots to service_role;

drop policy if exists "pnr case detail snapshots scoped read" on public.pnr_case_detail_snapshots;
create policy "pnr case detail snapshots scoped read"
on public.pnr_case_detail_snapshots
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
    where record.case_id = pnr_case_detail_snapshots.case_id
      and ((select app_private.can_manage_imports()) or app_private.can_read_scope(record.sigla, record.base_key))
  )
);

comment on table public.pnr_case_detail_snapshots is 'Versões imutáveis dos detalhes sanitizados recebidos do Case Center PNR.';
comment on column public.pnr_case_detail_snapshots.payload_hash is 'SHA-256 do payload canônico para persistência idempotente.';
