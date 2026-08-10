create or replace function public.update_desvios_pnr_status(
  p_record_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed_statuses constant text[] := array[
    'Anulado',
    'Enviado para faturamento',
    'Aguardando Comprovante',
    'Com Penalidade',
    'Comprovante Carregado',
    'Em Revisão',
    'Sin Comprovante Carregado',
    'Em aberto/análise'
  ];
  v_previous text;
  v_file_id uuid;
  v_updated_by text;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if p_record_id is null or p_status is null or not (p_status = any(v_allowed_statuses)) then
    raise exception 'Status inválido para atualização.';
  end if;

  select coalesce(nullif(status_normalizado, ''), nullif(status_current, ''), nullif(status_original, '')), file_id
    into v_previous, v_file_id
  from public.desvios_pnr_records
  where id = p_record_id;

  if not found then
    raise exception 'Registro PNR não encontrado.';
  end if;

  select coalesce(nullif(email, ''), auth.uid()::text)
    into v_updated_by
  from auth.users
  where id = auth.uid();

  update public.desvios_pnr_records
  set
    status_normalizado = p_status,
    status_current = p_status,
    status_previous = v_previous,
    status_updated_at = now(),
    status_updated_by = coalesce(v_updated_by, auth.uid()::text),
    manual_status_override = true
  where id = p_record_id
  returning jsonb_build_object(
    'id', id,
    'file_id', file_id,
    'status_normalizado', status_normalizado,
    'status_previous', status_previous,
    'status_current', status_current,
    'status_updated_at', status_updated_at,
    'status_updated_by', status_updated_by,
    'manual_status_override', manual_status_override
  )
  into v_result;

  perform public.refresh_desvios_pnr_metrics_summary(array[v_file_id]);

  return v_result;
end;
$$;

revoke all on function public.update_desvios_pnr_status(uuid, text) from public;
grant execute on function public.update_desvios_pnr_status(uuid, text) to authenticated;
