create or replace function app_private.enrich_operational_scope_on_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  resolved_base text;
  resolved_sigla text;
  match_count integer;
begin
  if exists (
    select 1
    from public.operational_units u
    where u.active = true
      and app_private.normalize_scope_text(u.sigla) = app_private.normalize_scope_text(new.sigla)
      and app_private.normalize_scope_text(u.base_key) = app_private.normalize_scope_text(new.base_key)
  ) then
    return new;
  end if;

  if coalesce(new.driver_id, '') <> '' then
    select count(distinct u.unit_key), min(u.base_key), min(u.sigla)
    into match_count, resolved_base, resolved_sigla
    from public.alc_drivers d
    join public.operational_units u
      on u.active = true
     and app_private.normalize_scope_text(d.base_key) = app_private.normalize_scope_text(u.base_key)
     and (coalesce(app_private.normalize_scope_text(d.sigla), '') = '' or app_private.normalize_scope_text(d.sigla) = app_private.normalize_scope_text(u.sigla))
    where d.driver_code = new.driver_id;

    if match_count = 1 then
      new.base_key := resolved_base;
      new.sigla := resolved_sigla;
      return new;
    end if;
  end if;

  select count(*), min(u.base_key), min(u.sigla)
  into match_count, resolved_base, resolved_sigla
  from public.operational_units u
  where u.active = true
    and app_private.normalize_scope_text(u.sigla) = app_private.normalize_scope_text(new.sigla);

  if match_count = 1 then
    new.base_key := resolved_base;
    new.sigla := resolved_sigla;
  end if;

  return new;
end
$function$;

drop trigger if exists pnr_enrich_operational_scope on public.pnr_records;
create trigger pnr_enrich_operational_scope
before insert or update of driver_id, sigla, base_key
on public.pnr_records
for each row
execute function app_private.enrich_operational_scope_on_write();

drop trigger if exists risk_enrich_operational_scope on public.risk_lm_records;
create trigger risk_enrich_operational_scope
before insert or update of driver_id, sigla, base_key
on public.risk_lm_records
for each row
execute function app_private.enrich_operational_scope_on_write();
