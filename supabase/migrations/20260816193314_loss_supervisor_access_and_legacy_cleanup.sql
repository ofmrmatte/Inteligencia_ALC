update public.profiles
set module_scope = array[
  'visao-geral','gestao-pnr','pre-faturamento','risco-lm','motoristas',
  'conciliacao-ids','qualidade-dados','importacoes','configuracoes','perfil'
]::text[],
    driver_management_scope = '{}'::text[],
    updated_at = now()
where role = 'loss_supervisor';

revoke execute on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated;

revoke execute on function public.set_driver_portal_base_access(text, boolean, uuid) from public, anon, authenticated;
grant execute on function public.set_driver_portal_base_access(text, boolean, uuid) to service_role;

drop function if exists public.can_access_driver_base(text);
drop function if exists public.can_manage_users();
drop function if exists public.can_read_scope(text, text);
drop function if exists public.current_base_scope();
drop function if exists public.current_driver_id();
drop function if exists public.current_sigla_scope();
drop function if exists public.current_user_role();
drop function if exists public.has_full_access();
drop function if exists public.normalize_scope_text(text);

drop type if exists public.app_role;
