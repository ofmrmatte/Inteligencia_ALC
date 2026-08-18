create table if not exists public.global_data_revision (
  id smallint primary key default 1 check (id = 1),
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);

insert into public.global_data_revision (id, revision, updated_at)
values (1, 1, now())
on conflict (id) do nothing;

alter table public.global_data_revision enable row level security;

drop policy if exists "global data revision authenticated read" on public.global_data_revision;
create policy "global data revision authenticated read"
on public.global_data_revision
for select
to authenticated
using (true);

revoke all on table public.global_data_revision from anon;
grant select on table public.global_data_revision to authenticated;

create or replace function app_private.bump_global_data_revision()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.global_data_revision
  set revision = revision + 1,
      updated_at = now()
  where id = 1;
  return null;
end;
$$;

revoke all on function app_private.bump_global_data_revision() from public, anon, authenticated;

do $$
declare
  target_table text;
  tracked_tables text[] := array[
    'admin_base_assignments',
    'alc_drivers',
    'dashboard_files',
    'dashboard_settings',
    'desvios_pnr_records',
    'discount_cases',
    'driver_dispute_messages',
    'driver_disputes',
    'driver_notifications',
    'driver_payment_batches',
    'driver_payment_document_versions',
    'driver_payment_documents',
    'driver_portal_base_access',
    'driver_records',
    'gestao_desvios_pacotes_faltantes',
    'gestao_pacotes_records',
    'hierarchy_scopes',
    'import_batches',
    'imported_files',
    'operational_bases',
    'operational_unit_supervisors',
    'operational_units',
    'operational_xpts',
    'pnr_records',
    'pre_fatura_records',
    'prefatura_records',
    'processed_dashboard_files',
    'profiles',
    'quality_issues',
    'risk_lm_records'
  ];
begin
  foreach target_table in array tracked_tables loop
    if to_regclass(format('public.%I', target_table)) is not null then
      execute format('drop trigger if exists global_data_revision_trigger on public.%I', target_table);
      execute format(
        'create trigger global_data_revision_trigger after insert or update or delete or truncate on public.%I for each statement execute function app_private.bump_global_data_revision()',
        target_table
      );
    end if;
  end loop;
end;
$$;
