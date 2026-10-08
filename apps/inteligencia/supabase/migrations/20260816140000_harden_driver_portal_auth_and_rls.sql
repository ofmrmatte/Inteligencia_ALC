create schema if not exists app_private;

alter table public.alc_drivers
  add column if not exists portal_status text not null default 'not_activated',
  add column if not exists portal_eligible boolean not null default false,
  add column if not exists operational_status text not null default 'unknown',
  add column if not exists last_operational_seen_at timestamptz,
  add column if not exists source_updated_at timestamptz,
  add column if not exists source_payload jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'alc_drivers_portal_status_check'
      and conrelid = 'public.alc_drivers'::regclass
  ) then
    alter table public.alc_drivers
      add constraint alc_drivers_portal_status_check
      check (portal_status in ('not_activated', 'active', 'blocked', 'inactive', 'reset_required'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'alc_drivers_operational_status_check'
      and conrelid = 'public.alc_drivers'::regclass
  ) then
    alter table public.alc_drivers
      add constraint alc_drivers_operational_status_check
      check (operational_status in ('active', 'inactive', 'blocked', 'unknown'));
  end if;
end $$;

create table if not exists public.driver_portal_credentials (
  driver_id uuid primary key references public.alc_drivers(id) on delete cascade,
  pin_hash text not null,
  activated_at timestamptz not null default now(),
  pin_updated_at timestamptz not null default now(),
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.driver_portal_sessions (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.alc_drivers(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.driver_portal_setup_tokens (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.alc_drivers(id) on delete cascade,
  token_hash text not null unique,
  origin text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create table if not exists public.driver_portal_auth_attempts (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid references public.alc_drivers(id) on delete set null,
  driver_code text,
  base_key text,
  origin text,
  kind text not null check (kind in ('first_access', 'login', 'pin_create')),
  success boolean not null default false,
  failure_reason text,
  created_at timestamptz not null default now()
);

create index if not exists alc_drivers_portal_idx on public.alc_drivers(portal_status, portal_eligible, operational_status);
create index if not exists alc_drivers_operational_seen_idx on public.alc_drivers(last_operational_seen_at);
create index if not exists driver_portal_sessions_driver_idx on public.driver_portal_sessions(driver_id, expires_at, revoked_at);
create index if not exists driver_portal_setup_tokens_driver_idx on public.driver_portal_setup_tokens(driver_id, expires_at, used_at);
create index if not exists driver_portal_auth_attempts_window_idx on public.driver_portal_auth_attempts(driver_code, origin, kind, created_at);

create or replace function app_private.normalize_scope_text(value text)
returns text
language sql
immutable
set search_path = public
as $$
  select regexp_replace(upper(trim(coalesce(value, ''))), '\s+', ' ', 'g')
$$;

create or replace function app_private.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role::text
  from public.profiles p
  where p.id = auth.uid()
    and p.active = true
$$;

create or replace function app_private.is_internal_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(app_private.current_user_role() in ('coordinator', 'supervisor', 'director', 'admin', 'developer', 'super_admin'), false)
$$;

create or replace function app_private.has_global_internal_access()
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
        and p.role::text <> 'driver'
        and (p.global_access = true or p.role::text in ('director', 'admin', 'developer', 'super_admin'))
    ),
    false
  )
$$;

create or replace function app_private.can_manage_driver_base(target_base_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.has_global_internal_access()
    or (
      app_private.is_internal_user()
      and coalesce(app_private.normalize_scope_text(target_base_key), '') <> ''
      and (
        exists (
          select 1
          from public.admin_base_assignments a
          where a.admin_id = auth.uid()
            and a.active = true
            and app_private.normalize_scope_text(a.base_key) = app_private.normalize_scope_text(target_base_key)
        )
        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and exists (
              select 1
              from unnest(coalesce(p.base_scope, '{}')) as scope(base_key)
              where app_private.normalize_scope_text(scope.base_key) = app_private.normalize_scope_text(target_base_key)
            )
        )
      )
    )
$$;

create or replace function public.can_access_driver_base(target_base_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.can_manage_driver_base(target_base_key)
$$;

alter table public.driver_portal_credentials enable row level security;
alter table public.driver_portal_sessions enable row level security;
alter table public.driver_portal_setup_tokens enable row level security;
alter table public.driver_portal_auth_attempts enable row level security;

drop policy if exists "bases scoped read" on public.operational_bases;
create policy "bases scoped read" on public.operational_bases
  for select to authenticated
  using (app_private.has_global_internal_access() or app_private.can_manage_driver_base(base_key));

drop policy if exists "drivers scoped read" on public.alc_drivers;
create policy "drivers scoped read" on public.alc_drivers
  for select to authenticated
  using (app_private.has_global_internal_access() or app_private.can_manage_driver_base(base_key) or auth_user_id = auth.uid());

drop policy if exists "drivers admin write" on public.alc_drivers;
create policy "drivers admin write" on public.alc_drivers
  for all to authenticated
  using (app_private.has_global_internal_access() or app_private.can_manage_driver_base(base_key))
  with check (app_private.has_global_internal_access() or app_private.can_manage_driver_base(base_key));

drop policy if exists "payment batches scoped" on public.driver_payment_batches;
create policy "payment batches scoped" on public.driver_payment_batches
  for all to authenticated
  using (app_private.has_global_internal_access())
  with check (app_private.has_global_internal_access());

drop policy if exists "payment docs scoped read" on public.driver_payment_documents;
create policy "payment docs scoped read" on public.driver_payment_documents
  for select to authenticated
  using (app_private.has_global_internal_access() or app_private.can_manage_driver_base(base_key));

drop policy if exists "payment docs admin write" on public.driver_payment_documents;
create policy "payment docs admin write" on public.driver_payment_documents
  for all to authenticated
  using (app_private.has_global_internal_access() or app_private.can_manage_driver_base(base_key))
  with check (app_private.has_global_internal_access() or app_private.can_manage_driver_base(base_key));

drop policy if exists "payment versions scoped read" on public.driver_payment_document_versions;
create policy "payment versions scoped read" on public.driver_payment_document_versions
  for select to authenticated
  using (
    exists (
      select 1 from public.driver_payment_documents d
      where d.id = document_id
        and (app_private.has_global_internal_access() or app_private.can_manage_driver_base(d.base_key))
    )
  );

drop policy if exists "payment versions admin write" on public.driver_payment_document_versions;
create policy "payment versions admin write" on public.driver_payment_document_versions
  for all to authenticated
  using (
    exists (
      select 1 from public.driver_payment_documents d
      where d.id = document_id
        and (app_private.has_global_internal_access() or app_private.can_manage_driver_base(d.base_key))
    )
  )
  with check (
    exists (
      select 1 from public.driver_payment_documents d
      where d.id = document_id
        and (app_private.has_global_internal_access() or app_private.can_manage_driver_base(d.base_key))
    )
  );

drop policy if exists "disputes scoped" on public.driver_disputes;
create policy "disputes scoped" on public.driver_disputes
  for all to authenticated
  using (app_private.has_global_internal_access() or app_private.can_manage_driver_base(base_key))
  with check (app_private.has_global_internal_access() or app_private.can_manage_driver_base(base_key));

drop policy if exists "dispute messages scoped" on public.driver_dispute_messages;
create policy "dispute messages scoped" on public.driver_dispute_messages
  for all to authenticated
  using (
    exists (
      select 1 from public.driver_disputes d
      where d.id = dispute_id
        and (app_private.has_global_internal_access() or app_private.can_manage_driver_base(d.base_key))
    )
  )
  with check (
    exists (
      select 1 from public.driver_disputes d
      where d.id = dispute_id
        and (app_private.has_global_internal_access() or app_private.can_manage_driver_base(d.base_key))
    )
  );

drop policy if exists "notifications driver read" on public.driver_notifications;
create policy "notifications scoped internal read" on public.driver_notifications
  for select to authenticated
  using (
    app_private.has_global_internal_access()
    or exists (
      select 1
      from public.alc_drivers d
      where d.id = driver_notifications.driver_id
        and app_private.can_manage_driver_base(d.base_key)
    )
  );

drop policy if exists "portal credentials internal only" on public.driver_portal_credentials;
create policy "portal credentials internal only" on public.driver_portal_credentials
  for all to authenticated
  using (
    app_private.has_global_internal_access()
    or exists (select 1 from public.alc_drivers d where d.id = driver_id and app_private.can_manage_driver_base(d.base_key))
  )
  with check (
    app_private.has_global_internal_access()
    or exists (select 1 from public.alc_drivers d where d.id = driver_id and app_private.can_manage_driver_base(d.base_key))
  );

drop policy if exists "portal sessions internal only" on public.driver_portal_sessions;
create policy "portal sessions internal only" on public.driver_portal_sessions
  for all to authenticated
  using (
    app_private.has_global_internal_access()
    or exists (select 1 from public.alc_drivers d where d.id = driver_id and app_private.can_manage_driver_base(d.base_key))
  )
  with check (
    app_private.has_global_internal_access()
    or exists (select 1 from public.alc_drivers d where d.id = driver_id and app_private.can_manage_driver_base(d.base_key))
  );

drop policy if exists "portal setup tokens internal only" on public.driver_portal_setup_tokens;
create policy "portal setup tokens internal only" on public.driver_portal_setup_tokens
  for all to authenticated
  using (
    app_private.has_global_internal_access()
    or exists (select 1 from public.alc_drivers d where d.id = driver_id and app_private.can_manage_driver_base(d.base_key))
  )
  with check (
    app_private.has_global_internal_access()
    or exists (select 1 from public.alc_drivers d where d.id = driver_id and app_private.can_manage_driver_base(d.base_key))
  );

drop policy if exists "portal auth attempts internal read" on public.driver_portal_auth_attempts;
create policy "portal auth attempts internal read" on public.driver_portal_auth_attempts
  for select to authenticated
  using (
    app_private.has_global_internal_access()
    or exists (select 1 from public.alc_drivers d where d.id = driver_id and app_private.can_manage_driver_base(d.base_key))
  );

drop policy if exists "audit scoped read" on public.driver_portal_audit_events;
create policy "audit scoped read" on public.driver_portal_audit_events
  for select to authenticated
  using (
    app_private.has_global_internal_access()
    or exists (
      select 1
      from public.alc_drivers d
      where d.id = driver_portal_audit_events.actor_driver_id
        and app_private.can_manage_driver_base(d.base_key)
    )
  );

drop policy if exists "audit scoped insert" on public.driver_portal_audit_events;
create policy "audit scoped insert" on public.driver_portal_audit_events
  for insert to authenticated
  with check (app_private.is_internal_user());

revoke all on schema app_private from anon;
grant usage on schema app_private to authenticated;
revoke all on all functions in schema app_private from anon;
grant execute on all functions in schema app_private to authenticated;

revoke execute on function public.can_access_driver_base(text) from anon;
grant execute on function public.can_access_driver_base(text) to authenticated;

revoke all on public.driver_portal_credentials from anon;
revoke all on public.driver_portal_sessions from anon;
revoke all on public.driver_portal_setup_tokens from anon;
revoke all on public.driver_portal_auth_attempts from anon;
