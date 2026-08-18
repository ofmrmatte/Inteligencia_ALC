alter table public.driver_disputes
  add column if not exists protocol text;

update public.driver_disputes
set protocol = 'CON-' || to_char(created_at at time zone 'America/Sao_Paulo', 'YYYYMMDD') || '-' || upper(substr(replace(id::text, '-', ''), 1, 6))
where protocol is null or btrim(protocol) = '';

create unique index if not exists driver_disputes_protocol_uidx
  on public.driver_disputes(protocol)
  where protocol is not null;

create or replace function app_private.ensure_driver_dispute_protocol()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if new.protocol is null or btrim(new.protocol) = '' then
    new.protocol := 'CON-' || to_char(coalesce(new.created_at, now()) at time zone 'America/Sao_Paulo', 'YYYYMMDD') || '-' || upper(substr(replace(new.id::text, '-', ''), 1, 6));
  end if;
  return new;
end
$function$;

drop trigger if exists trg_driver_dispute_protocol on public.driver_disputes;
create trigger trg_driver_dispute_protocol
before insert on public.driver_disputes
for each row execute function app_private.ensure_driver_dispute_protocol();
