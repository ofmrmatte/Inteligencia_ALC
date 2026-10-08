do $$
begin
  if exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'app_role') then
    alter type public.app_role add value if not exists 'super_admin';
    alter type public.app_role add value if not exists 'driver';
  end if;
end
$$;

create table if not exists public.operational_bases (
  base_key text primary key,
  base_name text not null,
  sigla text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.alc_drivers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  driver_code text not null unique,
  full_name text not null,
  base_key text references public.operational_bases(base_key) on update cascade,
  sigla text,
  cpf_last4 text,
  activation_code_hash text,
  portal_login text unique,
  status text not null default 'pending_activation' check (status in ('pending_activation', 'active', 'blocked', 'inactive')),
  activated_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_base_assignments (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id) on delete cascade,
  base_key text not null references public.operational_bases(base_key) on update cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (admin_id, base_key)
);

create table if not exists public.admin_base_assignment_history (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references public.admin_base_assignments(id) on delete set null,
  admin_id uuid references public.profiles(id) on delete set null,
  base_key text,
  action text not null check (action in ('assigned', 'removed', 'reactivated', 'updated')),
  actor_id uuid references public.profiles(id) on delete set null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.driver_payment_batches (
  id uuid primary key default gen_random_uuid(),
  imported_by uuid references public.profiles(id) on delete set null,
  original_name text not null,
  archive_type text not null check (archive_type in ('zip', 'rar')),
  storage_path text,
  status text not null default 'review' check (status in ('uploading', 'review', 'published', 'partial', 'failed')),
  total_files integer not null default 0,
  identified_count integer not null default 0,
  unidentified_count integer not null default 0,
  duplicate_count integer not null default 0,
  error_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create table if not exists public.driver_payment_documents (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.driver_payment_batches(id) on delete set null,
  driver_id uuid references public.alc_drivers(id) on delete set null,
  base_key text references public.operational_bases(base_key) on update cascade,
  period text,
  document_date date,
  status text not null default 'draft' check (status in ('draft', 'published', 'superseded', 'unidentified', 'duplicate', 'error')),
  active_version_id uuid,
  title text not null,
  classification text not null default 'payment_pdf',
  issue text,
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create table if not exists public.driver_payment_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.driver_payment_documents(id) on delete cascade,
  version_number integer not null,
  storage_path text not null,
  file_hash text not null,
  file_size bigint not null default 0,
  original_name text not null,
  published_by uuid references public.profiles(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'active', 'superseded')),
  notes text,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (document_id, version_number)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'driver_payment_documents_active_version_id_fkey'
  ) then
    alter table public.driver_payment_documents
      add constraint driver_payment_documents_active_version_id_fkey
      foreign key (active_version_id) references public.driver_payment_document_versions(id) on delete set null;
  end if;
end
$$;

create table if not exists public.driver_disputes (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.driver_payment_documents(id) on delete cascade,
  document_version_id uuid references public.driver_payment_document_versions(id) on delete set null,
  driver_id uuid not null references public.alc_drivers(id) on delete cascade,
  assigned_admin_id uuid references public.profiles(id) on delete set null,
  base_key text references public.operational_bases(base_key) on update cascade,
  reason text not null,
  description text not null,
  reference text,
  amount numeric(14,2),
  status text not null default 'aberta' check (status in ('aberta', 'em_analise', 'aguardando_informacao', 'deferida', 'indeferida', 'pdf_em_correcao', 'concluida')),
  decision text,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.driver_dispute_messages (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.driver_disputes(id) on delete cascade,
  author_profile_id uuid references public.profiles(id) on delete set null,
  author_driver_id uuid references public.alc_drivers(id) on delete set null,
  body text not null,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.driver_notifications (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.alc_drivers(id) on delete cascade,
  title text not null,
  body text not null,
  entity_table text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.driver_portal_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_driver_id uuid references public.alc_drivers(id) on delete set null,
  action text not null,
  entity_table text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists alc_drivers_base_idx on public.alc_drivers(base_key, status);
create index if not exists admin_base_assignments_admin_idx on public.admin_base_assignments(admin_id, active);
create index if not exists driver_payment_documents_scope_idx on public.driver_payment_documents(base_key, driver_id, status);
create index if not exists driver_payment_versions_hash_idx on public.driver_payment_document_versions(file_hash);
create index if not exists driver_disputes_scope_idx on public.driver_disputes(base_key, status, assigned_admin_id);
create index if not exists driver_notifications_driver_idx on public.driver_notifications(driver_id, read_at);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('driver-payments', 'driver-payments', false, 52428800, array['application/pdf', 'application/zip', 'application/x-zip-compressed', 'application/vnd.rar', 'application/x-rar-compressed'])
on conflict (id) do update set public = false;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and active = true
        and (global_access = true or role::text in ('super_admin', 'director', 'developer'))
    ),
    false
  )
$$;

create or replace function public.has_full_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and active = true
        and (global_access = true or role::text in ('director', 'admin', 'developer', 'super_admin'))
    ),
    false
  )
$$;

create or replace function public.can_manage_users()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and active = true
        and (global_access = true or role::text in ('director', 'admin', 'developer', 'super_admin'))
    ),
    false
  )
$$;

