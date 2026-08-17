create or replace function app_private.enrich_operational_scope_on_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  raw_station text;
  resolved_base text;
  resolved_sigla text;
  match_count integer;
  source_sigla_exists boolean;
begin
  raw_station := app_private.normalize_scope_text(
    coalesce(
      nullif(to_jsonb(new)->>'origin_station',''),
      nullif(to_jsonb(new)->>'facility_id',''),
      nullif(new.sigla,'')
    )
  );

  if coalesce(raw_station,'') <> '' then
    select exists (
      select 1 from public.operational_units u
      where u.active=true and app_private.normalize_scope_text(u.sigla)=raw_station
    ) into source_sigla_exists;

    if source_sigla_exists then
      select count(*),min(u.base_key),min(u.sigla)
      into match_count,resolved_base,resolved_sigla
      from public.operational_units u
      where u.active=true and app_private.normalize_scope_text(u.sigla)=raw_station;

      if match_count=1 then
        new.sigla:=resolved_sigla;
        new.base_key:=resolved_base;
        return new;
      end if;

      if coalesce(new.driver_id,'')<>'' then
        with evidence as (
          select u.unit_key,u.base_key,u.sigla
          from public.alc_drivers d
          join public.operational_units u on u.active=true
           and app_private.normalize_scope_text(d.base_key)=app_private.normalize_scope_text(u.base_key)
           and (coalesce(app_private.normalize_scope_text(d.sigla),'')='' or app_private.normalize_scope_text(d.sigla)=app_private.normalize_scope_text(u.sigla))
          where d.driver_code=new.driver_id and app_private.normalize_scope_text(u.sigla)=raw_station
          union all
          select u.unit_key,u.base_key,u.sigla
          from public.prefatura_records f
          join public.operational_units u on u.active=true
           and app_private.normalize_scope_text(f.sigla)=app_private.normalize_scope_text(u.sigla)
           and app_private.normalize_scope_text(f.base_key)=app_private.normalize_scope_text(u.base_key)
          where f.driver_id=new.driver_id and app_private.normalize_scope_text(u.sigla)=raw_station
          union all
          select u.unit_key,u.base_key,u.sigla
          from public.pnr_records p
          join public.operational_units u on u.active=true
           and app_private.normalize_scope_text(p.sigla)=app_private.normalize_scope_text(u.sigla)
           and app_private.normalize_scope_text(p.base_key)=app_private.normalize_scope_text(u.base_key)
          where p.driver_id=new.driver_id
            and app_private.normalize_scope_text(p.origin_station)=raw_station
            and app_private.normalize_scope_text(u.sigla)=raw_station
          union all
          select u.unit_key,u.base_key,u.sigla
          from public.risk_lm_records r
          join public.operational_units u on u.active=true
           and app_private.normalize_scope_text(r.sigla)=app_private.normalize_scope_text(u.sigla)
           and app_private.normalize_scope_text(r.base_key)=app_private.normalize_scope_text(u.base_key)
          where r.driver_id=new.driver_id
            and app_private.normalize_scope_text(r.facility_id)=raw_station
            and app_private.normalize_scope_text(u.sigla)=raw_station
        )
        select count(distinct unit_key),min(base_key),min(sigla)
        into match_count,resolved_base,resolved_sigla
        from evidence;

        if match_count=1 then
          new.sigla:=resolved_sigla;
          new.base_key:=resolved_base;
          return new;
        end if;
      end if;

      new.sigla:=raw_station;
      new.base_key:=raw_station;
      return new;
    end if;

    new.sigla:=raw_station;
    new.base_key:=raw_station;
    return new;
  end if;

  if coalesce(new.driver_id,'')<>'' then
    with evidence as (
      select u.unit_key,u.base_key,u.sigla
      from public.alc_drivers d
      join public.operational_units u on u.active=true
       and app_private.normalize_scope_text(d.base_key)=app_private.normalize_scope_text(u.base_key)
       and (coalesce(app_private.normalize_scope_text(d.sigla),'')='' or app_private.normalize_scope_text(d.sigla)=app_private.normalize_scope_text(u.sigla))
      where d.driver_code=new.driver_id
      union all
      select u.unit_key,u.base_key,u.sigla
      from public.prefatura_records f
      join public.operational_units u on u.active=true
       and app_private.normalize_scope_text(f.sigla)=app_private.normalize_scope_text(u.sigla)
       and app_private.normalize_scope_text(f.base_key)=app_private.normalize_scope_text(u.base_key)
      where f.driver_id=new.driver_id
      union all
      select u.unit_key,u.base_key,u.sigla
      from public.pnr_records p
      join public.operational_units u on u.active=true
       and app_private.normalize_scope_text(p.sigla)=app_private.normalize_scope_text(u.sigla)
       and app_private.normalize_scope_text(p.base_key)=app_private.normalize_scope_text(u.base_key)
      where p.driver_id=new.driver_id and coalesce(p.origin_station,'')<>''
        and app_private.normalize_scope_text(p.origin_station)=app_private.normalize_scope_text(u.sigla)
      union all
      select u.unit_key,u.base_key,u.sigla
      from public.risk_lm_records r
      join public.operational_units u on u.active=true
       and app_private.normalize_scope_text(r.sigla)=app_private.normalize_scope_text(u.sigla)
       and app_private.normalize_scope_text(r.base_key)=app_private.normalize_scope_text(u.base_key)
      where r.driver_id=new.driver_id and coalesce(r.facility_id,'')<>''
        and app_private.normalize_scope_text(r.facility_id)=app_private.normalize_scope_text(u.sigla)
    )
    select count(distinct unit_key),min(base_key),min(sigla)
    into match_count,resolved_base,resolved_sigla
    from evidence;

    if match_count=1 then
      new.sigla:=resolved_sigla;
      new.base_key:=resolved_base;
    end if;
  end if;

  return new;
