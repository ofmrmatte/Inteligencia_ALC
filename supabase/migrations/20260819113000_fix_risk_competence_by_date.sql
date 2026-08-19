-- Risk LM competence is always derived from the real package failure date:
-- days 01..15 = 1Q, days 16..end = 2Q.
-- Some Mercado Livre/Excel exports encode DD/MM as an Excel date displayed with
-- an US-style mask. When the file name carries YYYYMMDD, repair the specific
-- month/day inversion only when it is unambiguous against that report month.

create or replace function app_private.normalize_risk_competence_on_write()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  batch_name text;
  report_parts text[];
  report_year integer;
  report_month integer;
  parsed_date date;
begin
  parsed_date := new.failure_date;

  if parsed_date is null then
    new.fortnight := null;
    new.month := null;
    return new;
  end if;

  select b.name into batch_name
  from public.import_batches b
  where b.id = new.batch_id;

  report_parts := regexp_match(coalesce(batch_name, ''), '(20[0-9]{2})(0[1-9]|1[0-2])([0-3][0-9])');

  if report_parts is not null then
    report_year := report_parts[1]::integer;
    report_month := report_parts[2]::integer;

    -- Example from an August report: Excel may store 02/08 as 2026-02-08.
    -- We only swap when the stored day equals the report month and the stored
    -- month differs from the report month, which avoids changing valid dates.
    if extract(year from parsed_date)::integer = report_year
       and extract(month from parsed_date)::integer <> report_month
       and extract(day from parsed_date)::integer = report_month
    then
      parsed_date := make_date(
        report_year,
        report_month,
        extract(month from parsed_date)::integer
      );
    end if;
  end if;

  new.failure_date := parsed_date;
  new.month := to_char(parsed_date, 'YYYY-MM');
  new.fortnight := case
    when extract(day from parsed_date)::integer <= 15
      then '01Q' || to_char(parsed_date, 'MMYYYY')
    else '02Q' || to_char(parsed_date, 'MMYYYY')
  end;

  return new;
end;
$$;

drop trigger if exists risk_normalize_competence_before_write on public.risk_lm_records;
create trigger risk_normalize_competence_before_write
before insert or update of failure_date, batch_id
on public.risk_lm_records
for each row
execute function app_private.normalize_risk_competence_on_write();

-- Keep the import batch summary aligned with the row-level competences. This is
-- important for Risk LM files that legitimately contain both 1Q and 2Q in the
-- same month: the history must show both quinzenas instead of "Competência não identificada".
create or replace function app_private.refresh_import_batch_competence(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_fortnights text[];
  v_months text[];
  v_fortnight text;
  v_month text;
begin
  if p_batch_id is null then
    return;
  end if;

  select
    coalesce(array_agg(distinct x.fortnight order by x.fortnight) filter (where coalesce(x.fortnight, '') <> ''), '{}'::text[]),
    coalesce(array_agg(distinct x.month order by x.month) filter (where coalesce(x.month, '') <> ''), '{}'::text[])
  into v_fortnights, v_months
  from (
    select fortnight, month from public.prefatura_records where batch_id = p_batch_id
    union all
    select fortnight, month from public.pnr_records where batch_id = p_batch_id
    union all
    select fortnight, month from public.risk_lm_records where batch_id = p_batch_id
  ) x;

  v_fortnight := case when cardinality(v_fortnights) = 1 then v_fortnights[1] else null end;
  v_month := case when cardinality(v_months) = 1 then v_months[1] else null end;

  update public.import_batches b
  set
    fortnight = v_fortnight,
    month = v_month,
    competence = v_month,
    fortnights = v_fortnights,
    months = v_months,
    metadata = coalesce(b.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'entry',
        coalesce(b.metadata->'entry', '{}'::jsonb)
          || jsonb_build_object(
            'fortnight', v_fortnight,
            'month', v_month,
            'fortnights', to_jsonb(v_fortnights),
            'months', to_jsonb(v_months)
          )
      )
  where b.id = p_batch_id;
end;
$$;

create or replace function app_private.refresh_risk_batches_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  batch_uuid uuid;
begin
  for batch_uuid in select distinct batch_id from new_rows where batch_id is not null
  loop
    perform app_private.refresh_import_batch_competence(batch_uuid);
  end loop;
  return null;
end;
$$;

create or replace function app_private.refresh_risk_batches_after_update()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  batch_uuid uuid;
begin
  for batch_uuid in
    select distinct batch_id
    from (
      select batch_id from new_rows
      union
      select batch_id from old_rows
    ) x
    where batch_id is not null
  loop
    perform app_private.refresh_import_batch_competence(batch_uuid);
  end loop;
  return null;
end;
$$;

drop trigger if exists risk_refresh_batch_competence_after_insert on public.risk_lm_records;
create trigger risk_refresh_batch_competence_after_insert
after insert on public.risk_lm_records
referencing new table as new_rows
for each statement
execute function app_private.refresh_risk_batches_after_insert();

drop trigger if exists risk_refresh_batch_competence_after_update on public.risk_lm_records;
create trigger risk_refresh_batch_competence_after_update
after update on public.risk_lm_records
referencing old table as old_rows new table as new_rows
for each statement
execute function app_private.refresh_risk_batches_after_update();

-- Speed up the operational-scope trigger used during bulk Risk LM imports.
create index if not exists pnr_driver_origin_station_norm_idx
  on public.pnr_records (driver_id, (app_private.normalize_scope_text(origin_station)))
  where driver_id is not null;

create index if not exists risk_driver_facility_norm_idx
  on public.risk_lm_records (driver_id, (app_private.normalize_scope_text(facility_id)))
  where driver_id is not null;

create index if not exists operational_units_scope_norm_idx
  on public.operational_units (
    (app_private.normalize_scope_text(sigla)),
    (app_private.normalize_scope_text(base_key))
  )
  where active = true;

-- Evaluate admin import permission once per write statement instead of once per row.
drop policy if exists "risk full access insert" on public.risk_lm_records;
create policy "risk full access insert"
on public.risk_lm_records
for insert
to authenticated
with check ((select app_private.can_manage_imports()));

drop policy if exists "risk full access update" on public.risk_lm_records;
create policy "risk full access update"
on public.risk_lm_records
for update
to authenticated
using ((select app_private.can_manage_imports()))
with check ((select app_private.can_manage_imports()));

drop policy if exists "risk full access delete" on public.risk_lm_records;
create policy "risk full access delete"
on public.risk_lm_records
for delete
to authenticated
using ((select app_private.can_manage_imports()));
