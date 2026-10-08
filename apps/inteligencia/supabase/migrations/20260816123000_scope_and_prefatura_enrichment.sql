alter table public.prefatura_records
  add column if not exists driver_id text,
  add column if not exists quality_status text not null default 'PENDING',
  add column if not exists enrichment_source text,
  add column if not exists base_source text,
  add column if not exists driver_name_source text,
  add column if not exists driver_id_source text,
  add column if not exists enriched_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'prefatura_records_quality_status_check'
      and conrelid = 'public.prefatura_records'::regclass
  ) then
    alter table public.prefatura_records
      add constraint prefatura_records_quality_status_check
      check (quality_status in ('COMPLETE', 'ENRICHED', 'PENDING', 'UPDATED'));
  end if;
end $$;

alter table public.driver_records
  add column if not exists base_key text,
  add column if not exists sigla text;

create index if not exists prefatura_records_driver_idx on public.prefatura_records(driver_id);
create index if not exists prefatura_records_quality_idx on public.prefatura_records(quality_status);
create index if not exists prefatura_records_identity_idx on public.prefatura_records(shipment_id, operation, route_id, period);
create index if not exists driver_records_scope_idx on public.driver_records(base_key, sigla);

create or replace function public.normalize_scope_text(value text)
returns text
language sql
immutable
as $$
  select regexp_replace(upper(trim(coalesce(value, ''))), '\s+', ' ', 'g')
$$;

create or replace function public.profile_allowed_base_keys(target_user uuid default auth.uid())
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  with profile_row as (
    select id, email, full_name, role::text as role, coalesce(base_scope, '{}') as base_scope
    from public.profiles
    where id = target_user and active = true
  ),
  identities as (
    select public.normalize_scope_text(full_name) as value from profile_row
    union
    select public.normalize_scope_text(email) from profile_row
    union
    select public.normalize_scope_text(split_part(email, '@', 1)) from profile_row
  ),
  explicit_scope as (
    select public.normalize_scope_text(unnest(base_scope)) as base_key from profile_row
  ),
  assignments as (
    select public.normalize_scope_text(base_key) as base_key
    from public.admin_base_assignments
    where admin_id = target_user and active = true
  ),
  hierarchy_scope as (
    select distinct public.normalize_scope_text(h.base_key) as base_key
    from public.hierarchy_scopes h
    cross join profile_row p
    where (
      p.role = 'coordinator'
      and public.normalize_scope_text(h.coordinator_name) in (select value from identities where value <> '')
    ) or (
      p.role = 'supervisor'
      and public.normalize_scope_text(h.supervisor_name) in (select value from identities where value <> '')
    )
  )
  select coalesce(array_agg(distinct base_key) filter (where base_key <> ''), '{}')
  from (
    select base_key from explicit_scope
    union all
    select base_key from assignments
    union all
    select base_key from hierarchy_scope
  ) allowed
$$;

create or replace function public.profile_allowed_siglas(target_user uuid default auth.uid())
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  with profile_row as (
    select id, email, full_name, role::text as role, coalesce(sigla_scope, '{}') as sigla_scope
    from public.profiles
    where id = target_user and active = true
  ),
  identities as (
    select public.normalize_scope_text(full_name) as value from profile_row
    union
    select public.normalize_scope_text(email) from profile_row
    union
    select public.normalize_scope_text(split_part(email, '@', 1)) from profile_row
  ),
  explicit_scope as (
    select public.normalize_scope_text(unnest(sigla_scope)) as sigla from profile_row
  ),
  hierarchy_scope as (
    select distinct public.normalize_scope_text(h.sigla) as sigla
    from public.hierarchy_scopes h
    cross join profile_row p
    where (
      p.role = 'coordinator'
      and public.normalize_scope_text(h.coordinator_name) in (select value from identities where value <> '')
    ) or (
      p.role = 'supervisor'
      and public.normalize_scope_text(h.supervisor_name) in (select value from identities where value <> '')
    )
  )
  select coalesce(array_agg(distinct sigla) filter (where sigla <> ''), '{}')
  from (
    select sigla from explicit_scope
    union all
    select sigla from hierarchy_scope
  ) allowed
