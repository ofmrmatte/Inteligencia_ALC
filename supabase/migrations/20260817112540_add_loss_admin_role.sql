alter table public.profiles drop constraint if exists profiles_role_check;

alter table public.profiles add constraint profiles_role_check
check (
  role in (
    'coordinator',
    'supervisor',
    'director',
    'admin',
    'developer',
    'loss_supervisor',
    'loss_admin',
    'administration_supervisor',
    'super_admin',
    'driver'
  )
);

update public.profiles
set global_access = false,
    driver_management_scope = '{}'::text[],
    updated_at = now()
where role = 'loss_admin';
