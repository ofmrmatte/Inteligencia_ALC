create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  action text not null,
  entity_type text,
  entity_id text,
  details jsonb default '{}'::jsonb,
  created_at timestamp with time zone default now()
);

alter table public.audit_logs enable row level security;

drop policy if exists "Admins can read audit logs" on public.audit_logs;
drop policy if exists "Logged users can insert audit logs" on public.audit_logs;

create policy "Admins can read audit logs"
on public.audit_logs
for select
using (public.is_current_user_admin());

create policy "Logged users can insert audit logs"
on public.audit_logs
for insert
with check (auth.uid() is not null);
