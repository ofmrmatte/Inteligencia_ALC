insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dashboard-files', 'dashboard-files', false, null, null)
on conflict (id) do update
set public = false;

create table if not exists public.dashboard_files (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  storage_path text not null,
  file_type text,
  file_size bigint,
  uploaded_by uuid references auth.users(id),
  uploaded_by_email text,
  reference_month text,
  reference_year text,
  is_active boolean default false,
  status text default 'uploaded',
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.dashboard_files enable row level security;

drop policy if exists "Logged users can read dashboard files" on public.dashboard_files;
drop policy if exists "Admins can insert dashboard files" on public.dashboard_files;
drop policy if exists "Admins can update dashboard files" on public.dashboard_files;
drop policy if exists "Admins can delete dashboard files" on public.dashboard_files;

create policy "Logged users can read dashboard files"
on public.dashboard_files
for select
using (auth.uid() is not null);

create policy "Admins can insert dashboard files"
on public.dashboard_files
for insert
with check (public.is_current_user_admin());

create policy "Admins can update dashboard files"
on public.dashboard_files
for update
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

create policy "Admins can delete dashboard files"
on public.dashboard_files
for delete
using (public.is_current_user_admin());

drop policy if exists "Logged users can read dashboard storage files" on storage.objects;
drop policy if exists "Admins can upload dashboard storage files" on storage.objects;
drop policy if exists "Admins can update dashboard storage files" on storage.objects;
drop policy if exists "Admins can delete dashboard storage files" on storage.objects;

create policy "Logged users can read dashboard storage files"
on storage.objects
for select
using (
  bucket_id = 'dashboard-files'
  and auth.uid() is not null
);

create policy "Admins can upload dashboard storage files"
on storage.objects
for insert
with check (
  bucket_id = 'dashboard-files'
  and public.is_current_user_admin()
);

create policy "Admins can update dashboard storage files"
on storage.objects
for update
using (
  bucket_id = 'dashboard-files'
  and public.is_current_user_admin()
)
with check (
  bucket_id = 'dashboard-files'
  and public.is_current_user_admin()
);

create policy "Admins can delete dashboard storage files"
on storage.objects
for delete
using (
  bucket_id = 'dashboard-files'
  and public.is_current_user_admin()
);
