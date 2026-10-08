alter table public.import_batches
  add column if not exists fortnights text[] not null default '{}',
  add column if not exists months text[] not null default '{}',
  add column if not exists analysis_excluded boolean not null default false,
  add column if not exists duplicate_of uuid references public.import_batches(id) on delete set null;

create index if not exists import_batches_fortnights_gin_idx on public.import_batches using gin(fortnights);
create index if not exists import_batches_months_gin_idx on public.import_batches using gin(months);
create index if not exists import_batches_analysis_excluded_idx on public.import_batches(analysis_excluded);
