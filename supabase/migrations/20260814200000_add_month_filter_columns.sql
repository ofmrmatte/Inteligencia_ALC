alter table public.import_batches
  add column if not exists month text;

alter table public.prefatura_records
  add column if not exists month text;

alter table public.pnr_records
  add column if not exists month text;

alter table public.risk_lm_records
  add column if not exists month text;

create index if not exists import_batches_month_idx on public.import_batches(month);
create index if not exists prefatura_records_month_idx on public.prefatura_records(month);
create index if not exists pnr_records_month_idx on public.pnr_records(month);
create index if not exists risk_lm_records_month_idx on public.risk_lm_records(month);
