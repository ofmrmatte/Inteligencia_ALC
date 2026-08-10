create table if not exists public.processed_dashboard_files (
  id uuid primary key default gen_random_uuid(),
  module_key text not null,
  file_name text not null,
  file_hash text not null,
  file_size bigint,
  last_modified text,
  competencia text,
  row_count integer default 0,
  status text not null default 'processed',
  processed_at timestamp with time zone default now(),
  created_at timestamp with time zone default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (module_key, file_hash)
);

create index if not exists idx_processed_dashboard_files_module on public.processed_dashboard_files(module_key);
create index if not exists idx_processed_dashboard_files_hash on public.processed_dashboard_files(file_hash);
create index if not exists idx_processed_dashboard_files_competencia on public.processed_dashboard_files(competencia);

alter table public.processed_dashboard_files enable row level security;

drop policy if exists "Logged users can read processed dashboard files" on public.processed_dashboard_files;
drop policy if exists "Admins can manage processed dashboard files" on public.processed_dashboard_files;

create policy "Logged users can read processed dashboard files"
on public.processed_dashboard_files
for select
to authenticated
using ((select auth.uid()) is not null);

create policy "Admins can manage processed dashboard files"
on public.processed_dashboard_files
for all
to authenticated
using ((select public.is_current_user_admin()))
with check ((select public.is_current_user_admin()));
