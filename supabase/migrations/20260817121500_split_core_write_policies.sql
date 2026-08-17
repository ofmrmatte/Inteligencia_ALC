drop policy if exists "imports full access write" on public.import_batches;
create policy "imports full access insert" on public.import_batches
  for insert to authenticated
  with check (app_private.has_global_internal_access());
create policy "imports full access update" on public.import_batches
  for update to authenticated
  using (app_private.has_global_internal_access())
  with check (app_private.has_global_internal_access());
create policy "imports full access delete" on public.import_batches
  for delete to authenticated
  using (app_private.has_global_internal_access());

drop policy if exists "hierarchy full access write" on public.hierarchy_scopes;
create policy "hierarchy full access insert" on public.hierarchy_scopes
  for insert to authenticated
  with check (app_private.has_global_internal_access());
create policy "hierarchy full access update" on public.hierarchy_scopes
  for update to authenticated
  using (app_private.has_global_internal_access())
  with check (app_private.has_global_internal_access());
create policy "hierarchy full access delete" on public.hierarchy_scopes
  for delete to authenticated
  using (app_private.has_global_internal_access());

drop policy if exists "prefatura full access write" on public.prefatura_records;
create policy "prefatura full access insert" on public.prefatura_records
  for insert to authenticated
  with check (app_private.has_global_internal_access());
create policy "prefatura full access update" on public.prefatura_records
  for update to authenticated
  using (app_private.has_global_internal_access())
  with check (app_private.has_global_internal_access());
create policy "prefatura full access delete" on public.prefatura_records
  for delete to authenticated
  using (app_private.has_global_internal_access());

drop policy if exists "pnr full access write" on public.pnr_records;
create policy "pnr full access insert" on public.pnr_records
  for insert to authenticated
  with check (app_private.has_global_internal_access());
create policy "pnr full access update" on public.pnr_records
  for update to authenticated
  using (app_private.has_global_internal_access())
  with check (app_private.has_global_internal_access());
create policy "pnr full access delete" on public.pnr_records
  for delete to authenticated
  using (app_private.has_global_internal_access());

drop policy if exists "risk full access write" on public.risk_lm_records;
create policy "risk full access insert" on public.risk_lm_records
  for insert to authenticated
  with check (app_private.has_global_internal_access());
create policy "risk full access update" on public.risk_lm_records
  for update to authenticated
  using (app_private.has_global_internal_access())
  with check (app_private.has_global_internal_access());
create policy "risk full access delete" on public.risk_lm_records
  for delete to authenticated
  using (app_private.has_global_internal_access());

drop policy if exists "drivers full access write" on public.driver_records;
create policy "drivers full access insert" on public.driver_records
  for insert to authenticated
  with check (app_private.has_global_internal_access());
create policy "drivers full access update" on public.driver_records
  for update to authenticated
  using (app_private.has_global_internal_access())
  with check (app_private.has_global_internal_access());
create policy "drivers full access delete" on public.driver_records
  for delete to authenticated
  using (app_private.has_global_internal_access());
