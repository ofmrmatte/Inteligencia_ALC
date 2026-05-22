alter table public.gestao_desvios_pacotes_faltantes
add column if not exists source_file_id uuid,
add column if not exists file_name text,
add column if not exists raw_data jsonb not null default '{}'::jsonb;

alter table public.gestao_desvios_pacotes_faltantes
alter column status_contato_meli set default 'Em tratativa';

update public.gestao_desvios_pacotes_faltantes
set status_contato_meli = 'Em tratativa'
where status_contato_meli in ('E-mail Enviado', 'Em Tratativa');

update public.gestao_desvios_pacotes_faltantes
set status_contato_meli = 'Aguardando Méli'
where status_contato_meli = 'Aguardando MELI';

create index if not exists idx_gestao_desvios_pf_source_file_id
on public.gestao_desvios_pacotes_faltantes(source_file_id);

create index if not exists idx_gestao_desvios_pf_file_name
on public.gestao_desvios_pacotes_faltantes(file_name);
