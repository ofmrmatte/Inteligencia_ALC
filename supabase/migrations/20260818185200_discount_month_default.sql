alter table public.discount_cases
  alter column discount_month set default to_char(timezone('America/Sao_Paulo', now()), 'YYYY-MM');