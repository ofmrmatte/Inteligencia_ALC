alter table public.discount_cases
  alter column last_operational_snapshot type json
  using last_operational_snapshot::json;
