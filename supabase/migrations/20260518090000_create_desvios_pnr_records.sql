create table if not exists public.desvios_pnr_records (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.dashboard_files(id) on delete cascade,
  dedupe_key text,
  competencia text,
  quinzena text,
  tipo text,
  status_original text,
  status_normalizado text,
  periodo_faturamento text,
  periodo_faturamento_original text,
  mes text,
  ano text,
  quinzena_ref text,
  periodo_label text,
  source_file_name text,
  source_periodo text,
  data_pedido_revisao date,
  pedido_revisao text,
  data_encerramento_caso date,
  rep_assistente text,
  comentario_encerramento text,
  numero_pre_fatura text,
  id_envio text,
  produtos text,
  valor_compra numeric(14,2) default 0,
  rep_transportadora text,
  id_transportadora text,
  transportadora text,
  estacao_origem text,
  tipo_operacional text,
  id_rota text,
  id_motorista text,
  nome_motorista text,
  motorista_display text,
  motorista_match_source text,
  data_caso date,
  data_entrega date,
  id_reclamacao text,
  data_reclamacao date,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default now()
);

create index if not exists idx_desvios_pnr_records_file_id on public.desvios_pnr_records(file_id);
create index if not exists idx_desvios_pnr_records_competencia on public.desvios_pnr_records(competencia);
create index if not exists idx_desvios_pnr_records_quinzena on public.desvios_pnr_records(quinzena);
create index if not exists idx_desvios_pnr_records_status on public.desvios_pnr_records(status_normalizado);
create index if not exists idx_desvios_pnr_records_tipo_operacional on public.desvios_pnr_records(tipo_operacional);
create index if not exists idx_desvios_pnr_records_estacao on public.desvios_pnr_records(estacao_origem);
create index if not exists idx_desvios_pnr_records_id_envio on public.desvios_pnr_records(id_envio);
create index if not exists idx_desvios_pnr_records_id_motorista on public.desvios_pnr_records(id_motorista);
create index if not exists idx_desvios_pnr_records_scope on public.desvios_pnr_records(competencia, quinzena, tipo_operacional, status_normalizado);

alter table public.desvios_pnr_records add column if not exists periodo_faturamento_original text;
alter table public.desvios_pnr_records add column if not exists mes text;
alter table public.desvios_pnr_records add column if not exists ano text;
alter table public.desvios_pnr_records add column if not exists quinzena_ref text;
alter table public.desvios_pnr_records add column if not exists periodo_label text;
alter table public.desvios_pnr_records add column if not exists source_file_name text;
alter table public.desvios_pnr_records add column if not exists source_periodo text;
alter table public.desvios_pnr_records add column if not exists dedupe_key text;
alter table public.desvios_pnr_records add column if not exists nome_motorista text;
alter table public.desvios_pnr_records add column if not exists motorista_display text;
alter table public.desvios_pnr_records add column if not exists motorista_match_source text;

create index if not exists idx_desvios_pnr_records_dedupe_key on public.desvios_pnr_records(dedupe_key);
create index if not exists idx_desvios_pnr_records_nome_motorista on public.desvios_pnr_records(nome_motorista);

alter table public.desvios_pnr_records enable row level security;

drop policy if exists "Logged users can read desvios pnr records" on public.desvios_pnr_records;
drop policy if exists "Admins can manage desvios pnr records" on public.desvios_pnr_records;

create policy "Logged users can read desvios pnr records"
on public.desvios_pnr_records
for select
to authenticated
using ((select auth.uid()) is not null);

create policy "Admins can manage desvios pnr records"
on public.desvios_pnr_records
for all
to authenticated
using ((select public.is_current_user_admin()))
with check ((select public.is_current_user_admin()));
