drop policy if exists "Users can insert own profile" on public.profiles;

create policy "Users can insert own profile"
on public.profiles
for insert
with check (
  auth.uid() = id
  and coalesce(is_admin, false) = false
  and coalesce(role, 'user') = 'user'
);
