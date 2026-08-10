alter table public.desvios_pnr_records add column if not exists tipo_ocorrencia text default 'PNR';
alter table public.desvios_pnr_records add column if not exists tipo_base text;
alter table public.desvios_pnr_records add column if not exists base_identificada text;
alter table public.desvios_pnr_records add column if not exists nome_base_operacao text;
alter table public.desvios_pnr_records add column if not exists status_motorista text;
alter table public.desvios_pnr_records add column if not exists fonte_cruzamento text;
alter table public.desvios_pnr_records add column if not exists observacao_cruzamento text;
alter table public.desvios_pnr_records add column if not exists month_key text;
alter table public.desvios_pnr_records add column if not exists quinzena_key text;

create index if not exists idx_desvios_pnr_records_file_scope
on public.desvios_pnr_records(file_id, ano, mes, quinzena_ref, status_normalizado, tipo_base);

create index if not exists idx_desvios_pnr_records_file_status_motorista
on public.desvios_pnr_records(file_id, status_motorista);

create index if not exists idx_desvios_pnr_records_file_fonte
on public.desvios_pnr_records(file_id, fonte_cruzamento);

create index if not exists idx_desvios_pnr_records_file_month_key
on public.desvios_pnr_records(file_id, month_key);

create index if not exists idx_desvios_pnr_records_file_month_quinzena
on public.desvios_pnr_records(file_id, month_key, quinzena_key);

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

create or replace function public.set_desvios_pnr_period_keys()
returns trigger
language plpgsql
as $$
begin
  new.month_key := case
    when new.ano ~ '^[0-9]{4}$' and new.mes ~ '^[0-9]{1,2}$'
      then new.ano || '-' || lpad(new.mes, 2, '0')
    else public.pnr_month_key(new.ano, new.mes, new.competencia, coalesce(new.source_periodo, new.periodo_faturamento))
  end;
  new.quinzena_key := public.pnr_quinzena_key(new.quinzena, new.quinzena_ref, new.periodo_label);
  return new;
end
$$;

drop trigger if exists trg_desvios_pnr_period_keys on public.desvios_pnr_records;
create trigger trg_desvios_pnr_period_keys
before insert or update of ano, mes, competencia, source_periodo, periodo_faturamento, quinzena, quinzena_ref, periodo_label
on public.desvios_pnr_records
for each row
execute function public.set_desvios_pnr_period_keys();


