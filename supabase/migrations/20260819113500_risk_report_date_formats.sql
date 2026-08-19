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

  -- Accept YYYYMMDD, YYYY-MM-DD, YYYY_MM_DD and YYYY MM DD in report names.
  report_parts := regexp_match(
    coalesce(batch_name, ''),
    '(20[0-9]{2})[-_ ]?(0[1-9]|1[0-2])[-_ ]?([0-3][0-9])'
  );

  if report_parts is not null then
    report_year := report_parts[1]::integer;
    report_month := report_parts[2]::integer;

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