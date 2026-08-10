alter table public.profiles
  add column if not exists setor text,
  add column if not exists cargo text,
  add column if not exists avatar_url text;

update public.profiles
set
  name = coalesce(nullif(name, ''), 'Matheus Ferreira Folgado'),
  cargo = coalesce(nullif(cargo, ''), 'Auxiliar de Perdas'),
  setor = coalesce(nullif(setor, ''), 'LOSS'),
  role = 'admin',
  is_admin = true,
  updated_at = now()
where email = 'matheus_frafou@outlook.com';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "Public can read avatars" on storage.objects;
drop policy if exists "Users can upload own avatar" on storage.objects;
drop policy if exists "Users can update own avatar" on storage.objects;
drop policy if exists "Users can delete own avatar" on storage.objects;

create policy "Public can read avatars"
on storage.objects
for select
using (bucket_id = 'avatars');

create policy "Users can upload own avatar"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can update own avatar"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can delete own avatar"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create or replace function public.protect_profile_sensitive_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.id and not public.is_current_user_admin() then
    if new.email is distinct from old.email
      or new.role is distinct from old.role
      or new.is_admin is distinct from old.is_admin
      or new.setor is distinct from old.setor
      or new.cargo is distinct from old.cargo then
      raise exception 'Apenas administradores podem alterar setor, cargo ou permissões.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_sensitive_fields on public.profiles;

create trigger protect_profile_sensitive_fields
before update on public.profiles
for each row
execute function public.protect_profile_sensitive_fields();
