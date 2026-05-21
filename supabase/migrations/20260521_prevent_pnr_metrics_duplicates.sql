delete from public.desvios_pnr_metrics_summary a
using public.desvios_pnr_metrics_summary b
where a.id < b.id
  and coalesce(a.file_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(b.file_id, '00000000-0000-0000-0000-000000000000'::uuid)
  and coalesce(a.month_key, '') = coalesce(b.month_key, '')
  and coalesce(a.quinzena_key, '') = coalesce(b.quinzena_key, '')
  and coalesce(a.status_normalizado, '') = coalesce(b.status_normalizado, '')
  and coalesce(a.tipo_base_label, '') = coalesce(b.tipo_base_label, '')
  and coalesce(a.estacao_origem, '') = coalesce(b.estacao_origem, '')
  and coalesce(a.status_motorista, '') = coalesce(b.status_motorista, '')
  and coalesce(a.fonte_cruzamento, '') = coalesce(b.fonte_cruzamento, '')
  and coalesce(a.motorista_label, '') = coalesce(b.motorista_label, '')
  and coalesce(a.motorista_detail, '') = coalesce(b.motorista_detail, '')
  and coalesce(a.id_rota, '') = coalesce(b.id_rota, '');

create unique index if not exists idx_desvios_pnr_metrics_summary_unique_scope
on public.desvios_pnr_metrics_summary(
  coalesce(file_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(month_key, ''),
  coalesce(quinzena_key, ''),
  coalesce(status_normalizado, ''),
  coalesce(tipo_base_label, ''),
  coalesce(estacao_origem, ''),
  coalesce(status_motorista, ''),
  coalesce(fonte_cruzamento, ''),
  coalesce(motorista_label, ''),
  coalesce(motorista_detail, ''),
  coalesce(id_rota, '')
);

select public.refresh_desvios_pnr_metrics_summary();
