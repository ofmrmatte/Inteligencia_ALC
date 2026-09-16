alter table public.profiles
  add column if not exists module_scope text[] not null default '{}'::text[],
  add column if not exists driver_management_scope text[] not null default '{}'::text[];

update public.profiles
set module_scope = array[
  'visao-geral','gestao-pnr','pre-faturamento','risco-lm','motoristas',
  'gestao-motoristas','conciliacao-ids','qualidade-dados','importacoes','configuracoes','perfil'
]::text[],
    driver_management_scope = array['overview','pilot','drivers','tickets','payments','disputes','admins']::text[]
where global_access = true
   or role in ('director','developer','super_admin','loss_supervisor');

update public.profiles
set module_scope = array['gestao-motoristas']::text[],
    driver_management_scope = array['payments','disputes']::text[]
where role = 'admin' and global_access = false;

update public.profiles
set module_scope = array['visao-geral','gestao-pnr','pre-faturamento','risco-lm','motoristas','perfil']::text[]
where role in ('coordinator','supervisor','user')
  and global_access = false
  and cardinality(module_scope) = 0;

comment on column public.profiles.module_scope is 'Main Inteligencia ALC sections explicitly available to the profile. Role defaults are applied by the application when empty.';
comment on column public.profiles.driver_management_scope is 'Driver Management internal tabs explicitly available to the profile. Role defaults are applied by the application when empty.';
