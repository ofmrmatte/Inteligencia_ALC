alter table public.desvios_pnr_records
add column if not exists source_file_type text,
add column if not exists source_period text,
add column if not exists source_quinzena text,
add column if not exists upload_batch_id uuid,
add column if not exists first_seen_at timestamp with time zone,
add column if not exists last_seen_at timestamp with time zone,
add column if not exists status_previous text,
add column if not exists status_current text,
add column if not exists status_updated_at timestamp with time zone;

update public.desvios_pnr_records r
set
  source_file_type = coalesce(
    nullif(r.source_file_type, ''),
    case
      when coalesce(df.metadata->>'file_role', df.metadata->>'pnr_file_role', '') = 'master' then 'master'
      else 'quinzena'
    end
  ),
  source_period = coalesce(nullif(r.source_period, ''), nullif(r.source_periodo, ''), nullif(r.periodo_faturamento, '')),
  source_quinzena = coalesce(nullif(r.source_quinzena, ''), nullif(r.quinzena_ref, ''), nullif(r.quinzena, '')),
  upload_batch_id = coalesce(r.upload_batch_id, r.file_id),
  first_seen_at = coalesce(r.first_seen_at, r.created_at, now()),
  last_seen_at = coalesce(r.last_seen_at, r.created_at, now()),
  status_current = coalesce(nullif(r.status_current, ''), nullif(r.status_normalizado, ''), nullif(r.status_original, '')),
  status_updated_at = coalesce(r.status_updated_at, r.created_at, now())
from public.dashboard_files df
where r.file_id = df.id;

create index if not exists idx_desvios_pnr_records_dedupe_period
on public.desvios_pnr_records(dedupe_key, source_period, source_quinzena);

create index if not exists idx_desvios_pnr_records_seen_at
on public.desvios_pnr_records(last_seen_at);

create index if not exists idx_desvios_pnr_records_upload_batch
on public.desvios_pnr_records(upload_batch_id);

analyze public.desvios_pnr_records;
