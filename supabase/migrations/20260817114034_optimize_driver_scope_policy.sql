create index if not exists pnr_records_driver_scope_idx
  on public.pnr_records(driver_id, base_key, sigla);

create index if not exists risk_lm_records_driver_scope_idx
  on public.risk_lm_records(driver_id, base_key, sigla);

create index if not exists prefatura_records_driver_scope_idx
  on public.prefatura_records(driver_id, base_key, sigla);

create index if not exists prefatura_records_driver_name_scope_idx
  on public.prefatura_records((app_private.normalize_scope_text(driver_name)), base_key, sigla);

create or replace function app_private.can_read_driver_record(
  target_driver_id text,
  target_name text,
  record_sigla text,
  record_base_key text
)
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
            and (
              (coalesce(record_base_key, '') <> '' and record_base_key = any(cp.allowed_bases))
              or (coalesce(record_sigla, '') <> '' and record_sigla = any(cp.allowed_siglas))
              or exists (
                select 1
                from public.prefatura_records p
                where coalesce(target_driver_id, '') <> ''
                  and p.driver_id = target_driver_id
                  and (
                    (coalesce(p.base_key, '') <> '' and p.base_key = any(cp.allowed_bases))
                    or (coalesce(p.sigla, '') <> '' and p.sigla = any(cp.allowed_siglas))
                  )
              )
              or exists (
                select 1
                from public.pnr_records p
                where coalesce(target_driver_id, '') <> ''
                  and p.driver_id = target_driver_id
                  and (
                    (coalesce(p.base_key, '') <> '' and p.base_key = any(cp.allowed_bases))
                    or (coalesce(p.sigla, '') <> '' and p.sigla = any(cp.allowed_siglas))
                  )
              )
              or exists (
                select 1
                from public.risk_lm_records r
                where coalesce(target_driver_id, '') <> ''
                  and r.driver_id = target_driver_id
                  and (
                    (coalesce(r.base_key, '') <> '' and r.base_key = any(cp.allowed_bases))
                    or (coalesce(r.sigla, '') <> '' and r.sigla = any(cp.allowed_siglas))
                  )
              )
              or exists (
                select 1
                from public.prefatura_records p
                where coalesce(target_name, '') <> ''
                  and app_private.normalize_scope_text(p.driver_name) = app_private.normalize_scope_text(target_name)
                  and (
                    (coalesce(p.base_key, '') <> '' and p.base_key = any(cp.allowed_bases))
                    or (coalesce(p.sigla, '') <> '' and p.sigla = any(cp.allowed_siglas))
                  )
              )
            )
          )
        )
    ),
    false
  )
$$;

drop policy if exists "drivers scoped read" on public.driver_records;
create policy "drivers scoped read" on public.driver_records
  for select to authenticated
  using (app_private.can_read_driver_record(driver_id, name, sigla, base_key));

revoke all on function app_private.can_read_driver_record(text, text, text, text) from public, anon;
grant execute on function app_private.can_read_driver_record(text, text, text, text) to authenticated;
grant execute on function app_private.can_read_driver_record(text, text, text, text) to service_role;
