create table if not exists public.driver_portal_base_access (
  id uuid primary key default gen_random_uuid(),
  base_key text not null unique references public.operational_bases(base_key) on update cascade on delete restrict,
  enabled boolean not null default false,
  enabled_at timestamptz,
  enabled_by uuid references public.profiles(id) on delete set null,
  disabled_at timestamptz,
  disabled_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists driver_portal_base_access_enabled_idx
  on public.driver_portal_base_access(enabled, base_key);

alter table public.driver_portal_base_access enable row level security;
alter table public.driver_portal_base_access force row level security;

revoke all on public.driver_portal_base_access from anon, authenticated;

create or replace function public.set_driver_portal_base_access(
  target_base_key text,
  target_enabled boolean,
  actor_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_base_key text := upper(trim(coalesce(target_base_key, '')));
  config_before jsonb;
  config_after jsonb;
  config_id uuid;
  drivers_updated integer := 0;
  sessions_revoked integer := 0;
begin
  if normalized_base_key = '' then
    raise exception 'base_key obrigatoria';
  end if;

  if not exists (select 1 from public.operational_bases where base_key = normalized_base_key) then
    raise exception 'base_key inexistente: %', normalized_base_key;
  end if;

  select to_jsonb(c.*)
    into config_before
  from public.driver_portal_base_access c
  where c.base_key = normalized_base_key
  for update;

  insert into public.driver_portal_base_access (
    base_key,
    enabled,
    enabled_at,
    enabled_by,
    disabled_at,
    disabled_by,
    updated_at
  )
  values (
    normalized_base_key,
    target_enabled,
    case when target_enabled then now() else null end,
    case when target_enabled then actor_profile_id else null end,
    case when target_enabled then null else now() end,
    case when target_enabled then null else actor_profile_id end,
    now()
  )
  on conflict (base_key) do update set
    enabled = excluded.enabled,
    enabled_at = case when excluded.enabled then now() else public.driver_portal_base_access.enabled_at end,
    enabled_by = case when excluded.enabled then actor_profile_id else public.driver_portal_base_access.enabled_by end,
    disabled_at = case when excluded.enabled then public.driver_portal_base_access.disabled_at else now() end,
    disabled_by = case when excluded.enabled then public.driver_portal_base_access.disabled_by else actor_profile_id end,
    updated_at = now()
  returning id into config_id;

  if target_enabled then
    update public.alc_drivers
    set portal_eligible = true,
        updated_at = now()
    where base_key = normalized_base_key
      and portal_status not in ('blocked', 'inactive')
      and portal_eligible is distinct from true;
    get diagnostics drivers_updated = row_count;
  else
    update public.alc_drivers
    set portal_eligible = false,
        updated_at = now()
    where base_key = normalized_base_key
      and portal_eligible is distinct from false;
    get diagnostics drivers_updated = row_count;

    update public.driver_portal_sessions s
    set revoked_at = now()
    from public.alc_drivers d
    where s.driver_id = d.id
      and d.base_key = normalized_base_key
      and s.revoked_at is null;
    get diagnostics sessions_revoked = row_count;
  end if;

  select to_jsonb(c.*)
    into config_after
  from public.driver_portal_base_access c
  where c.id = config_id;

  insert into public.driver_portal_audit_events (
    actor_profile_id,
    action,
    entity_table,
    entity_id,
    before_data,
    after_data
  )
  values (
    actor_profile_id,
    case when target_enabled then 'driver_portal_base_enabled' else 'driver_portal_base_disabled' end,
    'driver_portal_base_access',
    config_id,
    config_before,
    config_after || jsonb_build_object('drivers_updated', drivers_updated, 'sessions_revoked', sessions_revoked)
  );

  return jsonb_build_object(
    'baseKey', normalized_base_key,
    'enabled', target_enabled,
    'driversUpdated', drivers_updated,
    'sessionsRevoked', sessions_revoked
  );
end;
$$;

revoke execute on function public.set_driver_portal_base_access(text, boolean, uuid) from public, anon, authenticated;
