-- A previous broad table grant also included TRUNCATE/REFERENCES/TRIGGER.
-- Keep only the read privilege required by the authenticated own-profile policy.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant all on public.profiles to service_role;
