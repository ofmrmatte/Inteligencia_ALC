update public.profiles
set global_access = case
  when role::text in ('director','developer','super_admin') then true
  else false
end,
updated_at = now();

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
        and p.role::text in ('director','developer','super_admin')
    ),
    false
  )
$$;
