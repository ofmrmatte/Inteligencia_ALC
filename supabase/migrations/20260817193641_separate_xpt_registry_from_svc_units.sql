create table if not exists public.operational_xpts (
  xpt_code text primary key,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.operational_xpts (xpt_code, active)
select distinct upper(trim(xpt_code)), true
from public.operational_units
where nullif(trim(coalesce(xpt_code, '')), '') is not null
on conflict (xpt_code) do nothing;

alter table public.operational_xpts enable row level security;

drop policy if exists "operational xpts authenticated read" on public.operational_xpts;
create policy "operational xpts authenticated read"
on public.operational_xpts
for select
to authenticated
using (true);

grant select on public.operational_xpts to authenticated;
