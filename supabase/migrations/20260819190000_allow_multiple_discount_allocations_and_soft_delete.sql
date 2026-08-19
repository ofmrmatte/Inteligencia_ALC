alter table public.discount_cases
  add column if not exists allocation_no integer,
  add column if not exists allocation_amount numeric,
  add column if not exists allocation_target_id text,
  add column if not exists allocation_target_name text,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

update public.discount_cases
set allocation_no = 1
where allocation_no is null;

alter table public.discount_cases
  alter column allocation_no set default 1,
  alter column allocation_no set not null;

alter table public.discount_cases drop constraint if exists discount_cases_shipment_id_unique;
alter table public.discount_cases drop constraint if exists discount_cases_allocation_no_check;
alter table public.discount_cases add constraint discount_cases_allocation_no_check check (allocation_no > 0);
alter table public.discount_cases drop constraint if exists discount_cases_allocation_amount_check;
alter table public.discount_cases add constraint discount_cases_allocation_amount_check check (allocation_amount is null or allocation_amount >= 0);
alter table public.discount_cases drop constraint if exists discount_cases_shipment_allocation_unique;
alter table public.discount_cases add constraint discount_cases_shipment_allocation_unique unique (shipment_id, allocation_no);

create index if not exists idx_discount_cases_shipment_active on public.discount_cases(shipment_id) where deleted_at is null;
create index if not exists idx_discount_cases_deleted_at on public.discount_cases(deleted_at) where deleted_at is not null;

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
  coalesce(pf.driver_name, driver.full_name, c.manual_driver_name) as driver_name,
  coalesce(pf.base_key, pn.base_key, c.manual_base_key) as base_key,
  coalesce(pf.base_name, unit.base_name, c.manual_base_name, pf.base_label) as base_name,
  coalesce(pf.sigla, pn.sigla, c.manual_sigla) as sigla,
  unit.xpt_code,
  coalesce(pf.route_id, pn.route_id, c.manual_route_id) as route_id,
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
    case when c.manual_date is not null then to_char(c.manual_date::timestamptz, 'YYYY-MM') else null::text end
  ) as operational_month,
  coalesce(pf.fortnight, pn.fortnight) as operational_fortnight,
  coalesce(c.discount_month,
    case
      when c.source_period ~ '^0?[12]Q[0-9]{2}[0-9]{4}$'::text
        then substr(c.source_period, length(c.source_period) - 3, 4) || '-' || substr(c.source_period, position('Q' in c.source_period) + 1, 2)
      else null::text
    end,
    pf.month,
    pn.month,
    case when c.manual_date is not null then to_char(c.manual_date::timestamptz, 'YYYY-MM') else null::text end
  ) as month,
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
    when c.source_kind = 'historical'::text then 'Histórico'::text
    when c.source_kind = 'spreadsheet'::text then 'Planilha Gestão de Descontos'::text
    else 'Manual'::text
  end as origin,
  greatest(coalesce(pf.source_updated_at, '-infinity'::timestamptz), coalesce(pn.source_updated_at, '-infinity'::timestamptz), c.updated_at) as source_updated_at,
  c.allocation_no,
  c.allocation_amount,
  c.allocation_target_id,
  c.allocation_target_name,
  c.deleted_at,
  c.deleted_by
from public.discount_cases c
left join lateral (
  select p.id, p.driver_id, p.driver_name, p.base_key, p.base_name, p.base_label, p.sigla, p.route_id, p.route_date, p.value, p.operation, p.month, p.fortnight, p.source_file,
         coalesce(b.finished_at, b.started_at, p.created_at) as source_updated_at
  from public.prefatura_records p
  join public.import_batches b on b.id = p.batch_id
  where p.shipment_id = c.shipment_id and coalesce(b.analysis_excluded, false) = false
  order by coalesce(b.finished_at, b.started_at, p.created_at) desc, p.created_at desc
  limit 1
) pf on true
left join lateral (
  select p.id, p.driver_id, p.base_key, p.sigla, p.route_id, p.case_date, p.purchase_value, p.status, p.month, p.fortnight, p.source_file,
         coalesce(b.finished_at, b.started_at, p.created_at) as source_updated_at
  from public.pnr_records p
  join public.import_batches b on b.id = p.batch_id
  where p.shipment_id = c.shipment_id and coalesce(b.analysis_excluded, false) = false
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
  where u.active = true and (
    (coalesce(pf.base_key, pn.base_key, c.manual_base_key) is not null and upper(trim(u.base_key)) = upper(trim(coalesce(pf.base_key, pn.base_key, c.manual_base_key))))
    or
    (coalesce(pf.base_key, pn.base_key, c.manual_base_key) is null and coalesce(pf.sigla, pn.sigla, c.manual_sigla) is not null and upper(trim(u.sigla)) = upper(trim(coalesce(pf.sigla, pn.sigla, c.manual_sigla))) and
      (select count(*) from public.operational_units u2 where u2.active = true and upper(trim(u2.sigla)) = upper(trim(coalesce(pf.sigla, pn.sigla, c.manual_sigla)))) = 1)
  )
  order by case when coalesce(pf.base_key, pn.base_key, c.manual_base_key) is not null and upper(trim(u.base_key)) = upper(trim(coalesce(pf.base_key, pn.base_key, c.manual_base_key))) then 0 else 1 end,
           u.updated_at desc
  limit 1
) unit on true
where c.deleted_at is null;
