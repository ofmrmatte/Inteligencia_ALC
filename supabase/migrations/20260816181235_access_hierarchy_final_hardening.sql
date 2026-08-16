alter table public.profiles
  add column if not exists module_scope text[] not null default '{}'::text[],
  add column if not exists driver_management_scope text[] not null default '{}'::text[];

create or replace function app_private.has_global_internal_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(exists (select 1 from public.profiles p where p.id = auth.uid() and p.active = true and p.role::text in ('director', 'developer', 'loss_supervisor', 'super_admin')), false)
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(exists (select 1 from public.profiles p where p.id = auth.uid() and p.active = true and p.role::text in ('director', 'developer', 'loss_supervisor', 'super_admin')), false)
$$;

create or replace function private.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(exists (select 1 from public.profiles p where p.id = auth.uid() and p.active = true and p.role::text in ('director', 'developer', 'loss_supervisor', 'super_admin')), false)
$$;

create or replace function app_private.can_manage_driver_base(target_base_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.has_global_internal_access()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.active = true and p.role::text = 'administration_supervisor')
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.active = true and p.role::text = 'admin'
        and (
          exists (select 1 from public.admin_base_assignments a where a.admin_id = p.id and a.active = true and app_private.normalize_scope_text(a.base_key) = app_private.normalize_scope_text(target_base_key))
          or exists (select 1 from unnest(coalesce(p.base_scope, '{}')) as scope(base_key) where app_private.normalize_scope_text(scope.base_key) = app_private.normalize_scope_text(target_base_key))
        )
    )
$$;

drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can read permitted profiles" on public.profiles;
drop policy if exists "Users can update permitted profiles" on public.profiles;
drop policy if exists "profiles admin write" on public.profiles;
drop policy if exists "profiles read own or admin" on public.profiles;

create policy "profiles read own or full manager" on public.profiles for select to authenticated using (id = auth.uid() or app_private.has_global_internal_access());
create policy "profiles full manager write" on public.profiles for all to authenticated using (app_private.has_global_internal_access()) with check (app_private.has_global_internal_access());

update public.profiles set global_access = case when role::text in ('director', 'developer', 'loss_supervisor', 'super_admin') then true else false end, updated_at = now();
update public.profiles set module_scope = array['visao-geral','gestao-pnr','pre-faturamento','risco-lm','motoristas','perfil']::text[], driver_management_scope = '{}'::text[], updated_at = now() where role::text in ('coordinator','supervisor');
update public.profiles set module_scope = array['gestao-motoristas']::text[], driver_management_scope = array['payments','disputes']::text[], updated_at = now() where role::text = 'admin';
update public.profiles set module_scope = array['gestao-motoristas']::text[], driver_management_scope = array['overview','pilot','drivers','tickets','payments','disputes','admins']::text[], updated_at = now() where role::text = 'administration_supervisor';
