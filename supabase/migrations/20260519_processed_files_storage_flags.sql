alter table public.processed_dashboard_files
add column if not exists storage_path text;

alter table public.processed_dashboard_files
add column if not exists raw_file_deleted boolean not null default false;

create index if not exists idx_processed_dashboard_files_raw_deleted
on public.processed_dashboard_files(module_key, raw_file_deleted);

update public.processed_dashboard_files pdf
set
  storage_path = coalesce(nullif(pdf.storage_path, ''), df.storage_path),
  raw_file_deleted = case
    when coalesce(df.status, '') = 'missing_storage' then true
    when coalesce(pdf.metadata->>'raw_file_deleted', '') = 'true' then true
    else pdf.raw_file_deleted
  end,
  metadata = coalesce(pdf.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'storage_path', coalesce(nullif(pdf.storage_path, ''), df.storage_path, ''),
      'raw_file_deleted', case
        when coalesce(df.status, '') = 'missing_storage' then true
        when coalesce(pdf.metadata->>'raw_file_deleted', '') = 'true' then true
        else pdf.raw_file_deleted
      end
    )
from public.dashboard_files df
where pdf.file_name = df.file_name
  and (pdf.storage_path is null or pdf.storage_path = '' or coalesce(df.status, '') = 'missing_storage');
