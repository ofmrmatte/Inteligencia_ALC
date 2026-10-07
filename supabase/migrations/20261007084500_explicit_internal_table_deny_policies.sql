-- Make default-deny intent explicit for internal-only tables.
create policy "deny_client_access_discount_cases"
  on public.discount_cases
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_client_access_discount_case_events"
  on public.discount_case_events
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_client_access_reconciliation_merge_audit"
  on public.reconciliation_merge_audit
  for all
  to anon, authenticated
  using (false)
  with check (false);
