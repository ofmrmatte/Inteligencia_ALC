-- Keep the legacy base table only as FK compatibility, but align every
-- unambiguous master base to the canonical SVC + base directory.
with unique_master as (
  select
    app_private.normalize_scope_text(base_key) as normalized_base,
    min(base_key) as base_key,
    min(base_name) as base_name,
    min(sigla) as sigla
  from public.operational_units
  where active = true
  group by app_private.normalize_scope_text(base_key)
  having count(*) = 1
)
insert into public.operational_bases (base_key, base_name, sigla, active, updated_at)
select u.base_key, u.base_name, u.sigla, true, now()
from unique_master u
where not exists (
  select 1 from public.operational_bases b
  where app_private.normalize_scope_text(b.base_key) = u.normalized_base
)
on conflict (base_key) do update
set base_name = excluded.base_name,
    sigla = excluded.sigla,
    active = true,
    updated_at = now();

create or replace function app_private.canonicalize_alc_driver_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  match_count integer := 0;
  resolved_base text;
  resolved_sigla text;
begin
  if exists (
    select 1
    from public.operational_units u
    where u.active = true
      and app_private.normalize_scope_text(u.sigla) = app_private.normalize_scope_text(new.sigla)
      and app_private.normalize_scope_text(u.base_key) = app_private.normalize_scope_text(new.base_key)
  ) then
    return new;
  end if;

  if coalesce(new.base_key, '') <> '' then
    select count(*), min(u.base_key), min(u.sigla)
      into match_count, resolved_base, resolved_sigla
    from public.operational_units u
    where u.active = true
      and app_private.normalize_scope_text(u.base_key) = app_private.normalize_scope_text(new.base_key);

    if match_count = 1 then
      new.base_key := resolved_base;
      new.sigla := resolved_sigla;
      return new;
    end if;
  end if;

  if coalesce(new.sigla, '') <> ''
     and (coalesce(new.base_key, '') = ''
          or app_private.normalize_scope_text(new.base_key) = app_private.normalize_scope_text(new.sigla)) then
    select count(*), min(u.base_key), min(u.sigla)
      into match_count, resolved_base, resolved_sigla
    from public.operational_units u
    where u.active = true
      and app_private.normalize_scope_text(u.sigla) = app_private.normalize_scope_text(new.sigla);

    if match_count = 1 then
      new.base_key := resolved_base;
      new.sigla := resolved_sigla;
      return new;
    end if;
  end if;

  if exists (
    select 1 from public.operational_xpts x
    where x.active = true
      and app_private.normalize_scope_text(x.xpt_code) = app_private.normalize_scope_text(new.sigla)
  ) then
    new.sigla := null;
  end if;

  return new;
end
$function$;

drop trigger if exists trg_canonicalize_alc_driver_scope on public.alc_drivers;
create trigger trg_canonicalize_alc_driver_scope
before insert or update of base_key, sigla on public.alc_drivers
for each row execute function app_private.canonicalize_alc_driver_scope();

with evidence as (
  select p.driver_id, u.unit_key, u.sigla, u.base_key,
         coalesce(p.route_date::timestamptz, p.created_at) as event_at
  from public.prefatura_records p
  join public.operational_units u
    on u.active = true
   and app_private.normalize_scope_text(u.sigla) = app_private.normalize_scope_text(p.sigla)
   and app_private.normalize_scope_text(u.base_key) = app_private.normalize_scope_text(p.base_key)
  where coalesce(p.driver_id, '') <> ''

  union all

  select p.driver_id, u.unit_key, u.sigla, u.base_key,
         coalesce(p.case_date::timestamptz, p.created_at) as event_at
  from public.pnr_records p
  join public.operational_units u
    on u.active = true
   and app_private.normalize_scope_text(u.sigla) = app_private.normalize_scope_text(p.sigla)
   and app_private.normalize_scope_text(u.base_key) = app_private.normalize_scope_text(p.base_key)
  where coalesce(p.driver_id, '') <> ''

  union all

  select r.driver_id, u.unit_key, u.sigla, u.base_key,
         coalesce(r.failure_date::timestamptz, r.created_at) as event_at
  from public.risk_lm_records r
  join public.operational_units u
    on u.active = true
   and app_private.normalize_scope_text(u.sigla) = app_private.normalize_scope_text(r.sigla)
   and app_private.normalize_scope_text(u.base_key) = app_private.normalize_scope_text(r.base_key)
  where coalesce(r.driver_id, '') <> ''
), latest as (
  select distinct on (driver_id)
    driver_id, unit_key, sigla, base_key
  from evidence
  order by driver_id, event_at desc nulls last, unit_key
)
update public.alc_drivers d
set base_key = l.base_key,
    sigla = l.sigla,
    updated_at = now()
from latest l
where d.driver_code = l.driver_id
  and not exists (
    select 1 from public.operational_units u
    where u.active = true
      and app_private.normalize_scope_text(u.sigla) = app_private.normalize_scope_text(d.sigla)
      and app_private.normalize_scope_text(u.base_key) = app_private.normalize_scope_text(d.base_key)
  );

update public.alc_drivers d
set base_key = d.base_key,
    sigla = d.sigla,
    updated_at = now()
where not exists (
  select 1 from public.operational_units u
  where u.active = true
    and app_private.normalize_scope_text(u.sigla) = app_private.normalize_scope_text(d.sigla)
    and app_private.normalize_scope_text(u.base_key) = app_private.normalize_scope_text(d.base_key)
);
