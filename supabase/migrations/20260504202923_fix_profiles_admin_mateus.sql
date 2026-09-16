insert into public.profiles (
  id,
  email,
  name,
  role,
  is_admin,
  created_at,
  updated_at
)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'name', 'Usuário'),
  'user',
  false,
  now(),
  now()
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

insert into public.profiles (
  id,
  email,
  name,
  role,
  is_admin,
  created_at,
  updated_at
)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'name', 'Matheus'),
  'admin',
  true,
  now(),
  now()
from auth.users u
where u.email = 'matheus_frafou@outlook.com'
on conflict (id) do update
set
  role = 'admin',
  is_admin = true,
  name = coalesce(public.profiles.name, 'Matheus'),
  updated_at = now();
