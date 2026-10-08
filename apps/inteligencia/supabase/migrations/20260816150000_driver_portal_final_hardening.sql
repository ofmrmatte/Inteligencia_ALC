create or replace function app_private.profile_allowed_base_keys(target_user uuid default auth.uid())
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  with profile_row as (
    select id, email, full_name, role::text as role, coalesce(base_scope, '{}') as base_scope
    from public.profiles
    where id = target_user and active = true and role::text <> 'driver'
  ),
  identities as (
    select app_private.normalize_scope_text(full_name) as value from profile_row
    union
    select app_private.normalize_scope_text(email) from profile_row
    union
    select app_private.normalize_scope_text(split_part(email, '@', 1)) from profile_row
  ),
  explicit_scope as (
    select app_private.normalize_scope_text(unnest(base_scope)) as base_key from profile_row
  ),
  assignments as (
    select app_private.normalize_scope_text(base_key) as base_key
    from public.admin_base_assignments
    where admin_id = target_user and active = true
  ),
  hierarchy_scope as (
    select distinct app_private.normalize_scope_text(h.base_key) as base_key
    from public.hierarchy_scopes h
    cross join profile_row p
    where (
      p.role = 'coordinator'
      and app_private.normalize_scope_text(h.coordinator_name) in (select value from identities where value <> '')
    ) or (
      p.role = 'supervisor'
      and app_private.normalize_scope_text(h.supervisor_name) in (select value from identities where value <> '')
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

create or replace function app_private.profile_allowed_siglas(target_user uuid default auth.uid())
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  with profile_row as (
    select id, email, full_name, role::text as role, coalesce(sigla_scope, '{}') as sigla_scope
    from public.profiles
    where id = target_user and active = true and role::text <> 'driver'
  ),
  identities as (
    select app_private.normalize_scope_text(full_name) as value from profile_row
    union
    select app_private.normalize_scope_text(email) from profile_row
    union
    select app_private.normalize_scope_text(split_part(email, '@', 1)) from profile_row
  ),
  explicit_scope as (
    select app_private.normalize_scope_text(unnest(sigla_scope)) as sigla from profile_row
  ),
  hierarchy_scope as (
    select distinct app_private.normalize_scope_text(h.sigla) as sigla
    from public.hierarchy_scopes h
    cross join profile_row p
    where (
      p.role = 'coordinator'
      and app_private.normalize_scope_text(h.coordinator_name) in (select value from identities where value <> '')
    ) or (
      p.role = 'supervisor'
      and app_private.normalize_scope_text(h.supervisor_name) in (select value from identities where value <> '')
    )
  )
  select coalesce(array_agg(distinct sigla) filter (where sigla <> ''), '{}')
  from (
    select sigla from explicit_scope
    union all
    select sigla from hierarchy_scope
  ) allowed
$$;

create or replace function app_private.can_read_scope(record_sigla text, record_base_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.has_global_internal_access()
    or (
      coalesce(app_private.normalize_scope_text(record_base_key), '') <> ''
      and app_private.normalize_scope_text(record_base_key) = any(app_private.profile_allowed_base_keys(auth.uid()))
    )
    or (
      coalesce(app_private.normalize_scope_text(record_sigla), '') <> ''
      and app_private.normalize_scope_text(record_sigla) = any(app_private.profile_allowed_siglas(auth.uid()))
    )
$$;

drop policy if exists "profiles read own or admin" on public.profiles;
create policy "profiles read own or admin" on public.profiles
  for select to authenticated
  using (id = auth.uid() or app_private.has_global_internal_access());

drop policy if exists "profiles admin write" on public.profiles;
create policy "profiles admin write" on public.profiles
  for all to authenticated
  using (app_private.has_global_internal_access())
  with check (app_private.has_global_internal_access());

drop policy if exists "imports authenticated read" on public.import_batches;
drop policy if exists "imports full access read" on public.import_batches;
drop policy if exists "imports scoped read" on public.import_batches;
create policy "imports scoped read" on public.import_batches
  for select to authenticated
  using (
    app_private.has_global_internal_access()
    or exists (select 1 from public.hierarchy_scopes h where h.batch_id = import_batches.id and app_private.can_read_scope(h.sigla, h.base_key))
    or exists (select 1 from public.prefatura_records p where p.batch_id = import_batches.id and app_private.can_read_scope(p.sigla, p.base_key))
    or exists (select 1 from public.pnr_records p where p.batch_id = import_batches.id and app_private.can_read_scope(p.sigla, p.base_key))
    or exists (select 1 from public.risk_lm_records r where r.batch_id = import_batches.id and app_private.can_read_scope(r.sigla, r.base_key))
  );

drop policy if exists "imports full access write" on public.import_batches;
create policy "imports full access write" on public.import_batches
  for all to authenticated
  using (app_private.has_global_internal_access())
  with check (app_private.has_global_internal_access());

drop policy if exists "files full access" on public.imported_files;
create policy "files full access" on public.imported_files
  for all to authenticated
  using (app_private.has_global_internal_access())
  with check (app_private.has_global_internal_access());

drop policy if exists "hierarchy scoped read" on public.hierarchy_scopes;
create policy "hierarchy scoped read" on public.hierarchy_scopes
  for select to authenticated
  using (app_private.can_read_scope(sigla, base_key));

drop policy if exists "hierarchy full access write" on public.hierarchy_scopes;
create policy "hierarchy full access write" on public.hierarchy_scopes
  for all to authenticated
  using (app_private.has_global_internal_access())
  with check (app_private.has_global_internal_access());

drop policy if exists "prefatura scoped read" on public.prefatura_records;
create policy "prefatura scoped read" on public.prefatura_records
  for select to authenticated
  using (app_private.can_read_scope(sigla, base_key));

drop policy if exists "prefatura full access write" on public.prefatura_records;
create policy "prefatura full access write" on public.prefatura_records
  for all to authenticated
  using (app_private.has_global_internal_access())
  with check (app_private.has_global_internal_access());

drop policy if exists "pnr scoped read" on public.pnr_records;
create policy "pnr scoped read" on public.pnr_records
  for select to authenticated
  using (app_private.can_read_scope(sigla, base_key));

drop policy if exists "pnr full access write" on public.pnr_records;
create policy "pnr full access write" on public.pnr_records
  for all to authenticated
  using (app_private.has_global_internal_access())
  with check (app_private.has_global_internal_access());

drop policy if exists "risk scoped read" on public.risk_lm_records;
create policy "risk scoped read" on public.risk_lm_records
  for select to authenticated
  using (app_private.can_read_scope(sigla, base_key));

drop policy if exists "risk full access write" on public.risk_lm_records;
create policy "risk full access write" on public.risk_lm_records
  for all to authenticated
  using (app_private.has_global_internal_access())
  with check (app_private.has_global_internal_access());

drop policy if exists "drivers authenticated read" on public.driver_records;
drop policy if exists "drivers scoped read" on public.driver_records;
create policy "drivers scoped read" on public.driver_records
  for select to authenticated
  using (
    app_private.has_global_internal_access()
    or app_private.can_read_scope(sigla, base_key)
    or exists (
      select 1 from public.prefatura_records p
      where (p.driver_id = driver_records.driver_id or app_private.normalize_scope_text(p.driver_name) = app_private.normalize_scope_text(driver_records.name))
        and app_private.can_read_scope(p.sigla, p.base_key)
    )
    or exists (
      select 1 from public.pnr_records p
      where p.driver_id = driver_records.driver_id
        and app_private.can_read_scope(p.sigla, p.base_key)
    )
    or exists (
      select 1 from public.risk_lm_records r
      where r.driver_id = driver_records.driver_id
        and app_private.can_read_scope(r.sigla, r.base_key)
    )
  );

drop policy if exists "drivers full access write" on public.driver_records;
create policy "drivers full access write" on public.driver_records
  for all to authenticated
  using (app_private.has_global_internal_access())
  with check (app_private.has_global_internal_access());

drop policy if exists "quality scoped read" on public.quality_issues;
create policy "quality scoped read" on public.quality_issues
  for select to authenticated
  using (
    app_private.has_global_internal_access()
    or assigned_to = auth.uid()
    or exists (select 1 from public.hierarchy_scopes h where h.batch_id = quality_issues.batch_id and app_private.can_read_scope(h.sigla, h.base_key))
    or exists (select 1 from public.prefatura_records p where p.batch_id = quality_issues.batch_id and app_private.can_read_scope(p.sigla, p.base_key))
    or exists (select 1 from public.pnr_records p where p.batch_id = quality_issues.batch_id and app_private.can_read_scope(p.sigla, p.base_key))
    or exists (select 1 from public.risk_lm_records r where r.batch_id = quality_issues.batch_id and app_private.can_read_scope(r.sigla, r.base_key))
  );

drop policy if exists "quality full access write" on public.quality_issues;
create policy "quality full access write" on public.quality_issues
  for all to authenticated
  using (app_private.has_global_internal_access())
  with check (app_private.has_global_internal_access());

drop policy if exists "audit admin read" on public.audit_events;
create policy "audit admin read" on public.audit_events
  for select to authenticated
  using (app_private.has_global_internal_access());

drop policy if exists "audit admin insert" on public.audit_events;
create policy "audit admin insert" on public.audit_events
  for insert to authenticated
  with check (app_private.has_global_internal_access());

drop policy if exists "portal credentials internal only" on public.driver_portal_credentials;
drop policy if exists "portal sessions internal only" on public.driver_portal_sessions;
drop policy if exists "portal setup tokens internal only" on public.driver_portal_setup_tokens;
drop policy if exists "portal auth attempts internal read" on public.driver_portal_auth_attempts;
drop policy if exists "audit scoped insert" on public.driver_portal_audit_events;

alter table public.driver_portal_credentials force row level security;
alter table public.driver_portal_sessions force row level security;
alter table public.driver_portal_setup_tokens force row level security;
alter table public.driver_portal_auth_attempts force row level security;
alter table public.driver_portal_audit_events force row level security;

revoke all on public.driver_portal_credentials from anon, authenticated;
revoke all on public.driver_portal_sessions from anon, authenticated;
revoke all on public.driver_portal_setup_tokens from anon, authenticated;
revoke all on public.driver_portal_auth_attempts from anon, authenticated;
revoke all on public.driver_portal_audit_events from anon, authenticated;

drop policy if exists "alc imports read" on storage.objects;
drop policy if exists "alc imports insert" on storage.objects;
drop policy if exists "alc imports update" on storage.objects;
drop policy if exists "alc imports delete" on storage.objects;
create policy "alc imports read" on storage.objects
  for select to authenticated
  using (bucket_id = 'alc-imports' and app_private.has_global_internal_access());
create policy "alc imports insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'alc-imports' and app_private.has_global_internal_access());
create policy "alc imports update" on storage.objects
  for update to authenticated
  using (bucket_id = 'alc-imports' and app_private.has_global_internal_access())
  with check (bucket_id = 'alc-imports' and app_private.has_global_internal_access());
create policy "alc imports delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'alc-imports' and app_private.has_global_internal_access());

revoke execute on function public.can_access_driver_base(text) from anon, authenticated;
revoke execute on function public.can_manage_users() from anon, authenticated;
revoke execute on function public.can_read_scope(text, text) from anon, authenticated;
revoke execute on function public.current_base_scope() from anon, authenticated;
revoke execute on function public.current_driver_id() from anon, authenticated;
revoke execute on function public.current_sigla_scope() from anon, authenticated;
revoke execute on function public.current_user_role() from anon, authenticated;
revoke execute on function public.has_full_access() from anon, authenticated;
revoke execute on function public.is_super_admin() from anon, authenticated;
revoke execute on function public.profile_allowed_base_keys(uuid) from anon, authenticated;
revoke execute on function public.profile_allowed_siglas(uuid) from anon, authenticated;
revoke execute on function public.normalize_scope_text(text) from anon;

revoke all on schema app_private from anon;
grant usage on schema app_private to authenticated;
revoke execute on all functions in schema app_private from anon;
grant execute on all functions in schema app_private to authenticated;