create or replace function public.desvios_pnr_summary(
  p_file_ids uuid[] default '{}',
  p_month_keys text[] default '{}',
  p_quinzenas text[] default '{}',
  p_statuses text[] default '{}',
  p_tipos text[] default '{}',
  p_estacoes text[] default '{}',
  p_status_motoristas text[] default '{}',
  p_fontes text[] default '{}',
  p_motoristas text[] default '{}',
  p_rotas text[] default '{}',
  p_search text default ''
)
returns jsonb
language sql
stable
as $$
  with scoped as not materialized (
    select
      r.id,
      r.file_id,
      r.competencia,
      r.quinzena,
      r.status_normalizado,
      r.tipo_base,
      r.tipo_operacional,
      r.estacao_origem,
      r.status_motorista,
      r.fonte_cruzamento,
      r.id_envio,
      r.id_motorista,
      r.id_rota,
      r.id_reclamacao,
      r.comentario_encerramento,
      r.nome_motorista,
      r.motorista_display,
      r.valor_compra,
      r.ano,
      r.mes,
      r.source_periodo,
      r.periodo_faturamento,
      r.quinzena_ref,
      r.periodo_label,
      r.month_key as stored_month_key,
      r.quinzena_key as stored_quinzena_key
    from public.desvios_pnr_records r
    where coalesce(cardinality(p_file_ids), 0) = 0 or r.file_id = any(p_file_ids)
  ),
  prepared as not materialized (
    select
      r.*,
      coalesce(
        r.stored_month_key,
        case
          when r.ano ~ '^[0-9]{4}$' and r.mes ~ '^[0-9]{1,2}$'
            then r.ano || '-' || lpad(r.mes, 2, '0')
          else public.pnr_month_key(r.ano, r.mes, r.competencia, coalesce(r.source_periodo, r.periodo_faturamento))
        end
      ) as computed_month_key,
      coalesce(r.stored_quinzena_key, public.pnr_quinzena_key(r.quinzena, r.quinzena_ref, r.periodo_label)) as computed_quinzena_key
    from scoped r
  ),
  filtered as not materialized (
    select *
    from prepared
    where (coalesce(cardinality(p_month_keys), 0) = 0 or computed_month_key = any(p_month_keys))
      and (coalesce(cardinality(p_quinzenas), 0) = 0 or computed_quinzena_key = any(p_quinzenas))
      and (coalesce(cardinality(p_statuses), 0) = 0 or status_normalizado = any(p_statuses))
      and (coalesce(cardinality(p_tipos), 0) = 0 or coalesce(nullif(tipo_base, ''), nullif(tipo_operacional, ''), 'Não identificada') = any(p_tipos))
      and (coalesce(cardinality(p_estacoes), 0) = 0 or estacao_origem = any(p_estacoes))
      and (coalesce(cardinality(p_status_motoristas), 0) = 0 or status_motorista = any(p_status_motoristas))
      and (coalesce(cardinality(p_fontes), 0) = 0 or fonte_cruzamento = any(p_fontes))
      and (coalesce(cardinality(p_motoristas), 0) = 0 or coalesce(nullif(motorista_display, ''), nullif(nome_motorista, ''), id_motorista) = any(p_motoristas))
      and (coalesce(cardinality(p_rotas), 0) = 0 or id_rota = any(p_rotas))
      and (
        coalesce(btrim(p_search), '') = ''
        or concat_ws(' ',
          competencia, quinzena, status_normalizado, tipo_base, tipo_operacional,
          estacao_origem, status_motorista, fonte_cruzamento, id_envio, id_motorista,
          id_rota, id_reclamacao, id::text, comentario_encerramento, nome_motorista,
          motorista_display
        ) ilike '%' || btrim(p_search) || '%'
      )
  ),
  totals as (
    select
      count(*)::integer as count,
      coalesce(sum(valor_compra), 0)::numeric as total_value,
      coalesce(avg(valor_compra), 0)::numeric as avg_value,
      count(*) filter (where status_normalizado = 'Anulado')::integer as anulado,
      count(*) filter (where status_normalizado = 'Enviado para faturamento')::integer as faturamento
    from filtered
  ),
  status_rows as (
    select status_normalizado as label, count(*)::integer as count
    from filtered
    group by status_normalizado
    order by count(*) desc
  ),
  operation_rows as (
    select coalesce(nullif(tipo_base, ''), nullif(tipo_operacional, ''), 'Não identificada') as label, count(*)::integer as count
    from filtered
    group by 1
    order by count(*) desc
  ),
  station_rows as (
    select coalesce(nullif(estacao_origem, ''), 'Sem estação') as label, count(*)::integer as count, coalesce(sum(valor_compra), 0)::numeric as total_value
    from filtered
    group by 1
    order by count(*) desc, coalesce(sum(valor_compra), 0) desc
    limit 10
  ),
  driver_rows as (
    select coalesce(nullif(motorista_display, ''), nullif(nome_motorista, ''), case when nullif(id_motorista, '') is not null then 'ID ' || id_motorista else 'Sem motorista' end) as label,
      case when nullif(id_motorista, '') is not null then 'ID: ' || id_motorista else '' end as detail,
      count(*)::integer as count,
      coalesce(sum(valor_compra), 0)::numeric as total_value
    from filtered
    group by 1, 2
    order by count(*) desc, coalesce(sum(valor_compra), 0) desc
    limit 10
  ),
  evolution_source as (
    select computed_month_key, min(competencia) as label, count(*)::integer as count, coalesce(sum(valor_compra), 0)::numeric as total_value
    from filtered
    where computed_month_key is not null
    group by computed_month_key
    order by computed_month_key desc
    limit 12
  ),
  month_options as (
    select computed_month_key as key, coalesce(min(competencia), computed_month_key) as label, substring(computed_month_key from 1 for 4)::integer as year, substring(computed_month_key from 6 for 2)::integer as month
    from prepared
    where computed_month_key is not null
    group by computed_month_key
    order by computed_month_key
  ),
  filter_options as (
    select
      (select jsonb_agg(label order by label) from (select status_normalizado as label from prepared where nullif(status_normalizado, '') is not null group by status_normalizado) s) as statuses,
      (select jsonb_agg(label order by label) from (select coalesce(nullif(tipo_base, ''), nullif(tipo_operacional, '')) as label from prepared where coalesce(nullif(tipo_base, ''), nullif(tipo_operacional, '')) is not null group by 1) t) as tipos,
      (select jsonb_agg(label order by label) from (select estacao_origem as label from prepared where nullif(estacao_origem, '') is not null group by estacao_origem order by count(*) desc, estacao_origem limit 300) e) as estacoes,
      (select jsonb_agg(label order by label) from (select status_motorista as label from prepared where nullif(status_motorista, '') is not null group by status_motorista) sm) as status_motoristas,
      (select jsonb_agg(label order by label) from (select fonte_cruzamento as label from prepared where nullif(fonte_cruzamento, '') is not null group by fonte_cruzamento) f) as fontes_cruzamento,
      (select jsonb_agg(label order by label) from (select coalesce(nullif(motorista_display, ''), nullif(nome_motorista, ''), id_motorista) as label from prepared where coalesce(nullif(motorista_display, ''), nullif(nome_motorista, ''), id_motorista) is not null group by 1 order by count(*) desc, label limit 200) m) as motoristas,
      (select jsonb_agg(label order by label) from (select id_rota as label from prepared where nullif(id_rota, '') is not null group by id_rota order by count(*) desc, id_rota limit 200) r) as rotas
  )
  select jsonb_build_object(
    'total', (select count from totals),
    'summary', jsonb_build_object(
      'count', (select count from totals),
      'totalValue', (select total_value from totals),
      'avgValue', (select avg_value from totals),
      'anulado', (select anulado from totals),
      'faturamento', (select faturamento from totals),
      'aberto', greatest((select count - anulado - faturamento from totals), 0)
    ),
    'statusRows', coalesce((select jsonb_agg(jsonb_build_object('label', coalesce(label, 'Indefinido'), 'count', count, 'share', case when (select count from totals) > 0 then (count::numeric / (select count from totals)::numeric) * 100 else 0 end)) from status_rows), '[]'::jsonb),
    'operationRows', coalesce((select jsonb_agg(jsonb_build_object('label', coalesce(label, 'Não identificada'), 'count', count, 'share', case when (select count from totals) > 0 then (count::numeric / (select count from totals)::numeric) * 100 else 0 end)) from operation_rows), '[]'::jsonb),
    'stationRows', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'count', count, 'totalValue', total_value, 'share', case when (select count from totals) > 0 then (count::numeric / (select count from totals)::numeric) * 100 else 0 end)) from station_rows), '[]'::jsonb),
    'driverRows', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'detail', detail, 'count', count, 'totalValue', total_value, 'share', case when (select count from totals) > 0 then (count::numeric / (select count from totals)::numeric) * 100 else 0 end)) from driver_rows), '[]'::jsonb),
    'evolutionRows', coalesce((select jsonb_agg(jsonb_build_object('key', computed_month_key, 'label', label, 'year', substring(computed_month_key from 1 for 4)::integer, 'month', substring(computed_month_key from 6 for 2)::integer, 'count', count, 'totalValue', total_value) order by computed_month_key) from evolution_source), '[]'::jsonb),
    'monthOptions', coalesce((select jsonb_agg(jsonb_build_object('key', key, 'label', label, 'year', year, 'month', month)) from month_options), '[]'::jsonb),
    'filterOptions', jsonb_build_object(
      'statuses', coalesce((select statuses from filter_options), '[]'::jsonb),
      'tipos', coalesce((select tipos from filter_options), '[]'::jsonb),
      'estacoes', coalesce((select estacoes from filter_options), '[]'::jsonb),
      'statusMotoristas', coalesce((select status_motoristas from filter_options), '[]'::jsonb),
      'fontesCruzamento', coalesce((select fontes_cruzamento from filter_options), '[]'::jsonb),
      'motoristas', coalesce((select motoristas from filter_options), '[]'::jsonb),
      'rotas', coalesce((select rotas from filter_options), '[]'::jsonb)
    )
  )
