-- Corrige textos UTF-8 que foram persistidos após interpretação como Latin-1.
-- A rotina é conservadora: somente pares válidos C2/C3 + byte de continuação
-- são convertidos, preservando textos legítimos como CHAPADÃO e GUIMARÃES.

create or replace function app_private.repair_import_mojibake(input_text text)
returns text
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
declare
  result text := input_text;
  lead integer;
  trail integer;
  pass integer;
begin
  for pass in 1..3 loop
    for lead in 194..195 loop
      for trail in 128..191 loop
        result := replace(
          result,
          chr(lead) || chr(trail),
          convert_from(
            decode(lpad(to_hex(lead), 2, '0') || lpad(to_hex(trail), 2, '0'), 'hex'),
            'UTF8'
          )
        );
      end loop;
    end loop;
  end loop;

  -- Pontuação UTF-8 de três bytes interpretada como Latin-1.
  result := replace(result, chr(226) || chr(128) || chr(147), '–');
  result := replace(result, chr(226) || chr(128) || chr(148), '—');
  result := replace(result, chr(226) || chr(128) || chr(152), '‘');
  result := replace(result, chr(226) || chr(128) || chr(153), '’');
  result := replace(result, chr(226) || chr(128) || chr(156), '“');
  result := replace(result, chr(226) || chr(128) || chr(157), '”');
  result := replace(result, chr(226) || chr(128) || chr(166), '…');
  result := replace(result, chr(226) || chr(128) || chr(162), '•');

  return result;
end;
$$;

update public.pnr_records
set
  status = app_private.repair_import_mojibake(status),
  products = app_private.repair_import_mojibake(products),
  carrier = app_private.repair_import_mojibake(carrier),
  origin_station = app_private.repair_import_mojibake(origin_station),
  custom = app_private.repair_import_mojibake(custom)
where
  status is distinct from app_private.repair_import_mojibake(status)
  or products is distinct from app_private.repair_import_mojibake(products)
  or carrier is distinct from app_private.repair_import_mojibake(carrier)
  or origin_station is distinct from app_private.repair_import_mojibake(origin_station)
  or custom is distinct from app_private.repair_import_mojibake(custom);

update public.risk_lm_records
set
  item_description = app_private.repair_import_mojibake(item_description),
  destination_type = app_private.repair_import_mojibake(destination_type),
  carrier_name = app_private.repair_import_mojibake(carrier_name),
  failure_reason = app_private.repair_import_mojibake(failure_reason),
  last_substatus = app_private.repair_import_mojibake(last_substatus),
  route_status = app_private.repair_import_mojibake(route_status),
  vehicle_type = app_private.repair_import_mojibake(vehicle_type)
where
  item_description is distinct from app_private.repair_import_mojibake(item_description)
  or destination_type is distinct from app_private.repair_import_mojibake(destination_type)
  or carrier_name is distinct from app_private.repair_import_mojibake(carrier_name)
  or failure_reason is distinct from app_private.repair_import_mojibake(failure_reason)
  or last_substatus is distinct from app_private.repair_import_mojibake(last_substatus)
  or route_status is distinct from app_private.repair_import_mojibake(route_status)
  or vehicle_type is distinct from app_private.repair_import_mojibake(vehicle_type);

update public.prefatura_records
set
  base_label = app_private.repair_import_mojibake(base_label),
  base_name = app_private.repair_import_mojibake(base_name),
  driver_name = app_private.repair_import_mojibake(driver_name),
  description = app_private.repair_import_mojibake(description)
where
  base_label is distinct from app_private.repair_import_mojibake(base_label)
  or base_name is distinct from app_private.repair_import_mojibake(base_name)
  or driver_name is distinct from app_private.repair_import_mojibake(driver_name)
  or description is distinct from app_private.repair_import_mojibake(description);

update public.hierarchy_scopes
set
  coordinator_name = app_private.repair_import_mojibake(coordinator_name),
  supervisor_name = app_private.repair_import_mojibake(supervisor_name),
  base_name = app_private.repair_import_mojibake(base_name)
where
  coordinator_name is distinct from app_private.repair_import_mojibake(coordinator_name)
  or supervisor_name is distinct from app_private.repair_import_mojibake(supervisor_name)
  or base_name is distinct from app_private.repair_import_mojibake(base_name);

update public.driver_records
set
  name = app_private.repair_import_mojibake(name),
  experience = app_private.repair_import_mojibake(experience),
  state = app_private.repair_import_mojibake(state)
where
  name is distinct from app_private.repair_import_mojibake(name)
  or experience is distinct from app_private.repair_import_mojibake(experience)
  or state is distinct from app_private.repair_import_mojibake(state);

drop function app_private.repair_import_mojibake(text);
