update public.profiles
set role = 'coordinator',
    active = false,
    global_access = false,
    base_scope = '{}'::text[],
    sigla_scope = '{}'::text[],
    module_scope = '{}'::text[],
    driver_management_scope = '{}'::text[],
    updated_at = now()
where role is null
   or role not in ('coordinator','supervisor','director','admin','developer','loss_supervisor','administration_supervisor','super_admin','driver');

alter table public.profiles alter column role set default 'coordinator';
alter table public.profiles alter column active set default false;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
check (role in ('coordinator','supervisor','director','admin','developer','loss_supervisor','administration_supervisor','super_admin','driver'));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  display_name text;
begin
  display_name := coalesce(
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'name', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Usuário ALC'
  );

  insert into public.profiles (
    id,
    email,
    name,
    full_name,
    role,
    is_admin,
    setor,
    active,
    global_access,
    base_scope,
    sigla_scope,
    module_scope,
    driver_management_scope
  )
  values (
    new.id,
    new.email,
    display_name,
    display_name,
    'coordinator',
    false,
    'LOSS',
    false,
    false,
    '{}'::text[],
    '{}'::text[],
    '{}'::text[],
    '{}'::text[]
  )
  on conflict (id) do update
  set
    email = excluded.email,
    name = coalesce(nullif(public.profiles.name, ''), excluded.name),
    full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
    updated_at = now();

  return new;
end;
$$;

create or replace function app_private.profile_allowed_base_keys(target_user uuid default auth.uid())
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    array_agg(distinct app_private.normalize_scope_text(scope.base_key))
      filter (where app_private.normalize_scope_text(scope.base_key) <> ''),
    '{}'
  )
  from public.profiles p
  cross join lateral unnest(coalesce(p.base_scope, '{}')) as scope(base_key)
  where p.id = target_user
    and p.active = true
    and p.role::text <> 'driver'
$$;

create or replace function app_private.profile_allowed_siglas(target_user uuid default auth.uid())
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    array_agg(distinct app_private.normalize_scope_text(scope.sigla))
      filter (where app_private.normalize_scope_text(scope.sigla) <> ''),
    '{}'
  )
  from public.profiles p
  cross join lateral unnest(coalesce(p.sigla_scope, '{}')) as scope(sigla)
  where p.id = target_user
    and p.active = true
    and p.role::text <> 'driver'
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function app_private.profile_allowed_base_keys(uuid) from public, anon;
revoke all on function app_private.profile_allowed_siglas(uuid) from public, anon;
grant execute on function app_private.profile_allowed_base_keys(uuid) to authenticated;
grant execute on function app_private.profile_allowed_siglas(uuid) to authenticated;
