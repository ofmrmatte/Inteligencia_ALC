create or replace function app_private.can_read_driver_record(
  target_driver_id text,
  target_name text,
  record_sigla text,
  record_base_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Global internal profiles must short-circuit before any cross-table lookup.
  if app_private.has_global_internal_access() then
    return true;
  end if;

  if app_private.can_read_scope(record_sigla, record_base_key) then
    return true;
  end if;

  if coalesce(target_driver_id, '') <> '' then
    if exists (
      select 1
      from public.prefatura_records p
      where p.driver_id = target_driver_id
        and app_private.can_read_scope(p.sigla, p.base_key)
      limit 1
    ) then
      return true;
    end if;

    if exists (
      select 1
      from public.pnr_records p
      where p.driver_id = target_driver_id
        and app_private.can_read_scope(p.sigla, p.base_key)
      limit 1
    ) then
      return true;
    end if;

    if exists (
      select 1
      from public.risk_lm_records r
      where r.driver_id = target_driver_id
        and app_private.can_read_scope(r.sigla, r.base_key)
      limit 1
    ) then
      return true;
    end if;
  end if;

  if coalesce(target_name, '') <> '' and exists (
    select 1
    from public.prefatura_records p
    where app_private.normalize_scope_text(p.driver_name) = app_private.normalize_scope_text(target_name)
      and app_private.can_read_scope(p.sigla, p.base_key)
    limit 1
  ) then
    return true;
  end if;

  return false;
end;
$$;

drop policy if exists "drivers scoped read" on public.driver_records;
create policy "drivers scoped read"
on public.driver_records
for select
to authenticated
using (
  case
    when (select app_private.has_global_internal_access()) then true
    else app_private.can_read_driver_record(driver_id, name, sigla, base_key)
  end
);
