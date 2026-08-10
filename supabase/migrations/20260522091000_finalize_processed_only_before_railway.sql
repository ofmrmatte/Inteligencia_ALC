create or replace function public.processed_dedupe_norm(value text)
returns text
language sql
immutable
set search_path = public
as $$
  select trim(regexp_replace(
    regexp_replace(
      upper(translate(coalesce(value, ''),
        'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
        'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn')),
      '[_./-]+', ' ', 'g'),
    '[^A-Z0-9]+', ' ', 'g'));
$$;

alter table public.pre_fatura_records
  add column if not exists module_key text not null default 'pre_fatura',
  add column if not exists dedupe_key text;

alter table public.gestao_pacotes_records
  add column if not exists module_key text not null default 'gestao_pacotes',
  add column if not exists dedupe_key text;

alter table public.desvios_pnr_records
  add column if not exists module_key text not null default 'desvios_pnr';

alter table public.gestao_desvios_pacotes_faltantes
  add column if not exists module_key text not null default 'pacotes_faltantes';

update public.pre_fatura_records
set module_key = 'pre_fatura',
    dedupe_key = concat_ws('|',
      'pre_fatura',
      public.processed_dedupe_norm(competencia),
      public.processed_dedupe_norm(quinzena),
      public.processed_dedupe_norm(coalesce(nullif(codigo_base, ''), base)),
      public.processed_dedupe_norm(coalesce(nullif(driver_normalizado, ''), driver)),
      public.processed_dedupe_norm(rota),
      public.processed_dedupe_norm(id_envio),
      public.processed_dedupe_norm(tipo),
      public.processed_dedupe_norm(aba_origem),
      public.processed_dedupe_norm(data::text),
      public.processed_dedupe_norm(coalesce(valor, 0)::numeric(14,2)::text)
    )
where module_key is distinct from 'pre_fatura'
   or nullif(dedupe_key, '') is null;

update public.gestao_pacotes_records
set module_key = 'gestao_pacotes',
    dedupe_key = concat_ws('|',
      'gestao_pacotes',
      public.processed_dedupe_norm(competencia),
      public.processed_dedupe_norm(quinzena),
      public.processed_dedupe_norm(coalesce(nullif(codigo_base, ''), base)),
      public.processed_dedupe_norm(coalesce(nullif(driver_normalizado, ''), driver)),
      public.processed_dedupe_norm(rota),
      public.processed_dedupe_norm(id_envio),
      public.processed_dedupe_norm(tipo),
      public.processed_dedupe_norm(desconto),
      public.processed_dedupe_norm(decisao_adm),
      public.processed_dedupe_norm(data::text),
      public.processed_dedupe_norm(coalesce(valor, 0)::numeric(14,2)::text)
    )
where module_key is distinct from 'gestao_pacotes'
   or nullif(dedupe_key, '') is null;

update public.desvios_pnr_records
set module_key = 'desvios_pnr'
where module_key is distinct from 'desvios_pnr';

update public.gestao_desvios_pacotes_faltantes
set module_key = 'pacotes_faltantes'
where module_key is distinct from 'pacotes_faltantes';

with ranked as (
  select id,
         row_number() over (partition by module_key, dedupe_key order by created_at, id) as rn
  from public.pre_fatura_records
  where nullif(dedupe_key, '') is not null
)
delete from public.pre_fatura_records target
using ranked
where target.id = ranked.id
  and ranked.rn > 1;

with ranked as (
  select id,
         row_number() over (partition by module_key, dedupe_key order by created_at, id) as rn
  from public.gestao_pacotes_records
  where nullif(dedupe_key, '') is not null
)
delete from public.gestao_pacotes_records target
using ranked
where target.id = ranked.id
  and ranked.rn > 1;

alter table public.pre_fatura_records
  alter column dedupe_key set not null;

alter table public.gestao_pacotes_records
  alter column dedupe_key set not null;

create unique index if not exists idx_pre_fatura_records_module_dedupe
  on public.pre_fatura_records(module_key, dedupe_key);

create unique index if not exists idx_gestao_pacotes_records_module_dedupe
  on public.gestao_pacotes_records(module_key, dedupe_key);

create index if not exists idx_desvios_pnr_records_module_key
  on public.desvios_pnr_records(module_key);

create index if not exists idx_gestao_desvios_pf_module_key
  on public.gestao_desvios_pacotes_faltantes(module_key);

update public.processed_dashboard_files
set module_key = case module_key
  when 'pre-fatura' then 'pre_fatura'
  when 'gestao-pacotes' then 'gestao_pacotes'
  when 'gestao-desvios-pnr' then 'desvios_pnr'
  when 'desvios-pnr' then 'desvios_pnr'
  when 'pacotes-faltantes' then 'pacotes_faltantes'
  else module_key
end
where module_key in ('pre-fatura', 'gestao-pacotes', 'gestao-desvios-pnr', 'desvios-pnr', 'pacotes-faltantes');

update public.dashboard_files
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
  'module_key', case file_type
    when 'PRE_FATURA' then 'pre_fatura'
    when 'GESTAO_PACOTES' then 'gestao_pacotes'
    when 'DESVIOS_PNR' then 'desvios_pnr'
    when 'PACOTES_FALTANTES' then 'pacotes_faltantes'
    else coalesce(metadata->>'module_key', '')
  end,
  'dashboard_module_key', case file_type
    when 'PRE_FATURA' then 'pre_fatura'
    when 'GESTAO_PACOTES' then 'gestao_pacotes'
    when 'DESVIOS_PNR' then 'desvios_pnr'
    when 'PACOTES_FALTANTES' then 'pacotes_faltantes'
    else coalesce(metadata->>'dashboard_module_key', '')
  end
)
where file_type in ('PRE_FATURA', 'GESTAO_PACOTES', 'DESVIOS_PNR', 'PACOTES_FALTANTES');

analyze public.pre_fatura_records;
analyze public.gestao_pacotes_records;
analyze public.desvios_pnr_records;
analyze public.gestao_desvios_pacotes_faltantes;
