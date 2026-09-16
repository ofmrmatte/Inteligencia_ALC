alter table public.dashboard_files
  add column if not exists period_label text,
  add column if not exists period_type text;

update public.dashboard_files
set
  period_label = coalesce(period_label, metadata->>'period_label'),
  period_type = coalesce(period_type, metadata->>'period_type')
where period_label is null or period_type is null;