$$;

create or replace function public.desvios_pnr_table(
  p_file_ids uuid[] default '{}',
  p_month_keys text[] default '{}',
  p_quinzenas text[] default '{}',
  p_statuses text[] default '{}',
  p_tipos text[] default '{}',
  p_estacoes text[] default '{}',
  p_status_motoristas text[] default '{}',
  p_fontes text[] default '{}',
  p_motoristas text[] default '{}',
  p_rotas text[] default '{}',
  p_search text default '',
  p_page integer default 1,
  p_page_size integer default 15,
  p_sort_key text default '',
  p_sort_dir text default 'desc'
)
returns jsonb
language sql
stable
as $$
  with scoped as not materialized (
    select
      r.id,
      r.file_id,
      r.competencia,
      r.quinzena,
      r.status_normalizado,
      r.tipo_base,
      r.tipo_operacional,
      r.estacao_origem,
      r.status_motorista,
      r.fonte_cruzamento,
      r.id_envio,
      r.id_motorista,
      r.id_rota,
      r.id_reclamacao,
      r.comentario_encerramento,
      r.nome_motorista,
      r.motorista_display,
      r.valor_compra,
      r.ano,
      r.mes,
      r.source_periodo,
      r.periodo_faturamento,
      r.quinzena_ref,
      r.periodo_label,
      r.month_key as stored_month_key,
      r.quinzena_key as stored_quinzena_key,
      r.data_caso
    from public.desvios_pnr_records r
    where coalesce(cardinality(p_file_ids), 0) = 0 or r.file_id = any(p_file_ids)
  ),
  prepared as not materialized (
    select
      r.*,
      coalesce(
        r.stored_month_key,
        case
          when r.ano ~ '^[0-9]{4}$' and r.mes ~ '^[0-9]{1,2}$'
            then r.ano || '-' || lpad(r.mes, 2, '0')
          else public.pnr_month_key(r.ano, r.mes, r.competencia, coalesce(r.source_periodo, r.periodo_faturamento))
        end
      ) as computed_month_key,
      coalesce(r.stored_quinzena_key, public.pnr_quinzena_key(r.quinzena, r.quinzena_ref, r.periodo_label)) as computed_quinzena_key
    from scoped r
  ),
  filtered as not materialized (
    select *
    from prepared
    where (coalesce(cardinality(p_month_keys), 0) = 0 or computed_month_key = any(p_month_keys))
      and (coalesce(cardinality(p_quinzenas), 0) = 0 or computed_quinzena_key = any(p_quinzenas))
      and (coalesce(cardinality(p_statuses), 0) = 0 or status_normalizado = any(p_statuses))
      and (coalesce(cardinality(p_tipos), 0) = 0 or coalesce(nullif(tipo_base, ''), nullif(tipo_operacional, ''), 'Não identificada') = any(p_tipos))
      and (coalesce(cardinality(p_estacoes), 0) = 0 or estacao_origem = any(p_estacoes))
      and (coalesce(cardinality(p_status_motoristas), 0) = 0 or status_motorista = any(p_status_motoristas))
      and (coalesce(cardinality(p_fontes), 0) = 0 or fonte_cruzamento = any(p_fontes))
      and (coalesce(cardinality(p_motoristas), 0) = 0 or coalesce(nullif(motorista_display, ''), nullif(nome_motorista, ''), id_motorista) = any(p_motoristas))
      and (coalesce(cardinality(p_rotas), 0) = 0 or id_rota = any(p_rotas))
      and (
        coalesce(btrim(p_search), '') = ''
        or concat_ws(' ',
          competencia, quinzena, status_normalizado, tipo_base, tipo_operacional,
          estacao_origem, status_motorista, fonte_cruzamento, id_envio, id_motorista,
          id_rota, id_reclamacao, id::text, comentario_encerramento, nome_motorista,
          motorista_display
        ) ilike '%' || btrim(p_search) || '%'
      )
  ),
  totals as (
    select count(*)::integer as count
    from filtered
  ),
  table_row_ids as (
    select id, row_number() over () as row_order
    from (
      select id
      from filtered
      order by
        case when p_sort_key = 'valorCompraNumerico' and p_sort_dir = 'asc' then valor_compra end asc nulls last,
        case when p_sort_key = 'valorCompraNumerico' and p_sort_dir <> 'asc' then valor_compra end desc nulls last,
        case when p_sort_key = 'statusNormalizado' and p_sort_dir = 'asc' then status_normalizado end asc nulls last,
        case when p_sort_key = 'statusNormalizado' and p_sort_dir <> 'asc' then status_normalizado end desc nulls last,
        case when p_sort_key = 'estacaoOrigem' and p_sort_dir = 'asc' then estacao_origem end asc nulls last,
        case when p_sort_key = 'estacaoOrigem' and p_sort_dir <> 'asc' then estacao_origem end desc nulls last,
        computed_month_key desc nulls last,
        computed_quinzena_key desc nulls last,
        data_caso desc nulls last,
        id desc
      limit least(greatest(p_page_size, 10), 100)
      offset greatest(p_page - 1, 0) * least(greatest(p_page_size, 10), 100)
    ) page_ids
  )
  select jsonb_build_object(
    'total', (select count from totals),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(r) order by tri.row_order)
      from table_row_ids tri
      join public.desvios_pnr_records r on r.id = tri.id
    ), '[]'::jsonb)
  )
$$;

grant execute on function public.desvios_pnr_summary(uuid[], text[], text[], text[], text[], text[], text[], text[], text[], text[], text) to authenticated;

