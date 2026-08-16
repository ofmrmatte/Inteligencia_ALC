do $$
begin
  if exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'app_role'
  ) then
    alter type public.app_role add value if not exists 'developer';
  end if;
end
$$;

create or replace function public.has_full_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and active = true
        and (global_access = true or role::text in ('director', 'admin', 'developer'))
    ),
    false
  )
$$;

create or replace function public.can_manage_users()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and active = true
        and (global_access = true or role::text in ('director', 'admin', 'developer'))
    ),
    false
  )
$$;

drop policy if exists "profiles admin write" on public.profiles;
create policy "profiles admin write" on public.profiles
  for all to authenticated
  using (public.can_manage_users())
  with check (public.can_manage_users());
