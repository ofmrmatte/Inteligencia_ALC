-- Profile mutations and discount management are performed only by authenticated
-- Next.js APIs using the service role. Direct Data API writes would bypass the
-- server-side role hierarchy and row-level operational scope checks.

alter table public.profiles enable row level security;

drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can read permitted profiles" on public.profiles;
drop policy if exists "Users can update permitted profiles" on public.profiles;
drop policy if exists "profiles admin write" on public.profiles;
drop policy if exists "profiles read own or admin" on public.profiles;
drop policy if exists "profiles read own or full manager" on public.profiles;
drop policy if exists "profiles full manager write" on public.profiles;
drop policy if exists "profiles own read" on public.profiles;

create policy "profiles own read"
on public.profiles
for select
to authenticated
using (id = (select auth.uid()));

revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant all on public.profiles to service_role;

alter table public.discount_cases enable row level security;
alter table public.discount_case_events enable row level security;

drop policy if exists "discount cases analysis read" on public.discount_cases;
drop policy if exists "discount cases analysis write" on public.discount_cases;
drop policy if exists "discount cases analysis insert" on public.discount_cases;
drop policy if exists "discount cases analysis update" on public.discount_cases;
drop policy if exists "discount cases analysis delete" on public.discount_cases;
drop policy if exists "discount events analysis read" on public.discount_case_events;
drop policy if exists "discount events analysis write" on public.discount_case_events;

revoke all on public.discount_cases from anon, authenticated;
revoke all on public.discount_case_events from anon, authenticated;
revoke all on public.discount_case_current from anon, authenticated;
grant all on public.discount_cases to service_role;
grant all on public.discount_case_events to service_role;
grant select on public.discount_case_current to service_role;

-- These public compatibility RPCs accepted an arbitrary target_user. Keep them
-- available to trusted server code only; RLS uses the app_private equivalents.
revoke all on function public.profile_allowed_base_keys(uuid) from public, anon, authenticated;
revoke all on function public.profile_allowed_siglas(uuid) from public, anon, authenticated;
grant execute on function public.profile_allowed_base_keys(uuid) to service_role;
grant execute on function public.profile_allowed_siglas(uuid) to service_role;

-- Legacy dashboard tables are not used by the current application. Preserve
-- their data while closing the broad "any authenticated user" Data API access.
do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'pre_fatura_records',
    'desvios_pnr_records',
    'desvios_pnr_metrics_summary',
    'dashboard_files',
    'processed_dashboard_files',
    'gestao_pacotes_records',
    'gestao_desvios_pacotes_faltantes',
    'dashboard_metrics_cache'
  ]
  loop
    if to_regclass(format('public.%I', relation_name)) is not null then
      execute format('revoke all on table public.%I from anon, authenticated', relation_name);
      execute format('grant all on table public.%I to service_role', relation_name);
    end if;
  end loop;
end
$$;
