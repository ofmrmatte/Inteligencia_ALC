-- Keep the processed PNR table as the source of truth, but remove payloads that
-- duplicate normalized columns and are not used by the dashboard RPCs.
update public.desvios_pnr_records
set
  raw_data = '{}'::jsonb,
  produtos = null
where raw_data <> '{}'::jsonb
   or produtos is not null;

analyze public.desvios_pnr_records;
analyze public.desvios_pnr_metrics_summary;
