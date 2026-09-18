create index if not exists pnr_case_center_cases_latest_batch_idx
  on public.pnr_case_center_cases(latest_batch_id)
  where latest_batch_id is not null;

create index if not exists pnr_case_events_cached_by_idx
  on public.pnr_case_events(cached_by)
  where cached_by is not null;
