create or replace function app_private.has_global_internal_access()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.role::text in ('director', 'developer', 'loss_supervisor', 'super_admin')
    ),
    false
  )
$function$;

create or replace function app_private.has_operational_read_access()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.role::text in ('director', 'developer', 'loss_supervisor', 'super_admin', 'coordinator', 'supervisor')
    ),
    false
  )
$function$;

create or replace function app_private.can_read_scope(record_sigla text, record_base_key text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select app_private.has_global_internal_access()
    or (
      app_private.has_operational_read_access()
      and (
        (
          coalesce(app_private.normalize_scope_text(record_base_key), '') <> ''
          and app_private.normalize_scope_text(record_base_key) = any(app_private.profile_allowed_base_keys(auth.uid()))
        )
        or (
          coalesce(app_private.normalize_scope_text(record_sigla), '') <> ''
          and app_private.normalize_scope_text(record_sigla) = any(app_private.profile_allowed_siglas(auth.uid()))
        )
      )
    )
$function$;

revoke execute on function app_private.has_operational_read_access() from public, anon, authenticated;
revoke execute on function app_private.has_global_internal_access() from public, anon, authenticated;
revoke execute on function app_private.can_read_scope(text,text) from public, anon, authenticated;
