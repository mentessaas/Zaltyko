-- =============================================================================
-- ZAL-328 [D-006/WD→P&S] Modelar status semánticas academy (churned/fraud_hold)
-- Issue:    ZAL-328 (child of ZAL-324)
-- Parent:   ZAL-324 [D-006/WD] Cerrar 5 gaps de activación d0/d2/d7
-- Spec:     ZAL-139 v0.2 §6 (gate de envío) + ZAL-315 §3 (criterios B3)
-- Owner:    Platform & Security (agent 6909a098)
-- Date:     2026-08-05
-- Status:   VERSIONED — NO APLICADA. Aplica con `pnpm db:migrate:reviewed`
--           sobre sandbox cuando el Web Developer verifique el shape.
-- =============================================================================
--
-- Decisión: opción (a) enum con `status text NOT NULL DEFAULT 'active'`.
-- Ver ZAL-315 §3.1 (recomendación P&S) y ZAL-312 B3 (QA verdict).
-- Valores: active, trial, suspended, churned, fraud_hold.
--
-- Backfill: filas existentes se mapean según transitorio
--   is_suspended=true   → status='suspended', suspendedAt = actualmente
--   is_trial_active=true (y no suspended) → status='trial'
--   resto (post-purga 2026-07-07: sin suspended, sin trial) → status='active'
--
-- Esta migración es INDEPENDIENTE de la transición a eliminar `is_suspended`.
-- Mientras la UI del super-admin siga usando `is_suspended` para togglear
-- suspensión, mantenemos ambos. El gate de envío (§6 v0.2) usa `status`
-- directamente, más el legacy `isSuspended=true` como red de seguridad
-- durante la transición (defense in depth, no dependencia).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) Enum-style check constraint (idempotente por si re-ejecuta el ledger)
-- -----------------------------------------------------------------------------
ALTER TABLE academies
  DROP CONSTRAINT IF EXISTS academies_status_values_check;

ALTER TABLE academies
  ADD CONSTRAINT academies_status_values_check
  CHECK (status IN ('active', 'trial', 'suspended', 'churned', 'fraud_hold'));

-- -----------------------------------------------------------------------------
-- 2) Columnas aditivas (todas idempotentes con IF NOT EXISTS)
-- -----------------------------------------------------------------------------
ALTER TABLE academies
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

ALTER TABLE academies
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz;

ALTER TABLE academies
  ADD COLUMN IF NOT EXISTS churned_at timestamptz;

ALTER TABLE academies
  ADD COLUMN IF NOT EXISTS churned_reason text;

ALTER TABLE academies
  ADD COLUMN IF NOT EXISTS churned_reason_notes text;

ALTER TABLE academies
  ADD COLUMN IF NOT EXISTS fraud_hold_at timestamptz;

ALTER TABLE academies
  ADD COLUMN IF NOT EXISTS fraud_hold_reason text;

ALTER TABLE academies
  ADD COLUMN IF NOT EXISTS fraud_hold_reason_notes text;

ALTER TABLE academies
  ADD COLUMN IF NOT EXISTS fraud_hold_actor_id uuid
    REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE academies
  ADD COLUMN IF NOT EXISTS fraud_hold_cleared_at timestamptz;

ALTER TABLE academies
  ADD COLUMN IF NOT EXISTS fraud_hold_cleared_actor_id uuid
    REFERENCES profiles(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- 3) Check constraints para los enums de razón (defensa en profundidad)
-- -----------------------------------------------------------------------------
ALTER TABLE academies
  DROP CONSTRAINT IF EXISTS academies_fraud_hold_reason_check;

ALTER TABLE academies
  ADD CONSTRAINT academies_fraud_hold_reason_check
  CHECK (
    fraud_hold_reason IS NULL
    OR fraud_hold_reason IN (
      'payment_fraud_signal',
      'owner_identity_failure',
      'chargeback_threshold',
      'manual_review',
      'other'
    )
  );

ALTER TABLE academies
  DROP CONSTRAINT IF EXISTS academies_churned_reason_check;

ALTER TABLE academies
  ADD CONSTRAINT academies_churned_reason_check
  CHECK (
    churned_reason IS NULL
    OR churned_reason IN (
      'trial_expired_no_payment',
      'owner_cancellation',
      'manual_closure',
      'other'
    )
  );

-- -----------------------------------------------------------------------------
-- 4) Cross-field invariant: si fraud_hold=true, fraud_hold_at Y fraud_hold_reason
--    deben estar presentes. Refleja criterio B3 §3.3 #2 (auditoría obligatoria).
-- -----------------------------------------------------------------------------
ALTER TABLE academies
  DROP CONSTRAINT IF EXISTS academies_fraud_hold_audit_required;

ALTER TABLE academies
  ADD CONSTRAINT academies_fraud_hold_audit_required
  CHECK (
    status <> 'fraud_hold'
    OR (fraud_hold_at IS NOT NULL AND fraud_hold_reason IS NOT NULL)
  );

