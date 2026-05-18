alter table public.desvios_pnr_records add column if not exists tipo_ocorrencia text default 'PNR';
alter table public.desvios_pnr_records add column if not exists tipo_base text;
alter table public.desvios_pnr_records add column if not exists base_identificada text;
alter table public.desvios_pnr_records add column if not exists nome_base_operacao text;
alter table public.desvios_pnr_records add column if not exists status_motorista text;
alter table public.desvios_pnr_records add column if not exists fonte_cruzamento text;
alter table public.desvios_pnr_records add column if not exists observacao_cruzamento text;

update public.desvios_pnr_records
set tipo_ocorrencia = 'PNR'
where tipo_ocorrencia is null or tipo_ocorrencia = '';

create index if not exists idx_desvios_pnr_records_tipo_base on public.desvios_pnr_records(tipo_base);
create index if not exists idx_desvios_pnr_records_base_identificada on public.desvios_pnr_records(base_identificada);
create index if not exists idx_desvios_pnr_records_status_motorista on public.desvios_pnr_records(status_motorista);
create index if not exists idx_desvios_pnr_records_fonte_cruzamento on public.desvios_pnr_records(fonte_cruzamento);
