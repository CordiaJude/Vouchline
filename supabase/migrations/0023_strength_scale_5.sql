-- ===== Phase C: strength scale 3 -> 5 =====
-- lo_strength/hi_strength/eff_strength are unchanged in every other way
-- -- eff_strength stays least(lo,hi), stays private always (never
-- returned by any RPC as a number or label), and still only drives edge
-- thickness/opacity and broker ranking. Only the allowed range grows.
alter table public.connections
  drop constraint connections_lo_strength_check,
  drop constraint connections_hi_strength_check,
  add constraint connections_lo_strength_check check (lo_strength between 1 and 5),
  add constraint connections_hi_strength_check check (hi_strength between 1 and 5);
