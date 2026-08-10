alter table public.desvios_pnr_records
add column if not exists manual_status_override boolean not null default false,
add column if not exists status_previous text,
add column if not exists status_current text,
add column if not exists status_updated_at timestamptz,
add column if not exists status_updated_by text;

create index if not exists idx_desvios_pnr_records_manual_status_override
on public.desvios_pnr_records(manual_status_override);

create index if not exists idx_desvios_pnr_records_status_current
on public.desvios_pnr_records(status_current);

analyze public.desvios_pnr_records;