end
$function$;

update public.pnr_records
set sigla=app_private.normalize_scope_text(origin_station),
    base_key=app_private.normalize_scope_text(origin_station)
where coalesce(origin_station,'')<>'';

update public.risk_lm_records
set sigla=app_private.normalize_scope_text(facility_id),
    base_key=app_private.normalize_scope_text(facility_id)
where coalesce(facility_id,'')<>'';

with unique_sigla as (
  select app_private.normalize_scope_text(sigla) sigla_norm,min(sigla) sigla,min(base_key) base_key
  from public.operational_units where active=true
  group by app_private.normalize_scope_text(sigla) having count(*)=1
)
update public.pnr_records p set sigla=u.sigla,base_key=u.base_key
from unique_sigla u
where app_private.normalize_scope_text(p.origin_station)=u.sigla_norm;

with unique_sigla as (
  select app_private.normalize_scope_text(sigla) sigla_norm,min(sigla) sigla,min(base_key) base_key
  from public.operational_units where active=true
  group by app_private.normalize_scope_text(sigla) having count(*)=1
)
update public.risk_lm_records r set sigla=u.sigla,base_key=u.base_key
from unique_sigla u
where app_private.normalize_scope_text(r.facility_id)=u.sigla_norm;

with safe_evidence as (
  select d.driver_code driver_id,u.unit_key,u.sigla,u.base_key
  from public.alc_drivers d
  join public.operational_units u on u.active=true
   and app_private.normalize_scope_text(d.base_key)=app_private.normalize_scope_text(u.base_key)
   and (coalesce(app_private.normalize_scope_text(d.sigla),'')='' or app_private.normalize_scope_text(d.sigla)=app_private.normalize_scope_text(u.sigla))
  where coalesce(d.driver_code,'')<>''
  union all
  select f.driver_id,u.unit_key,u.sigla,u.base_key
  from public.prefatura_records f
  join public.operational_units u on u.active=true
   and app_private.normalize_scope_text(f.sigla)=app_private.normalize_scope_text(u.sigla)
   and app_private.normalize_scope_text(f.base_key)=app_private.normalize_scope_text(u.base_key)
  where coalesce(f.driver_id,'')<>''
  union all
  select p.driver_id,u.unit_key,u.sigla,u.base_key
  from public.pnr_records p
  join public.operational_units u on u.active=true
   and app_private.normalize_scope_text(p.sigla)=app_private.normalize_scope_text(u.sigla)
   and app_private.normalize_scope_text(p.base_key)=app_private.normalize_scope_text(u.base_key)
  where coalesce(p.driver_id,'')<>'' and app_private.normalize_scope_text(p.origin_station)=app_private.normalize_scope_text(u.sigla)
  union all
  select r.driver_id,u.unit_key,u.sigla,u.base_key
  from public.risk_lm_records r
  join public.operational_units u on u.active=true
   and app_private.normalize_scope_text(r.sigla)=app_private.normalize_scope_text(u.sigla)
   and app_private.normalize_scope_text(r.base_key)=app_private.normalize_scope_text(u.base_key)
  where coalesce(r.driver_id,'')<>'' and app_private.normalize_scope_text(r.facility_id)=app_private.normalize_scope_text(u.sigla)
), unique_driver_sigla as (
  select driver_id,app_private.normalize_scope_text(sigla) sigla_norm,min(sigla) sigla,min(base_key) base_key
  from safe_evidence group by driver_id,app_private.normalize_scope_text(sigla)
  having count(distinct unit_key)=1
)
update public.pnr_records p set sigla=e.sigla,base_key=e.base_key
from unique_driver_sigla e
where p.driver_id=e.driver_id
  and app_private.normalize_scope_text(p.origin_station)=e.sigla_norm
  and not exists (
    select 1 from public.operational_units u where u.active=true
      and app_private.normalize_scope_text(u.sigla)=app_private.normalize_scope_text(p.sigla)
      and app_private.normalize_scope_text(u.base_key)=app_private.normalize_scope_text(p.base_key)
  );

