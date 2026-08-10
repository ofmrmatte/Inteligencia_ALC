alter table public.profiles
  alter column setor set default 'LOSS';

update public.profiles
set setor = 'LOSS', updated_at = now()
where setor is null or btrim(setor) = '';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    name,
    role,
    is_admin,
    setor
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', 'Usuário'),
    'user',
    false,
    'LOSS'
  );

  return new;
end;
$$;
