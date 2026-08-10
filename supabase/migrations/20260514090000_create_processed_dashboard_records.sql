create table if not exists public.pre_fatura_records (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.dashboard_files(id) on delete cascade,
  competencia text,
  quinzena text,
  tipo text,
  base text,
  codigo_base text,
  driver text,
  driver_normalizado text,
  placa text,
  data date,
  id_envio text,
  rota text,
  valor numeric(14,2) default 0,
  aba_origem text,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default now()
);

create table if not exists public.gestao_pacotes_records (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.dashboard_files(id) on delete cascade,
  competencia text,
  quinzena text,
  tipo text,
  desconto text,
  base text,
  codigo_base text,
  driver text,
  driver_normalizado text,
  data date,
  id_envio text,
  rota text,
  valor numeric(14,2) default 0,
  decisao_adm text,
  observacao text,
  aba_origem text,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default now()
);

create table if not exists public.dashboard_metrics_cache (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  file_type text not null,
  competencia text,
  quinzena text,
  tipo text,
  metric_key text not null,
  metric_value numeric(18,4) default 0,
  updated_at timestamp with time zone default now(),
  unique (scope, file_type, competencia, quinzena, tipo, metric_key)
);

create index if not exists idx_pre_fatura_records_file_id on public.pre_fatura_records(file_id);
create index if not exists idx_pre_fatura_records_competencia on public.pre_fatura_records(competencia);
create index if not exists idx_pre_fatura_records_quinzena on public.pre_fatura_records(quinzena);
create index if not exists idx_pre_fatura_records_tipo on public.pre_fatura_records(tipo);
create index if not exists idx_pre_fatura_records_base on public.pre_fatura_records(base);
create index if not exists idx_pre_fatura_records_driver_norm on public.pre_fatura_records(driver_normalizado);
create index if not exists idx_pre_fatura_records_id_envio on public.pre_fatura_records(id_envio);
create index if not exists idx_pre_fatura_records_scope on public.pre_fatura_records(competencia, quinzena, tipo);

create index if not exists idx_gestao_pacotes_records_file_id on public.gestao_pacotes_records(file_id);
create index if not exists idx_gestao_pacotes_records_competencia on public.gestao_pacotes_records(competencia);
create index if not exists idx_gestao_pacotes_records_quinzena on public.gestao_pacotes_records(quinzena);
create index if not exists idx_gestao_pacotes_records_tipo on public.gestao_pacotes_records(tipo);
create index if not exists idx_gestao_pacotes_records_desconto on public.gestao_pacotes_records(desconto);
create index if not exists idx_gestao_pacotes_records_base on public.gestao_pacotes_records(base);
create index if not exists idx_gestao_pacotes_records_driver_norm on public.gestao_pacotes_records(driver_normalizado);
create index if not exists idx_gestao_pacotes_records_id_envio on public.gestao_pacotes_records(id_envio);
create index if not exists idx_gestao_pacotes_records_scope on public.gestao_pacotes_records(competencia, quinzena, tipo);

create index if not exists idx_dashboard_files_type_active on public.dashboard_files(file_type, is_active);
create index if not exists idx_dashboard_files_competencia on public.dashboard_files((metadata->>'competencia'));
create index if not exists idx_dashboard_files_quinzena on public.dashboard_files((metadata->>'quinzena'));
create index if not exists idx_dashboard_files_hash on public.dashboard_files((metadata->>'file_hash'));

alter table public.pre_fatura_records enable row level security;
alter table public.gestao_pacotes_records enable row level security;
alter table public.dashboard_metrics_cache enable row level security;

drop policy if exists "Logged users can read pre fatura records" on public.pre_fatura_records;
drop policy if exists "Admins can manage pre fatura records" on public.pre_fatura_records;
drop policy if exists "Logged users can read gestao pacotes records" on public.gestao_pacotes_records;
drop policy if exists "Admins can manage gestao pacotes records" on public.gestao_pacotes_records;
drop policy if exists "Logged users can read dashboard metrics cache" on public.dashboard_metrics_cache;
drop policy if exists "Admins can manage dashboard metrics cache" on public.dashboard_metrics_cache;

create policy "Logged users can read pre fatura records"
on public.pre_fatura_records
for select
to authenticated
using ((select auth.uid()) is not null);

create policy "Admins can manage pre fatura records"
on public.pre_fatura_records
for all
to authenticated
using ((select public.is_current_user_admin()))
with check ((select public.is_current_user_admin()));

create policy "Logged users can read gestao pacotes records"
on public.gestao_pacotes_records
for select
to authenticated
using ((select auth.uid()) is not null);

create policy "Admins can manage gestao pacotes records"
on public.gestao_pacotes_records
for all
to authenticated
using ((select public.is_current_user_admin()))
with check ((select public.is_current_user_admin()));

create policy "Logged users can read dashboard metrics cache"
on public.dashboard_metrics_cache
for select
to authenticated
using ((select auth.uid()) is not null);

create policy "Admins can manage dashboard metrics cache"
on public.dashboard_metrics_cache
for all
to authenticated
using ((select public.is_current_user_admin()))
with check ((select public.is_current_user_admin()));
