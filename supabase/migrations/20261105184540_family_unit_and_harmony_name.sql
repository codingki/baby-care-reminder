-- Follow-up to the phase 0 migration. Do not edit the merged file.
-- Volume unit moves to the family. Language stays on member_settings.
-- No check constraint limits unit to ml, so oz can be added later.

alter table public.families
  add column unit text not null default 'ml';

comment on column public.families.unit is
  'Family volume unit. Defaults to ml. oz may be added later; there is no ml-only check.';

alter table public.member_settings
  drop constraint member_settings_unit_check;

alter table public.member_settings
  drop column unit;

comment on table public.member_settings is
  'Per-member quiet hours, snooze, and language. One row per family membership.';

update public.pump_models
set model = 'Harmony'
where brand = 'Medela'
  and model = 'Harmony (manual)';
