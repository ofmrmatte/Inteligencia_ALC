create or replace function public.alc_norm_unit_key(value text)
returns text
language sql
immutable
parallel safe
as $$
  select trim(both ' ' from regexp_replace(
    upper(translate(coalesce(value, ''),
      'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑáàãâäéèêëíìîïóòõôöúùûüçñ',
      'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn')),
    '[^A-Z0-9]+', ' ', 'g'));
$$;

create or replace function public.resolve_alc_operational_unit(raw_base text, raw_sigla text)
returns table(base_key text, base_name text, sigla text, xpt_code text)
language sql
stable
as $$
  with input as (
    select public.alc_norm_unit_key(raw_base) as b,
           public.alc_norm_unit_key(raw_sigla) as s
  ), ranked as (
    select u.base_key, u.base_name, u.sigla, u.xpt_code,
      case
        when i.b <> '' and public.alc_norm_unit_key(u.base_key) = i.b
             and i.s <> '' and public.alc_norm_unit_key(u.sigla) = i.s then 0
        when i.b <> '' and public.alc_norm_unit_key(u.base_key) = i.b
             and i.s <> '' and public.alc_norm_unit_key(coalesce(u.xpt_code,'')) = i.s then 1
        when i.b <> '' and public.alc_norm_unit_key(u.base_key) = i.b
             and (select count(*) from public.operational_units u2 where u2.active = true and public.alc_norm_unit_key(u2.base_key) = i.b) = 1 then 2
        when i.b <> '' and public.alc_norm_unit_key(u.sigla) = i.b
             and (select count(*) from public.operational_units u2 where u2.active = true and public.alc_norm_unit_key(u2.sigla) = i.b) = 1 then 3
        when i.b like 'BRX%' and (
             public.alc_norm_unit_key(u.sigla) = substring(i.b from 4)
             or public.alc_norm_unit_key(u.sigla) = 'S' || substring(i.b from 4)
           ) then 4
        when i.s <> '' and public.alc_norm_unit_key(u.sigla) = i.s
             and (select count(*) from public.operational_units u2 where u2.active = true and public.alc_norm_unit_key(u2.sigla) = i.s) = 1 then 5
        else 99
      end as score,
      u.updated_at
    from public.operational_units u
    cross join input i
    where u.active = true
      and (
        (i.b <> '' and public.alc_norm_unit_key(u.base_key) = i.b)
        or (i.b <> '' and public.alc_norm_unit_key(u.sigla) = i.b)
        or (i.b like 'BRX%' and (
             public.alc_norm_unit_key(u.sigla) = substring(i.b from 4)
             or public.alc_norm_unit_key(u.sigla) = 'S' || substring(i.b from 4)
           ))
        or (i.s <> '' and public.alc_norm_unit_key(u.sigla) = i.s)
      )
  )
  select r.base_key, r.base_name, r.sigla, r.xpt_code
  from ranked r
  where r.score < 99
  order by r.score, r.updated_at desc nulls last
  limit 1;
$$;

create or replace view public.discount_case_current as
select
  c.id,
  c.shipment_id,
  c.direction,
  c.note,
  c.manual_amount,
  c.manual_route_id,
  c.manual_date,
  c.manual_driver_id,
  c.manual_driver_name,
  c.manual_base_key,
  c.manual_base_name,
  c.manual_sigla,
  c.source_kind,
  c.source_period,
  c.discount_month,
  c.source_batch_id,
  c.source_file,
  c.source_sheet,
  c.source_row,
  c.source_payload,
  c.last_operational_snapshot,
  c.last_operational_synced_at,
  c.created_by,
  c.updated_by,
  c.created_at,
  c.updated_at,
  coalesce(pf.driver_id, pn.driver_id, c.manual_driver_id) as driver_id,
  coalesce(pf.driver_name, driver.full_name, c.manual_driver_name, nullif(c.source_payload->>'MOTORISTA','')) as driver_name,
  canonical.base_key,
  canonical.base_name,
  canonical.sigla,
  canonical.xpt_code,
  coalesce(pf.route_id, pn.route_id, c.manual_route_id, nullif(c.source_payload->>'ROTA','')) as route_id,
  coalesce(pf.route_date, pn.case_date, c.manual_date) as event_date,
  coalesce(c.allocation_amount, pf.value, pn.purchase_value, c.manual_amount, 0::numeric) as amount,
  case
    when c.allocation_amount is not null then 'Direcionamento manual'::text
    when pf.value is not null then 'Pré-fatura'::text
    when pn.purchase_value is not null then 'PNR'::text
    when c.manual_amount is not null then 'Manual/histórico'::text
    else 'Sem valor'::text
  end as amount_source,
  pn.status as pnr_status,
  pf.operation as prefatura_operation,
  coalesce(pf.month, pn.month,
    case when c.manual_date is not null then to_char(c.manual_date::timestamp with time zone, 'YYYY-MM') else null end) as operational_month,
  coalesce(pf.fortnight, pn.fortnight) as operational_fortnight,
  coalesce(c.discount_month,
    case when c.source_period ~ '^0?[12]Q[0-9]{2}[0-9]{4}$' then
      substr(c.source_period, length(c.source_period) - 3, 4) || '-' || substr(c.source_period, position('Q' in c.source_period) + 1, 2)
      else null end,
    pf.month, pn.month,
    case when c.manual_date is not null then to_char(c.manual_date::timestamp with time zone, 'YYYY-MM') else null end) as month,
  coalesce(c.source_period, pf.fortnight, pn.fortnight) as fortnight,
  pf.source_file as prefatura_source_file,
  pn.source_file as pnr_source_file,
  pf.id is not null as matched_prefatura,
  pn.id is not null as matched_pnr,
  pf.id is null and pn.id is null as awaiting_match,
  case
    when pf.id is not null and pn.id is not null then 'Pré-fatura + PNR'::text
    when pf.id is not null then 'Pré-fatura'::text
    when pn.id is not null then 'PNR'::text
    when c.source_kind = 'historical' then 'Histórico'::text
    when c.source_kind = 'spreadsheet' then 'Planilha Gestão de Descontos'::text
    else 'Manual'::text
  end as origin,
  greatest(coalesce(pf.source_updated_at, '-infinity'::timestamp with time zone), coalesce(pn.source_updated_at, '-infinity'::timestamp with time zone), c.updated_at) as source_updated_at,
  c.allocation_no,
  c.allocation_amount,
  c.allocation_target_id,
  c.allocation_target_name,
  c.deleted_at,
  c.deleted_by