with safe_evidence as (
  select d.driver_code driver_id,u.unit_key,u.sigla,u.base_key
  from public.alc_drivers d
  join public.operational_units u on u.active=true
   and app_private.normalize_scope_text(d.base_key)=app_private.normalize_scope_text(u.base_key)
   and (coalesce(app_private.normalize_scope_text(d.sigla),'')='' or app_private.normalize_scope_text(d.sigla)=app_private.normalize_scope_text(u.sigla))
  where coalesce(d.driver_code,'')<>''
  union all
  select f.driver_id,u.unit_key,u.sigla,u.base_key
  from public.prefatura_records f
  join public.operational_units u on u.active=true
   and app_private.normalize_scope_text(f.sigla)=app_private.normalize_scope_text(u.sigla)
   and app_private.normalize_scope_text(f.base_key)=app_private.normalize_scope_text(u.base_key)
  where coalesce(f.driver_id,'')<>''
  union all
  select p.driver_id,u.unit_key,u.sigla,u.base_key
  from public.pnr_records p
  join public.operational_units u on u.active=true
   and app_private.normalize_scope_text(p.sigla)=app_private.normalize_scope_text(u.sigla)
   and app_private.normalize_scope_text(p.base_key)=app_private.normalize_scope_text(u.base_key)
  where coalesce(p.driver_id,'')<>'' and app_private.normalize_scope_text(p.origin_station)=app_private.normalize_scope_text(u.sigla)
  union all
  select r.driver_id,u.unit_key,u.sigla,u.base_key
  from public.risk_lm_records r
  join public.operational_units u on u.active=true
   and app_private.normalize_scope_text(r.sigla)=app_private.normalize_scope_text(u.sigla)
   and app_private.normalize_scope_text(r.base_key)=app_private.normalize_scope_text(u.base_key)
  where coalesce(r.driver_id,'')<>'' and app_private.normalize_scope_text(r.facility_id)=app_private.normalize_scope_text(u.sigla)
), unique_driver_sigla as (
  select driver_id,app_private.normalize_scope_text(sigla) sigla_norm,min(sigla) sigla,min(base_key) base_key
  from safe_evidence group by driver_id,app_private.normalize_scope_text(sigla)
  having count(distinct unit_key)=1
)
update public.risk_lm_records r set sigla=e.sigla,base_key=e.base_key
from unique_driver_sigla e
where r.driver_id=e.driver_id
  and app_private.normalize_scope_text(r.facility_id)=e.sigla_norm
  and not exists (
    select 1 from public.operational_units u where u.active=true
      and app_private.normalize_scope_text(u.sigla)=app_private.normalize_scope_text(r.sigla)
      and app_private.normalize_scope_text(u.base_key)=app_private.normalize_scope_text(r.base_key)
  );

with safe_evidence as (
  select d.driver_code driver_id,u.unit_key,u.sigla,u.base_key
  from public.alc_drivers d
  join public.operational_units u on u.active=true
   and app_private.normalize_scope_text(d.base_key)=app_private.normalize_scope_text(u.base_key)
   and (coalesce(app_private.normalize_scope_text(d.sigla),'')='' or app_private.normalize_scope_text(d.sigla)=app_private.normalize_scope_text(u.sigla))
  where coalesce(d.driver_code,'')<>''
  union all
  select f.driver_id,u.unit_key,u.sigla,u.base_key
  from public.prefatura_records f
  join public.operational_units u on u.active=true
   and app_private.normalize_scope_text(f.sigla)=app_private.normalize_scope_text(u.sigla)
   and app_private.normalize_scope_text(f.base_key)=app_private.normalize_scope_text(u.base_key)
  where coalesce(f.driver_id,'')<>''
  union all
  select p.driver_id,u.unit_key,u.sigla,u.base_key
  from public.pnr_records p
  join public.operational_units u on u.active=true
   and app_private.normalize_scope_text(p.sigla)=app_private.normalize_scope_text(u.sigla)
   and app_private.normalize_scope_text(p.base_key)=app_private.normalize_scope_text(u.base_key)
  where coalesce(p.driver_id,'')<>'' and coalesce(p.origin_station,'')<>'' and app_private.normalize_scope_text(p.origin_station)=app_private.normalize_scope_text(u.sigla)
  union all
  select r.driver_id,u.unit_key,u.sigla,u.base_key
  from public.risk_lm_records r
  join public.operational_units u on u.active=true
   and app_private.normalize_scope_text(r.sigla)=app_private.normalize_scope_text(u.sigla)
   and app_private.normalize_scope_text(r.base_key)=app_private.normalize_scope_text(u.base_key)
  where coalesce(r.driver_id,'')<>'' and coalesce(r.facility_id,'')<>'' and app_private.normalize_scope_text(r.facility_id)=app_private.normalize_scope_text(u.sigla)
), unique_driver as (
  select driver_id,min(sigla) sigla,min(base_key) base_key
  from safe_evidence group by driver_id having count(distinct unit_key)=1
)
update public.pnr_records p set sigla=e.sigla,base_key=e.base_key
from unique_driver e
where coalesce(p.origin_station,'')='' and p.driver_id=e.driver_id;
