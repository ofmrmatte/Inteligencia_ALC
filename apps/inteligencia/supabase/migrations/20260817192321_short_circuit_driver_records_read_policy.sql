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
