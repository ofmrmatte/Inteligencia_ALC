-- Security hardening for missing packages and DB-side dashboard aggregation.

alter table public.gestao_desvios_pacotes_faltantes enable row level security;

revoke all on table public.gestao_desvios_pacotes_faltantes from anon;
grant select, insert, update, delete on table public.gestao_desvios_pacotes_faltantes to authenticated;

drop policy if exists "Authenticated users can manage missing packages" on public.gestao_desvios_pacotes_faltantes;
drop policy if exists "Admins can manage missing packages" on public.gestao_desvios_pacotes_faltantes;

create policy "Admins can manage missing packages"
on public.gestao_desvios_pacotes_faltantes
for all
to authenticated
using ((select public.is_current_user_admin()))
with check ((select public.is_current_user_admin()));

create or replace function public.get_dashboard_summary_metrics()
returns table (
  pre_fatura_count bigint,
  gestao_pacotes_count bigint,
  desvios_pnr_count bigint,
  pacotes_faltantes_count bigint,
  pre_fatura_total numeric,
  pre_fatura_bases bigint,
  pre_fatura_drivers bigint,
  pre_fatura_routes bigint,
  pre_fatura_package_ids bigint,
  top_bases jsonb,
  top_drivers jsonb,
  type_mix jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  with pre as (
    select
      nullif(trim(coalesce(nullif(codigo_base, ''), base)), '') as base_label,
      nullif(trim(driver), '') as driver_label,
      nullif(trim(rota), '') as route_label,
      nullif(trim(id_envio), '') as package_label,
      nullif(trim(tipo), '') as type_label,
      coalesce(valor, 0)::numeric as valor
    from public.pre_fatura_records
    where module_key = 'pre_fatura'
  ),
  pre_totals as (
    select
      count(*)::bigint as total_rows,
      coalesce(sum(valor), 0)::numeric as total_value,
      count(distinct base_label)::bigint as bases,
      count(distinct driver_label)::bigint as drivers,
      count(distinct route_label)::bigint as routes,
      count(distinct package_label)::bigint as package_ids
    from pre
  ),
  top_base_rows as (
    select base_label as label, sum(valor)::numeric as value, count(*)::bigint as count
    from pre
    where base_label is not null
    group by base_label
    order by value desc, count desc, label
    limit 5
  ),
  top_driver_rows as (
    select driver_label as label, sum(valor)::numeric as value, count(*)::bigint as count
    from pre
    where driver_label is not null
    group by driver_label
    order by value desc, count desc, label
    limit 5
  ),
  type_mix_rows as (
    select type_label as label, sum(valor)::numeric as value, count(*)::bigint as count
    from pre
    where type_label is not null
    group by type_label
    order by value desc, count desc, label
    limit 5
  )
  select
    (select count(*)::bigint from public.pre_fatura_records where module_key = 'pre_fatura'),
    (select count(*)::bigint from public.gestao_pacotes_records where module_key = 'gestao_pacotes'),
    (select count(*)::bigint from public.desvios_pnr_records where module_key = 'desvios_pnr'),
    (select count(*)::bigint from public.gestao_desvios_pacotes_faltantes where module_key = 'pacotes_faltantes'),
    pre_totals.total_value,
    pre_totals.bases,
    pre_totals.drivers,
    pre_totals.routes,
    pre_totals.package_ids,
    coalesce((select jsonb_agg(jsonb_build_object('label', label, 'value', value, 'count', count) order by value desc, count desc, label) from top_base_rows), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('label', label, 'value', value, 'count', count) order by value desc, count desc, label) from top_driver_rows), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('label', label, 'value', value, 'count', count) order by value desc, count desc, label) from type_mix_rows), '[]'::jsonb)
  from pre_totals;
$$;

revoke execute on function public.get_dashboard_summary_metrics() from public, anon;
grant execute on function public.get_dashboard_summary_metrics() to authenticated;

analyze public.gestao_desvios_pacotes_faltantes;
analyze public.pre_fatura_records;
analyze public.gestao_pacotes_records;
analyze public.desvios_pnr_records;
