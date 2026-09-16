drop view if exists public.discount_case_current;

alter table public.discount_cases
  alter column last_operational_snapshot type json
  using last_operational_snapshot::json;

create or replace view public.discount_case_current
with (security_invoker = true)
as
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
  coalesce(pf.driver_name, driver.full_name, c.manual_driver_name) as driver_name,
  coalesce(pf.base_key, pn.base_key, c.manual_base_key) as base_key,
  coalesce(pf.base_name, unit.base_name, c.manual_base_name, pf.base_label) as base_name,
  coalesce(pf.sigla, pn.sigla, c.manual_sigla) as sigla,
  unit.xpt_code,
  coalesce(pf.route_id, pn.route_id, c.manual_route_id) as route_id,
  coalesce(pf.route_date, pn.case_date, c.manual_date) as event_date,
  coalesce(pf.value, pn.purchase_value, c.manual_amount, 0::numeric) as amount,
  case
    when pf.value is not null then 'Pré-fatura'
    when pn.purchase_value is not null then 'PNR'
    when c.manual_amount is not null then 'Manual/histórico'
    else 'Sem valor'
  end as amount_source,
  pn.status as pnr_status,
  pf.operation as prefatura_operation,
  coalesce(pf.month, pn.month, case when c.manual_date is not null then to_char(c.manual_date, 'YYYY-MM') else null end) as month,
  coalesce(pf.fortnight, pn.fortnight, c.source_period) as fortnight,
  pf.source_file as prefatura_source_file,
  pn.source_file as pnr_source_file,
  (pf.id is not null) as matched_prefatura,
  (pn.id is not null) as matched_pnr,
  (pf.id is null and pn.id is null) as awaiting_match,
  case
    when pf.id is not null and pn.id is not null then 'Pré-fatura + PNR'
    when pf.id is not null then 'Pré-fatura'
    when pn.id is not null then 'PNR'
    when c.source_kind = 'historical' then 'Histórico'
    else 'Manual'
  end as origin,
  greatest(
    coalesce(pf.source_updated_at, '-infinity'::timestamptz),
    coalesce(pn.source_updated_at, '-infinity'::timestamptz),
    c.updated_at
  ) as source_updated_at
from public.discount_cases c
left join lateral (
  select
    p.id,
    p.driver_id,
    p.driver_name,
    p.base_key,
    p.base_name,
    p.base_label,
    p.sigla,
    p.route_id,
    p.route_date,
    p.value,
    p.operation,
    p.month,
    p.fortnight,
    p.source_file,
    coalesce(b.finished_at, b.started_at, p.created_at) as source_updated_at
  from public.prefatura_records p
  join public.import_batches b on b.id = p.batch_id
  where p.shipment_id = c.shipment_id
    and coalesce(b.analysis_excluded, false) = false
  order by coalesce(b.finished_at, b.started_at, p.created_at) desc, p.created_at desc
  limit 1
) pf on true
left join lateral (
  select
    p.id,
    p.driver_id,
    p.base_key,
    p.sigla,
    p.route_id,
    p.case_date,
    p.purchase_value,
    p.status,
    p.month,
    p.fortnight,
    p.source_file,
    coalesce(b.finished_at, b.started_at, p.created_at) as source_updated_at
  from public.pnr_records p
  join public.import_batches b on b.id = p.batch_id
  where p.shipment_id = c.shipment_id
    and coalesce(b.analysis_excluded, false) = false
  order by coalesce(b.finished_at, b.started_at, p.created_at) desc, p.created_at desc
  limit 1
) pn on true
left join lateral (
  select d.full_name
  from public.alc_drivers d
  where d.driver_code = coalesce(pf.driver_id, pn.driver_id, c.manual_driver_id)
  order by d.updated_at desc nulls last, d.created_at desc
  limit 1
) driver on true
left join lateral (
  select u.base_name, u.xpt_code
  from public.operational_units u
  where u.active = true
    and (
      (
        coalesce(pf.base_key, pn.base_key, c.manual_base_key) is not null
        and upper(trim(u.base_key)) = upper(trim(coalesce(pf.base_key, pn.base_key, c.manual_base_key)))
      )
      or (
        coalesce(pf.base_key, pn.base_key, c.manual_base_key) is null
        and coalesce(pf.sigla, pn.sigla, c.manual_sigla) is not null
        and upper(trim(u.sigla)) = upper(trim(coalesce(pf.sigla, pn.sigla, c.manual_sigla)))
        and (
          select count(*)
          from public.operational_units u2
          where u2.active = true
            and upper(trim(u2.sigla)) = upper(trim(coalesce(pf.sigla, pn.sigla, c.manual_sigla)))
        ) = 1
      )
    )
  order by
    case
      when coalesce(pf.base_key, pn.base_key, c.manual_base_key) is not null
        and upper(trim(u.base_key)) = upper(trim(coalesce(pf.base_key, pn.base_key, c.manual_base_key))) then 0
      else 1
    end,
    u.updated_at desc
  limit 1
) unit on true;

grant select on public.discount_case_current to authenticated;