$$;

create or replace function public.current_base_scope()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select public.profile_allowed_base_keys(auth.uid())
$$;

create or replace function public.current_sigla_scope()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select public.profile_allowed_siglas(auth.uid())
$$;

create or replace function public.can_read_scope(record_sigla text, record_base_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_full_access()
    or (
      coalesce(public.normalize_scope_text(record_base_key), '') <> ''
      and public.normalize_scope_text(record_base_key) = any(public.current_base_scope())
    )
    or (
      coalesce(public.normalize_scope_text(record_sigla), '') <> ''
      and public.normalize_scope_text(record_sigla) = any(public.current_sigla_scope())
    )
$$;

create or replace function public.can_access_driver_base(target_base_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_full_access()
    or exists (
      select 1 from public.admin_base_assignments
      where admin_id = auth.uid()
        and public.normalize_scope_text(base_key) = public.normalize_scope_text(target_base_key)
        and active = true
    )
    or (
      coalesce(public.normalize_scope_text(target_base_key), '') <> ''
      and public.normalize_scope_text(target_base_key) = any(public.current_base_scope())
    )
$$;

drop policy if exists "imports authenticated read" on public.import_batches;
drop policy if exists "imports full access read" on public.import_batches;
create policy "imports scoped read" on public.import_batches
  for select to authenticated
  using (
    public.has_full_access()
    or exists (select 1 from public.hierarchy_scopes h where h.batch_id = import_batches.id and public.can_read_scope(h.sigla, h.base_key))
    or exists (select 1 from public.prefatura_records p where p.batch_id = import_batches.id and public.can_read_scope(p.sigla, p.base_key))
    or exists (select 1 from public.pnr_records p where p.batch_id = import_batches.id and public.can_read_scope(p.sigla, p.base_key))
    or exists (select 1 from public.risk_lm_records r where r.batch_id = import_batches.id and public.can_read_scope(r.sigla, r.base_key))
  );

drop policy if exists "hierarchy scoped read" on public.hierarchy_scopes;
create policy "hierarchy scoped read" on public.hierarchy_scopes
  for select to authenticated
  using (public.can_read_scope(sigla, base_key));

drop policy if exists "drivers authenticated read" on public.driver_records;
drop policy if exists "drivers scoped read" on public.driver_records;
create policy "drivers scoped read" on public.driver_records
  for select to authenticated
  using (
    public.has_full_access()
    or public.can_read_scope(sigla, base_key)
    or exists (
      select 1 from public.prefatura_records p
      where (p.driver_id = driver_records.driver_id or public.normalize_scope_text(p.driver_name) = public.normalize_scope_text(driver_records.name))
        and public.can_read_scope(p.sigla, p.base_key)
    )
    or exists (
      select 1 from public.pnr_records p
      where p.driver_id = driver_records.driver_id
        and public.can_read_scope(p.sigla, p.base_key)
    )
    or exists (
      select 1 from public.risk_lm_records r
      where r.driver_id = driver_records.driver_id
        and public.can_read_scope(r.sigla, r.base_key)
    )
  );

drop policy if exists "quality scoped read" on public.quality_issues;
create policy "quality scoped read" on public.quality_issues
  for select to authenticated
  using (
    public.has_full_access()
    or assigned_to = auth.uid()
    or exists (select 1 from public.hierarchy_scopes h where h.batch_id = quality_issues.batch_id and public.can_read_scope(h.sigla, h.base_key))
    or exists (select 1 from public.prefatura_records p where p.batch_id = quality_issues.batch_id and public.can_read_scope(p.sigla, p.base_key))
    or exists (select 1 from public.pnr_records p where p.batch_id = quality_issues.batch_id and public.can_read_scope(p.sigla, p.base_key))
    or exists (select 1 from public.risk_lm_records r where r.batch_id = quality_issues.batch_id and public.can_read_scope(r.sigla, r.base_key))
  );
