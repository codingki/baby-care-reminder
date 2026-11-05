-- Phase 1. Not applied to the hosted database.
-- Bottle-only babies, plus age and weight feeding guidelines the parent can override.

alter table public.babies
  add column feeding_type text not null default 'bottle',
  add column suggested_ml integer,
  add column suggested_interval_minutes integer;

alter table public.babies
  add constraint babies_feeding_bottle check (feeding_type = 'bottle'),
  add constraint babies_suggestion_positive check (
    (suggested_ml is null or suggested_ml > 0)
    and (suggested_interval_minutes is null or suggested_interval_minutes > 0)
  );

comment on column public.babies.feeding_type is
  'v1 supports bottle only.';
comment on column public.babies.suggested_ml is
  'Parent override for millilitres per feed. Null uses the guideline.';
comment on column public.babies.suggested_interval_minutes is
  'Parent override for minutes between feeds. Null uses the guideline.';

create table public.feeding_guidelines (
  id uuid primary key default gen_random_uuid(),
  age_min_days integer not null,
  age_max_days integer,
  weight_min_grams integer not null,
  weight_max_grams integer,
  suggested_ml integer not null,
  interval_minutes integer not null,
  constraint feeding_guidelines_age check (
    age_min_days >= 0
    and (age_max_days is null or age_max_days >= age_min_days)
  ),
  constraint feeding_guidelines_weight check (
    weight_min_grams >= 0
    and (weight_max_grams is null or weight_max_grams >= weight_min_grams)
  ),
  constraint feeding_guidelines_amounts check (
    suggested_ml > 0 and interval_minutes > 0
  )
);

comment on table public.feeding_guidelines is
  'Starting bottle amounts by age and weight. A pediatrician''s advice comes first.';

insert into public.feeding_guidelines (
  age_min_days, age_max_days, weight_min_grams, weight_max_grams, suggested_ml, interval_minutes
)
values
  (0, 28, 0, 3499, 45, 150),
  (0, 28, 3500, null, 60, 180),
  (29, 60, 0, 4499, 75, 180),
  (29, 60, 4500, null, 90, 180),
  (61, 120, 0, 5999, 120, 180),
  (61, 120, 6000, null, 150, 210),
  (121, 180, 0, 6999, 150, 210),
  (121, 180, 7000, null, 180, 240),
  (181, 365, 0, null, 180, 240),
  (366, null, 0, null, 200, 300);

alter table public.feeding_guidelines enable row level security;

create policy feeding_guidelines_select
on public.feeding_guidelines
for select
to authenticated
using (true);

revoke all on table public.feeding_guidelines from public, anon;
grant select on table public.feeding_guidelines to authenticated;
