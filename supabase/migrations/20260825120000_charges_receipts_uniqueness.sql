-- Zaltyko — anti-doble-cargo: unicidad de cargos por (academia, gimnasta, periodo)
--
-- Caza de bugs Ox Alpha 2026-08-25: la dedupe de generación masiva/mensual
-- era check-then-insert sin respaldo de BD; dos peticiones concurrentes
-- creaban cargos idénticos cobrables por tarjeta.
--
-- Seguro aplicar: verificado 0 grupos duplicados en producción (2026-08-25).
-- Los inserts nuevos usan ON CONFLICT DO NOTHING (charges/bulk, generate-monthly).

CREATE UNIQUE INDEX IF NOT EXISTS "charges_academy_athlete_period_uq"
  ON "charges" ("academy_id", "athlete_id", "period")
  WHERE "athlete_id" IS NOT NULL;

-- Recibos: el índice "receipts_number_unique" se declaró como index() no
-- uniqueIndex(); numeración duplicable bajo concurrencia.
CREATE UNIQUE INDEX IF NOT EXISTS "receipts_academy_number_uq"
  ON "receipts" ("academy_id", "receipt_number");
