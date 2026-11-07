-- Optional note on stored milk. Pump parts leave this null.

alter table public.chiller_items
  add column note text;

alter table public.chiller_items
  add constraint chiller_items_note_not_blank check (
    note is null or char_length(btrim(note)) > 0
  );

comment on column public.chiller_items.note is
  'Optional note for stored milk. Null when the caregiver left it blank.';
