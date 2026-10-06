-- Aggregated overview bootstrap for the Railway-hosted dashboard.
-- Keeps the service-role-only RPC in source control.

CREATE OR REPLACE FUNCTION public.dashboard_overview_v1(p_pairs text[] DEFAULT NULL::text[], p_month text DEFAULT NULL::text, p_fortnight text DEFAULT NULL::text, p_operation text DEFAULT NULL::text, p_driver text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with
active_batches as (
  select id
  from public.import_batches
  where coalesce(analysis_excluded, false) = false
),
pref_raw as (
  select
    p.id,
    p.batch_id,
    p.shipment_id,
    coalesce(p.value, 0)::numeric as amount,
    p.operation,
    p.month,
    p.fortnight,
    p.base_label,
    p.base_name,
    p.base_key,
    p.sigla,
    p.driver_id,
    p.driver_name,
    d.full_name as master_driver_name,
    d.base_key as master_base_key,
    d.sigla as master_sigla,
    coalesce(
      nullif(upper(trim(coalesce(p.sigla, ''))), '') || '|' || nullif(upper(trim(coalesce(p.base_key, ''))), ''),
      nullif(upper(trim(coalesce(d.sigla, ''))), '') || '|' || nullif(upper(trim(coalesce(d.base_key, ''))), '')
    ) as record_pair,
    nullif(upper(trim(coalesce(d.sigla, ''))), '') || '|' || nullif(upper(trim(coalesce(d.base_key, ''))), '') as driver_pair
  from public.prefatura_records p
  join active_batches b on b.id = p.batch_id
  left join public.alc_drivers d on d.driver_code = p.driver_id
  where coalesce(p.shipment_id, '') <> ''
    and (p_month is null or p.month = p_month)
    and (
      p_fortnight is null
      or (p_fortnight = 'Q1' and p.fortnight like '01Q%')
      or (p_fortnight = 'Q2' and p.fortnight like '02Q%')
    )
    and (p_operation is null or p.operation = p_operation)
    and (
      p_driver is null
      or upper(trim(coalesce(p.driver_name, d.full_name, ''))) = upper(trim(p_driver))
    )
),
pref as (
  select *
  from pref_raw
  where p_pairs is null
     or record_pair = any(p_pairs)
     or driver_pair = any(p_pairs)
),
pref_unique as (
  select distinct on (shipment_id)
    shipment_id, amount, operation, month, base_label, base_name, base_key, sigla, driver_id, driver_name,
    master_driver_name, master_base_key, master_sigla, record_pair, driver_pair
  from pref
  order by shipment_id, id desc
),
legacy_pnr_raw as (
  select
    p.id,
    p.batch_id,
    p.shipment_id,
    coalesce(p.purchase_value, 0)::numeric as amount,
    p.month,
    p.fortnight,
    p.case_date,
    p.base_key,
    p.sigla,
    p.driver_id,
    p.driver_name,
    d.full_name as master_driver_name,
    d.base_key as master_base_key,
    d.sigla as master_sigla,
    1 as source_priority,
    p.case_date::timestamptz as source_time,
    coalesce(
      nullif(upper(trim(coalesce(p.sigla, ''))), '') || '|' || nullif(upper(trim(coalesce(p.base_key, ''))), ''),
      nullif(upper(trim(coalesce(d.sigla, ''))), '') || '|' || nullif(upper(trim(coalesce(d.base_key, ''))), '')
    ) as record_pair,
    nullif(upper(trim(coalesce(d.sigla, ''))), '') || '|' || nullif(upper(trim(coalesce(d.base_key, ''))), '') as driver_pair
  from public.pnr_records p
  join active_batches b on b.id = p.batch_id
  left join public.alc_drivers d on d.driver_code = p.driver_id
  where p.source_system <> 'case_center'
    and coalesce(p.shipment_id, '') <> ''
    and (p_operation is null or p_operation = 'PNR')
    and (p_month is null or p.month = p_month)
    and (
      p_fortnight is null
      or (p_fortnight = 'Q1' and p.fortnight like '01Q%')
      or (p_fortnight = 'Q2' and p.fortnight like '02Q%')
    )
    and (
      p_driver is null
      or upper(trim(coalesce(p.driver_name, d.full_name, ''))) = upper(trim(p_driver))
    )
),
case_pnr_raw as (
  select
    c.id,
    c.latest_batch_id as batch_id,
    c.shipment_id,
    coalesce(c.purchase_value, 0)::numeric as amount,
    case
      when c.competence ~ '^[0-9]{6}Q[12]$'
      then substring(c.competence from 1 for 4) || '-' || substring(c.competence from 5 for 2)
      else to_char(c.case_date, 'YYYY-MM')
    end as month,
    c.billing_period as fortnight,
    c.case_date,
    c.base_key,
    c.sigla,
    c.driver_id,
    c.driver_name,
    d.full_name as master_driver_name,
    d.base_key as master_base_key,
    d.sigla as master_sigla,
    2 as source_priority,
    coalesce(c.last_captured_at, c.source_last_seen_at, c.case_date::timestamptz) as source_time,
    coalesce(
      nullif(upper(trim(coalesce(c.sigla, ''))), '') || '|' || nullif(upper(trim(coalesce(c.base_key, ''))), ''),
      nullif(upper(trim(coalesce(d.sigla, ''))), '') || '|' || nullif(upper(trim(coalesce(d.base_key, ''))), '')
    ) as record_pair,
    nullif(upper(trim(coalesce(d.sigla, ''))), '') || '|' || nullif(upper(trim(coalesce(d.base_key, ''))), '') as driver_pair
  from public.pnr_case_center_cases c
  left join public.alc_drivers d on d.driver_code = c.driver_id
  where coalesce(c.shipment_id, '') <> ''
    and (p_operation is null or p_operation = 'PNR')
    and (
      p_month is null
      or (
        case
          when c.competence ~ '^[0-9]{6}Q[12]$'
          then substring(c.competence from 1 for 4) || '-' || substring(c.competence from 5 for 2)
          else to_char(c.case_date, 'YYYY-MM')
        end
      ) = p_month
    )
    and (
      p_fortnight is null
      or (p_fortnight = 'Q1' and c.billing_period like '01Q%')
      or (p_fortnight = 'Q2' and c.billing_period like '02Q%')
    )
    and (
      p_driver is null
      or upper(trim(coalesce(c.driver_name, d.full_name, ''))) = upper(trim(p_driver))
    )
),
pnr_all as (
  select * from legacy_pnr_raw
  union all
  select * from case_pnr_raw
),
pnr_visible as (
  select *
  from pnr_all
  where p_pairs is null
     or record_pair = any(p_pairs)
     or driver_pair = any(p_pairs)
),
pnr_latest as (
  select *
  from (
    select p.*, row_number() over (
      partition by shipment_id
      order by source_priority desc, source_time desc nulls last, id desc
    ) as rn
    from pnr_visible p
  ) ranked
  where rn = 1
),
risk_raw as (
  select
    r.id,
    r.batch_id,
    r.shipment_id,
    coalesce(r.gmv_brl, 0)::numeric as amount,
    r.month,
    r.fortnight,
    r.base_key,
    r.sigla,
    r.driver_id,
    d.full_name as master_driver_name,
    d.base_key as master_base_key,
    d.sigla as master_sigla,
    coalesce(
      nullif(upper(trim(coalesce(r.sigla, ''))), '') || '|' || nullif(upper(trim(coalesce(r.base_key, ''))), ''),
      nullif(upper(trim(coalesce(d.sigla, ''))), '') || '|' || nullif(upper(trim(coalesce(d.base_key, ''))), '')
    ) as record_pair,
    nullif(upper(trim(coalesce(d.sigla, ''))), '') || '|' || nullif(upper(trim(coalesce(d.base_key, ''))), '') as driver_pair
  from public.risk_lm_records r
  join active_batches b on b.id = r.batch_id
  left join public.alc_drivers d on d.driver_code = r.driver_id
  where coalesce(r.shipment_id, '') <> ''
    and (p_month is null or r.month = p_month)
    and (
      p_fortnight is null
      or (p_fortnight = 'Q1' and r.fortnight like '01Q%')
      or (p_fortnight = 'Q2' and r.fortnight like '02Q%')
    )
    and (
      p_driver is null
      or upper(trim(coalesce(d.full_name, r.driver_id, ''))) = upper(trim(p_driver))
    )
),
risk as (
  select *
  from risk_raw
  where p_pairs is null
     or record_pair = any(p_pairs)
     or driver_pair = any(p_pairs)
),
risk_unique as (
  select distinct on (shipment_id)
    shipment_id, amount, month, driver_id, master_driver_name, record_pair, driver_pair
  from risk
  order by shipment_id, id desc
),
visible_driver_ids as (
  select nullif(driver_id, '') as driver_id from pref
  union
  select nullif(driver_id, '') from pnr_visible
  union
  select nullif(driver_id, '') from risk
),
driver_rows as (
  select dr.*
  from public.driver_records dr
  join active_batches b on b.id = dr.batch_id
  left join public.alc_drivers ad on ad.driver_code = dr.driver_id
  where
    (
      p_driver is null
      or upper(trim(coalesce(dr.name, ad.full_name, ''))) = upper(trim(p_driver))
    )
    and (
      p_pairs is null
      or (
        nullif(upper(trim(coalesce(dr.sigla, ''))), '') || '|' || nullif(upper(trim(coalesce(dr.base_key, ''))), '')
      ) = any(p_pairs)
      or (
        nullif(upper(trim(coalesce(ad.sigla, ''))), '') || '|' || nullif(upper(trim(coalesce(ad.base_key, ''))), '')
      ) = any(p_pairs)
      or dr.driver_id in (select driver_id from visible_driver_ids where driver_id is not null)
    )
),
all_ids as (
  select shipment_id from pref_unique
  union
  select shipment_id from pnr_latest
  union
  select shipment_id from risk_unique
),
pref_duplicates as (
  select shipment_id
  from pref
  group by shipment_id
  having count(*) > 1
),
pref_ops as (
  select
    operation,
    count(*)::bigint as packages,
    coalesce(sum(amount), 0)::numeric as value
  from pref_unique
  group by operation
),
months as (
  select month from pref_unique where month is not null and month <> ''
  union
  select month from pnr_latest where month is not null and month <> ''
  union
  select month from risk_unique where month is not null and month <> ''
),
last_months as (
  select month
  from months
  order by month desc
  limit 12
),
movement as (
  select
    m.month,
    coalesce((select sum(p.amount) from pref_unique p where p.month = m.month), 0)::numeric as prefatura,
    coalesce((select sum(p.amount) from pnr_latest p where p.month = m.month), 0)::numeric as pnr,
    coalesce((select sum(r.amount) from risk_unique r where r.month = m.month), 0)::numeric as risco
  from last_months m
  order by m.month
),
pref_base_labeled as (
  select
    p.*,
    coalesce(
      (
        select ou.sigla || ' - ' || ou.base_name
        from public.operational_units ou
        where ou.active = true
          and upper(trim(ou.sigla)) = upper(trim(coalesce(p.sigla, p.master_sigla, '')))
          and upper(trim(ou.base_key)) = upper(trim(coalesce(p.base_key, p.master_base_key, '')))
        limit 1
      ),
      nullif(p.base_label, ''),
      nullif(p.base_name, ''),
      nullif(p.base_key, ''),
      nullif(p.sigla, ''),
      'Sem base'
    ) as base_label_resolved
  from pref_unique p
),
top_bases as (
  select
    base_label_resolved as base,
    count(*)::bigint as packages,
    coalesce(sum(amount), 0)::numeric as value
  from pref_base_labeled
  group by base_label_resolved
  order by value desc
  limit 7
),
visible_batches as (
  select batch_id from pref where batch_id is not null
  union
  select batch_id from pnr_visible where batch_id is not null
  union
  select batch_id from risk where batch_id is not null
),
import_count as (
  select
    case
      when p_pairs is null then (select count(*) from public.import_batches)
      else (select count(*) from visible_batches)
    end::bigint as n
)
select jsonb_build_object(
  'rowCount',
    (select count(*) from pref)
    + (select count(*) from pnr_visible)
    + (select count(*) from risk),
  'importsCount', (select n from import_count),
  'metrics', jsonb_build_object(
    'uniquePackages', (select count(*) from all_ids),
    'prefaturaValue', coalesce((select sum(amount) from pref_unique), 0),
    'riskValue', coalesce((select sum(amount) from risk_unique), 0),
    'deliveryRate', coalesce(
      (
        select case when sum(shipped) > 0 then (sum(delivered)::numeric / sum(shipped)::numeric) * 100 else 0 end
        from driver_rows
      ),
      0
    ),
    'drivers', (select count(distinct driver_id) from driver_rows where coalesce(driver_id, '') <> ''),
    'duplicateCount', (select count(*) from pref_duplicates)
  ),
  'movement', coalesce(
    (select jsonb_agg(jsonb_build_object(
      'month', month,
      'prefatura', prefatura,
      'pnr', pnr,
      'risco', risco
    ) order by month) from movement),
    '[]'::jsonb
  ),
  'operations', jsonb_build_array(
    jsonb_build_object(
      'operation', 'SVC',
      'packages', coalesce((select packages from pref_ops where operation = 'SVC'), 0),
      'value', coalesce((select value from pref_ops where operation = 'SVC'), 0)
    ),
    jsonb_build_object(
      'operation', 'XPT',
      'packages', coalesce((select packages from pref_ops where operation = 'XPT'), 0),
      'value', coalesce((select value from pref_ops where operation = 'XPT'), 0)
    ),
    jsonb_build_object(
      'operation', 'PNR',
      'packages', coalesce((select packages from pref_ops where operation = 'PNR'), 0),
      'value', coalesce((select value from pref_ops where operation = 'PNR'), 0)
    )
  ),
  'topBases', coalesce(
    (select jsonb_agg(jsonb_build_object(
      'base', base,
      'packages', packages,
      'value', value
    ) order by value desc) from top_bases),
    '[]'::jsonb
  )
);
$function$;

revoke all on function public.dashboard_overview_v1(text[], text, text, text, text) from public, anon, authenticated;
grant execute on function public.dashboard_overview_v1(text[], text, text, text, text) to service_role;


alter function public.dashboard_overview_v1(text[], text, text, text, text)
set statement_timeout = '30s';
