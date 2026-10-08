create index if not exists pnr_case_center_cases_due_queue_idx
  on public.pnr_case_center_cases(detail_next_sync_at nulls first, case_date desc, case_id);

drop trigger if exists global_data_revision_trigger on public.pnr_case_center_cases;
drop trigger if exists global_data_revision_case_lifecycle_trigger on public.pnr_case_center_cases;
drop trigger if exists global_data_revision_case_update_trigger on public.pnr_case_center_cases;

create trigger global_data_revision_case_lifecycle_trigger
after insert or delete or truncate on public.pnr_case_center_cases
for each statement execute function app_private.bump_global_data_revision();

create trigger global_data_revision_case_update_trigger
after update of
  shipment_id,
  competence,
  case_date,
  route_id,
  route_code,
  svc_name,
  driver_id,
  driver_name,
  purchase_value,
  currency,
  main_status,
  sub_status,
  reviewed_status,
  case_type,
  route_status,
  priority,
  billing_period,
  claim_id,
  pre_invoice_number,
  base_key,
  sigla,
  case_capture_status,
  detail_sync_status,
  timeline_synced_at,
  latest_batch_id,
  raw_snapshot_jsonb
on public.pnr_case_center_cases
for each statement execute function app_private.bump_global_data_revision();

comment on index public.pnr_case_center_cases_due_queue_idx is
  'Acelera a fila de sincronização de detalhes por vencimento e data do caso.';
