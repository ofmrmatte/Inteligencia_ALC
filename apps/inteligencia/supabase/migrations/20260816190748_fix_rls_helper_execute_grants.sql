revoke all on function app_private.has_global_internal_access() from public, anon;
revoke all on function app_private.can_read_scope(text, text) from public, anon;
revoke all on function app_private.can_manage_driver_base(text) from public, anon;

grant execute on function app_private.has_global_internal_access() to authenticated;
grant execute on function app_private.can_read_scope(text, text) to authenticated;
grant execute on function app_private.can_manage_driver_base(text) to authenticated;
