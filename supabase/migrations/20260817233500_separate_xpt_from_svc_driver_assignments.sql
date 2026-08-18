alter table public.operational_xpts add column if not exists base_name text;
alter table public.operational_xpts add column if not exists base_key text;

update public.operational_xpts x
set base_key=v.base_key,
    base_name=v.base_name,
    updated_at=now()
from (values
  ('EGO11','MOZARLANDIA','MOZARLANDIA'),
  ('EGO17','CHAPADAO DO SUL','CHAPADÃO DO SUL'),
  ('EDF10','MINACU','MINAÇU'),
  ('EMG7','GUAXUPE','GUAXUPÉ'),
  ('EMG34','ARAXA','ARAXÁ'),
  ('EMR6','CACERES','CÁCERES'),
  ('EMR14','ARAPUTANGA','ARAPUTANGA'),
  ('EMR16','PONTES E LACERDA','PONTES E LACERDA'),
  ('EMG26','CONCEICAO DO MATO DENTRO','CONCEIÇÃO DO MATO DENTRO'),
  ('EMG37','GUANHAES','GUANHÃES'),
  ('EPR7','SANTO ANTONIO DA PLATINA','SANTO ANTONIO DA PLATINA')
) as v(xpt_code,base_key,base_name)
where app_private.normalize_scope_text(x.xpt_code)=v.xpt_code;

insert into public.operational_bases(base_key,base_name,sigla,active,updated_at)
select x.base_key,x.base_name,x.xpt_code,true,now()
from public.operational_xpts x
where x.active=true and coalesce(x.base_key,'')<>''
  and not exists (select 1 from public.operational_bases b where b.base_key=x.base_key)
on conflict (base_key) do nothing;

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
begin
  select x.base_key,x.xpt_code
    into resolved_base,resolved_sigla
  from public.operational_xpts x
  where x.active=true
    and app_private.normalize_scope_text(x.xpt_code)=app_private.normalize_scope_text(new.sigla)
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
    select count(*),min(u.base_key),min(u.sigla)
      into match_count,resolved_base,resolved_sigla
    from public.operational_units u
    where u.active=true
      and app_private.normalize_scope_text(u.base_key)=app_private.normalize_scope_text(new.base_key);
    if match_count=1 then
      new.base_key:=resolved_base;
      new.sigla:=resolved_sigla;
      return new;
    end if;
  end if;

  if coalesce(new.sigla,'')<>''
     and (coalesce(new.base_key,'')=''
          or app_private.normalize_scope_text(new.base_key)=app_private.normalize_scope_text(new.sigla)) then
    select count(*),min(u.base_key),min(u.sigla)
      into match_count,resolved_base,resolved_sigla
    from public.operational_units u
    where u.active=true
      and app_private.normalize_scope_text(u.sigla)=app_private.normalize_scope_text(new.sigla);
    if match_count=1 then
      new.base_key:=resolved_base;
      new.sigla:=resolved_sigla;
    end if;
  end if;

  return new;
end
$function$;

delete from public.operational_units u
where exists (
  select 1 from public.operational_xpts x
  where x.active=true
    and app_private.normalize_scope_text(x.xpt_code)=app_private.normalize_scope_text(u.sigla)
);

with evidence as (
  select p.driver_id,p.sigla,p.base_key,coalesce(p.route_date,p.created_at::date) activity_date,p.created_at,'prefatura_records'::text source
  from public.prefatura_records p where coalesce(p.driver_id,'')<>''
  union all
  select p.driver_id,p.sigla,p.base_key,coalesce(p.case_date,p.created_at::date),p.created_at,'pnr_records'::text
  from public.pnr_records p where coalesce(p.driver_id,'')<>''
  union all
  select r.driver_id,r.sigla,r.base_key,coalesce(r.failure_date,r.created_at::date),r.created_at,'risk_lm_records'::text
  from public.risk_lm_records r where coalesce(r.driver_id,'')<>''
), ranked as (
  select e.*,row_number() over(partition by e.driver_id order by e.activity_date desc nulls last,e.created_at desc) rn
  from evidence e
), resolved as (
  select r.driver_id,
         coalesce(x.base_key,u.base_key) base_key,
         coalesce(x.xpt_code,u.sigla) sigla,
         case when x.xpt_code is not null then 'xpt' else 'svc' end unit_type,
         r.activity_date,r.source
  from ranked r
  left join public.operational_xpts x
    on x.active=true
   and app_private.normalize_scope_text(x.xpt_code)=app_private.normalize_scope_text(r.sigla)
  left join public.operational_units u
    on x.xpt_code is null
   and u.active=true
   and app_private.normalize_scope_text(u.sigla)=app_private.normalize_scope_text(r.sigla)
   and app_private.normalize_scope_text(u.base_key)=app_private.normalize_scope_text(r.base_key)
  where r.rn=1 and (x.xpt_code is not null or u.unit_key is not null)
)
update public.alc_drivers d
set base_key=r.base_key,
    sigla=r.sigla,
    source_payload=coalesce(d.source_payload,'{}'::jsonb) || jsonb_build_object(
      'operational_unit_type',r.unit_type,
      'operational_assignment_source',r.source,
      'operational_assignment_date',r.activity_date
    ),
    updated_at=now()
from resolved r
where d.driver_code=r.driver_id;
