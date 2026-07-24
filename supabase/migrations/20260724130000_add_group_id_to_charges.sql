-- Multi-grupo real: un atleta puede pertenecer a varios grupos a la vez y cada
-- grupo genera su propia cuota. charges.group_id distingue el cargo de cada grupo
-- dentro del mismo periodo. Aditivo e idempotente.
--
-- Ver [[Decisiones#2026-07-24 - Multi-grupo real por atleta con cuota por grupo]].

ALTER TABLE charges
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES groups (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS charges_group_id_idx ON charges (group_id);

CREATE INDEX IF NOT EXISTS charges_academy_athlete_period_group_idx
  ON charges (academy_id, athlete_id, period, group_id);
