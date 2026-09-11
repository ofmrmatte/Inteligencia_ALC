-- Reduz o custo de leitura da view discount_case_current.
-- A view resolve motorista por código e, quando necessário, por nome normalizado.
-- Sem este índice, o ramo por nome fazia varredura sequencial de alc_drivers
-- para cada caso da Gestão de Descontos, causando Gateway Timeout.

create index if not exists alc_drivers_full_name_norm_idx
on public.alc_drivers (alc_norm_unit_key(full_name));

analyze public.alc_drivers;
