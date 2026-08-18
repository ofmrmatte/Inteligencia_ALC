create index if not exists prefatura_driver_activity_idx on public.prefatura_records(driver_id,route_date desc,created_at desc) where driver_id is not null;
create index if not exists pnr_driver_activity_idx on public.pnr_records(driver_id,case_date desc,created_at desc) where driver_id is not null;
create index if not exists risk_driver_activity_idx on public.risk_lm_records(driver_id,failure_date desc,created_at desc) where driver_id is not null;

create or replace function app_private.canonicalize_alc_driver_scope()
returns trigger
language plpgsql
security definer
set search_path=public
as $function$
declare
  match_count integer := 0;
  resolved_base text;
  resolved_sigla text;
  latest_base text;
  latest_sigla text;
begin
  if coalesce(new.driver_code,'')<>'' then
    with evidence as (
      select p.sigla,p.base_key,coalesce(p.route_date,p.created_at::date) activity_date,p.created_at
      from public.prefatura_records p where p.driver_id=new.driver_code
      union all
      select p.sigla,p.base_key,coalesce(p.case_date,p.created_at::date),p.created_at
      from public.pnr_records p where p.driver_id=new.driver_code
      union all
      select r.sigla,r.base_key,coalesce(r.failure_date,r.created_at::date),r.created_at
      from public.risk_lm_records r where r.driver_id=new.driver_code
    )
    select e.base_key,e.sigla into latest_base,latest_sigla
    from evidence e
    order by e.activity_date desc nulls last,e.created_at desc
    limit 1;

    if latest_sigla is not null then
      select x.base_key,x.xpt_code into resolved_base,resolved_sigla
      from public.operational_xpts x
      where x.active=true and app_private.normalize_scope_text(x.xpt_code)=app_private.normalize_scope_text(latest_sigla)
      limit 1;
      if resolved_sigla is not null then
        new.base_key:=resolved_base;
        new.sigla:=resolved_sigla;
        return new;
      end if;

      select u.base_key,u.sigla into resolved_base,resolved_sigla
      from public.operational_units u
      where u.active=true
        and app_private.normalize_scope_text(u.sigla)=app_private.normalize_scope_text(latest_sigla)
        and app_private.normalize_scope_text(u.base_key)=app_private.normalize_scope_text(latest_base)
      limit 1;
      if resolved_sigla is not null then
        new.base_key:=resolved_base;
        new.sigla:=resolved_sigla;
        return new;
      end if;
    end if;
  end if;

  select x.base_key,x.xpt_code into resolved_base,resolved_sigla
  from public.operational_xpts x
  where x.active=true and app_private.normalize_scope_text(x.xpt_code)=app_private.normalize_scope_text(new.sigla)
  limit 1;
  if resolved_sigla is not null then
    new.base_key:=resolved_base;
    new.sigla:=resolved_sigla;
    return new;
  end if;

  if exists (
    select 1 from public.operational_units u
    where u.active=true
      and app_private.normalize_scope_text(u.sigla)=app_private.normalize_scope_text(new.sigla)
      and app_private.normalize_scope_text(u.base_key)=app_private.normalize_scope_text(new.base_key)
  ) then
    return new;
  end if;

  if coalesce(new.base_key,'')<>'' then
    select count(*),min(u.base_key),min(u.sigla) into match_count,resolved_base,resolved_sigla
    from public.operational_units u
    where u.active=true and app_private.normalize_scope_text(u.base_key)=app_private.normalize_scope_text(new.base_key);
    if match_count=1 then
      new.base_key:=resolved_base;
      new.sigla:=resolved_sigla;
      return new;
    end if;
  end if;

  if coalesce(new.sigla,'')<>'' and (coalesce(new.base_key,'')='' or app_private.normalize_scope_text(new.base_key)=app_private.normalize_scope_text(new.sigla)) then
    select count(*),min(u.base_key),min(u.sigla) into match_count,resolved_base,resolved_sigla
    from public.operational_units u
    where u.active=true and app_private.normalize_scope_text(u.sigla)=app_private.normalize_scope_text(new.sigla);
    if match_count=1 then
      new.base_key:=resolved_base;
      new.sigla:=resolved_sigla;
    end if;
  end if;
  return new;
end
$function$;
