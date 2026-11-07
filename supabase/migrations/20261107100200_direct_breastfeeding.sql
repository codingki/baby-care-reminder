-- Direct breastfeeding is a feed: feed_kind breast, a side, and a duration.
-- It reschedules the feed reminder because kind stays 'feed'.
-- babies.feeding_type stays bottle-only; this is a log, not a profile change.

alter table public.logs
  add column breast_side text;

alter table public.logs
  add constraint logs_breast_side check (
    breast_side is null or breast_side in ('left', 'right')
  );

comment on column public.logs.breast_side is
  'Left or right side for a direct breastfeed. Null for bottle feeds.';

comment on column public.logs.duration_seconds is
  'Pump length, or direct-breastfeed length, in seconds. Null for bottle feeds.';

alter table public.logs drop constraint logs_kind_fields;

alter table public.logs
  add constraint logs_kind_fields check (
    (
      kind = 'diaper'
      and diaper_kind is not null
      and feed_kind is null
      and amount_ml is null
      and duration_seconds is null
      and pump_id is null
      and breast_side is null
    )
    or (
      kind = 'feed'
      and feed_kind = 'bottle'
      and amount_ml is not null
      and amount_ml > 0
      and diaper_kind is null
      and duration_seconds is null
      and pump_id is null
      and breast_side is null
    )
    or (
      kind = 'feed'
      and feed_kind = 'breast'
      and amount_ml is null
      and diaper_kind is null
      and duration_seconds is not null
      and duration_seconds > 0
      and pump_id is null
      and breast_side in ('left', 'right')
    )
    or (
      kind = 'pump'
      and diaper_kind is null
      and feed_kind is null
      and amount_ml is not null
      and amount_ml > 0
      and (duration_seconds is null or duration_seconds > 0)
      and pump_id is not null
      and breast_side is null
    )
  );
