create index if not exists driver_records_batch_id_idx
  on public.driver_records(batch_id);

create index if not exists imported_files_batch_id_idx
  on public.imported_files(batch_id);

create index if not exists quality_issues_batch_id_idx
  on public.quality_issues(batch_id);

create index if not exists import_batches_duplicate_of_idx
  on public.import_batches(duplicate_of)
  where duplicate_of is not null;