-- -----------------------------------------------------------------------------
-- 5) Backfill idempotente de status a partir de flags legacy
--    - is_suspended=true → status='suspended'
--    - is_trial_active=true (y no suspended) → status='trial'
--    - resto → status='active'
--    - status_updated_at = now() cuando el backfill cambia el valor
--    No tocamos `churned` ni `fraud_hold` en el backfill — no había filas
--    así pre-migración y meterlas sin evidencia sería fabricación.
-- -----------------------------------------------------------------------------
UPDATE academies
SET
  status = 'suspended',
  status_updated_at = COALESCE(status_updated_at, now())
WHERE is_suspended = true
  AND (status IS NULL OR status NOT IN ('suspended', 'fraud_hold'));

UPDATE academies
SET
  status = 'trial',
  status_updated_at = COALESCE(status_updated_at, now())
WHERE is_trial_active = true
  AND is_suspended = false
  AND (status IS NULL OR status = 'active');

UPDATE academies
SET
  status = 'active',
  status_updated_at = COALESCE(status_updated_at, now())
WHERE is_suspended = false
  AND is_trial_active = false
  AND (status IS NULL OR status <> 'active');

-- -----------------------------------------------------------------------------
-- 6) Índices para queries de gate y directorio público
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS academies_status_idx
  ON academies (status);

-- Soporta la query canónica del directorio público:
--   WHERE is_public = true AND status NOT IN ('churned', 'fraud_hold')
CREATE INDEX IF NOT EXISTS academies_status_public_idx
  ON academies (status, is_public);

-- -----------------------------------------------------------------------------
-- 7) RLS — Endurecimiento para anon/lectura pública
--    Patrón: NO se cambia la policy `academies_select` existente (server con
--    BYPASSRLS no la ve). Se añade una policy separada `academies_public_directory`
--    explícita para el directorio público `is_public=true`. La lectura anon
--    del directorio NO debe filtrar `churned` ni `fraud_hold`.
--
--    El directorio público (`get-public-academies.ts`, `/api/public/academies`)
--    sigue usando el cliente admin / conexión postgres con BYPASSRLS, por lo
--    que la policy funciona como defensa en profundidad: si en el futuro se
--    cambia el cliente a `anon`, el directorio sigue siendo seguro.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "academies_public_directory" ON academies;

CREATE POLICY "academies_public_directory"
  ON academies
  FOR SELECT
  TO anon, authenticated
  USING (
    is_public = true
    AND status NOT IN ('churned', 'fraud_hold')
  );

COMMENT ON POLICY "academies_public_directory" ON academies IS
  'Lectura pública del directorio: solo academias activas visibles. '
  'Excluye churned (terminal) y fraud_hold (decisión de seguridad).';

-- -----------------------------------------------------------------------------
-- 8) Helper SQL centralizado para el gate de envío (mismo criterio que
--    `isAcademyBlockedFromSending` en TypeScript). Mantener aquí para que
--    cualquier caller SQL (jobs, queries ad-hoc) evalúe la misma regla.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_academy_blocked_from_sending(target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM academies a
    WHERE a.id = target
      AND (
        a.status IN ('suspended', 'churned', 'fraud_hold')
        OR a.is_suspended = true
      )
  );
$$;

COMMENT ON FUNCTION public.is_academy_blocked_from_sending(uuid) IS
  'Gate de envío §6 spec v0.2: true si la academia está bloqueada para '
  'emails transaccionales soft (d0/d2/d7, marketing, notificaciones). '
  'Defense in depth: combina status semántico + flag legacy is_suspended '
  'durante la transición.';

-- -----------------------------------------------------------------------------
-- 9) Trigger de sync legacy `is_suspended` <-> `status='suspended'`
--    Mientras la UI del super-admin togglee `is_suspended`, mantenemos
--    ambos en sync. Esto evita drift silencioso entre el flag binario
--    (que la UI ve) y el status semántico (que el gate usa).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_academy_status_from_legacy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Si is_suspended cambió y estamos en suspended/active, propagar a status.
  IF NEW.is_suspended IS DISTINCT FROM OLD.is_suspended THEN
    IF NEW.is_suspended = true AND NEW.status NOT IN ('fraud_hold') THEN
      NEW.status := 'suspended';
      NEW.status_updated_at := now();
    ELSIF NEW.is_suspended = false AND NEW.status = 'suspended' THEN
      NEW.status := CASE
        WHEN NEW.is_trial_active = true THEN 'trial'
        ELSE 'active'
      END;
      NEW.status_updated_at := now();
    END IF;
  END IF;

  -- Si status cambió manualmente a suspended y is_suspended no estaba, reflejarlo.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_updated_at := now();
    IF NEW.status = 'suspended' AND NEW.is_suspended = false THEN
      NEW.is_suspended := true;
    ELSIF NEW.status IN ('active', 'trial') AND OLD.status = 'suspended' AND NEW.is_suspended = true THEN
      NEW.is_suspended := false;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_academy_status_legacy ON academies;

CREATE TRIGGER sync_academy_status_legacy
  BEFORE UPDATE ON academies
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_academy_status_from_legacy();

-- -----------------------------------------------------------------------------
-- 10) Idempotencia del ledger: registrar la migración en zaltyko_schema_migrations
--     El runner `pnpm db:migrate:ledger` lo hace automáticamente por nombre de
--     archivo + SHA256, así que no hay INSERT manual aquí.
-- -----------------------------------------------------------------------------

COMMIT;
