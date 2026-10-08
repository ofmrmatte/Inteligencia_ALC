-- Atomic commit RPCs for processed dashboard imports.

create unique index if not exists idx_pre_fatura_records_module_shipment_unique
on public.pre_fatura_records(module_key, btrim(id_envio))
where nullif(btrim(id_envio), '') is not null;

create or replace function public.commit_pre_fatura_import(
  p_file jsonb,
  p_rows jsonb,
  p_processed jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_file_id uuid := gen_random_uuid();
  v_file_hash text := nullif(p_processed->>'file_hash', '');
  v_inserted integer := 0;
  v_requested integer := jsonb_array_length(coalesce(p_rows, '[]'::jsonb));
  v_pre_skipped integer := coalesce(nullif(p_file->'metadata'->>'existing_ids_skipped', '')::integer, 0);
  v_existing public.processed_dashboard_files%rowtype;
  v_metadata jsonb := coalesce(p_file->'metadata', '{}'::jsonb);
begin
  if not private.is_current_user_admin() then
    raise exception 'Apenas administradores podem persistir importações.' using errcode = '42501';
  end if;
  if v_file_hash is null then
    raise exception 'Hash do arquivo é obrigatório.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('pre_fatura|' || v_file_hash, 0));

  select * into v_existing
  from public.processed_dashboard_files
  where module_key = 'pre_fatura' and file_hash = v_file_hash and status = 'processed'
  limit 1;

  if found then
    return jsonb_build_object(
      'fileId', null,
      'fileHash', v_file_hash,
      'duplicateFile', true,
      'existingIdsSkipped', 0,
      'persistedRows', 0,
      'processedFile', jsonb_build_object(
        'id', v_existing.id,
        'file_name', v_existing.file_name,
        'row_count', v_existing.row_count,
        'status', v_existing.status,
        'processed_at', v_existing.processed_at
      )
    );
  end if;

  insert into public.dashboard_files
  select (jsonb_populate_record(
    null::public.dashboard_files,
    p_file || jsonb_build_object('id', v_file_id, 'status', 'processing')
  )).*;

  insert into public.pre_fatura_records
  select (jsonb_populate_record(
    null::public.pre_fatura_records,
    value || jsonb_build_object('id', gen_random_uuid(), 'file_id', v_file_id)
  )).*
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  on conflict do nothing;
  get diagnostics v_inserted = row_count;

  v_metadata := v_metadata || jsonb_build_object(
    'persisted_rows', v_inserted,
    'existing_ids_skipped', v_pre_skipped + greatest(v_requested - v_inserted, 0)
  );

  update public.dashboard_files
  set status = 'processed', metadata = v_metadata, updated_at = now()
  where id = v_file_id;

  insert into public.processed_dashboard_files (
    module_key, file_name, file_hash, file_size, last_modified, competencia,
    row_count, status, processed_at, metadata, storage_path, raw_file_deleted, file_role
  ) values (
    'pre_fatura',
    p_processed->>'file_name',
    v_file_hash,
    nullif(p_processed->>'file_size', '')::bigint,
    p_processed->>'last_modified',
    p_processed->>'competencia',
    v_inserted,
    'processed',
    now(),
    v_metadata,
    p_processed->>'storage_path',
    coalesce((p_processed->>'raw_file_deleted')::boolean, true),
    coalesce(p_processed->>'file_role', 'quinzena')
  )
  on conflict (module_key, file_hash) do update
  set row_count = excluded.row_count,
      status = excluded.status,
      processed_at = excluded.processed_at,
      metadata = excluded.metadata,
      storage_path = excluded.storage_path,
      raw_file_deleted = excluded.raw_file_deleted,
      file_role = excluded.file_role;

  return jsonb_build_object(
    'fileId', v_file_id,
    'fileHash', v_file_hash,
    'duplicateFile', false,
    'existingIdsSkipped', v_pre_skipped + greatest(v_requested - v_inserted, 0),
    'persistedRows', v_inserted,
    'processedFile', null
  );
end;
$$;

create or replace function public.commit_gestao_pacotes_import(
  p_file jsonb,
  p_rows jsonb,
  p_processed jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_file_id uuid := gen_random_uuid();
  v_file_hash text := nullif(p_processed->>'file_hash', '');
  v_inserted integer := 0;
  v_existing public.processed_dashboard_files%rowtype;
  v_metadata jsonb := coalesce(p_file->'metadata', '{}'::jsonb);
begin
  if not private.is_current_user_admin() then
    raise exception 'Apenas administradores podem persistir importações.' using errcode = '42501';
  end if;
  if v_file_hash is null then
    raise exception 'Hash do arquivo é obrigatório.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('gestao_pacotes|' || v_file_hash, 0));
  select * into v_existing from public.processed_dashboard_files
  where module_key = 'gestao_pacotes' and file_hash = v_file_hash and status = 'processed'
  limit 1;
  if found then
    return jsonb_build_object('fileId', null, 'fileHash', v_file_hash, 'duplicateFile', true, 'persistedRows', 0);
  end if;

  insert into public.dashboard_files
  select (jsonb_populate_record(null::public.dashboard_files, p_file || jsonb_build_object('id', v_file_id, 'status', 'processing'))).*;

  insert into public.gestao_pacotes_records
  select (jsonb_populate_record(
    null::public.gestao_pacotes_records,
    value || jsonb_build_object('id', gen_random_uuid(), 'file_id', v_file_id)
  )).*
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  on conflict do nothing;
  get diagnostics v_inserted = row_count;

  v_metadata := v_metadata || jsonb_build_object('persisted_rows', v_inserted);
  update public.dashboard_files set status='processed', metadata=v_metadata, updated_at=now() where id=v_file_id;

  insert into public.processed_dashboard_files (
    module_key, file_name, file_hash, file_size, last_modified, competencia,
    row_count, status, processed_at, metadata, storage_path, raw_file_deleted, file_role
  ) values (
    'gestao_pacotes', p_processed->>'file_name', v_file_hash,
    nullif(p_processed->>'file_size','')::bigint, p_processed->>'last_modified', p_processed->>'competencia',
    v_inserted, 'processed', now(), v_metadata, p_processed->>'storage_path',
    coalesce((p_processed->>'raw_file_deleted')::boolean, true), coalesce(p_processed->>'file_role','quinzena')
  ) on conflict (module_key,file_hash) do update
  set row_count=excluded.row_count, status=excluded.status, processed_at=excluded.processed_at,
      metadata=excluded.metadata, storage_path=excluded.storage_path,
      raw_file_deleted=excluded.raw_file_deleted, file_role=excluded.file_role;

  return jsonb_build_object('fileId', v_file_id, 'fileHash', v_file_hash, 'duplicateFile', false, 'persistedRows', v_inserted);
end;
$$;

create or replace function public.commit_desvios_pnr_import(
  p_file jsonb,
  p_rows jsonb,
  p_processed jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_file_id uuid := gen_random_uuid();
  v_file_hash text := nullif(p_processed->>'file_hash', '');
  v_inserted integer := 0;
  v_existing public.processed_dashboard_files%rowtype;
  v_metadata jsonb := coalesce(p_file->'metadata', '{}'::jsonb);
begin
  if not private.is_current_user_admin() then
    raise exception 'Apenas administradores podem persistir importações PNR.' using errcode = '42501';
  end if;
  if v_file_hash is null then
    raise exception 'Hash do arquivo é obrigatório.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('desvios_pnr|' || v_file_hash, 0));
  select * into v_existing from public.processed_dashboard_files
  where module_key='desvios_pnr' and file_hash=v_file_hash and status='processed'
  limit 1;
  if found then
    return jsonb_build_object('fileId', null, 'fileHash', v_file_hash, 'duplicateFile', true, 'persistedRows', 0);
  end if;

  insert into public.dashboard_files
  select (jsonb_populate_record(null::public.dashboard_files, p_file || jsonb_build_object('id', v_file_id, 'status', 'processing'))).*;

  insert into public.desvios_pnr_records
  select (jsonb_populate_record(
    null::public.desvios_pnr_records,
    value || jsonb_build_object(
      'id', gen_random_uuid(),
      'file_id', v_file_id,
      'manual_status_override', coalesce((value->>'manual_status_override')::boolean, false),
      'raw_data', coalesce(value->'raw_data', '{}'::jsonb),
      'module_key', coalesce(nullif(value->>'module_key',''), 'desvios_pnr')
    )
  )).*
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  on conflict do nothing;
  get diagnostics v_inserted = row_count;

  v_metadata := v_metadata || jsonb_build_object('persisted_rows', v_inserted);
  update public.dashboard_files set status='processed', metadata=v_metadata, updated_at=now() where id=v_file_id;

  insert into public.processed_dashboard_files (
    module_key, file_name, file_hash, file_size, last_modified, competencia,
    row_count, status, processed_at, metadata, storage_path, raw_file_deleted, file_role
  ) values (
    'desvios_pnr', p_processed->>'file_name', v_file_hash,
    nullif(p_processed->>'file_size','')::bigint, p_processed->>'last_modified', p_processed->>'competencia',
    v_inserted, 'processed', now(), v_metadata, p_processed->>'storage_path',
    coalesce((p_processed->>'raw_file_deleted')::boolean, true), coalesce(p_processed->>'file_role','pnr')
  ) on conflict (module_key,file_hash) do update
  set row_count=excluded.row_count, status=excluded.status, processed_at=excluded.processed_at,
      metadata=excluded.metadata, storage_path=excluded.storage_path,
      raw_file_deleted=excluded.raw_file_deleted, file_role=excluded.file_role;

  perform public.refresh_desvios_pnr_metrics_summary(array[v_file_id]);
  return jsonb_build_object('fileId', v_file_id, 'fileHash', v_file_hash, 'duplicateFile', false, 'persistedRows', v_inserted);
end;
$$;

revoke all on function public.commit_pre_fatura_import(jsonb,jsonb,jsonb) from public, anon;
revoke all on function public.commit_gestao_pacotes_import(jsonb,jsonb,jsonb) from public, anon;
revoke all on function public.commit_desvios_pnr_import(jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.commit_pre_fatura_import(jsonb,jsonb,jsonb) to authenticated;
grant execute on function public.commit_gestao_pacotes_import(jsonb,jsonb,jsonb) to authenticated;
grant execute on function public.commit_desvios_pnr_import(jsonb,jsonb,jsonb) to authenticated;
