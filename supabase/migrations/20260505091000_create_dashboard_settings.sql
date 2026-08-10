create table if not exists public.dashboard_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_by_email text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.dashboard_settings enable row level security;

drop policy if exists "Logged users can read dashboard settings" on public.dashboard_settings;
drop policy if exists "Admins can insert dashboard settings" on public.dashboard_settings;
drop policy if exists "Admins can update dashboard settings" on public.dashboard_settings;
drop policy if exists "Admins can delete dashboard settings" on public.dashboard_settings;

create policy "Logged users can read dashboard settings"
on public.dashboard_settings
for select
to authenticated
using ((select auth.uid()) is not null);

create policy "Admins can insert dashboard settings"
on public.dashboard_settings
for insert
to authenticated
with check ((select public.is_current_user_admin()));

create policy "Admins can update dashboard settings"
on public.dashboard_settings
for update
to authenticated
using ((select public.is_current_user_admin()))
with check ((select public.is_current_user_admin()));

create policy "Admins can delete dashboard settings"
on public.dashboard_settings
for delete
to authenticated
using ((select public.is_current_user_admin()));

insert into public.dashboard_settings (
  key,
  value,
  created_at,
  updated_at
)
values (
  'pnr_goal',
  '{
    "monthly_goal": 40000,
    "annual_goal": 160000,
    "currency": "BRL",
    "goal_type": "loss_limit"
  }'::jsonb,
  now(),
  now()
)
on conflict (key) do nothing;
