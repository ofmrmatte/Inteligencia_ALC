-- Documenta o contrato de contagem por arquivo:
-- row_count_read = linhas lidas do arquivo/parser
-- row_count_imported = linhas normalizadas aceitas para importação
-- row_count_persisted = linhas finais persistidas por módulo

with persisted as (
  select 'PRE_FATURA'::text as file_type, file_id, count(*)::int as persisted_rows
  from public.pre_fatura_records
  group by file_id
  union all
  select 'GESTAO_PACOTES', file_id, count(*)::int
  from public.gestao_pacotes_records
  group by file_id
  union all
  select 'DESVIOS_PNR', file_id, count(*)::int
  from public.desvios_pnr_records
  group by file_id
  union all
  select 'PACOTES_FALTANTES', source_file_id as file_id, count(*)::int
  from public.gestao_desvios_pacotes_faltantes
  group by source_file_id
),
dashboard_counts as (
  select
    d.id,
    d.file_name,
    d.file_type,
    case d.file_type
      when 'PRE_FATURA' then 'pre_fatura'
      when 'GESTAO_PACOTES' then 'gestao_pacotes'
      when 'DESVIOS_PNR' then 'desvios_pnr'
      when 'PACOTES_FALTANTES' then 'pacotes_faltantes'
      else ''
    end as module_key,
    d.metadata->>'file_hash' as file_hash,
    coalesce(p.persisted_rows, 0) as persisted_rows,
    coalesce(
      nullif(d.metadata->>'row_count_read', '')::int,
      nullif(d.metadata->>'total_rows_read', '')::int,
      nullif(d.metadata->>'original_rows', '')::int,
      nullif(d.metadata->>'parsed_rows', '')::int,
      coalesce(p.persisted_rows, 0)
    ) as rows_read,
    coalesce(
      nullif(d.metadata->>'row_count_imported', '')::int,
      nullif(d.metadata->>'total_rows_imported', '')::int,
      nullif(d.metadata->>'consolidated_rows', '')::int,
      nullif(d.metadata->>'record_count', '')::int,
      nullif(d.metadata->>'parsed_rows', '')::int,
      coalesce(p.persisted_rows, 0)
    ) as rows_imported
  from public.dashboard_files d
  left join persisted p on p.file_type = d.file_type and p.file_id = d.id
)
update public.dashboard_files d
set
  metadata = coalesce(d.metadata, '{}'::jsonb) || jsonb_build_object(
    'row_count_read', c.rows_read,
    'row_count_imported', c.rows_imported,
    'row_count_persisted', c.persisted_rows,
    'row_count_contract', 'read/imported/persisted',
    'row_count_reconciliation_status', case when c.rows_imported = c.persisted_rows then 'aligned' else 'deduped' end,
    'row_count_reconciliation_note', case
      when c.rows_imported = c.persisted_rows then 'Linhas importadas e persistidas estão alinhadas.'
      else 'Diferença esperada por dedupe, atualização ou reprocessamento; a tela usa linhas persistidas como fonte final.'
    end,
    'row_count_delta_read_to_imported', greatest(c.rows_read - c.rows_imported, 0),
    'row_count_delta_imported_to_persisted', greatest(c.rows_imported - c.persisted_rows, 0),
    'row_count_reconciled_at', now()
  ),
  updated_at = now()
from dashboard_counts c
where d.id = c.id;

with persisted as (
  select 'PRE_FATURA'::text as file_type, file_id, count(*)::int as persisted_rows
  from public.pre_fatura_records
  group by file_id
  union all
  select 'GESTAO_PACOTES', file_id, count(*)::int
  from public.gestao_pacotes_records
  group by file_id
  union all
  select 'DESVIOS_PNR', file_id, count(*)::int
  from public.desvios_pnr_records
  group by file_id
  union all
  select 'PACOTES_FALTANTES', source_file_id as file_id, count(*)::int
  from public.gestao_desvios_pacotes_faltantes
  group by source_file_id
),
dashboard_counts as (
  select
    d.id,
    d.file_name,
    case d.file_type
      when 'PRE_FATURA' then 'pre_fatura'
      when 'GESTAO_PACOTES' then 'gestao_pacotes'
      when 'DESVIOS_PNR' then 'desvios_pnr'
      when 'PACOTES_FALTANTES' then 'pacotes_faltantes'
      else ''
    end as module_key,
    d.metadata->>'file_hash' as file_hash,
    coalesce(p.persisted_rows, 0) as persisted_rows,
    coalesce(
      nullif(d.metadata->>'row_count_read', '')::int,
      nullif(d.metadata->>'total_rows_read', '')::int,
      nullif(d.metadata->>'original_rows', '')::int,
      nullif(d.metadata->>'parsed_rows', '')::int,
      coalesce(p.persisted_rows, 0)
    ) as rows_read,
    coalesce(
      nullif(d.metadata->>'row_count_imported', '')::int,
      nullif(d.metadata->>'total_rows_imported', '')::int,
      nullif(d.metadata->>'consolidated_rows', '')::int,
      nullif(d.metadata->>'record_count', '')::int,
      nullif(d.metadata->>'parsed_rows', '')::int,
      coalesce(p.persisted_rows, 0)
    ) as rows_imported
  from public.dashboard_files d
  left join persisted p on p.file_type = d.file_type and p.file_id = d.id
),
matched as (
  select distinct on (pdf.id)
    pdf.id,
    c.rows_read,
    c.rows_imported,
    c.persisted_rows
  from public.processed_dashboard_files pdf
  join dashboard_counts c on
    (pdf.metadata->>'dashboard_file_id' = c.id::text)
    or (pdf.metadata->>'file_id' = c.id::text)
    or (pdf.module_key = c.module_key and nullif(pdf.file_hash, '') is not null and pdf.file_hash = c.file_hash)
    or (pdf.module_key = c.module_key and lower(pdf.file_name) = lower(c.file_name))
  order by pdf.id, c.persisted_rows desc
)
update public.processed_dashboard_files pdf
set
  row_count = m.persisted_rows,
  metadata = coalesce(pdf.metadata, '{}'::jsonb) || jsonb_build_object(
    'row_count_read', m.rows_read,
    'row_count_imported', m.rows_imported,
    'row_count_persisted', m.persisted_rows,
    'row_count_contract', 'read/imported/persisted',
    'row_count_reconciliation_status', case when m.rows_imported = m.persisted_rows then 'aligned' else 'deduped' end,
    'row_count_reconciliation_note', case
      when m.rows_imported = m.persisted_rows then 'Linhas importadas e persistidas estão alinhadas.'
      else 'Diferença esperada por dedupe, atualização ou reprocessamento; a tela usa linhas persistidas como fonte final.'
    end,
    'row_count_delta_read_to_imported', greatest(m.rows_read - m.rows_imported, 0),
    'row_count_delta_imported_to_persisted', greatest(m.rows_imported - m.persisted_rows, 0),
    'row_count_reconciled_at', now()
  )
from matched m
where pdf.id = m.id;

analyze public.dashboard_files;
analyze public.processed_dashboard_files;
