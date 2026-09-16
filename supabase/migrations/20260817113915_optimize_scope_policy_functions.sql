create or replace function app_private.can_read_scope(record_sigla text, record_base_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and (
          p.role::text in ('director', 'developer', 'loss_supervisor', 'super_admin')
          or (
            p.role::text in ('coordinator', 'supervisor', 'loss_admin')
            and (
              (coalesce(record_base_key, '') <> '' and record_base_key = any(coalesce(p.base_scope, '{}'::text[])))
              or
              (coalesce(record_sigla, '') <> '' and record_sigla = any(coalesce(p.sigla_scope, '{}'::text[])))
            )
          )
        )
    ),
    false
  )
$$;

create or replace function app_private.can_read_batch(target_batch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with current_profile as (
    select
      p.active,
      p.role::text as role,
      coalesce(p.base_scope, '{}'::text[]) as allowed_bases,
      coalesce(p.sigla_scope, '{}'::text[]) as allowed_siglas
    from public.profiles p
    where p.id = auth.uid()
    limit 1
  ),
  batch_scope as (
    select h.base_key, h.sigla
    from public.hierarchy_scopes h
    where h.batch_id = target_batch_id
    union all
    select p.base_key, p.sigla
    from public.prefatura_records p
    where p.batch_id = target_batch_id
    union all
    select p.base_key, p.sigla
    from public.pnr_records p
    where p.batch_id = target_batch_id
    union all
    select r.base_key, r.sigla
    from public.risk_lm_records r
    where r.batch_id = target_batch_id
  )
  select coalesce(
    exists (
      select 1
      from current_profile cp
      where cp.active = true
        and (
          cp.role in ('director', 'developer', 'loss_supervisor', 'super_admin')
          or (
            cp.role in ('coordinator', 'supervisor', 'loss_admin')
            and exists (
              select 1
              from batch_scope bs
              where (coalesce(bs.base_key, '') <> '' and bs.base_key = any(cp.allowed_bases))
                 or (coalesce(bs.sigla, '') <> '' and bs.sigla = any(cp.allowed_siglas))
            )
          )
        )
    ),
    false
  )
$$;

revoke all on function app_private.can_read_scope(text, text) from public, anon;
grant execute on function app_private.can_read_scope(text, text) to authenticated;
grant execute on function app_private.can_read_scope(text, text) to service_role;

revoke all on function app_private.can_read_batch(uuid) from public, anon;
grant execute on function app_private.can_read_batch(uuid) to authenticated;
grant execute on function app_private.can_read_batch(uuid) to service_role;
