-- Diagnostico seguro: nao remove dados.
-- Execute no SQL Editor do Supabase para comparar duplicidade real no banco
-- com duplicidade visual/agregada no painel.

select
  count(*) as total_registros,
  count(distinct dedupe_key) as total_dedupe_key_distinto,
  count(*) - count(distinct dedupe_key) as duplicados_por_dedupe_key
from public.desvios_pnr_records;

select
  dedupe_key,
  count(*) as ocorrencias,
  array_agg(id order by created_at desc nulls last) as ids,
  array_agg(file_id order by created_at desc nulls last) as file_ids
from public.desvios_pnr_records
where nullif(dedupe_key, '') is not null
group by dedupe_key
having count(*) > 1
order by ocorrencias desc, dedupe_key
limit 100;

select
  coalesce(id_envio, '') as id_envio,
  coalesce(id_reclamacao, '') as id_reclamacao,
  coalesce(competencia, '') as competencia,
  count(*) as ocorrencias,
  array_agg(id order by created_at desc nulls last) as ids
from public.desvios_pnr_records
group by
  coalesce(id_envio, ''),
  coalesce(id_reclamacao, ''),
  coalesce(competencia, '')
having count(*) > 1
order by ocorrencias desc
limit 100;

select
  count(*) as total_metricas,
  coalesce(sum(row_count), 0) as soma_row_count_metricas
from public.desvios_pnr_metrics_summary;

select
  coalesce(file_id, '00000000-0000-0000-0000-000000000000'::uuid) as file_id,
  coalesce(month_key, '') as month_key,
  coalesce(quinzena_key, '') as quinzena_key,
  coalesce(status_normalizado, '') as status_normalizado,
  coalesce(tipo_base_label, '') as tipo_base_label,
  coalesce(estacao_origem, '') as estacao_origem,
  coalesce(status_motorista, '') as status_motorista,
  coalesce(fonte_cruzamento, '') as fonte_cruzamento,
  coalesce(motorista_label, '') as motorista_label,
  coalesce(motorista_detail, '') as motorista_detail,
  coalesce(id_rota, '') as id_rota,
  count(*) as metricas_duplicadas,
  sum(row_count) as soma_row_count
from public.desvios_pnr_metrics_summary
group by
  coalesce(file_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(month_key, ''),
  coalesce(quinzena_key, ''),
  coalesce(status_normalizado, ''),
  coalesce(tipo_base_label, ''),
  coalesce(estacao_origem, ''),
  coalesce(status_motorista, ''),
  coalesce(fonte_cruzamento, ''),
  coalesce(motorista_label, ''),
  coalesce(motorista_detail, ''),
  coalesce(id_rota, '')
having count(*) > 1
order by metricas_duplicadas desc
limit 100;
