create or replace function app_private.can_read_scope(record_sigla text, record_base_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  with current_profile as (
    select p.active, p.role::text as role,
      coalesce(p.base_scope, '{}'::text[]) as allowed_bases,
      coalesce(p.sigla_scope, '{}'::text[]) as allowed_siglas
    from public.profiles p where p.id = auth.uid() limit 1
  ), normalized_record as (
    select app_private.normalize_scope_text(record_sigla) as sigla,
           app_private.normalize_scope_text(record_base_key) as base_key
  ), matching_units as (
    select u.unit_key,u.sigla,u.base_key
    from public.operational_units u, normalized_record r
    where u.active=true
      and app_private.normalize_scope_text(u.sigla)=r.sigla
      and app_private.normalize_scope_text(u.base_key)=r.base_key
  ), unique_sigla_unit as (
    select min(u.unit_key) unit_key,min(u.sigla) sigla,min(u.base_key) base_key
    from public.operational_units u, normalized_record r
    where u.active=true and app_private.normalize_scope_text(u.sigla)=r.sigla
    group by app_private.normalize_scope_text(u.sigla)
    having count(*)=1
  )
  select coalesce(exists (
    select 1 from current_profile cp
    where cp.active=true and (
      cp.role in ('director','developer','loss_supervisor','loss_admin','super_admin')
      or (cp.role in ('coordinator','supervisor') and exists (
        select 1 from (
          select * from matching_units
          union all
          select * from unique_sigla_unit
          where coalesce((select base_key from normalized_record),'')=''
             or (select base_key from normalized_record)=(select sigla from normalized_record)
        ) u
        where exists (
          select 1 from unnest(cp.allowed_bases) s(value)
          where app_private.normalize_scope_text(s.value)=app_private.normalize_scope_text(u.unit_key)
        ) or (
          exists (
            select 1 from unnest(cp.allowed_bases) s(value)
            where app_private.normalize_scope_text(s.value)=app_private.normalize_scope_text(u.base_key)
          ) and (
            cardinality(cp.allowed_siglas)=0
            or exists (
              select 1 from unnest(cp.allowed_siglas) s(value)
              where app_private.normalize_scope_text(s.value)=app_private.normalize_scope_text(u.sigla)
            )
          )
        ) or (
          exists (
            select 1 from unnest(cp.allowed_bases) s(value)
            where app_private.normalize_scope_text(s.value)=app_private.normalize_scope_text(u.sigla)
          ) and (select count(*) from public.operational_units z where z.active=true and app_private.normalize_scope_text(z.sigla)=app_private.normalize_scope_text(u.sigla))=1
        )
      ))
    )
  ),false)
$function$;

create or replace function app_private.can_read_batch(target_batch_id uuid)
returns boolean language sql stable security definer set search_path=public
as $function$
  select coalesce(
    app_private.has_global_internal_access()
    or exists (select 1 from public.profiles p where p.id=auth.uid() and p.active=true and p.role::text='loss_admin')
    or exists (select 1 from public.hierarchy_scopes h where h.batch_id=target_batch_id and app_private.can_read_scope(h.sigla,h.base_key))
    or exists (select 1 from public.prefatura_records p where p.batch_id=target_batch_id and app_private.can_read_scope(p.sigla,p.base_key))
    or exists (select 1 from public.pnr_records p where p.batch_id=target_batch_id and app_private.can_read_scope(p.sigla,p.base_key))
    or exists (select 1 from public.risk_lm_records r where r.batch_id=target_batch_id and app_private.can_read_scope(r.sigla,r.base_key)), false)
$function$;

create or replace function app_private.can_read_driver_record(target_driver_id text,target_name text,record_sigla text,record_base_key text)
returns boolean language sql stable security definer set search_path=public
as $function$
  select coalesce(
    app_private.can_read_scope(record_sigla,record_base_key)
    or exists (select 1 from public.prefatura_records p where coalesce(target_driver_id,'')<>'' and p.driver_id=target_driver_id and app_private.can_read_scope(p.sigla,p.base_key))
    or exists (select 1 from public.pnr_records p where coalesce(target_driver_id,'')<>'' and p.driver_id=target_driver_id and app_private.can_read_scope(p.sigla,p.base_key))
    or exists (select 1 from public.risk_lm_records r where coalesce(target_driver_id,'')<>'' and r.driver_id=target_driver_id and app_private.can_read_scope(r.sigla,r.base_key))
    or exists (select 1 from public.prefatura_records p where coalesce(target_name,'')<>'' and app_private.normalize_scope_text(p.driver_name)=app_private.normalize_scope_text(target_name) and app_private.can_read_scope(p.sigla,p.base_key)), false)
$function$;

with driver_candidates as (
  select d.driver_code,u.unit_key,u.base_key,u.sigla
  from public.alc_drivers d join public.operational_units u
    on u.active=true
   and app_private.normalize_scope_text(d.base_key)=app_private.normalize_scope_text(u.base_key)
   and (coalesce(app_private.normalize_scope_text(d.sigla),'')='' or app_private.normalize_scope_text(d.sigla)=app_private.normalize_scope_text(u.sigla))
  where coalesce(d.driver_code,'')<>''
), resolved_driver as (
  select driver_code,min(base_key) base_key,min(sigla) sigla from driver_candidates group by driver_code having count(distinct unit_key)=1
)
update public.pnr_records p set base_key=r.base_key,sigla=r.sigla from resolved_driver r
where p.driver_id=r.driver_code and not exists (
  select 1 from public.operational_units u where u.active=true and app_private.normalize_scope_text(u.sigla)=app_private.normalize_scope_text(p.sigla) and app_private.normalize_scope_text(u.base_key)=app_private.normalize_scope_text(p.base_key)
);

with driver_candidates as (
  select d.driver_code,u.unit_key,u.base_key,u.sigla
  from public.alc_drivers d join public.operational_units u
    on u.active=true
   and app_private.normalize_scope_text(d.base_key)=app_private.normalize_scope_text(u.base_key)
   and (coalesce(app_private.normalize_scope_text(d.sigla),'')='' or app_private.normalize_scope_text(d.sigla)=app_private.normalize_scope_text(u.sigla))
  where coalesce(d.driver_code,'')<>''
), resolved_driver as (
  select driver_code,min(base_key) base_key,min(sigla) sigla from driver_candidates group by driver_code having count(distinct unit_key)=1
)
update public.risk_lm_records rlm set base_key=r.base_key,sigla=r.sigla from resolved_driver r
where rlm.driver_id=r.driver_code and not exists (
  select 1 from public.operational_units u where u.active=true and app_private.normalize_scope_text(u.sigla)=app_private.normalize_scope_text(rlm.sigla) and app_private.normalize_scope_text(u.base_key)=app_private.normalize_scope_text(rlm.base_key)
);

with unique_siglas as (
  select app_private.normalize_scope_text(sigla) normalized_sigla,min(base_key) base_key,min(sigla) sigla
  from public.operational_units where active=true group by app_private.normalize_scope_text(sigla) having count(*)=1
)
update public.pnr_records p set base_key=u.base_key,sigla=u.sigla from unique_siglas u
where app_private.normalize_scope_text(p.sigla)=u.normalized_sigla and not exists (
  select 1 from public.operational_units z where z.active=true and app_private.normalize_scope_text(z.sigla)=app_private.normalize_scope_text(p.sigla) and app_private.normalize_scope_text(z.base_key)=app_private.normalize_scope_text(p.base_key)
);

with unique_siglas as (
  select app_private.normalize_scope_text(sigla) normalized_sigla,min(base_key) base_key,min(sigla) sigla
  from public.operational_units where active=true group by app_private.normalize_scope_text(sigla) having count(*)=1
)
update public.risk_lm_records r set base_key=u.base_key,sigla=u.sigla from unique_siglas u
where app_private.normalize_scope_text(r.sigla)=u.normalized_sigla and not exists (
  select 1 from public.operational_units z where z.active=true and app_private.normalize_scope_text(z.sigla)=app_private.normalize_scope_text(r.sigla) and app_private.normalize_scope_text(z.base_key)=app_private.normalize_scope_text(r.base_key)
);
