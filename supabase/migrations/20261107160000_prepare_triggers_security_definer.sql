-- The send-reminders edge function updates reminders and chiller_items as service_role.
-- These BEFORE triggers call private.* helpers, and service_role has no usage on schema private,
-- so every notified_at update failed and the same push re-sent every 5 minutes.
alter function private.prepare_reminder() security definer;
alter function private.prepare_chiller_item() security definer;
revoke all on function private.prepare_reminder() from public, anon, authenticated;
revoke all on function private.prepare_chiller_item() from public, anon, authenticated;