create or replace function public.desvios_pnr_table(
  p_file_ids uuid[] default '{}',
  p_month_keys text[] default '{}',
  p_quinzenas text[] default '{}',
  p_statuses text[] default '{}',
  p_tipos text[] default '{}',
  p_estacoes text[] default '{}',
  p_status_motoristas text[] default '{}',
  p_fontes text[] default '{}',
  p_motoristas text[] default '{}',
  p_rotas text[] default '{}',
  p_search text default '',
  p_page integer default 1,
  p_page_size integer default 15,
  p_sort_key text default '',
  p_sort_dir text default 'desc'
)
returns jsonb
language sql
stable
as $$
  with filtered_metrics as not materialized (
    select *
    from public.desvios_pnr_metrics_summary m
    where (coalesce(cardinality(p_file_ids), 0) = 0 or m.file_id = any(p_file_ids))
      and (coalesce(cardinality(p_month_keys), 0) = 0 or m.month_key = any(p_month_keys))
      and (coalesce(cardinality(p_quinzenas), 0) = 0 or m.quinzena_key = any(p_quinzenas))
      and (coalesce(cardinality(p_statuses), 0) = 0 or m.status_normalizado = any(p_statuses))
      and (coalesce(cardinality(p_tipos), 0) = 0 or m.tipo_base_label = any(p_tipos))
      and (coalesce(cardinality(p_estacoes), 0) = 0 or m.estacao_origem = any(p_estacoes))
      and (coalesce(cardinality(p_status_motoristas), 0) = 0 or m.status_motorista = any(p_status_motoristas))
      and (coalesce(cardinality(p_fontes), 0) = 0 or m.fonte_cruzamento = any(p_fontes))
      and (coalesce(cardinality(p_motoristas), 0) = 0 or m.motorista_label = any(p_motoristas))
      and (coalesce(cardinality(p_rotas), 0) = 0 or m.id_rota = any(p_rotas))
      and (
        coalesce(btrim(p_search), '') = ''
        or concat_ws(' ',
          m.competencia_label, m.quinzena_key, m.status_normalizado, m.tipo_base_label,
          m.estacao_origem, m.status_motorista, m.fonte_cruzamento, m.motorista_label, m.id_rota
        ) ilike '%' || btrim(p_search) || '%'
      )
  ),
  table_row_ids as (
    select id, row_number() over () as row_order
    from (
      select r.id
      from public.desvios_pnr_records r
      where (coalesce(cardinality(p_file_ids), 0) = 0 or r.file_id = any(p_file_ids))
        and (coalesce(cardinality(p_month_keys), 0) = 0 or r.month_key = any(p_month_keys))
        and (coalesce(cardinality(p_quinzenas), 0) = 0 or r.quinzena_key = any(p_quinzenas))
        and (coalesce(cardinality(p_statuses), 0) = 0 or coalesce(nullif(r.status_normalizado, ''), 'Indefinido') = any(p_statuses))
        and (coalesce(cardinality(p_tipos), 0) = 0 or coalesce(nullif(r.tipo_base, ''), nullif(r.tipo_operacional, ''), 'Não identificada') = any(p_tipos))
        and (coalesce(cardinality(p_estacoes), 0) = 0 or coalesce(nullif(r.estacao_origem, ''), 'Sem estação') = any(p_estacoes))
        and (coalesce(cardinality(p_status_motoristas), 0) = 0 or coalesce(nullif(r.status_motorista, ''), 'Não identificado') = any(p_status_motoristas))
        and (coalesce(cardinality(p_fontes), 0) = 0 or coalesce(nullif(r.fonte_cruzamento, ''), 'Não identificada') = any(p_fontes))
        and (coalesce(cardinality(p_motoristas), 0) = 0 or coalesce(nullif(r.motorista_display, ''), nullif(r.nome_motorista, ''), nullif(r.id_motorista, ''), 'Sem motorista') = any(p_motoristas))
        and (coalesce(cardinality(p_rotas), 0) = 0 or coalesce(nullif(r.id_rota, ''), 'Sem rota') = any(p_rotas))
        and (
          coalesce(btrim(p_search), '') = ''
          or concat_ws(' ',
            r.competencia, r.quinzena, r.status_normalizado, r.tipo_base, r.tipo_operacional,
            r.estacao_origem, r.status_motorista, r.fonte_cruzamento, r.id_envio, r.id_motorista,
            r.id_rota, r.id_reclamacao, r.id::text, r.comentario_encerramento, r.nome_motorista,
            r.motorista_display
          ) ilike '%' || btrim(p_search) || '%'
        )
      order by
        case when p_sort_key = 'valorCompraNumerico' and p_sort_dir = 'asc' then r.valor_compra end asc nulls last,
        case when p_sort_key = 'valorCompraNumerico' and p_sort_dir <> 'asc' then r.valor_compra end desc nulls last,
        case when p_sort_key = 'statusNormalizado' and p_sort_dir = 'asc' then r.status_normalizado end asc nulls last,
        case when p_sort_key = 'statusNormalizado' and p_sort_dir <> 'asc' then r.status_normalizado end desc nulls last,
        case when p_sort_key = 'estacaoOrigem' and p_sort_dir = 'asc' then r.estacao_origem end asc nulls last,
        case when p_sort_key = 'estacaoOrigem' and p_sort_dir <> 'asc' then r.estacao_origem end desc nulls last,
        r.month_key desc nulls last,
        r.quinzena_key desc nulls last,
        r.data_caso desc nulls last,
        r.id desc
      limit least(greatest(p_page_size, 10), 100)
      offset greatest(p_page - 1, 0) * least(greatest(p_page_size, 10), 100)
    ) page_ids
  )
  select jsonb_build_object(
    'total', coalesce((select sum(row_count)::integer from filtered_metrics), 0),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(r) order by tri.row_order)
      from table_row_ids tri
      join (
        select
          id, file_id, dedupe_key, competencia, quinzena, tipo,
          status_original, status_normalizado, periodo_faturamento,
          periodo_faturamento_original, mes, ano, month_key, quinzena_key,
          quinzena_ref, periodo_label, source_file_name, source_periodo,
          data_pedido_revisao, pedido_revisao, data_encerramento_caso,
          rep_assistente, comentario_encerramento, numero_pre_fatura,
          id_envio, valor_compra, rep_transportadora, id_transportadora,
          transportadora, estacao_origem, tipo_ocorrencia, tipo_base,
          base_identificada, nome_base_operacao, tipo_operacional,
          id_rota, id_motorista, nome_motorista, motorista_display,
          status_motorista, fonte_cruzamento, observacao_cruzamento,
          motorista_match_source, data_caso, data_entrega, id_reclamacao,
          data_reclamacao
        from public.desvios_pnr_records
      ) r on r.id = tri.id
    ), '[]'::jsonb)
  )
