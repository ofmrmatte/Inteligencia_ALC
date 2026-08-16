revoke execute on all functions in schema app_private from public, anon, authenticated;
grant usage on schema app_private to authenticated;
grant execute on function app_private.has_global_internal_access() to authenticated;
grant execute on function app_private.can_read_scope(text, text) to authenticated;
grant execute on function app_private.can_manage_driver_base(text) to authenticated;
grant execute on function app_private.normalize_scope_text(text) to authenticated;
grant execute on all functions in schema app_private to service_role;