create or replace function public.current_driver_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.alc_drivers where auth_user_id = auth.uid() and status = 'active'
$$;

create or replace function public.can_access_driver_base(target_base_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
    or exists (
      select 1 from public.admin_base_assignments
      where admin_id = auth.uid()
        and base_key = target_base_key
        and active = true
    )
    or target_base_key = any(public.current_base_scope())
$$;

alter table public.operational_bases enable row level security;
alter table public.alc_drivers enable row level security;
alter table public.admin_base_assignments enable row level security;
alter table public.admin_base_assignment_history enable row level security;
alter table public.driver_payment_batches enable row level security;
alter table public.driver_payment_documents enable row level security;
alter table public.driver_payment_document_versions enable row level security;
alter table public.driver_disputes enable row level security;
alter table public.driver_dispute_messages enable row level security;
alter table public.driver_notifications enable row level security;
alter table public.driver_portal_audit_events enable row level security;

drop policy if exists "bases scoped read" on public.operational_bases;
create policy "bases scoped read" on public.operational_bases
  for select to authenticated
  using (public.is_super_admin() or public.can_access_driver_base(base_key) or base_key = (select base_key from public.alc_drivers where auth_user_id = auth.uid()));

drop policy if exists "drivers scoped read" on public.alc_drivers;
create policy "drivers scoped read" on public.alc_drivers
  for select to authenticated
  using (public.is_super_admin() or public.can_access_driver_base(base_key) or auth_user_id = auth.uid());

drop policy if exists "drivers admin write" on public.alc_drivers;
create policy "drivers admin write" on public.alc_drivers
  for all to authenticated
  using (public.is_super_admin() or public.can_access_driver_base(base_key))
  with check (public.is_super_admin() or public.can_access_driver_base(base_key));

drop policy if exists "assignments super admin" on public.admin_base_assignments;
create policy "assignments super admin" on public.admin_base_assignments
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "assignment history scoped read" on public.admin_base_assignment_history;
create policy "assignment history scoped read" on public.admin_base_assignment_history
  for select to authenticated
  using (public.is_super_admin() or admin_id = auth.uid());

drop policy if exists "payment batches scoped" on public.driver_payment_batches;
create policy "payment batches scoped" on public.driver_payment_batches
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "payment docs scoped read" on public.driver_payment_documents;
create policy "payment docs scoped read" on public.driver_payment_documents
  for select to authenticated
  using (public.is_super_admin() or public.can_access_driver_base(base_key) or driver_id = public.current_driver_id());

drop policy if exists "payment docs admin write" on public.driver_payment_documents;
create policy "payment docs admin write" on public.driver_payment_documents
  for all to authenticated
  using (public.is_super_admin() or public.can_access_driver_base(base_key))
  with check (public.is_super_admin() or public.can_access_driver_base(base_key));

drop policy if exists "payment versions scoped read" on public.driver_payment_document_versions;
create policy "payment versions scoped read" on public.driver_payment_document_versions
  for select to authenticated
  using (
    exists (
      select 1 from public.driver_payment_documents d
      where d.id = document_id
        and (public.is_super_admin() or public.can_access_driver_base(d.base_key) or d.driver_id = public.current_driver_id())
    )
  );

drop policy if exists "payment versions admin write" on public.driver_payment_document_versions;
create policy "payment versions admin write" on public.driver_payment_document_versions
  for all to authenticated
  using (
    exists (select 1 from public.driver_payment_documents d where d.id = document_id and (public.is_super_admin() or public.can_access_driver_base(d.base_key)))
  )
  with check (
    exists (select 1 from public.driver_payment_documents d where d.id = document_id and (public.is_super_admin() or public.can_access_driver_base(d.base_key)))
  );

drop policy if exists "disputes scoped" on public.driver_disputes;
create policy "disputes scoped" on public.driver_disputes
  for all to authenticated
  using (public.is_super_admin() or public.can_access_driver_base(base_key) or driver_id = public.current_driver_id())
  with check (public.is_super_admin() or public.can_access_driver_base(base_key) or driver_id = public.current_driver_id());

drop policy if exists "dispute messages scoped" on public.driver_dispute_messages;
create policy "dispute messages scoped" on public.driver_dispute_messages
  for all to authenticated
  using (
    exists (select 1 from public.driver_disputes d where d.id = dispute_id and (public.is_super_admin() or public.can_access_driver_base(d.base_key) or d.driver_id = public.current_driver_id()))
  )
  with check (
    exists (select 1 from public.driver_disputes d where d.id = dispute_id and (public.is_super_admin() or public.can_access_driver_base(d.base_key) or d.driver_id = public.current_driver_id()))
  );

drop policy if exists "notifications driver read" on public.driver_notifications;
create policy "notifications driver read" on public.driver_notifications
  for select to authenticated
  using (driver_id = public.current_driver_id() or public.is_super_admin());

drop policy if exists "audit scoped read" on public.driver_portal_audit_events;
create policy "audit scoped read" on public.driver_portal_audit_events
  for select to authenticated
  using (public.is_super_admin());

drop policy if exists "audit scoped insert" on public.driver_portal_audit_events;
create policy "audit scoped insert" on public.driver_portal_audit_events
  for insert to authenticated
  with check (auth.uid() is not null);
