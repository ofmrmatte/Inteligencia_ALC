alter table public.desvios_pnr_records add column if not exists tipo_ocorrencia text default 'PNR';
alter table public.desvios_pnr_records add column if not exists tipo_base text;
alter table public.desvios_pnr_records add column if not exists base_identificada text;
alter table public.desvios_pnr_records add column if not exists nome_base_operacao text;
alter table public.desvios_pnr_records add column if not exists status_motorista text;
alter table public.desvios_pnr_records add column if not exists fonte_cruzamento text;
alter table public.desvios_pnr_records add column if not exists observacao_cruzamento text;

create index if not exists idx_desvios_pnr_records_file_scope
on public.desvios_pnr_records(file_id, ano, mes, quinzena_ref, status_normalizado, tipo_base);

create index if not exists idx_desvios_pnr_records_file_status_motorista
on public.desvios_pnr_records(file_id, status_motorista);

create index if not exists idx_desvios_pnr_records_file_fonte
on public.desvios_pnr_records(file_id, fonte_cruzamento);

create or replace function public.pnr_month_number(value text)
returns integer
language sql
immutable
as $$
  select case
    when value is null or btrim(value) = '' then null
    when btrim(value) ~ '^\d+$' then nullif(btrim(value), '')::integer
    when upper(btrim(value)) like 'JAN%' then 1
    when upper(btrim(value)) like 'FEV%' then 2
    when upper(btrim(value)) like 'FEB%' then 2
    when upper(btrim(value)) like 'MAR%' then 3
    when upper(btrim(value)) like 'ABR%' then 4
    when upper(btrim(value)) like 'APR%' then 4
    when upper(btrim(value)) like 'MAI%' then 5
    when upper(btrim(value)) like 'MAY%' then 5
    when upper(btrim(value)) like 'JUN%' then 6
    when upper(btrim(value)) like 'JUL%' then 7
    when upper(btrim(value)) like 'AGO%' then 8
    when upper(btrim(value)) like 'AUG%' then 8
    when upper(btrim(value)) like 'SET%' then 9
    when upper(btrim(value)) like 'SEP%' then 9
    when upper(btrim(value)) like 'OUT%' then 10
    when upper(btrim(value)) like 'OCT%' then 10
    when upper(btrim(value)) like 'NOV%' then 11
    when upper(btrim(value)) like 'DEZ%' then 12
    when upper(btrim(value)) like 'DEC%' then 12
    else null
  end
$$;

create or replace function public.pnr_year_number(value text)
returns integer
language sql
immutable
as $$
  select case
    when value is null or btrim(value) = '' then null
    when btrim(value) ~ '^\d{4}$' then btrim(value)::integer
    when btrim(value) ~ '^\d{2}$' then 2000 + btrim(value)::integer
    else null
  end
$$;

create or replace function public.pnr_month_key(p_ano text, p_mes text, p_competencia text, p_periodo text)
returns text
language sql
immutable
as $$
  with parts as (
    select
      coalesce(
        public.pnr_year_number(p_ano),
        public.pnr_year_number(substring(coalesce(p_competencia, '') from '(\d{4})')),
        public.pnr_year_number(substring(coalesce(p_competencia, '') from '/(\d{2})')),
        public.pnr_year_number(substring(coalesce(p_periodo, '') from '(\d{4})')),
        public.pnr_year_number(substring(coalesce(p_periodo, '') from '/(\d{2})'))
      ) as year_value,
      coalesce(
        public.pnr_month_number(p_mes),
        public.pnr_month_number(split_part(coalesce(p_competencia, ''), '/', 1)),
        public.pnr_month_number(substring(coalesce(p_periodo, '') from '([A-Za-zÀ-ÿ]{3,})'))
      ) as month_value
  )
  select case
    when year_value is null or month_value is null or month_value not between 1 and 12 then null
    else year_value::text || '-' || lpad(month_value::text, 2, '0')
  end
  from parts
$$;

create or replace function public.pnr_quinzena_key(p_quinzena text, p_quinzena_ref text, p_periodo_label text)
returns text
language sql
immutable
as $$
  select case
    when lower(coalesce(p_quinzena_ref, '')) in ('q1', '1', '1q') then 'q1'
    when lower(coalesce(p_quinzena_ref, '')) in ('q2', '2', '2q') then 'q2'
    when lower(coalesce(p_quinzena, '')) like '1%' then 'q1'
    when lower(coalesce(p_quinzena, '')) like '2%' then 'q2'
    when lower(coalesce(p_periodo_label, '')) like '1%' then 'q1'
    when lower(coalesce(p_periodo_label, '')) like '2%' then 'q2'
    else null
  end
$$;

