create table if not exists public.reconciliation_merge_audit (
  id uuid primary key default gen_random_uuid(),
  shipment_id text not null,
  source_table text not null,
  kept_record_id uuid not null,
  discarded_record_id uuid not null,
  batch_id uuid,
  kept_snapshot jsonb not null default '{}'::jsonb,
  discarded_snapshot jsonb not null default '{}'::jsonb,
  merged_by uuid references public.profiles(id) on delete set null,
  merged_at timestamptz not null default now()
);

create index if not exists reconciliation_merge_audit_shipment_idx
  on public.reconciliation_merge_audit (shipment_id, merged_at desc);
create index if not exists reconciliation_merge_audit_batch_idx
  on public.reconciliation_merge_audit (batch_id);

alter table public.reconciliation_merge_audit enable row level security;

comment on table public.reconciliation_merge_audit is
  'Auditoria de registros duplicados removidos pela conciliação, preservando snapshots do registro mantido e descartado.';

create or replace function public.merge_reconciliation_duplicates_admin(
  p_shipment_id text,
  p_merged_by uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_keep_id uuid;
  v_prefatura integer := 0;
  v_pnr integer := 0;
  v_risk integer := 0;
begin
  if p_shipment_id is null or p_shipment_id !~ '^\d{8,14}$' then
    raise exception 'ID de pacote inválido.';
  end if;

  select r.batch_id into v_batch_id
  from public.prefatura_records r
  left join public.import_batches b on b.id = r.batch_id
  where r.shipment_id = p_shipment_id
  order by coalesce(b.started_at, r.created_at) desc, r.created_at desc, r.id desc
  limit 1;

  if v_batch_id is not null then
    select r.id into v_keep_id
    from public.prefatura_records r
    where r.shipment_id = p_shipment_id and r.batch_id = v_batch_id
    order by r.route_date desc nulls last, r.source_row desc, r.created_at desc, r.id desc
    limit 1;

    if v_keep_id is not null then
      insert into public.reconciliation_merge_audit (
        shipment_id, source_table, kept_record_id, discarded_record_id, batch_id,
        kept_snapshot, discarded_snapshot, merged_by
      )
      select p_shipment_id, 'prefatura_records', kept.id, discarded.id, v_batch_id,
             to_jsonb(kept), to_jsonb(discarded), p_merged_by
      from public.prefatura_records kept
      join public.prefatura_records discarded
        on discarded.shipment_id = p_shipment_id
       and discarded.batch_id = v_batch_id
       and discarded.id <> kept.id
      where kept.id = v_keep_id;

      delete from public.prefatura_records
      where shipment_id = p_shipment_id and batch_id = v_batch_id and id <> v_keep_id;
      get diagnostics v_prefatura = row_count;
    end if;
  end if;

  v_batch_id := null;
  v_keep_id := null;

  select r.batch_id into v_batch_id
  from public.pnr_records r
  left join public.import_batches b on b.id = r.batch_id
  where r.shipment_id = p_shipment_id
  order by coalesce(b.started_at, r.created_at) desc, r.created_at desc, r.id desc
  limit 1;

  if v_batch_id is not null then
    select r.id into v_keep_id
    from public.pnr_records r
    where r.shipment_id = p_shipment_id and r.batch_id = v_batch_id
    order by r.case_date desc nulls last, r.source_row desc, r.created_at desc, r.id desc
    limit 1;

    if v_keep_id is not null then
      insert into public.reconciliation_merge_audit (
        shipment_id, source_table, kept_record_id, discarded_record_id, batch_id,
        kept_snapshot, discarded_snapshot, merged_by
      )
      select p_shipment_id, 'pnr_records', kept.id, discarded.id, v_batch_id,
             to_jsonb(kept), to_jsonb(discarded), p_merged_by
      from public.pnr_records kept
      join public.pnr_records discarded
        on discarded.shipment_id = p_shipment_id
       and discarded.batch_id = v_batch_id
       and discarded.id <> kept.id
      where kept.id = v_keep_id;

      delete from public.pnr_records
      where shipment_id = p_shipment_id and batch_id = v_batch_id and id <> v_keep_id;
      get diagnostics v_pnr = row_count;
    end if;
  end if;

  v_batch_id := null;
  v_keep_id := null;

  select r.batch_id into v_batch_id
  from public.risk_lm_records r
  left join public.import_batches b on b.id = r.batch_id
  where r.shipment_id = p_shipment_id
  order by coalesce(b.started_at, r.created_at) desc, r.created_at desc, r.id desc
  limit 1;

  if v_batch_id is not null then
    select r.id into v_keep_id
    from public.risk_lm_records r
    where r.shipment_id = p_shipment_id and r.batch_id = v_batch_id
    order by r.failure_date desc nulls last, r.source_row desc, r.created_at desc, r.id desc
    limit 1;

    if v_keep_id is not null then
      insert into public.reconciliation_merge_audit (
        shipment_id, source_table, kept_record_id, discarded_record_id, batch_id,
        kept_snapshot, discarded_snapshot, merged_by
      )
      select p_shipment_id, 'risk_lm_records', kept.id, discarded.id, v_batch_id,
             to_jsonb(kept), to_jsonb(discarded), p_merged_by
      from public.risk_lm_records kept
      join public.risk_lm_records discarded
        on discarded.shipment_id = p_shipment_id
       and discarded.batch_id = v_batch_id
       and discarded.id <> kept.id
      where kept.id = v_keep_id;

      delete from public.risk_lm_records
      where shipment_id = p_shipment_id and batch_id = v_batch_id and id <> v_keep_id;
      get diagnostics v_risk = row_count;
    end if;
  end if;

  return jsonb_build_object(
    'shipmentId', p_shipment_id,
    'removed', v_prefatura + v_pnr + v_risk,
    'prefaturaRemoved', v_prefatura,
    'pnrRemoved', v_pnr,
    'riskRemoved', v_risk
  );
end;
$$;

revoke all on function public.merge_reconciliation_duplicates_admin(text, uuid) from public;
revoke all on function public.merge_reconciliation_duplicates_admin(text, uuid) from anon;
revoke all on function public.merge_reconciliation_duplicates_admin(text, uuid) from authenticated;
grant execute on function public.merge_reconciliation_duplicates_admin(text, uuid) to service_role;

comment on function public.merge_reconciliation_duplicates_admin(text, uuid) is
  'Mescla duplicidades do lote atual por fonte, preservando a ocorrência mais recente e auditando as removidas.';
