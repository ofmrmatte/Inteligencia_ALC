alter table public.operational_xpts add column if not exists base_name text;

update public.operational_xpts x
set base_name = v.base_name,
    updated_at = now()
from (values
  ('EGO11','MOZARLANDIA'),
  ('EGO17','CHAPADÃO DO SUL'),
  ('EDF10','MINAÇU'),
  ('EMG7','GUAXUPÉ'),
  ('EMG34','ARAXÁ'),
  ('EMR6','CÁCERES'),
  ('EMR14','ARAPUTANGA'),
  ('EMR16','PONTES E LACERDA'),
  ('EMG26','CONCEIÇÃO DO MATO DENTRO'),
  ('EMG37','GUANHÃES'),
  ('EPR7','SANTO ANTONIO DA PLATINA')
) as v(xpt_code,base_name)
where upper(x.xpt_code)=v.xpt_code;

delete from public.operational_units u
where exists (
  select 1 from public.operational_xpts x
  where x.active=true
    and app_private.normalize_scope_text(x.xpt_code)=app_private.normalize_scope_text(u.sigla)
);

with xpt_directory(xpt_code,base_key,base_name) as (values
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
), ensure_bases as (
  insert into public.operational_bases(base_key,base_name,sigla,active,updated_at)
  select x.base_key,x.base_name,x.xpt_code,true,now()
  from xpt_directory x
  where not exists (select 1 from public.operational_bases b where b.base_key=x.base_key)
  on conflict (base_key) do nothing
  returning base_key
), evidence as (
  select p.driver_id,p.sigla,p.base_key,coalesce(p.route_date,p.created_at::date) as activity_date,p.created_at,'prefatura_records'::text as source
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
         case when xd.xpt_code is not null then xd.base_key else u.base_key end as base_key,
         case when xd.xpt_code is not null then xd.xpt_code else u.sigla end as sigla,
         case when xd.xpt_code is not null then 'xpt' else 'svc' end as unit_type,
         r.activity_date,r.source
  from ranked r
  left join xpt_directory xd on app_private.normalize_scope_text(xd.xpt_code)=app_private.normalize_scope_text(r.sigla)
  left join public.operational_units u
    on xd.xpt_code is null
   and u.active=true
   and app_private.normalize_scope_text(u.sigla)=app_private.normalize_scope_text(r.sigla)
   and app_private.normalize_scope_text(u.base_key)=app_private.normalize_scope_text(r.base_key)
  where r.rn=1 and (xd.xpt_code is not null or u.unit_key is not null)
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
