-- Hardening generated during the processed-only/Railway readiness audit.
-- This migration is intentionally idempotent.

create unique index if not exists idx_desvios_pnr_records_module_dedupe
  on public.desvios_pnr_records(module_key, dedupe_key);

create unique index if not exists idx_gestao_desvios_pf_module_dedupe
  on public.gestao_desvios_pacotes_faltantes(module_key, dedupe_key);

insert into public.processed_dashboard_files (
  module_key,
  file_name,
  file_hash,
  file_size,
  last_modified,
  competencia,
  row_count,
  status,
  processed_at,
  metadata,
  storage_path,
  raw_file_deleted,
  file_role
)
select
  'pacotes_faltantes',
  d.file_name,
  d.metadata->>'file_hash',
  d.file_size,
  coalesce(d.updated_at::text, d.created_at::text),
  coalesce(d.metadata->>'competencia', ''),
  coalesce(nullif(d.metadata->>'record_count', '')::integer, nullif(d.metadata->>'parsed_rows', '')::integer, 0),
  coalesce(nullif(d.status, ''), 'processed'),
  coalesce((d.metadata->>'processed_at')::timestamptz, d.updated_at, d.created_at, now()),
  coalesce(d.metadata, '{}'::jsonb) || jsonb_build_object(
    'module_key', 'pacotes_faltantes',
    'dashboard_module_key', 'pacotes_faltantes',
    'dashboard_file_id', d.id,
    'file_id', d.id,
    'storage_path', d.storage_path,
    'raw_file_deleted', true
  ),
  d.storage_path,
  true,
  ''
from public.dashboard_files d
where d.file_type = 'PACOTES_FALTANTES'
  and nullif(d.metadata->>'file_hash', '') is not null
on conflict (module_key, file_hash) do update
set
  file_name = excluded.file_name,
  file_size = excluded.file_size,
  last_modified = excluded.last_modified,
  competencia = excluded.competencia,
  row_count = excluded.row_count,
  status = excluded.status,
  processed_at = excluded.processed_at,
  metadata = excluded.metadata,
  storage_path = excluded.storage_path,
  raw_file_deleted = excluded.raw_file_deleted,
  file_role = excluded.file_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  insert into public.profiles (
    id,
    email,
    name,
    role,
    is_admin,
    setor
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', 'Usuario'),
    'user',
    false,
    'LOSS'
  )
  on conflict (id) do update
  set
    email = excluded.email,
    name = coalesce(nullif(public.profiles.name, ''), excluded.name),
    role = coalesce(nullif(public.profiles.role, ''), excluded.role),
    is_admin = coalesce(public.profiles.is_admin, excluded.is_admin),
    setor = coalesce(nullif(public.profiles.setor, ''), excluded.setor);

  return new;
end;
$function$;

analyze public.processed_dashboard_files;
analyze public.desvios_pnr_records;
analyze public.gestao_desvios_pacotes_faltantes;
