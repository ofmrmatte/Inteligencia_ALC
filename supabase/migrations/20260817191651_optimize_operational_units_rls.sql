drop policy if exists "operational units scoped read" on public.operational_units;
create policy "operational units scoped read"
on public.operational_units
for select
to authenticated
using (
  app_private.can_manage_imports()
  or exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.active = true
      and (
        (
          p.role::text in ('coordinator','supervisor')
          and (
            unit_key = any(coalesce(p.base_scope,'{}'::text[]))
            or (
              base_key = any(coalesce(p.base_scope,'{}'::text[]))
              and (
                cardinality(coalesce(p.sigla_scope,'{}'::text[])) = 0
                or sigla = any(coalesce(p.sigla_scope,'{}'::text[]))
              )
            )
          )
        )
        or (
          p.role::text in ('admin','administration_supervisor')
          and app_private.can_manage_driver_base(base_key)
        )
      )
  )
);
