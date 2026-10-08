create index if not exists alc_drivers_full_name_norm_idx
on public.alc_drivers (alc_norm_unit_key(full_name));

analyze public.alc_drivers;
