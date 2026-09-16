-- Move privileged authorization helper out of the exposed public schema,
-- close direct RPC paths, and pin function search paths.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_admin = true
      and lower(trim(coalesce(role, ''))) = 'admin'
  );
$$;

revoke all on function private.is_current_user_admin() from public, anon;
grant execute on function private.is_current_user_admin() to authenticated;

alter policy "Admins can read audit logs"
on public.audit_logs
to authenticated
using ((select private.is_current_user_admin()));

alter policy "Admins can delete dashboard files"
on public.dashboard_files
to authenticated
using ((select private.is_current_user_admin()));

alter policy "Admins can insert dashboard files"
on public.dashboard_files
to authenticated
with check ((select private.is_current_user_admin()));

alter policy "Admins can update dashboard files"
on public.dashboard_files
to authenticated
using ((select private.is_current_user_admin()))
with check ((select private.is_current_user_admin()));

alter policy "Admins can manage dashboard metrics cache"
on public.dashboard_metrics_cache
to authenticated
using ((select private.is_current_user_admin()))
with check ((select private.is_current_user_admin()));

alter policy "Admins can delete dashboard settings"
on public.dashboard_settings
to authenticated
using ((select private.is_current_user_admin()));

alter policy "Admins can insert dashboard settings"
on public.dashboard_settings
to authenticated
with check ((select private.is_current_user_admin()));

alter policy "Admins can update dashboard settings"
on public.dashboard_settings
to authenticated
using ((select private.is_current_user_admin()))
with check ((select private.is_current_user_admin()));

alter policy "Admins can manage desvios pnr metrics"
on public.desvios_pnr_metrics_summary
to authenticated
using ((select private.is_current_user_admin()))
with check ((select private.is_current_user_admin()));

alter policy "Admins can manage desvios pnr records"
on public.desvios_pnr_records
to authenticated
using ((select private.is_current_user_admin()))
with check ((select private.is_current_user_admin()));

alter policy "Admins can manage missing packages"
on public.gestao_desvios_pacotes_faltantes
to authenticated
using ((select private.is_current_user_admin()))
with check ((select private.is_current_user_admin()));

alter policy "Admins can manage gestao pacotes records"
on public.gestao_pacotes_records
to authenticated
using ((select private.is_current_user_admin()))
with check ((select private.is_current_user_admin()));

alter policy "Admins can manage pre fatura records"
on public.pre_fatura_records
to authenticated
using ((select private.is_current_user_admin()))
with check ((select private.is_current_user_admin()));

alter policy "Admins can manage processed dashboard files"
on public.processed_dashboard_files
to authenticated
using ((select private.is_current_user_admin()))
with check ((select private.is_current_user_admin()));

alter policy "Admins can read all profiles"
on public.profiles
to authenticated
using ((select private.is_current_user_admin()));

alter policy "Admins can update profiles"
on public.profiles
to authenticated
using ((select private.is_current_user_admin()))
with check ((select private.is_current_user_admin()));

alter policy "Admins can delete dashboard storage files"
on storage.objects
to authenticated
using (bucket_id = 'dashboard-files' and (select private.is_current_user_admin()));

alter policy "Admins can update dashboard storage files"
on storage.objects
to authenticated
using (bucket_id = 'dashboard-files' and (select private.is_current_user_admin()))
with check (bucket_id = 'dashboard-files' and (select private.is_current_user_admin()));

alter policy "Admins can upload dashboard storage files"
on storage.objects
to authenticated
with check (bucket_id = 'dashboard-files' and (select private.is_current_user_admin()));

create or replace function public.protect_profile_sensitive_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() = old.id and not private.is_current_user_admin() then
    if new.email is distinct from old.email
      or new.role is distinct from old.role
      or new.is_admin is distinct from old.is_admin
      or new.setor is distinct from old.setor
      or new.cargo is distinct from old.cargo then
      raise exception 'Apenas administradores podem alterar setor, cargo ou permissões.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.protect_profile_sensitive_fields() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create or replace function public.update_desvios_pnr_status(p_record_id uuid, p_status text)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
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
  v_updated_by text := auth.uid()::text;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if not private.is_current_user_admin() then
    raise exception 'Apenas administradores podem atualizar status PNR.' using errcode = '42501';
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
  from public.profiles
  where id = auth.uid();

  v_updated_by := coalesce(v_updated_by, auth.uid()::text);

  update public.desvios_pnr_records
  set
    status_normalizado = p_status,
    status_current = p_status,
    status_previous = v_previous,
    status_updated_at = now(),
    status_updated_by = v_updated_by,
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

revoke all on function public.update_desvios_pnr_status(uuid, text) from public, anon;
grant execute on function public.update_desvios_pnr_status(uuid, text) to authenticated;

alter function public.pnr_month_key(text,text,text,text) set search_path = public, pg_temp;
alter function public.pnr_quinzena_key(text,text,text) set search_path = public, pg_temp;
alter function public.pnr_month_number(text) set search_path = public, pg_temp;
alter function public.pnr_year_number(text) set search_path = public, pg_temp;
alter function public.set_desvios_pnr_period_keys() set search_path = public, pg_temp;
alter function public.refresh_desvios_pnr_metrics_summary(uuid[]) set search_path = public, pg_temp;
alter function public.desvios_pnr_dashboard(uuid[],text[],text[],text[],text[],text[],text[],text[],text,integer,integer,text,text) set search_path = public, pg_temp;
alter function public.desvios_pnr_dashboard(uuid[],text[],text[],text[],text[],text[],text[],text[],text[],text[],text,integer,integer,text,text) set search_path = public, pg_temp;
alter function public.desvios_pnr_summary(uuid[],text[],text[],text[],text[],text[],text[],text[],text[],text[],text) set search_path = public, pg_temp;
alter function public.desvios_pnr_table(uuid[],text[],text[],text[],text[],text[],text[],text[],text[],text[],text,integer,integer,text,text) set search_path = public, pg_temp;

drop function if exists public.is_current_user_admin();
