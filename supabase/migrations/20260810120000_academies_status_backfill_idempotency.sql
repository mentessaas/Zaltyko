-- =============================================================================
-- ZAL-510 — Blindar la idempotencia del backfill de status de academies
-- Issue:    ZAL-510 (corrección posterior a ZAL-489 / ZAL-328)
-- Date:     2026-08-10
-- Status:   VERSIONED — NO APLICADA. Requiere revisión de Web Developer y
--           aplicación controlada mediante pnpm db:migrate:ledger --apply.
-- =============================================================================
--
-- La migración 20260805120000 ya está registrada en el ledger y no se modifica.
-- Esta migración contiene únicamente el backfill corregido para que una
-- ejecución repetida nunca cambie los estados terminales `churned` ni
-- `fraud_hold` a estados operativos.
--
-- Las expresiones `status IS NULL OR ...` conservan la tolerancia del backfill
-- original aunque la columna actual sea NOT NULL; los estados terminales quedan
-- explícitamente fuera de las tres transiciones.
-- =============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Backfill seguro e idempotente a partir de los flags legacy.
-- ----------------------------------------------------------------------------
UPDATE academies
SET
  status = 'suspended',
  status_updated_at = COALESCE(status_updated_at, now())
WHERE is_suspended = true
  AND (
    status IS NULL
    OR status NOT IN ('suspended', 'churned', 'fraud_hold')
  );

UPDATE academies
SET
  status = 'trial',
  status_updated_at = COALESCE(status_updated_at, now())
WHERE is_trial_active = true
  AND is_suspended = false
  AND (
    status IS NULL
    OR status NOT IN ('churned', 'fraud_hold')
  )
  AND (status IS NULL OR status = 'active');

UPDATE academies
SET
  status = 'active',
  status_updated_at = COALESCE(status_updated_at, now())
WHERE is_suspended = false
  AND is_trial_active = false
  AND (
    status IS NULL
    OR status NOT IN ('churned', 'fraud_hold')
  )
  AND (status IS NULL OR status <> 'active');

COMMIT;
