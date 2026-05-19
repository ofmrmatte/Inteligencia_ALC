alter table public.processed_dashboard_files
add column if not exists file_role text;

update public.processed_dashboard_files
set file_role = coalesce(
  nullif(metadata->>'file_role', ''),
  nullif(metadata->>'pnr_file_role', ''),
  case
    when module_key = 'gestao-desvios-pnr'
      and lower(regexp_replace(regexp_replace(file_name, '\.(xlsx|xls|xltx|csv)$', '', 'i'), '[^a-zA-Z0-9]+', ' ', 'g')) = 'pnr mestre 2024 2025'
      then 'master'
    when module_key = 'gestao-desvios-pnr' then 'incremental'
    else null
  end
)
where file_role is null;

create index if not exists idx_processed_dashboard_files_module_hash_role
on public.processed_dashboard_files(module_key, file_hash, file_role);
