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

comment on table public.reconciliation_merge_audit is 'Auditoria de registros duplicados removidos pela conciliação, preservando snapshots do registro mantido e descartado.';
