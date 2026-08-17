create table if not exists public.operational_units (
  unit_key text primary key,
  sigla text not null,
  base_name text not null,
  base_key text not null,
  xpt_code text,
  coordinator_name text,
  source text not null default 'manual',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_units_sigla_base_key_unique unique (sigla, base_key)
);

create table if not exists public.operational_unit_supervisors (
  id uuid primary key default gen_random_uuid(),
  unit_key text not null references public.operational_units(unit_key) on update cascade on delete cascade,
  supervisor_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_unit_supervisors_unique unique (unit_key, supervisor_name)
);

create index if not exists operational_units_sigla_idx on public.operational_units(sigla) where active = true;
create index if not exists operational_units_base_key_idx on public.operational_units(base_key) where active = true;
create index if not exists operational_units_xpt_idx on public.operational_units(xpt_code) where active = true;
create index if not exists operational_units_coordinator_idx on public.operational_units(coordinator_name) where active = true;
create index if not exists operational_unit_supervisors_name_idx on public.operational_unit_supervisors(supervisor_name) where active = true;

alter table public.operational_units enable row level security;
alter table public.operational_unit_supervisors enable row level security;

drop policy if exists "operational units scoped read" on public.operational_units;
create policy "operational units scoped read"
on public.operational_units
for select
to authenticated
using (
  app_private.can_manage_imports()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and (
        (
          p.role::text in ('coordinator','supervisor')
          and (
            unit_key = any(coalesce(p.base_scope,'{}'::text[]))
            or (
              base_key = any(coalesce(p.base_scope,'{}'::text[]))
              and (
                cardinality(coalesce(p.sigla_scope,'{}'::text[])) = 0
                or sigla = any(coalesce(p.sigla_scope,'{}'::text[]))
              )
            )
          )
        )
        or (
          p.role::text in ('admin','administration_supervisor')
          and app_private.can_manage_driver_base(base_key)
        )
      )
  )
);

drop policy if exists "operational unit supervisors scoped read" on public.operational_unit_supervisors;
create policy "operational unit supervisors scoped read"
on public.operational_unit_supervisors
for select
to authenticated
using (
  exists (
    select 1
    from public.operational_units u
    where u.unit_key = operational_unit_supervisors.unit_key
  )
);
