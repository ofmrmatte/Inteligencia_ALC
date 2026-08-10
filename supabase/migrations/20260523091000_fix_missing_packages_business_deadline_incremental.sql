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
  end loop;

  return v_cursor;
end;
$$;

update public.gestao_desvios_pacotes_faltantes
set
  prazo_tratativa = public.add_weekday_hours(coalesce(imported_at, updated_at, now()), 48),
  situacao_prazo = case
    when public.processed_dedupe_norm(status_caso) = 'concluido'
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
