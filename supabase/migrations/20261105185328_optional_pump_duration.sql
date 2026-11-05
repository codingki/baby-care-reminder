-- Pump duration is optional. The log still stores one total amount and the owned pump.

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
    )
    or (
      kind = 'feed'
      and feed_kind = 'bottle'
      and amount_ml is not null
      and amount_ml > 0
      and diaper_kind is null
      and duration_seconds is null
      and pump_id is null
    )
    or (
      kind = 'pump'
      and diaper_kind is null
      and feed_kind is null
      and amount_ml is not null
      and amount_ml > 0
      and (duration_seconds is null or duration_seconds > 0)
      and pump_id is not null
    )
  );

comment on column public.logs.duration_seconds is
  'Optional pump length in seconds.';
