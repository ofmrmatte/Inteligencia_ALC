alter table public.profiles
  add column if not exists global_access boolean not null default false;

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
        and (global_access = true or role in ('director', 'admin'))
    ),
    false
  )
$$;
