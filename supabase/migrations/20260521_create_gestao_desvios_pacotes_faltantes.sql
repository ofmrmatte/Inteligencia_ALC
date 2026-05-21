create table if not exists public.gestao_desvios_pacotes_faltantes (
  id uuid primary key default gen_random_uuid(),
  data_fechamento date not null,
  base text not null,
  tipo_base text not null default 'XPT',
  driver_nome text not null,
  id_envio text not null,
  caso text not null default 'Pacote faltante',
  motivo_original text not null default 'Faltante',
  status_caso text not null default 'Pendente',
  status_contato_meli text not null default 'Em tratativa',
  prazo_tratativa timestamp with time zone not null,
  situacao_prazo text,
  imported_at timestamp with time zone not null default now(),
  imported_by text,
  source_hash text,
  dedupe_key text not null,
  updated_at timestamp with time zone not null default now(),
  status_updated_at timestamp with time zone,
  contato_updated_at timestamp with time zone,
  unique (dedupe_key)
);

create index if not exists idx_gestao_desvios_pf_id_envio
on public.gestao_desvios_pacotes_faltantes(id_envio);

create index if not exists idx_gestao_desvios_pf_data
on public.gestao_desvios_pacotes_faltantes(data_fechamento);

create index if not exists idx_gestao_desvios_pf_base
on public.gestao_desvios_pacotes_faltantes(base);

create index if not exists idx_gestao_desvios_pf_driver
on public.gestao_desvios_pacotes_faltantes(driver_nome);

create index if not exists idx_gestao_desvios_pf_status_caso
on public.gestao_desvios_pacotes_faltantes(status_caso);

create index if not exists idx_gestao_desvios_pf_status_meli
on public.gestao_desvios_pacotes_faltantes(status_contato_meli);

create index if not exists idx_gestao_desvios_pf_prazo
on public.gestao_desvios_pacotes_faltantes(prazo_tratativa);

create index if not exists idx_gestao_desvios_pf_situacao_prazo
on public.gestao_desvios_pacotes_faltantes(situacao_prazo);

create unique index if not exists idx_gestao_desvios_pf_dedupe
on public.gestao_desvios_pacotes_faltantes(dedupe_key);

alter table public.gestao_desvios_pacotes_faltantes enable row level security;

drop policy if exists "Logged users can read missing packages" on public.gestao_desvios_pacotes_faltantes;
drop policy if exists "Admins can manage missing packages" on public.gestao_desvios_pacotes_faltantes;

create policy "Logged users can read missing packages"
on public.gestao_desvios_pacotes_faltantes
for select
to authenticated
using ((select auth.uid()) is not null);

create policy "Admins can manage missing packages"
on public.gestao_desvios_pacotes_faltantes
for all
to authenticated
using ((select public.is_current_user_admin()))
with check ((select public.is_current_user_admin()));
