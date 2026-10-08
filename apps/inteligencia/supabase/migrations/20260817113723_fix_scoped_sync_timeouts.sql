create index if not exists hierarchy_scopes_batch_scope_idx
  on public.hierarchy_scopes(batch_id, base_key, sigla);

create index if not exists prefatura_records_batch_scope_idx
  on public.prefatura_records(batch_id, base_key, sigla);

create index if not exists pnr_records_batch_scope_idx
  on public.pnr_records(batch_id, base_key, sigla);

create index if not exists risk_lm_records_batch_scope_idx
  on public.risk_lm_records(batch_id, base_key, sigla);

create or replace function app_private.has_operational_read_access()
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
        and p.role::text in (
          'director',
          'developer',
          'loss_supervisor',
          'super_admin',
          'coordinator',
          'supervisor',
          'loss_admin'
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
      coalesce(
        array(
          select distinct app_private.normalize_scope_text(value)
          from unnest(coalesce(p.base_scope, '{}'::text[])) as s(value)
          where app_private.normalize_scope_text(value) <> ''
        ),
        '{}'::text[]
      ) as allowed_bases,
      coalesce(
        array(
          select distinct app_private.normalize_scope_text(value)
          from unnest(coalesce(p.sigla_scope, '{}'::text[])) as s(value)
          where app_private.normalize_scope_text(value) <> ''
        ),
        '{}'::text[]
      ) as allowed_siglas
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
              where (
                app_private.normalize_scope_text(bs.base_key) <> ''
                and app_private.normalize_scope_text(bs.base_key) = any(cp.allowed_bases)
              )
              or (
                app_private.normalize_scope_text(bs.sigla) <> ''
                and app_private.normalize_scope_text(bs.sigla) = any(cp.allowed_siglas)
              )
            )
          )
        )
    ),
    false
  )
$$;

drop policy if exists "imports scoped read" on public.import_batches;
create policy "imports scoped read" on public.import_batches
  for select to authenticated
  using (app_private.can_read_batch(id));

revoke all on function app_private.can_read_batch(uuid) from public, anon;
grant execute on function app_private.can_read_batch(uuid) to authenticated;
grant execute on function app_private.can_read_batch(uuid) to service_role;
