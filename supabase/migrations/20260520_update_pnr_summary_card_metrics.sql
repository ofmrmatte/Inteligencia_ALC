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
  classified as not materialized (
    select
      f.*,
      (lower(coalesce(f.status_normalizado, '')) like '%fatur%' or lower(coalesce(f.status_normalizado, '')) like '%cobr%') as is_faturado,
      (lower(coalesce(f.status_normalizado, '')) like '%anulad%' or lower(coalesce(f.status_normalizado, '')) like '%cancel%') as is_anulado
    from filtered f
  ),
  totals as (
    select
      coalesce(sum(row_count), 0)::integer as total_count,
      coalesce(sum(total_value), 0)::numeric as total_value,
      case when coalesce(sum(row_count), 0) > 0 then coalesce(sum(total_value), 0)::numeric / sum(row_count)::numeric else 0 end as avg_value,
      coalesce(sum(row_count) filter (where is_anulado), 0)::integer as anulado,
      coalesce(sum(total_value) filter (where is_anulado), 0)::numeric as valor_anulado,
      coalesce(sum(row_count) filter (where is_faturado), 0)::integer as faturamento,
      coalesce(sum(total_value) filter (where is_faturado), 0)::numeric as valor_faturado,
      coalesce(sum(row_count) filter (where not is_anulado and not is_faturado), 0)::integer as aberto_analise,
      coalesce(sum(total_value) filter (where not is_anulado and not is_faturado), 0)::numeric as valor_aberto_analise
    from classified
  ),
  status_rows as (
    select status_normalizado as label, sum(row_count)::integer as count, coalesce(sum(total_value), 0)::numeric as total_value
    from classified
    group by status_normalizado
    order by sum(row_count) desc
  ),
  operation_rows as (
    select tipo_base_label as label, sum(row_count)::integer as count
    from classified
    group by tipo_base_label
    order by sum(row_count) desc
  ),
  station_rows as (
    select estacao_origem as label, sum(row_count)::integer as count, coalesce(sum(total_value), 0)::numeric as total_value
    from classified
    group by estacao_origem
    order by sum(row_count) desc, coalesce(sum(total_value), 0) desc
    limit 10
  ),
  driver_rows as (
    select motorista_label as label, min(motorista_detail) as detail, sum(row_count)::integer as count, coalesce(sum(total_value), 0)::numeric as total_value
    from classified
    group by motorista_label
    order by sum(row_count) desc, coalesce(sum(total_value), 0) desc
    limit 10
  ),
  evolution_base as not materialized (
    select
      c.*,
      case
        when (
          coalesce(cardinality(p_month_keys), 0) = 1
          or coalesce(cardinality(p_quinzenas), 0) > 0
        ) then coalesce(nullif(c.quinzena_key, ''), 'month')
        else ''
      end as period_quinzena,
      (
        coalesce(cardinality(p_month_keys), 0) = 1
        or coalesce(cardinality(p_quinzenas), 0) > 0
      ) as use_quinzena_grain
    from classified c
    where c.month_key ~ '^[0-9]{4}-[0-9]{2}$'
  ),
  evolution_source as (
    select
      case
        when use_quinzena_grain then month_key || '|' || period_quinzena
        else month_key
      end as period_key,
      month_key,
      period_quinzena as quinzena_key,
      case
        when use_quinzena_grain then coalesce(min(competencia_label), month_key) || ' · ' ||
          case period_quinzena
            when 'q1' then '1Q'
            when 'q2' then '2Q'
            else 'Mês'
          end
        else coalesce(min(competencia_label), month_key)
      end as label,
      sum(row_count)::integer as count,
      coalesce(sum(total_value), 0)::numeric as total_value,
      coalesce(sum(total_value) filter (where is_anulado), 0)::numeric as valor_anulado,
      coalesce(sum(total_value) filter (where is_faturado), 0)::numeric as valor_faturado
    from evolution_base
    group by
      use_quinzena_grain,
      month_key,
      period_quinzena
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
      'valorAnulado', (select valor_anulado from totals),
      'faturamento', (select faturamento from totals),
      'valorFaturado', (select valor_faturado from totals),
      'aberto', (select aberto_analise from totals),
      'valorAberto', (select valor_aberto_analise from totals),
      'ticketMedioGeral', case when (select total_count from totals) > 0 then (select total_value from totals) / (select total_count from totals)::numeric else 0 end,
      'ticketMedioFaturado', case when (select faturamento from totals) > 0 then (select valor_faturado from totals) / (select faturamento from totals)::numeric else 0 end,
      'ticketMedioAnulado', case when (select anulado from totals) > 0 then (select valor_anulado from totals) / (select anulado from totals)::numeric else 0 end
    ),
    'statusRows', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'count', count, 'totalValue', total_value, 'share', case when (select total_count from totals) > 0 then (count::numeric / (select total_count from totals)::numeric) * 100 else 0 end)) from status_rows), '[]'::jsonb),
    'operationRows', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'count', count, 'share', case when (select total_count from totals) > 0 then (count::numeric / (select total_count from totals)::numeric) * 100 else 0 end)) from operation_rows), '[]'::jsonb),
    'stationRows', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'count', count, 'totalValue', total_value, 'share', case when (select total_count from totals) > 0 then (count::numeric / (select total_count from totals)::numeric) * 100 else 0 end)) from station_rows), '[]'::jsonb),
    'driverRows', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'detail', detail, 'count', count, 'totalValue', total_value, 'share', case when (select total_count from totals) > 0 then (count::numeric / (select total_count from totals)::numeric) * 100 else 0 end)) from driver_rows), '[]'::jsonb),
    'evolutionRows', coalesce((select jsonb_agg(jsonb_build_object(
      'key', period_key,
      'label', label,
      'year', substring(month_key from 1 for 4)::integer,
      'month', substring(month_key from 6 for 2)::integer,
      'quinzena', quinzena_key,
      'count', count,
      'totalValue', total_value,
      'valorAnulado', valor_anulado,
      'valorFaturado', valor_faturado,
      'saldoValue', valor_anulado - valor_faturado
    ) order by month_key, quinzena_key) from evolution_source), '[]'::jsonb),
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
