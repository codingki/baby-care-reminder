-- Catalog additions. Do not edit earlier migrations.
-- Motion In-Bra is Medela's in-bra wearable. eufy models stay in the listed order.

insert into public.pump_models (brand, model, sort_order)
values
  ('Medela', 'Motion In-Bra', 55),
  ('eufy', 'S2 Pro', 130),
  ('eufy', 'S1 Pro', 140),
  ('eufy', 'S1', 150),
  ('eufy', 'E20', 160),
  ('eufy', 'E10', 170)
on conflict (brand, model) do nothing;
