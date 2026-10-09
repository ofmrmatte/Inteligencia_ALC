-- Apply explicitly to Core after approval; runtime requests perform no DDL.
alter table public.pnr_case_center_cases
  add column if not exists atendimento_verified_contact jsonb;

create table if not exists app_private.pnr_enrichment_nonces (
  nonce uuid primary key,
  event_key text not null,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  signed_at timestamptz not null,
  received_at timestamptz not null default now()
);

create table if not exists app_private.pnr_enrichment_receipts (
  event_key text primary key,
  case_id text not null references public.pnr_case_center_cases(case_id) on delete restrict,
  shipment_id text not null,
  schema_version smallint not null check (schema_version = 2),
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  outcome text not null check (outcome in ('applied','superseded')),
  received_at timestamptz not null default now()
);

alter table app_private.pnr_enrichment_nonces enable row level security;
alter table app_private.pnr_enrichment_receipts enable row level security;
create index if not exists pnr_enrichment_receipts_case
  on app_private.pnr_enrichment_receipts(case_id);
revoke all on app_private.pnr_enrichment_nonces, app_private.pnr_enrichment_receipts from public, anon, authenticated;
grant usage on schema app_private to service_role;
grant select, insert on app_private.pnr_enrichment_nonces, app_private.pnr_enrichment_receipts to service_role;
