create or replace function public.add_weekday_hours(p_start timestamptz, p_hours integer)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  v_cursor timestamptz := coalesce(p_start, now());
  v_remaining interval := make_interval(hours => greatest(coalesce(p_hours, 0), 0));
  v_next_midnight timestamptz;
  v_step interval;
begin
  while extract(isodow from v_cursor) in (6, 7) loop
    v_cursor := v_cursor + interval '1 day';
  end loop;

  while v_remaining > interval '0 seconds' loop
    while extract(isodow from v_cursor) in (6, 7) loop
      v_cursor := v_cursor + interval '1 day';
    end loop;

    v_next_midnight := date_trunc('day', v_cursor) + interval '1 day';
    v_step := least(v_remaining, v_next_midnight - v_cursor);
    v_cursor := v_cursor + v_step;
    v_remaining := v_remaining - v_step;

    -- v_cursor already points to the next day at midnight.
    -- The weekend guard at the top of the next loop moves it to Monday when needed.
  end loop;

  return v_cursor;
end;
$$;

alter table public.gestao_desvios_pacotes_faltantes
alter column status_contato_meli set default 'E-mail Enviado';

update public.gestao_desvios_pacotes_faltantes
set
  status_caso = case
    when public.processed_dedupe_norm(status_caso) in ('resolvido', 'cancelado', 'concluido') then 'Concluído'
    when public.processed_dedupe_norm(status_caso) = 'em rota' then 'Em rota'
    else 'Pendente'
  end,
  status_contato_meli = case
    when public.processed_dedupe_norm(status_contato_meli) = 'concluido' then 'Concluído'
    when public.processed_dedupe_norm(status_contato_meli) like 'aguardando%' then 'Aguardando MELI'
    else 'E-mail Enviado'
  end,
  prazo_tratativa = public.add_weekday_hours(coalesce(imported_at, updated_at, now()), 48),
  situacao_prazo = case
    when public.processed_dedupe_norm(status_caso) in ('resolvido', 'cancelado', 'concluido')
      or public.processed_dedupe_norm(status_contato_meli) = 'concluido'
      then 'Concluído'
    when public.add_weekday_hours(coalesce(imported_at, updated_at, now()), 48) <= now()
      then 'Vencido'
    when public.add_weekday_hours(coalesce(imported_at, updated_at, now()), 48) <= now() + interval '12 hours'
      then 'Próximo do vencimento'
    else 'Dentro do prazo'
  end,
  updated_at = now()
where true;

grant execute on function public.add_weekday_hours(timestamptz, integer) to authenticated;

analyze public.gestao_desvios_pacotes_faltantes;
