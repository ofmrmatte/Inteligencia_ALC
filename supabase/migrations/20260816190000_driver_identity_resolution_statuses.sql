alter table public.prefatura_records
  drop constraint if exists prefatura_records_quality_status_check;

update public.prefatura_records
set quality_status = case quality_status
  when 'COMPLETE' then case when coalesce(driver_id, '') <> '' then 'resolved' else 'needs_review' end
  when 'ENRICHED' then case when coalesce(driver_id, '') <> '' then 'resolved' else 'needs_review' end
  when 'UPDATED' then case when coalesce(driver_id, '') <> '' then 'resolved' else 'partial' end
  when 'PENDING' then 'needs_review'
  else coalesce(nullif(quality_status, ''), 'needs_review')
end
where quality_status in ('COMPLETE', 'ENRICHED', 'UPDATED', 'PENDING') or coalesce(quality_status, '') = '';

alter table public.prefatura_records
  alter column quality_status set default 'needs_review';

alter table public.prefatura_records
  add constraint prefatura_records_quality_status_check
  check (quality_status in ('resolved', 'partial', 'needs_review', 'conflict'));

create index if not exists prefatura_records_route_idx on public.prefatura_records(route_id);
create index if not exists pnr_records_route_driver_idx on public.pnr_records(route_id, driver_id);
create index if not exists pnr_records_shipment_driver_idx on public.pnr_records(shipment_id, driver_id);
create index if not exists risk_lm_records_route_driver_idx on public.risk_lm_records(route_id, driver_id);
create index if not exists risk_lm_records_shipment_driver_idx on public.risk_lm_records(shipment_id, driver_id);
