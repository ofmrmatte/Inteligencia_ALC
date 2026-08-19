create index if not exists pnr_records_created_order_idx on public.pnr_records(created_at desc, id desc);
create index if not exists prefatura_records_created_order_idx on public.prefatura_records(created_at desc, id desc);
create index if not exists risk_lm_records_created_order_idx on public.risk_lm_records(created_at desc, id desc);
create index if not exists driver_records_created_order_idx on public.driver_records(created_at desc, id desc);
create index if not exists hierarchy_scopes_created_order_idx on public.hierarchy_scopes(created_at desc, id desc);

drop policy if exists "pnr scoped read" on public.pnr_records;
create policy "pnr scoped read"
on public.pnr_records
for select
to authenticated
using ((select app_private.can_manage_imports()) or app_private.can_read_scope(sigla, base_key));

drop policy if exists "prefatura scoped read" on public.prefatura_records;
create policy "prefatura scoped read"
on public.prefatura_records
for select
to authenticated
using ((select app_private.can_manage_imports()) or app_private.can_read_scope(sigla, base_key));

drop policy if exists "risk scoped read" on public.risk_lm_records;
create policy "risk scoped read"
on public.risk_lm_records
for select
to authenticated
using ((select app_private.can_manage_imports()) or app_private.can_read_scope(sigla, base_key));
