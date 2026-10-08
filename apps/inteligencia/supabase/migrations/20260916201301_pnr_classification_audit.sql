alter table public.pnr_records
  add column if not exists billing_type text,
  add column if not exists cancellation_type text,
  add column if not exists classification_columns_present boolean not null default false;

comment on column public.pnr_records.billing_type is 'Classificação de faturamento informada na planilha PNR.';
comment on column public.pnr_records.cancellation_type is 'Classificação de anulação informada na planilha PNR.';
comment on column public.pnr_records.classification_columns_present is 'Indica que a planilha PNR importada continha as colunas de classificação financeira.';
