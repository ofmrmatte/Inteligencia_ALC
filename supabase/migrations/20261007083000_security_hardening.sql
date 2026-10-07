-- Security hardening for the Inteligencia ALC production project.
-- Limits SECURITY DEFINER exposure, fixes mutable search_path warnings,
-- and removes unnecessary grants from an audit table protected by RLS.

alter function public.alc_norm_unit_key(text)
  set search_path = public, pg_temp;

alter function public.resolve_alc_operational_unit(text, text)
  set search_path = public, pg_temp;

revoke all on function public.is_super_admin() from public, anon, authenticated;
grant execute on function public.is_super_admin() to service_role;

revoke all privileges on table public.reconciliation_merge_audit from anon, authenticated;
grant select, insert, update, delete on table public.reconciliation_merge_audit to service_role;
