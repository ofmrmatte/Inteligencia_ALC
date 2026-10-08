create index if not exists discount_cases_created_by_idx on public.discount_cases(created_by);
create index if not exists discount_cases_updated_by_idx on public.discount_cases(updated_by);
create index if not exists discount_case_events_actor_id_idx on public.discount_case_events(actor_id);

drop policy if exists "discount cases analysis write" on public.discount_cases;
drop policy if exists "discount cases analysis insert" on public.discount_cases;
drop policy if exists "discount cases analysis update" on public.discount_cases;
drop policy if exists "discount cases analysis delete" on public.discount_cases;

create policy "discount cases analysis insert"
on public.discount_cases
for insert
to authenticated
with check (
  app_private.current_user_role() in ('director','developer','loss_supervisor','loss_admin','super_admin','coordinator','supervisor')
);

create policy "discount cases analysis update"
on public.discount_cases
for update
to authenticated
using (
  app_private.current_user_role() in ('director','developer','loss_supervisor','loss_admin','super_admin','coordinator','supervisor')
)
with check (
  app_private.current_user_role() in ('director','developer','loss_supervisor','loss_admin','super_admin','coordinator','supervisor')
);

create policy "discount cases analysis delete"
on public.discount_cases
for delete
to authenticated
using (
  app_private.current_user_role() in ('director','developer','loss_supervisor','loss_admin','super_admin','coordinator','supervisor')
);
