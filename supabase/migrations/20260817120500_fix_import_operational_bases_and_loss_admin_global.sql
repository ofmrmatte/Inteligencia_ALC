-- Corrige a compatibilidade do carregador genérico com operational_bases,
-- libera Administração Loss para todas as bases operacionais e para importações,
-- sem conceder gestão de usuários/perfis.

alter table public.operational_bases
  add column if not exists id text generated always as (base_key) stored;

create unique index if not exists operational_bases_id_uidx
  on public.operational_bases (id);

create or replace function app_private.can_manage_imports()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.role::text in ('director', 'developer', 'loss_supervisor', 'loss_admin', 'super_admin')
    ),
    false
  )
$$;

create or replace function app_private.can_read_scope(record_sigla text, record_base_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and (
          p.role::text in ('director', 'developer', 'loss_supervisor', 'loss_admin', 'super_admin')
          or (
            p.role::text in ('coordinator', 'supervisor')
            and (
              (coalesce(record_base_key, '') <> '' and record_base_key = any(coalesce(p.base_scope, '{}'::text[])))
              or
              (coalesce(record_sigla, '') <> '' and record_sigla = any(coalesce(p.sigla_scope, '{}'::text[])))
            )
          )
        )
    ),
    false
  )
$$;

create or replace function app_private.can_read_batch(target_batch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with current_profile as (
    select
      p.active,
      p.role::text as role,
      coalesce(p.base_scope, '{}'::text[]) as allowed_bases,
      coalesce(p.sigla_scope, '{}'::text[]) as allowed_siglas
    from public.profiles p
    where p.id = auth.uid()
    limit 1
  ),
  batch_scope as (
    select h.base_key, h.sigla from public.hierarchy_scopes h where h.batch_id = target_batch_id
    union all
    select p.base_key, p.sigla from public.prefatura_records p where p.batch_id = target_batch_id
    union all
    select p.base_key, p.sigla from public.pnr_records p where p.batch_id = target_batch_id
    union all
    select r.base_key, r.sigla from public.risk_lm_records r where r.batch_id = target_batch_id
  )
  select coalesce(
    exists (
      select 1
      from current_profile cp
      where cp.active = true
        and (
          cp.role in ('director', 'developer', 'loss_supervisor', 'loss_admin', 'super_admin')
          or (
            cp.role in ('coordinator', 'supervisor')
            and exists (
              select 1
              from batch_scope bs
              where (coalesce(bs.base_key, '') <> '' and bs.base_key = any(cp.allowed_bases))
                 or (coalesce(bs.sigla, '') <> '' and bs.sigla = any(cp.allowed_siglas))
            )
          )
        )
    ),
    false
  )
$$;

create or replace function app_private.can_read_driver_record(
  target_driver_id text,
  target_name text,
  record_sigla text,
  record_base_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with current_profile as (
    select
      p.active,
      p.role::text as role,
      coalesce(p.base_scope, '{}'::text[]) as allowed_bases,
      coalesce(p.sigla_scope, '{}'::text[]) as allowed_siglas
    from public.profiles p
    where p.id = auth.uid()
    limit 1
  )
  select coalesce(
    exists (
      select 1
      from current_profile cp
      where cp.active = true
        and (
          cp.role in ('director', 'developer', 'loss_supervisor', 'loss_admin', 'super_admin')
          or (
            cp.role in ('coordinator', 'supervisor')
            and (
              (coalesce(record_base_key, '') <> '' and record_base_key = any(cp.allowed_bases))
              or (coalesce(record_sigla, '') <> '' and record_sigla = any(cp.allowed_siglas))
              or exists (
                select 1 from public.prefatura_records p
                where coalesce(target_driver_id, '') <> ''
                  and p.driver_id = target_driver_id
                  and (
                    (coalesce(p.base_key, '') <> '' and p.base_key = any(cp.allowed_bases))
                    or (coalesce(p.sigla, '') <> '' and p.sigla = any(cp.allowed_siglas))
                  )
              )
              or exists (
                select 1 from public.pnr_records p
                where coalesce(target_driver_id, '') <> ''
                  and p.driver_id = target_driver_id
                  and (
                    (coalesce(p.base_key, '') <> '' and p.base_key = any(cp.allowed_bases))
                    or (coalesce(p.sigla, '') <> '' and p.sigla = any(cp.allowed_siglas))
                  )
              )
              or exists (
                select 1 from public.risk_lm_records r
                where coalesce(target_driver_id, '') <> ''
                  and r.driver_id = target_driver_id
                  and (
                    (coalesce(r.base_key, '') <> '' and r.base_key = any(cp.allowed_bases))
                    or (coalesce(r.sigla, '') <> '' and r.sigla = any(cp.allowed_siglas))
                  )
              )
              or exists (
                select 1 from public.prefatura_records p
                where coalesce(target_name, '') <> ''
                  and app_private.normalize_scope_text(p.driver_name) = app_private.normalize_scope_text(target_name)
                  and (
                    (coalesce(p.base_key, '') <> '' and p.base_key = any(cp.allowed_bases))
                    or (coalesce(p.sigla, '') <> '' and p.sigla = any(cp.allowed_siglas))
                  )
              )
            )
          )
        )
    ),
    false
  )
$$;

update public.profiles
set global_access = true,
    updated_at = now()
where role::text = 'loss_admin';

-- Escrita dos lotes operacionais: inclui Administração Loss, mas não altera
-- a policy de profiles, portanto não ganha gestão de usuários.

drop policy if exists "imports full access insert" on public.import_batches;
drop policy if exists "imports full access update" on public.import_batches;
drop policy if exists "imports full access delete" on public.import_batches;
create policy "imports full access insert" on public.import_batches for insert to authenticated with check (app_private.can_manage_imports());
create policy "imports full access update" on public.import_batches for update to authenticated using (app_private.can_manage_imports()) with check (app_private.can_manage_imports());
create policy "imports full access delete" on public.import_batches for delete to authenticated using (app_private.can_manage_imports());

drop policy if exists "hierarchy full access insert" on public.hierarchy_scopes;
drop policy if exists "hierarchy full access update" on public.hierarchy_scopes;
drop policy if exists "hierarchy full access delete" on public.hierarchy_scopes;
create policy "hierarchy full access insert" on public.hierarchy_scopes for insert to authenticated with check (app_private.can_manage_imports());
create policy "hierarchy full access update" on public.hierarchy_scopes for update to authenticated using (app_private.can_manage_imports()) with check (app_private.can_manage_imports());
create policy "hierarchy full access delete" on public.hierarchy_scopes for delete to authenticated using (app_private.can_manage_imports());

drop policy if exists "prefatura full access insert" on public.prefatura_records;
drop policy if exists "prefatura full access update" on public.prefatura_records;
drop policy if exists "prefatura full access delete" on public.prefatura_records;
create policy "prefatura full access insert" on public.prefatura_records for insert to authenticated with check (app_private.can_manage_imports());
create policy "prefatura full access update" on public.prefatura_records for update to authenticated using (app_private.can_manage_imports()) with check (app_private.can_manage_imports());
create policy "prefatura full access delete" on public.prefatura_records for delete to authenticated using (app_private.can_manage_imports());

drop policy if exists "pnr full access insert" on public.pnr_records;
drop policy if exists "pnr full access update" on public.pnr_records;
drop policy if exists "pnr full access delete" on public.pnr_records;
create policy "pnr full access insert" on public.pnr_records for insert to authenticated with check (app_private.can_manage_imports());
create policy "pnr full access update" on public.pnr_records for update to authenticated using (app_private.can_manage_imports()) with check (app_private.can_manage_imports());
create policy "pnr full access delete" on public.pnr_records for delete to authenticated using (app_private.can_manage_imports());

drop policy if exists "risk full access insert" on public.risk_lm_records;
drop policy if exists "risk full access update" on public.risk_lm_records;
drop policy if exists "risk full access delete" on public.risk_lm_records;
create policy "risk full access insert" on public.risk_lm_records for insert to authenticated with check (app_private.can_manage_imports());
create policy "risk full access update" on public.risk_lm_records for update to authenticated using (app_private.can_manage_imports()) with check (app_private.can_manage_imports());
create policy "risk full access delete" on public.risk_lm_records for delete to authenticated using (app_private.can_manage_imports());

drop policy if exists "drivers full access insert" on public.driver_records;
drop policy if exists "drivers full access update" on public.driver_records;
drop policy if exists "drivers full access delete" on public.driver_records;
create policy "drivers full access insert" on public.driver_records for insert to authenticated with check (app_private.can_manage_imports());
create policy "drivers full access update" on public.driver_records for update to authenticated using (app_private.can_manage_imports()) with check (app_private.can_manage_imports());
create policy "drivers full access delete" on public.driver_records for delete to authenticated using (app_private.can_manage_imports());

drop policy if exists "files full access" on public.imported_files;
create policy "files full access" on public.imported_files for all to authenticated using (app_private.can_manage_imports()) with check (app_private.can_manage_imports());

-- Leitura do cadastro mestre necessária ao enriquecimento das importações.
drop policy if exists "bases scoped read" on public.operational_bases;
create policy "bases scoped read" on public.operational_bases for select to authenticated
using (app_private.can_manage_imports() or app_private.can_manage_driver_base(base_key));

drop policy if exists "drivers scoped read" on public.alc_drivers;
create policy "drivers scoped read" on public.alc_drivers for select to authenticated
using (app_private.can_manage_imports() or app_private.can_manage_driver_base(base_key) or auth_user_id = auth.uid());

-- Storage privado das planilhas importadas.
drop policy if exists "alc imports insert" on storage.objects;
drop policy if exists "alc imports read" on storage.objects;
drop policy if exists "alc imports update" on storage.objects;
drop policy if exists "alc imports delete" on storage.objects;
create policy "alc imports insert" on storage.objects for insert to authenticated
with check (bucket_id = 'alc-imports' and app_private.can_manage_imports());
create policy "alc imports read" on storage.objects for select to authenticated
using (bucket_id = 'alc-imports' and app_private.can_manage_imports());
create policy "alc imports update" on storage.objects for update to authenticated
using (bucket_id = 'alc-imports' and app_private.can_manage_imports())
with check (bucket_id = 'alc-imports' and app_private.can_manage_imports());
create policy "alc imports delete" on storage.objects for delete to authenticated
using (bucket_id = 'alc-imports' and app_private.can_manage_imports());
