-- A member can keep the device time zone, or pin one themselves.
-- Changing the zone only affects quiet hours. Reminder instants stay in UTC.

alter table public.member_settings
  add column timezone_manual boolean not null default false;

comment on column public.member_settings.timezone_manual is
  'When true, timezone is the member''s choice and is not replaced by the device zone.';
comment on column public.member_settings.timezone is
  'IANA zone used for quiet hours. Auto-updated from the device unless timezone_manual is true.';
