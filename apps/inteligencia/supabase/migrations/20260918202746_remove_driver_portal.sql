begin;

create schema if not exists alc_cleanup_backup_20260918;
revoke all on schema alc_cleanup_backup_20260918 from public, anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'admin_base_assignment_history',
    'admin_base_assignments',
    'driver_dispute_messages',
    'driver_disputes',
    'driver_notifications',
    'driver_payment_batches',
    'driver_payment_document_versions',
    'driver_payment_documents',
    'driver_portal_audit_events',
    'driver_portal_auth_attempts',
    'driver_portal_base_access',
    'driver_portal_credentials',
    'driver_portal_sessions',
    'driver_portal_setup_tokens'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is not null
      and to_regclass(format('alc_cleanup_backup_20260918.%I', table_name)) is null then
      execute format(
        'create table alc_cleanup_backup_20260918.%I as table public.%I',
        table_name,
        table_name
      );
    end if;
  end loop;
end;
$$;

create table if not exists alc_cleanup_backup_20260918.alc_drivers_portal_fields as
select
  id,
  auth_user_id,
  cpf_last4,
  activation_code_hash,
  portal_login,
  status,
  activated_at,
  last_seen_at,
  portal_status,
  portal_eligible
from public.alc_drivers;

create table if not exists alc_cleanup_backup_20260918.profiles_driver_management_scope as
select id, role, module_scope, driver_management_scope
from public.profiles;

create table if not exists alc_cleanup_backup_20260918.driver_payments_bucket as
select * from storage.buckets where id = 'driver-payments';

create table if not exists alc_cleanup_backup_20260918.driver_payments_storage_objects as
select * from storage.objects where bucket_id = 'driver-payments';

revoke all on all tables in schema alc_cleanup_backup_20260918 from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  display_name text;
begin
  display_name := coalesce(
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'name', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Usuário ALC'
  );

  insert into public.profiles (
    id,
    email,
    name,
    full_name,
    role,
    is_admin,
    setor,
    active,
    global_access,
    base_scope,
    sigla_scope,
    module_scope
  )
  values (
    new.id,
    new.email,
    display_name,
    display_name,
    'coordinator',
    false,
    'LOSS',
    false,
    false,
    '{}'::text[],
    '{}'::text[],
    '{}'::text[]
  )
  on conflict (id) do update
  set
    email = excluded.email,
    name = coalesce(nullif(public.profiles.name, ''), excluded.name),
    full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
    updated_at = now();

  return new;
end;
$$;

update public.profiles
set module_scope = array_remove(module_scope, 'gestao-motoristas')
where 'gestao-motoristas' = any(module_scope);

drop policy if exists "bases scoped read" on public.operational_bases;
create policy "bases scoped read"
on public.operational_bases
for select
to authenticated
using (
  (select app_private.can_manage_imports())
  or app_private.can_read_scope(sigla, base_key)
);

drop policy if exists "operational units scoped read" on public.operational_units;
create policy "operational units scoped read"
on public.operational_units
for select
to authenticated
using (
  (select app_private.can_manage_imports())
  or app_private.can_read_scope(sigla, base_key)
);

drop policy if exists "drivers scoped read" on public.alc_drivers;
create policy "drivers scoped read"
on public.alc_drivers
for select
to authenticated
using (
  (select app_private.can_manage_imports())
  or app_private.can_read_scope(sigla, base_key)
);

drop policy if exists "drivers admin insert" on public.alc_drivers;
create policy "drivers admin insert"
on public.alc_drivers
for insert
to authenticated
with check ((select app_private.has_global_internal_access()));

drop policy if exists "drivers admin update" on public.alc_drivers;
create policy "drivers admin update"
on public.alc_drivers
for update
to authenticated
using ((select app_private.has_global_internal_access()))
with check ((select app_private.has_global_internal_access()));

drop policy if exists "drivers admin delete" on public.alc_drivers;
create policy "drivers admin delete"
on public.alc_drivers
for delete
to authenticated
using ((select app_private.has_global_internal_access()));

drop function if exists public.set_driver_portal_base_access(text, boolean, uuid);
drop trigger if exists trg_driver_dispute_protocol on public.driver_disputes;

drop table if exists public.driver_dispute_messages;
drop table if exists public.driver_notifications;
drop table if exists public.driver_disputes;

alter table if exists public.driver_payment_documents
  drop constraint if exists driver_payment_documents_active_version_id_fkey;
drop table if exists public.driver_payment_document_versions;
drop table if exists public.driver_payment_documents;
drop table if exists public.driver_payment_batches;

drop table if exists public.driver_portal_audit_events;
drop table if exists public.driver_portal_auth_attempts;
drop table if exists public.driver_portal_sessions;
drop table if exists public.driver_portal_setup_tokens;
drop table if exists public.driver_portal_credentials;
drop table if exists public.driver_portal_base_access;

drop table if exists public.admin_base_assignment_history;
drop table if exists public.admin_base_assignments;

drop function if exists app_private.ensure_driver_dispute_protocol();
drop function if exists app_private.can_manage_driver_base(text);

alter table public.profiles
  drop column if exists driver_management_scope;

alter table public.alc_drivers
  drop column if exists auth_user_id,
  drop column if exists cpf_last4,
  drop column if exists activation_code_hash,
  drop column if exists portal_login,
  drop column if exists status,
  drop column if exists activated_at,
  drop column if exists last_seen_at,
  drop column if exists portal_status,
  drop column if exists portal_eligible;

comment on schema alc_cleanup_backup_20260918 is
  'Restricted pre-removal backup of the retired Driver Portal module. Not exposed through the Data API.';

commit;
