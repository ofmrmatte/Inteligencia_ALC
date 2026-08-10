alter table public.gestao_desvios_pacotes_faltantes
alter column status_contato_meli set default 'E-mail Enviado';

update public.gestao_desvios_pacotes_faltantes
set
  status_caso = case
    when lower(status_caso) in ('resolvido', 'cancelado', 'concluido', 'concluído') then 'Concluído'
    when lower(status_caso) = 'em rota' then 'Em rota'
    else 'Pendente'
  end,
  status_contato_meli = case
    when lower(status_contato_meli) in ('concluido', 'concluído') then 'Concluído'
    when lower(status_contato_meli) like 'aguardando%' then 'Aguardando MELI'
    else 'E-mail Enviado'
  end
where
  status_caso not in ('Pendente', 'Concluído', 'Em rota')
  or status_contato_meli not in ('E-mail Enviado', 'Aguardando MELI', 'Concluído');

drop policy if exists "Admins can manage missing packages" on public.gestao_desvios_pacotes_faltantes;
drop policy if exists "Authenticated users can manage missing packages" on public.gestao_desvios_pacotes_faltantes;

create policy "Authenticated users can manage missing packages"
on public.gestao_desvios_pacotes_faltantes
for all
to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);
