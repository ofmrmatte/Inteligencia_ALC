alter table if exists public.pnr_case_events
  add column if not exists actor_user_id text;

comment on column public.pnr_case_events.actor_user_id
  is 'Identificador operacional sanitizado do ator no Case Center, quando fornecido pelo Mercado Livre.';