$$;

grant execute on function public.desvios_pnr_table(uuid[], text[], text[], text[], text[], text[], text[], text[], text[], text[], text, integer, integer, text, text) to authenticated;

create or replace function public.desvios_pnr_table(
  p_file_ids uuid[] default '{}',
  p_month_keys text[] default '{}',
  p_quinzenas text[] default '{}',
  p_statuses text[] default '{}',
  p_tipos text[] default '{}',
  p_estacoes text[] default '{}',
  p_status_motoristas text[] default '{}',
  p_fontes text[] default '{}',
  p_motoristas text[] default '{}',
  p_rotas text[] default '{}',
  p_search text default '',
  p_page integer default 1,
  p_page_size integer default 15,
  p_sort_key text default '',
  p_sort_dir text default 'desc'
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_record_where text := 'true';
  v_metric_where text := 'true';
  v_order text;
  v_limit integer := least(greatest(coalesce(p_page_size, 15), 10), 100);
  v_offset integer := greatest(coalesce(p_page, 1) - 1, 0) * least(greatest(coalesce(p_page_size, 15), 10), 100);
  v_total integer := 0;
  v_rows jsonb := '[]'::jsonb;
  v_search text := btrim(coalesce(p_search, ''));
begin
  if coalesce(cardinality(p_file_ids), 0) > 0 then
    v_record_where := v_record_where || format(' and r.file_id = any(%L::uuid[])', p_file_ids);
    v_metric_where := v_metric_where || format(' and m.file_id = any(%L::uuid[])', p_file_ids);
  end if;
  if coalesce(cardinality(p_month_keys), 0) > 0 then
    v_record_where := v_record_where || format(' and r.month_key = any(%L::text[])', p_month_keys);
    v_metric_where := v_metric_where || format(' and m.month_key = any(%L::text[])', p_month_keys);
  end if;
  if coalesce(cardinality(p_quinzenas), 0) > 0 then
    v_record_where := v_record_where || format(' and r.quinzena_key = any(%L::text[])', p_quinzenas);
    v_metric_where := v_metric_where || format(' and m.quinzena_key = any(%L::text[])', p_quinzenas);
  end if;
  if coalesce(cardinality(p_statuses), 0) > 0 then
    v_record_where := v_record_where || format(' and coalesce(nullif(r.status_normalizado, ''''), ''Indefinido'') = any(%L::text[])', p_statuses);
    v_metric_where := v_metric_where || format(' and m.status_normalizado = any(%L::text[])', p_statuses);
  end if;
  if coalesce(cardinality(p_tipos), 0) > 0 then
    v_record_where := v_record_where || format(' and coalesce(nullif(r.tipo_base, ''''), nullif(r.tipo_operacional, ''''), ''Não identificada'') = any(%L::text[])', p_tipos);
    v_metric_where := v_metric_where || format(' and m.tipo_base_label = any(%L::text[])', p_tipos);
  end if;
  if coalesce(cardinality(p_estacoes), 0) > 0 then
    v_record_where := v_record_where || format(' and coalesce(nullif(r.estacao_origem, ''''), ''Sem estação'') = any(%L::text[])', p_estacoes);
    v_metric_where := v_metric_where || format(' and m.estacao_origem = any(%L::text[])', p_estacoes);
  end if;
  if coalesce(cardinality(p_status_motoristas), 0) > 0 then
    v_record_where := v_record_where || format(' and coalesce(nullif(r.status_motorista, ''''), ''Não identificado'') = any(%L::text[])', p_status_motoristas);
    v_metric_where := v_metric_where || format(' and m.status_motorista = any(%L::text[])', p_status_motoristas);
  end if;
  if coalesce(cardinality(p_fontes), 0) > 0 then
    v_record_where := v_record_where || format(' and coalesce(nullif(r.fonte_cruzamento, ''''), ''Não identificada'') = any(%L::text[])', p_fontes);
    v_metric_where := v_metric_where || format(' and m.fonte_cruzamento = any(%L::text[])', p_fontes);
  end if;
  if coalesce(cardinality(p_motoristas), 0) > 0 then
    v_record_where := v_record_where || format(' and coalesce(nullif(r.motorista_display, ''''), nullif(r.nome_motorista, ''''), nullif(r.id_motorista, ''''), ''Sem motorista'') = any(%L::text[])', p_motoristas);
    v_metric_where := v_metric_where || format(' and m.motorista_label = any(%L::text[])', p_motoristas);
  end if;
  if coalesce(cardinality(p_rotas), 0) > 0 then
    v_record_where := v_record_where || format(' and coalesce(nullif(r.id_rota, ''''), ''Sem rota'') = any(%L::text[])', p_rotas);
    v_metric_where := v_metric_where || format(' and m.id_rota = any(%L::text[])', p_rotas);
  end if;
  if v_search <> '' then
    v_record_where := v_record_where || format(' and concat_ws('' '', r.competencia, r.quinzena, r.status_normalizado, r.tipo_base, r.tipo_operacional, r.estacao_origem, r.status_motorista, r.fonte_cruzamento, r.id_envio, r.id_motorista, r.id_rota, r.id_reclamacao, r.id::text, r.comentario_encerramento, r.nome_motorista, r.motorista_display) ilike %L', '%' || v_search || '%');
    v_metric_where := v_metric_where || format(' and concat_ws('' '', m.competencia_label, m.quinzena_key, m.status_normalizado, m.tipo_base_label, m.estacao_origem, m.status_motorista, m.fonte_cruzamento, m.motorista_label, m.id_rota) ilike %L', '%' || v_search || '%');
  end if;

  v_order := case
    when p_sort_key = 'valorCompraNumerico' and p_sort_dir = 'asc' then 'r.valor_compra asc nulls last, r.month_key desc nulls last, r.quinzena_key desc nulls last, r.data_caso desc nulls last, r.id desc'
    when p_sort_key = 'valorCompraNumerico' then 'r.valor_compra desc nulls last, r.month_key desc nulls last, r.quinzena_key desc nulls last, r.data_caso desc nulls last, r.id desc'
    when p_sort_key = 'statusNormalizado' and p_sort_dir = 'asc' then 'r.status_normalizado asc nulls last, r.month_key desc nulls last, r.quinzena_key desc nulls last, r.data_caso desc nulls last, r.id desc'
    when p_sort_key = 'statusNormalizado' then 'r.status_normalizado desc nulls last, r.month_key desc nulls last, r.quinzena_key desc nulls last, r.data_caso desc nulls last, r.id desc'
    when p_sort_key = 'estacaoOrigem' and p_sort_dir = 'asc' then 'r.estacao_origem asc nulls last, r.month_key desc nulls last, r.quinzena_key desc nulls last, r.data_caso desc nulls last, r.id desc'
    when p_sort_key = 'estacaoOrigem' then 'r.estacao_origem desc nulls last, r.month_key desc nulls last, r.quinzena_key desc nulls last, r.data_caso desc nulls last, r.id desc'
    else 'r.month_key desc nulls last, r.quinzena_key desc nulls last, r.data_caso desc nulls last, r.id desc'
  end;

  execute 'select coalesce(sum(row_count)::integer, 0) from public.desvios_pnr_metrics_summary m where ' || v_metric_where
  into v_total;

  execute format($sql$
    with page_ids as (
      select id, row_number() over () as row_order
      from (
        select r.id
        from public.desvios_pnr_records r
        where %s
        order by %s
        limit %s offset %s
      ) page_scope
    ),
    page_rows as (
      select
        p.row_order,
        r.id, r.file_id, r.dedupe_key, r.competencia, r.quinzena, r.tipo,
        r.status_original, r.status_normalizado, r.periodo_faturamento,
        r.periodo_faturamento_original, r.mes, r.ano, r.month_key, r.quinzena_key,
        r.quinzena_ref, r.periodo_label, r.source_file_name, r.source_periodo,
        r.data_pedido_revisao, r.pedido_revisao, r.data_encerramento_caso,
        r.rep_assistente, r.comentario_encerramento, r.numero_pre_fatura,
        r.id_envio, r.valor_compra, r.rep_transportadora, r.id_transportadora,
        r.transportadora, r.estacao_origem, r.tipo_ocorrencia, r.tipo_base,
        r.base_identificada, r.nome_base_operacao, r.tipo_operacional,
        r.id_rota, r.id_motorista, r.nome_motorista, r.motorista_display,
        r.status_motorista, r.fonte_cruzamento, r.observacao_cruzamento,
        r.motorista_match_source, r.data_caso, r.data_entrega, r.id_reclamacao,
        r.data_reclamacao
      from page_ids p
      join public.desvios_pnr_records r on r.id = p.id
    )
    select coalesce(jsonb_agg(to_jsonb(page_rows) - 'row_order' order by row_order), '[]'::jsonb)
    from page_rows
  $sql$, v_record_where, v_order, v_limit, v_offset)
  into v_rows;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end
$$;

grant execute on function public.desvios_pnr_table(uuid[], text[], text[], text[], text[], text[], text[], text[], text[], text[], text, integer, integer, text, text) to authenticated;
grant execute on function public.desvios_pnr_table(uuid[], text[], text[], text[], text[], text[], text[], text[], text[], text[], text, integer, integer, text, text) to authenticated;

create index if not exists idx_desvios_pnr_records_default_order
on public.desvios_pnr_records(month_key desc, quinzena_key desc, data_caso desc, id desc);

create table if not exists public.desvios_pnr_metrics_summary (
  id bigserial primary key,
  file_id uuid not null,
  month_key text,
  quinzena_key text,
  competencia_label text,
  status_normalizado text,
  tipo_base_label text,
  estacao_origem text,
  status_motorista text,
  fonte_cruzamento text,
  motorista_label text,
  motorista_detail text,
  id_rota text,
  row_count integer not null default 0,
  total_value numeric not null default 0,
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_desvios_pnr_metrics_file_period
on public.desvios_pnr_metrics_summary(file_id, month_key, quinzena_key);

create index if not exists idx_desvios_pnr_metrics_filters
on public.desvios_pnr_metrics_summary(file_id, status_normalizado, tipo_base_label, estacao_origem);

create index if not exists idx_desvios_pnr_metrics_driver_route
on public.desvios_pnr_metrics_summary(file_id, motorista_label, id_rota);

alter table public.desvios_pnr_metrics_summary enable row level security;

drop policy if exists "Logged users can read desvios pnr metrics" on public.desvios_pnr_metrics_summary;
drop policy if exists "Admins can manage desvios pnr metrics" on public.desvios_pnr_metrics_summary;

create policy "Logged users can read desvios pnr metrics"
on public.desvios_pnr_metrics_summary
for select
to authenticated
using ((select auth.uid()) is not null);

create policy "Admins can manage desvios pnr metrics"
on public.desvios_pnr_metrics_summary
for all
to authenticated
using ((select public.is_current_user_admin()))
with check ((select public.is_current_user_admin()));

grant select, insert, update, delete on public.desvios_pnr_metrics_summary to authenticated;
grant usage, select on sequence public.desvios_pnr_metrics_summary_id_seq to authenticated;

create or replace function public.refresh_desvios_pnr_metrics_summary(
  p_file_ids uuid[] default '{}'
)
returns integer
language plpgsql
as $$
declare
  affected integer := 0;
begin
  delete from public.desvios_pnr_metrics_summary m
  where coalesce(cardinality(p_file_ids), 0) = 0
     or m.file_id = any(p_file_ids);

  insert into public.desvios_pnr_metrics_summary (
    file_id,
    month_key,
    quinzena_key,
    competencia_label,
    status_normalizado,
    tipo_base_label,
    estacao_origem,
    status_motorista,
    fonte_cruzamento,
    motorista_label,
    motorista_detail,
    id_rota,
    row_count,
    total_value,
    updated_at
  )
  select
    r.file_id,
    coalesce(
      r.month_key,
      case
        when r.ano ~ '^[0-9]{4}$' and r.mes ~ '^[0-9]{1,2}$'
          then r.ano || '-' || lpad(r.mes, 2, '0')
        else public.pnr_month_key(r.ano, r.mes, r.competencia, coalesce(r.source_periodo, r.periodo_faturamento))
      end
    ) as month_key,
    coalesce(r.quinzena_key, public.pnr_quinzena_key(r.quinzena, r.quinzena_ref, r.periodo_label)) as quinzena_key,
    coalesce(nullif(min(r.competencia), ''), min(r.periodo_label), min(r.periodo_faturamento)) as competencia_label,
    coalesce(nullif(r.status_normalizado, ''), 'Indefinido') as status_normalizado,
    coalesce(nullif(r.tipo_base, ''), nullif(r.tipo_operacional, ''), 'Não identificada') as tipo_base_label,
    coalesce(nullif(r.estacao_origem, ''), 'Sem estação') as estacao_origem,
    coalesce(nullif(r.status_motorista, ''), 'Não identificado') as status_motorista,
    coalesce(nullif(r.fonte_cruzamento, ''), 'Não identificada') as fonte_cruzamento,
    coalesce(nullif(r.motorista_display, ''), nullif(r.nome_motorista, ''), nullif(r.id_motorista, ''), 'Sem motorista') as motorista_label,
    case when nullif(r.id_motorista, '') is not null then 'ID: ' || r.id_motorista else '' end as motorista_detail,
    coalesce(nullif(r.id_rota, ''), 'Sem rota') as id_rota,
    count(*)::integer as row_count,
    coalesce(sum(r.valor_compra), 0)::numeric as total_value,
    now()
  from public.desvios_pnr_records r
  where coalesce(cardinality(p_file_ids), 0) = 0
     or r.file_id = any(p_file_ids)
  group by
    r.file_id,
    coalesce(
      r.month_key,
      case
        when r.ano ~ '^[0-9]{4}$' and r.mes ~ '^[0-9]{1,2}$'
          then r.ano || '-' || lpad(r.mes, 2, '0')
        else public.pnr_month_key(r.ano, r.mes, r.competencia, coalesce(r.source_periodo, r.periodo_faturamento))
      end
    ),
    coalesce(r.quinzena_key, public.pnr_quinzena_key(r.quinzena, r.quinzena_ref, r.periodo_label)),
    coalesce(nullif(r.status_normalizado, ''), 'Indefinido'),
    coalesce(nullif(r.tipo_base, ''), nullif(r.tipo_operacional, ''), 'Não identificada'),
    coalesce(nullif(r.estacao_origem, ''), 'Sem estação'),
    coalesce(nullif(r.status_motorista, ''), 'Não identificado'),
    coalesce(nullif(r.fonte_cruzamento, ''), 'Não identificada'),
    coalesce(nullif(r.motorista_display, ''), nullif(r.nome_motorista, ''), nullif(r.id_motorista, ''), 'Sem motorista'),
    case when nullif(r.id_motorista, '') is not null then 'ID: ' || r.id_motorista else '' end,
    coalesce(nullif(r.id_rota, ''), 'Sem rota');

  get diagnostics affected = row_count;
  return affected;
end
$$;

grant execute on function public.refresh_desvios_pnr_metrics_summary(uuid[]) to authenticated;

select public.refresh_desvios_pnr_metrics_summary();

create or replace function public.desvios_pnr_summary(
  p_file_ids uuid[] default '{}',
  p_month_keys text[] default '{}',
  p_quinzenas text[] default '{}',
  p_statuses text[] default '{}',
  p_tipos text[] default '{}',
  p_estacoes text[] default '{}',
  p_status_motoristas text[] default '{}',
  p_fontes text[] default '{}',
  p_motoristas text[] default '{}',
  p_rotas text[] default '{}',
  p_search text default ''
)
returns jsonb
language sql
stable
as $$
  with scoped as not materialized (
    select *
    from public.desvios_pnr_metrics_summary m
    where coalesce(cardinality(p_file_ids), 0) = 0 or m.file_id = any(p_file_ids)
  ),
  filtered as not materialized (
    select *
    from scoped
    where (coalesce(cardinality(p_month_keys), 0) = 0 or month_key = any(p_month_keys))
      and (coalesce(cardinality(p_quinzenas), 0) = 0 or quinzena_key = any(p_quinzenas))
      and (coalesce(cardinality(p_statuses), 0) = 0 or status_normalizado = any(p_statuses))
      and (coalesce(cardinality(p_tipos), 0) = 0 or tipo_base_label = any(p_tipos))
      and (coalesce(cardinality(p_estacoes), 0) = 0 or estacao_origem = any(p_estacoes))
      and (coalesce(cardinality(p_status_motoristas), 0) = 0 or status_motorista = any(p_status_motoristas))
      and (coalesce(cardinality(p_fontes), 0) = 0 or fonte_cruzamento = any(p_fontes))
      and (coalesce(cardinality(p_motoristas), 0) = 0 or motorista_label = any(p_motoristas))
      and (coalesce(cardinality(p_rotas), 0) = 0 or id_rota = any(p_rotas))
      and (
        coalesce(btrim(p_search), '') = ''
        or concat_ws(' ',
          competencia_label, quinzena_key, status_normalizado, tipo_base_label,
          estacao_origem, status_motorista, fonte_cruzamento, motorista_label, id_rota
        ) ilike '%' || btrim(p_search) || '%'
      )
  ),
  totals as (
    select
      coalesce(sum(row_count), 0)::integer as total_count,
      coalesce(sum(total_value), 0)::numeric as total_value,
      case when coalesce(sum(row_count), 0) > 0 then coalesce(sum(total_value), 0)::numeric / sum(row_count)::numeric else 0 end as avg_value,
      coalesce(sum(row_count) filter (where status_normalizado = 'Anulado'), 0)::integer as anulado,
      coalesce(sum(row_count) filter (where status_normalizado = 'Enviado para faturamento'), 0)::integer as faturamento
    from filtered
  ),
  status_rows as (
    select status_normalizado as label, sum(row_count)::integer as count
    from filtered
    group by status_normalizado
    order by sum(row_count) desc
  ),
  operation_rows as (
    select tipo_base_label as label, sum(row_count)::integer as count
    from filtered
    group by tipo_base_label
    order by sum(row_count) desc
  ),
  station_rows as (
    select estacao_origem as label, sum(row_count)::integer as count, coalesce(sum(total_value), 0)::numeric as total_value
    from filtered
    group by estacao_origem
    order by sum(row_count) desc, coalesce(sum(total_value), 0) desc
    limit 10
  ),
  driver_rows as (
    select motorista_label as label, min(motorista_detail) as detail, sum(row_count)::integer as count, coalesce(sum(total_value), 0)::numeric as total_value
    from filtered
    group by motorista_label
    order by sum(row_count) desc, coalesce(sum(total_value), 0) desc
    limit 10
  ),
  evolution_source as (
    select month_key, coalesce(min(competencia_label), month_key) as label, sum(row_count)::integer as count, coalesce(sum(total_value), 0)::numeric as total_value
    from filtered
    where month_key ~ '^[0-9]{4}-[0-9]{2}$'
    group by month_key
    order by month_key desc
    limit 12
  ),
  month_options as (
    select month_key as key, coalesce(min(competencia_label), month_key) as label, substring(month_key from 1 for 4)::integer as year, substring(month_key from 6 for 2)::integer as month
    from scoped
    where month_key ~ '^[0-9]{4}-[0-9]{2}$'
    group by month_key
    order by month_key
  ),
  filter_options as (
    select
      (select jsonb_agg(label order by label) from (select status_normalizado as label from scoped where nullif(status_normalizado, '') is not null group by status_normalizado) s) as statuses,
      (select jsonb_agg(label order by label) from (select tipo_base_label as label from scoped where nullif(tipo_base_label, '') is not null group by tipo_base_label) t) as tipos,
      (select jsonb_agg(label order by label) from (select estacao_origem as label from scoped where nullif(estacao_origem, '') is not null group by estacao_origem order by sum(row_count) desc, estacao_origem limit 300) e) as estacoes,
      (select jsonb_agg(label order by label) from (select status_motorista as label from scoped where nullif(status_motorista, '') is not null group by status_motorista) sm) as status_motoristas,
      (select jsonb_agg(label order by label) from (select fonte_cruzamento as label from scoped where nullif(fonte_cruzamento, '') is not null group by fonte_cruzamento) f) as fontes_cruzamento,
      (select jsonb_agg(label order by label) from (select motorista_label as label from scoped where nullif(motorista_label, '') is not null group by motorista_label order by sum(row_count) desc, motorista_label limit 200) m) as motoristas,
      (select jsonb_agg(label order by label) from (select id_rota as label from scoped where nullif(id_rota, '') is not null group by id_rota order by sum(row_count) desc, id_rota limit 200) r) as rotas
  )
  select jsonb_build_object(
    'total', (select total_count from totals),
    'summary', jsonb_build_object(
      'count', (select total_count from totals),
      'totalValue', (select total_value from totals),
      'avgValue', (select avg_value from totals),
      'anulado', (select anulado from totals),
      'faturamento', (select faturamento from totals),
      'aberto', greatest((select total_count - anulado - faturamento from totals), 0)
    ),
    'statusRows', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'count', count, 'share', case when (select total_count from totals) > 0 then (count::numeric / (select total_count from totals)::numeric) * 100 else 0 end)) from status_rows), '[]'::jsonb),
    'operationRows', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'count', count, 'share', case when (select total_count from totals) > 0 then (count::numeric / (select total_count from totals)::numeric) * 100 else 0 end)) from operation_rows), '[]'::jsonb),
    'stationRows', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'count', count, 'totalValue', total_value, 'share', case when (select total_count from totals) > 0 then (count::numeric / (select total_count from totals)::numeric) * 100 else 0 end)) from station_rows), '[]'::jsonb),
    'driverRows', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'detail', detail, 'count', count, 'totalValue', total_value, 'share', case when (select total_count from totals) > 0 then (count::numeric / (select total_count from totals)::numeric) * 100 else 0 end)) from driver_rows), '[]'::jsonb),
    'evolutionRows', coalesce((select jsonb_agg(jsonb_build_object('key', month_key, 'label', label, 'year', substring(month_key from 1 for 4)::integer, 'month', substring(month_key from 6 for 2)::integer, 'count', count, 'totalValue', total_value) order by month_key) from evolution_source), '[]'::jsonb),
    'monthOptions', coalesce((select jsonb_agg(jsonb_build_object('key', key, 'label', label, 'year', year, 'month', month)) from month_options), '[]'::jsonb),
    'filterOptions', jsonb_build_object(
      'statuses', coalesce((select statuses from filter_options), '[]'::jsonb),
      'tipos', coalesce((select tipos from filter_options), '[]'::jsonb),
      'estacoes', coalesce((select estacoes from filter_options), '[]'::jsonb),
      'statusMotoristas', coalesce((select status_motoristas from filter_options), '[]'::jsonb),
      'fontesCruzamento', coalesce((select fontes_cruzamento from filter_options), '[]'::jsonb),
      'motoristas', coalesce((select motoristas from filter_options), '[]'::jsonb),
      'rotas', coalesce((select rotas from filter_options), '[]'::jsonb)
    )
  )
$$;

grant execute on function public.desvios_pnr_summary(uuid[], text[], text[], text[], text[], text[], text[], text[], text[], text[], text) to authenticated;
