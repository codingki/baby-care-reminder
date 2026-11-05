-- Leftover milk uses the CDC 2-hour window. Adding an enum value cannot be
-- used in the same transaction, so this file only extends the type.

alter type public.storage_location add value if not exists 'leftover';

comment on column public.chiller_items.location is
  'Milk: room 4h, fridge 4 days, freezer 6 months, cooler 24h, thawed 24h, leftover 2h. Pump parts use families.pump_parts_wash_by_hours.';
