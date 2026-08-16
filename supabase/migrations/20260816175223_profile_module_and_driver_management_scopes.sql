alter table public.profiles
  add column if not exists module_scope text[] not null default '{}'::text[],
  add column if not exists driver_management_scope text[] not null default '{}'::text[];

update public.profiles
set module_scope = case
      when role::text in ('director','developer','super_admin') then array[
        'visao-geral','gestao-pnr','pre-faturamento','risco-lm','motoristas',
        'gestao-motoristas','conciliacao-ids','qualidade-dados','importacoes','configuracoes','perfil'
      ]::text[]
      when role::text = 'admin' then array['gestao-motoristas']::text[]
      when role::text in ('coordinator','supervisor') then array[
        'visao-geral','gestao-pnr','pre-faturamento','risco-lm','motoristas','perfil'
      ]::text[]
      else module_scope
    end,
    driver_management_scope = case
      when role::text in ('director','developer','super_admin') then array[
        'overview','pilot','drivers','tickets','payments','disputes','admins'
      ]::text[]
      when role::text = 'admin' then array['payments','disputes']::text[]
      else '{}'::text[]
    end,
    updated_at = now()
where active = true;
