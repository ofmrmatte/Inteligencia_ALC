-- RLS performance cleanup and core foreign-key indexes.

alter policy "Users can insert own profile"
on public.profiles
to authenticated
with check (
  (select auth.uid()) = id
  and coalesce(is_admin, false) = false
  and coalesce(role, 'user') = 'user'
);

drop policy if exists "Admins can read all profiles" on public.profiles;
drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read permitted profiles"
on public.profiles
for select
to authenticated
using (
  (select auth.uid()) = id
  or (select private.is_current_user_admin())
);

drop policy if exists "Admins can update profiles" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update permitted profiles"
on public.profiles
for update
to authenticated
using (
  (select auth.uid()) = id
  or (select private.is_current_user_admin())
)
with check (
  (select auth.uid()) = id
  or (select private.is_current_user_admin())
);

alter policy "Logged users can read dashboard files"
on public.dashboard_files
to authenticated
using ((select auth.uid()) is not null);

alter policy "Logged users can insert audit logs"
on public.audit_logs
to authenticated
with check ((select auth.uid()) = user_id);

alter policy "Logged users can read dashboard settings"
on public.dashboard_settings
to authenticated
using ((select auth.uid()) is not null);

drop policy if exists "Admins can manage dashboard metrics cache" on public.dashboard_metrics_cache;
create policy "Admins can insert dashboard metrics cache" on public.dashboard_metrics_cache for insert to authenticated with check ((select private.is_current_user_admin()));
create policy "Admins can update dashboard metrics cache" on public.dashboard_metrics_cache for update to authenticated using ((select private.is_current_user_admin())) with check ((select private.is_current_user_admin()));
create policy "Admins can delete dashboard metrics cache" on public.dashboard_metrics_cache for delete to authenticated using ((select private.is_current_user_admin()));

drop policy if exists "Admins can manage desvios pnr metrics" on public.desvios_pnr_metrics_summary;
create policy "Admins can insert desvios pnr metrics" on public.desvios_pnr_metrics_summary for insert to authenticated with check ((select private.is_current_user_admin()));
create policy "Admins can update desvios pnr metrics" on public.desvios_pnr_metrics_summary for update to authenticated using ((select private.is_current_user_admin())) with check ((select private.is_current_user_admin()));
create policy "Admins can delete desvios pnr metrics" on public.desvios_pnr_metrics_summary for delete to authenticated using ((select private.is_current_user_admin()));

drop policy if exists "Admins can manage desvios pnr records" on public.desvios_pnr_records;
create policy "Admins can insert desvios pnr records" on public.desvios_pnr_records for insert to authenticated with check ((select private.is_current_user_admin()));
create policy "Admins can update desvios pnr records" on public.desvios_pnr_records for update to authenticated using ((select private.is_current_user_admin())) with check ((select private.is_current_user_admin()));
create policy "Admins can delete desvios pnr records" on public.desvios_pnr_records for delete to authenticated using ((select private.is_current_user_admin()));

drop policy if exists "Admins can manage missing packages" on public.gestao_desvios_pacotes_faltantes;
create policy "Admins can insert missing packages" on public.gestao_desvios_pacotes_faltantes for insert to authenticated with check ((select private.is_current_user_admin()));
create policy "Admins can update missing packages" on public.gestao_desvios_pacotes_faltantes for update to authenticated using ((select private.is_current_user_admin())) with check ((select private.is_current_user_admin()));
create policy "Admins can delete missing packages" on public.gestao_desvios_pacotes_faltantes for delete to authenticated using ((select private.is_current_user_admin()));

drop policy if exists "Admins can manage gestao pacotes records" on public.gestao_pacotes_records;
create policy "Admins can insert gestao pacotes records" on public.gestao_pacotes_records for insert to authenticated with check ((select private.is_current_user_admin()));
create policy "Admins can update gestao pacotes records" on public.gestao_pacotes_records for update to authenticated using ((select private.is_current_user_admin())) with check ((select private.is_current_user_admin()));
create policy "Admins can delete gestao pacotes records" on public.gestao_pacotes_records for delete to authenticated using ((select private.is_current_user_admin()));

drop policy if exists "Admins can manage pre fatura records" on public.pre_fatura_records;
create policy "Admins can insert pre fatura records" on public.pre_fatura_records for insert to authenticated with check ((select private.is_current_user_admin()));
create policy "Admins can update pre fatura records" on public.pre_fatura_records for update to authenticated using ((select private.is_current_user_admin())) with check ((select private.is_current_user_admin()));
create policy "Admins can delete pre fatura records" on public.pre_fatura_records for delete to authenticated using ((select private.is_current_user_admin()));

drop policy if exists "Admins can manage processed dashboard files" on public.processed_dashboard_files;
create policy "Admins can insert processed dashboard files" on public.processed_dashboard_files for insert to authenticated with check ((select private.is_current_user_admin()));
create policy "Admins can update processed dashboard files" on public.processed_dashboard_files for update to authenticated using ((select private.is_current_user_admin())) with check ((select private.is_current_user_admin()));
create policy "Admins can delete processed dashboard files" on public.processed_dashboard_files for delete to authenticated using ((select private.is_current_user_admin()));

create index if not exists idx_audit_logs_user_id on public.audit_logs(user_id);
create index if not exists idx_dashboard_files_uploaded_by on public.dashboard_files(uploaded_by);
create index if not exists idx_dashboard_settings_updated_by on public.dashboard_settings(updated_by);

drop index if exists public.idx_gestao_desvios_pf_dedupe;

analyze public.profiles;
analyze public.audit_logs;
analyze public.dashboard_files;
analyze public.dashboard_settings;
