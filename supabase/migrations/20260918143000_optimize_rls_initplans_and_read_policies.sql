-- Preserve authorization semantics while avoiding repeated auth/profile work per row.
-- Read policies keep row-dependent scope checks; user-global checks become initplans.

drop policy if exists "drivers admin write" on public.alc_drivers;
drop policy if exists "drivers scoped read" on public.alc_drivers;

create policy "drivers scoped read"
on public.alc_drivers
for select
to authenticated
using (
  (select app_private.can_manage_imports())
  or app_private.can_manage_driver_base(base_key)
  or auth_user_id = (select auth.uid())
);

create policy "drivers admin insert"
on public.alc_drivers
for insert
to authenticated
with check (
  (select app_private.has_global_internal_access())
  or app_private.can_manage_driver_base(base_key)
);

create policy "drivers admin update"
on public.alc_drivers
for update
to authenticated
using (
  (select app_private.has_global_internal_access())
  or app_private.can_manage_driver_base(base_key)
)
with check (
  (select app_private.has_global_internal_access())
  or app_private.can_manage_driver_base(base_key)
);

create policy "drivers admin delete"
on public.alc_drivers
for delete
to authenticated
using (
  (select app_private.has_global_internal_access())
  or app_private.can_manage_driver_base(base_key)
);

drop policy if exists "assignment history scoped read" on public.admin_base_assignment_history;
create policy "assignment history scoped read"
on public.admin_base_assignment_history
for select
to authenticated
using (
  (select public.is_super_admin())
  or admin_id = (select auth.uid())
);

drop policy if exists "quality full access write" on public.quality_issues;
drop policy if exists "quality scoped read" on public.quality_issues;

create policy "quality scoped read"
on public.quality_issues
for select
to authenticated
using (
  (select app_private.has_global_internal_access())
  or assigned_to = (select auth.uid())
  or exists (
    select 1 from public.hierarchy_scopes h
    where h.batch_id = quality_issues.batch_id
      and app_private.can_read_scope(h.sigla, h.base_key)
  )
  or exists (
    select 1 from public.prefatura_records p
    where p.batch_id = quality_issues.batch_id
      and app_private.can_read_scope(p.sigla, p.base_key)
  )
  or exists (
    select 1 from public.pnr_records p
    where p.batch_id = quality_issues.batch_id
      and app_private.can_read_scope(p.sigla, p.base_key)
  )
  or exists (
    select 1 from public.risk_lm_records r
    where r.batch_id = quality_issues.batch_id
      and app_private.can_read_scope(r.sigla, r.base_key)
  )
);

create policy "quality full access insert"
on public.quality_issues
for insert
to authenticated
with check ((select app_private.has_global_internal_access()));

create policy "quality full access update"
on public.quality_issues
for update
to authenticated
using ((select app_private.has_global_internal_access()))
with check ((select app_private.has_global_internal_access()));

create policy "quality full access delete"
on public.quality_issues
for delete
to authenticated
using ((select app_private.has_global_internal_access()));

drop policy if exists "payment docs admin write" on public.driver_payment_documents;
drop policy if exists "payment docs scoped read" on public.driver_payment_documents;

create policy "payment docs scoped read"
on public.driver_payment_documents
for select
to authenticated
using (
  (select app_private.has_global_internal_access())
  or app_private.can_manage_driver_base(base_key)
);

create policy "payment docs admin insert"
on public.driver_payment_documents
for insert
to authenticated
with check (
  (select app_private.has_global_internal_access())
  or app_private.can_manage_driver_base(base_key)
);

create policy "payment docs admin update"
on public.driver_payment_documents
for update
to authenticated
using (
  (select app_private.has_global_internal_access())
  or app_private.can_manage_driver_base(base_key)
)
with check (
  (select app_private.has_global_internal_access())
  or app_private.can_manage_driver_base(base_key)
);

create policy "payment docs admin delete"
on public.driver_payment_documents
for delete
to authenticated
using (
  (select app_private.has_global_internal_access())
  or app_private.can_manage_driver_base(base_key)
);

drop policy if exists "payment versions admin write" on public.driver_payment_document_versions;
drop policy if exists "payment versions scoped read" on public.driver_payment_document_versions;

create policy "payment versions scoped read"
on public.driver_payment_document_versions
for select
to authenticated
using (
  exists (
    select 1
    from public.driver_payment_documents d
    where d.id = driver_payment_document_versions.document_id
      and (
        (select app_private.has_global_internal_access())
        or app_private.can_manage_driver_base(d.base_key)
      )
  )
);

create policy "payment versions admin insert"
on public.driver_payment_document_versions
for insert
to authenticated
with check (
  exists (
    select 1
    from public.driver_payment_documents d
    where d.id = driver_payment_document_versions.document_id
      and (
        (select app_private.has_global_internal_access())
        or app_private.can_manage_driver_base(d.base_key)
      )
  )
);

create policy "payment versions admin update"
on public.driver_payment_document_versions
for update
to authenticated
using (
  exists (
    select 1
    from public.driver_payment_documents d
    where d.id = driver_payment_document_versions.document_id
      and (
        (select app_private.has_global_internal_access())
        or app_private.can_manage_driver_base(d.base_key)
      )
  )
)
with check (
  exists (
    select 1
    from public.driver_payment_documents d
    where d.id = driver_payment_document_versions.document_id
      and (
        (select app_private.has_global_internal_access())
        or app_private.can_manage_driver_base(d.base_key)
      )
  )
);

create policy "payment versions admin delete"
on public.driver_payment_document_versions
for delete
to authenticated
using (
  exists (
    select 1
    from public.driver_payment_documents d
    where d.id = driver_payment_document_versions.document_id
      and (
        (select app_private.has_global_internal_access())
        or app_private.can_manage_driver_base(d.base_key)
      )
  )
);
