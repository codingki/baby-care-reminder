-- Optional poop color and amount on dirty or mixed diapers.

alter table public.logs
  add column poop_color text,
  add column poop_amount text;

alter table public.logs
  add constraint logs_poop_color check (
    poop_color is null
    or poop_color in ('yellow', 'green', 'brown', 'black', 'red', 'white')
  ),
  add constraint logs_poop_amount check (
    poop_amount is null or poop_amount in ('small', 'medium', 'large')
  ),
  add constraint logs_poop_only_dirty check (
    (poop_color is null and poop_amount is null)
    or diaper_kind in ('dirty', 'mixed')
  );

comment on column public.logs.poop_color is
  'Optional stool color for a dirty or mixed diaper.';
comment on column public.logs.poop_amount is
  'Optional stool amount for a dirty or mixed diaper: small, medium, or large.';
