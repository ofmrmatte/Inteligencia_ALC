create or replace function app_private.enrich_operational_scope_on_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  resolved_base text;
  resolved_sigla text;
  match_count integer;
begin
  if exists (
    select 1 from public.operational_units u
    where u.active = true
      and app_private.normalize_scope_text(u.sigla) = app_private.normalize_scope_text(new.sigla)
      and app_private.normalize_scope_text(u.base_key) = app_private.normalize_scope_text(new.base_key)
  ) then
    return new;
  end if;

  if coalesce(new.driver_id, '') <> '' then
    select count(distinct u.unit_key), min(u.base_key), min(u.sigla)
      into match_count, resolved_base, resolved_sigla
    from public.alc_drivers d
    join public.operational_units u
      on u.active = true
     and app_private.normalize_scope_text(d.base_key) = app_private.normalize_scope_text(u.base_key)
     and (
       coalesce(app_private.normalize_scope_text(d.sigla), '') = ''
       or app_private.normalize_scope_text(d.sigla) = app_private.normalize_scope_text(u.sigla)
     )
    where d.driver_code = new.driver_id;

    if match_count = 1 then
      new.base_key := resolved_base;
      new.sigla := resolved_sigla;
      return new;
    end if;

    with evidence as (
      select u.unit_key, u.base_key, u.sigla
      from public.prefatura_records f
      join public.operational_units u
        on u.active = true
       and app_private.normalize_scope_text(u.sigla) = app_private.normalize_scope_text(f.sigla)
       and app_private.normalize_scope_text(u.base_key) = app_private.normalize_scope_text(f.base_key)
      where f.driver_id = new.driver_id
      union all
      select u.unit_key, u.base_key, u.sigla
      from public.pnr_records p
      join public.operational_units u
        on u.active = true
       and app_private.normalize_scope_text(u.sigla) = app_private.normalize_scope_text(p.sigla)
       and app_private.normalize_scope_text(u.base_key) = app_private.normalize_scope_text(p.base_key)
      where p.driver_id = new.driver_id
      union all
      select u.unit_key, u.base_key, u.sigla
      from public.risk_lm_records r
      join public.operational_units u
        on u.active = true
       and app_private.normalize_scope_text(u.sigla) = app_private.normalize_scope_text(r.sigla)
       and app_private.normalize_scope_text(u.base_key) = app_private.normalize_scope_text(r.base_key)
      where r.driver_id = new.driver_id
    )
    select count(distinct unit_key), min(base_key), min(sigla)
      into match_count, resolved_base, resolved_sigla
    from evidence;

    if match_count = 1 then
      new.base_key := resolved_base;
      new.sigla := resolved_sigla;
      return new;
    end if;
  end if;

  select count(*), min(u.base_key), min(u.sigla)
    into match_count, resolved_base, resolved_sigla
  from public.operational_units u
  where u.active = true
    and app_private.normalize_scope_text(u.sigla) = app_private.normalize_scope_text(new.sigla);

  if match_count = 1 then
    new.base_key := resolved_base;
    new.sigla := resolved_sigla;
  end if;

  return new;
end
$function$;

with exact_evidence as (
  select f.driver_id,u.unit_key,u.base_key,u.sigla
  from public.prefatura_records f
  join public.operational_units u on u.active=true
   and app_private.normalize_scope_text(u.sigla)=app_private.normalize_scope_text(f.sigla)
   and app_private.normalize_scope_text(u.base_key)=app_private.normalize_scope_text(f.base_key)
  where coalesce(f.driver_id,'')<>''
  union all
  select p.driver_id,u.unit_key,u.base_key,u.sigla
  from public.pnr_records p
  join public.operational_units u on u.active=true
   and app_private.normalize_scope_text(u.sigla)=app_private.normalize_scope_text(p.sigla)
   and app_private.normalize_scope_text(u.base_key)=app_private.normalize_scope_text(p.base_key)
  where coalesce(p.driver_id,'')<>''
  union all
  select r.driver_id,u.unit_key,u.base_key,u.sigla
  from public.risk_lm_records r
  join public.operational_units u on u.active=true
   and app_private.normalize_scope_text(u.sigla)=app_private.normalize_scope_text(r.sigla)
   and app_private.normalize_scope_text(u.base_key)=app_private.normalize_scope_text(r.base_key)
  where coalesce(r.driver_id,'')<>''
), driver_unique as (
  select driver_id,min(base_key) base_key,min(sigla) sigla
  from exact_evidence group by driver_id having count(distinct unit_key)=1
)
update public.pnr_records p
set base_key=d.base_key,sigla=d.sigla
from driver_unique d
where p.driver_id=d.driver_id
  and not exists (
    select 1 from public.operational_units u
    where u.active=true
      and app_private.normalize_scope_text(u.sigla)=app_private.normalize_scope_text(p.sigla)
      and app_private.normalize_scope_text(u.base_key)=app_private.normalize_scope_text(p.base_key)
  );

with exact_evidence as (
  select f.driver_id,u.unit_key,u.base_key,u.sigla
  from public.prefatura_records f
  join public.operational_units u on u.active=true
   and app_private.normalize_scope_text(u.sigla)=app_private.normalize_scope_text(f.sigla)
   and app_private.normalize_scope_text(u.base_key)=app_private.normalize_scope_text(f.base_key)
  where coalesce(f.driver_id,'')<>''
  union all
  select p.driver_id,u.unit_key,u.base_key,u.sigla
  from public.pnr_records p
  join public.operational_units u on u.active=true
   and app_private.normalize_scope_text(u.sigla)=app_private.normalize_scope_text(p.sigla)
   and app_private.normalize_scope_text(u.base_key)=app_private.normalize_scope_text(p.base_key)
  where coalesce(p.driver_id,'')<>''
  union all
  select r.driver_id,u.unit_key,u.base_key,u.sigla
  from public.risk_lm_records r
  join public.operational_units u on u.active=true
   and app_private.normalize_scope_text(u.sigla)=app_private.normalize_scope_text(r.sigla)
   and app_private.normalize_scope_text(u.base_key)=app_private.normalize_scope_text(r.base_key)
  where coalesce(r.driver_id,'')<>''
), driver_unique as (
  select driver_id,min(base_key) base_key,min(sigla) sigla
  from exact_evidence group by driver_id having count(distinct unit_key)=1
)
update public.risk_lm_records r
set base_key=d.base_key,sigla=d.sigla
from driver_unique d
where r.driver_id=d.driver_id
  and not exists (
    select 1 from public.operational_units u
    where u.active=true
      and app_private.normalize_scope_text(u.sigla)=app_private.normalize_scope_text(r.sigla)
      and app_private.normalize_scope_text(u.base_key)=app_private.normalize_scope_text(r.base_key)
  );