from public.discount_cases c
left join lateral (
  select p.id,p.driver_id,p.driver_name,p.base_key,p.base_name,p.base_label,p.sigla,p.route_id,p.route_date,p.value,p.operation,p.month,p.fortnight,p.source_file,
         coalesce(b.finished_at,b.started_at,p.created_at) as source_updated_at
  from public.prefatura_records p
  join public.import_batches b on b.id=p.batch_id
  where p.shipment_id=c.shipment_id and coalesce(b.analysis_excluded,false)=false
  order by coalesce(b.finished_at,b.started_at,p.created_at) desc,p.created_at desc
  limit 1
) pf on true
left join lateral (
  select p.id,p.driver_id,p.base_key,p.sigla,p.route_id,p.case_date,p.purchase_value,p.status,p.month,p.fortnight,p.source_file,
         coalesce(b.finished_at,b.started_at,p.created_at) as source_updated_at
  from public.pnr_records p
  join public.import_batches b on b.id=p.batch_id
  where p.shipment_id=c.shipment_id and coalesce(b.analysis_excluded,false)=false
  order by coalesce(b.finished_at,b.started_at,p.created_at) desc,p.created_at desc
  limit 1
) pn on true
left join lateral (
  select d.full_name,d.base_key,d.sigla
  from public.alc_drivers d
  where (
    coalesce(pf.driver_id,pn.driver_id,c.manual_driver_id) is not null
    and d.driver_code=coalesce(pf.driver_id,pn.driver_id,c.manual_driver_id)
  ) or (
    coalesce(pf.driver_id,pn.driver_id,c.manual_driver_id) is null
    and public.alc_norm_unit_key(d.full_name)=public.alc_norm_unit_key(coalesce(pf.driver_name,c.manual_driver_name,c.source_payload->>'MOTORISTA'))
  )
  order by d.last_operational_seen_at desc nulls last,d.updated_at desc nulls last,d.created_at desc
  limit 1
) driver on true
left join lateral (
  select r.base_key,r.base_name,r.sigla,r.xpt_code
  from (
    select ru.base_key,ru.base_name,ru.sigla,ru.xpt_code,0 as priority,src.source_updated_at
    from (
      select p.base_key,p.sigla,coalesce(b.finished_at,b.started_at,p.created_at) as source_updated_at
      from public.prefatura_records p join public.import_batches b on b.id=p.batch_id
      where p.shipment_id=c.shipment_id and coalesce(b.analysis_excluded,false)=false
      union all
      select p.base_key,p.sigla,coalesce(b.finished_at,b.started_at,p.created_at)
      from public.pnr_records p join public.import_batches b on b.id=p.batch_id
      where p.shipment_id=c.shipment_id and coalesce(b.analysis_excluded,false)=false
    ) src
    cross join lateral public.resolve_alc_operational_unit(src.base_key,src.sigla) ru

    union all

    select ru.base_key,ru.base_name,ru.sigla,ru.xpt_code,1 as priority,src.source_updated_at
    from (
      select p.base_key,p.sigla,coalesce(b.finished_at,b.started_at,p.created_at) as source_updated_at
      from public.prefatura_records p join public.import_batches b on b.id=p.batch_id
      where p.route_id=coalesce(pf.route_id,pn.route_id,c.manual_route_id,nullif(c.source_payload->>'ROTA','')) and coalesce(b.analysis_excluded,false)=false
      union all
      select p.base_key,p.sigla,coalesce(b.finished_at,b.started_at,p.created_at)
      from public.pnr_records p join public.import_batches b on b.id=p.batch_id
      where p.route_id=coalesce(pf.route_id,pn.route_id,c.manual_route_id,nullif(c.source_payload->>'ROTA','')) and coalesce(b.analysis_excluded,false)=false
    ) src
    cross join lateral public.resolve_alc_operational_unit(src.base_key,src.sigla) ru

    union all

    select ru.base_key,ru.base_name,ru.sigla,ru.xpt_code,2 as priority,c.updated_at as source_updated_at
    from public.resolve_alc_operational_unit(driver.base_key,driver.sigla) ru

    union all

    select ru.base_key,ru.base_name,ru.sigla,ru.xpt_code,3 as priority,c.updated_at as source_updated_at
    from public.resolve_alc_operational_unit(
      coalesce(c.manual_base_key,c.manual_base_name,c.source_payload->>'BASE'),
      coalesce(c.manual_sigla,c.source_payload->>'SIGLA')
    ) ru
  ) r
  order by r.priority,r.source_updated_at desc nulls last
  limit 1
) canonical on true
where c.deleted_at is null;
