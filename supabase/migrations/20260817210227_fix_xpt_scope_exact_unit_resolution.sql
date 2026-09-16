create or replace function app_private.can_read_scope(record_sigla text, record_base_key text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  with current_profile as (
    select
      p.active,
      p.role::text as role,
      coalesce(p.base_scope, '{}'::text[]) as allowed_bases,
      coalesce(p.sigla_scope, '{}'::text[]) as allowed_siglas,
      coalesce(p.xpt_scope, '{}'::text[]) as allowed_xpts
    from public.profiles p
    where p.id = auth.uid()
    limit 1
  ),
  normalized_record as (
    select
      app_private.normalize_scope_text(record_sigla) as sigla,
      app_private.normalize_scope_text(record_base_key) as base_key
  ),
  matching_units as (
    select u.unit_key, u.sigla, u.base_key, u.xpt_code
    from public.operational_units u, normalized_record r
    where u.active = true
      and app_private.normalize_scope_text(u.sigla) = r.sigla
      and app_private.normalize_scope_text(u.base_key) = r.base_key
  ),
  unique_sigla_unit as (
    select min(u.unit_key) as unit_key, min(u.sigla) as sigla, min(u.base_key) as base_key, min(u.xpt_code) as xpt_code
    from public.operational_units u, normalized_record r
    where u.active = true
      and app_private.normalize_scope_text(u.sigla) = r.sigla
    group by app_private.normalize_scope_text(u.sigla)
    having count(*) = 1
  ),
  record_xpt as (
    select min(u.xpt_code) as xpt_code
    from public.operational_units u, normalized_record r
    where u.active = true
      and app_private.normalize_scope_text(u.sigla) = r.sigla
      and coalesce(app_private.normalize_scope_text(u.xpt_code), '') <> ''
    group by app_private.normalize_scope_text(u.sigla)
    having count(distinct app_private.normalize_scope_text(u.xpt_code)) = 1
  )
  select coalesce(exists (
    select 1
    from current_profile cp
    where cp.active = true
      and (
        cp.role in ('director','developer','loss_supervisor','loss_admin','super_admin')
        or (
          cp.role in ('coordinator','supervisor')
          and (
            exists (
              select 1
              from (
                select * from matching_units
                union all
                select * from unique_sigla_unit
                where coalesce((select base_key from normalized_record),'') = ''
                   or (select base_key from normalized_record) = (select sigla from normalized_record)
              ) u
              where
                exists (
                  select 1
                  from unnest(cp.allowed_bases) scope(value)
                  where app_private.normalize_scope_text(scope.value) = app_private.normalize_scope_text(u.unit_key)
                )
                or (
                  exists (
                    select 1
                    from unnest(cp.allowed_bases) scope(value)
                    where app_private.normalize_scope_text(scope.value) = app_private.normalize_scope_text(u.base_key)
                  )
                  and (
                    cardinality(cp.allowed_siglas) = 0
                    or exists (
                      select 1
                      from unnest(cp.allowed_siglas) scope(value)
                      where app_private.normalize_scope_text(scope.value) = app_private.normalize_scope_text(u.sigla)
                    )
                  )
                )
                or (
                  exists (
                    select 1
                    from unnest(cp.allowed_bases) scope(value)
                    where app_private.normalize_scope_text(scope.value) = app_private.normalize_scope_text(u.sigla)
                  )
                  and (select count(*) from public.operational_units z where z.active = true and app_private.normalize_scope_text(z.sigla) = app_private.normalize_scope_text(u.sigla)) = 1
                )
            )
            or exists (
              select 1
              from matching_units u
              join unnest(cp.allowed_xpts) scope(value)
                on app_private.normalize_scope_text(scope.value) = app_private.normalize_scope_text(u.xpt_code)
              where coalesce(u.xpt_code, '') <> ''
            )
            or exists (
              select 1
              from record_xpt rx
              join unnest(cp.allowed_xpts) scope(value)
                on app_private.normalize_scope_text(scope.value) = app_private.normalize_scope_text(rx.xpt_code)
              where coalesce(rx.xpt_code, '') <> ''
            )
          )
        )
      )
  ), false)
$function$;
