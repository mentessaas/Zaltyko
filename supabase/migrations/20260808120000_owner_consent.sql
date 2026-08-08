-- =============================================================================
-- ZAL-158 [GTM-DEP.2] Server-side consent storage (owner_consent + audit append-only)
-- Issue:    ZAL-158
-- Parent:   ZAL-156 [GTM-DEP] Track de instrumentación de tracking + atribución
-- Spec:     ZAL-158 §2 (modelo de estado) + criterios C1-C4
-- Owner:    Web Developer (agent 5bcea506)
-- Date:     2026-08-08
-- Status:   VERSIONED — NO APLICADA. Aplica con `pnpm db:migrate:reviewed`
--           sobre sandbox antes de producción. Companion a:
--             - src/db/schema/owner-consent.ts (Drizzle schema)
--             - src/lib/consent/owner-consent.ts (helper server-side)
--             - tests/owner-consent.test.ts (unit tests + RLS invariants)
--
-- Decisión de diseño (ver vault/03-Negocio/RESEARCH/ZAL-158 owner_consent
-- design v1 2026-08-08.md):
--   1) Consent por owner (no por academia). Coherente con RGPD Art. 6(1)(b).
--   2) `unset` NO se persiste: el cliente infiere "no hay fila".
--   3) RLS es defense-in-depth (la app conecta con BYPASSRLS). El gate real
--      es la API `withTenant` que valida `consent_proof` contra el flujo.
--   4) Audit append-only enforced en DB (trigger BEFORE UPDATE/DELETE),
--      no en código.
--   5) MVP rechaza `source='imported'` (CHECK + Zod).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) Tabla principal `owner_consent` (1 fila por owner, soft-revoke)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS owner_consent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL UNIQUE REFERENCES profiles(user_id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'granted'
    CHECK (state IN ('granted', 'revoked')),
  granted_at timestamptz NOT NULL DEFAULT now(),
  policy_version text NOT NULL
    CHECK (policy_version ~ '^v[0-9]+-[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  source text NOT NULL
    CHECK (source IN ('signup', 'claim', 'settings')),
  consent_proof text NOT NULL
    CHECK (consent_proof ~ '^(signup|claim|settings):[a-zA-Z0-9_-]{1,128}$'),
  revoked_at timestamptz,
  revocation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS owner_consent_policy_version_idx
  ON owner_consent (policy_version);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS owner_consent_set_updated_at ON owner_consent;
CREATE TRIGGER owner_consent_set_updated_at
  BEFORE UPDATE ON owner_consent
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2) Audit log append-only `owner_consent_audit` (C4)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS owner_consent_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,                       -- sin FK: append-only debe sobrevivir aunque el owner baje
  event text NOT NULL
    CHECK (event IN ('grant', 'revoke', 'policy_bump', 're_grant')),
  policy_version text NOT NULL
    CHECK (policy_version ~ '^v[0-9]+-[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  source text NOT NULL
    CHECK (source IN ('signup', 'claim', 'settings')),
  consent_proof text NOT NULL
    CHECK (consent_proof ~ '^(signup|claim|settings):[a-zA-Z0-9_-]{1,128}$'),
  actor text NOT NULL                           -- 'owner:<uuid>' | 'system:policy_bump' | 'admin:<uuid>'
    CHECK (actor ~ '^(owner|system|admin):[a-zA-Z0-9_-]{1,128}$'),
  reason text,
  previous_audit_id uuid REFERENCES owner_consent_audit(id) ON DELETE SET NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS owner_consent_audit_owner_recorded_idx
  ON owner_consent_audit (owner_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS owner_consent_audit_event_recorded_idx
  ON owner_consent_audit (event, recorded_at);

-- Append-only enforcement: trigger que rechaza UPDATE/DELETE.
CREATE OR REPLACE FUNCTION public.owner_consent_audit_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'owner_consent_audit is append-only (C4)';
END;
$$;

DROP TRIGGER IF EXISTS owner_consent_audit_no_update ON owner_consent_audit;
CREATE TRIGGER owner_consent_audit_no_update
  BEFORE UPDATE ON owner_consent_audit
  FOR EACH ROW EXECUTE FUNCTION public.owner_consent_audit_append_only();

DROP TRIGGER IF EXISTS owner_consent_audit_no_delete ON owner_consent_audit;
CREATE TRIGGER owner_consent_audit_no_delete
  BEFORE DELETE ON owner_consent_audit
  FOR EACH ROW EXECUTE FUNCTION public.owner_consent_audit_append_only();

-- -----------------------------------------------------------------------------
-- 3) Helper SQL `current_policy_version()` (C1)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Sembrar la policy_version inicial v1. Idempotente.
INSERT INTO app_config (key, value)
VALUES ('consent.policy_version', 'v1-2026-08-01')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.current_policy_version()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT value FROM public.app_config
  WHERE key = 'consent.policy_version'
  LIMIT 1;
$$;

-- -----------------------------------------------------------------------------
-- 4) RLS — defense-in-depth (la app server-side bypasa con BYPASSRLS)
-- -----------------------------------------------------------------------------
ALTER TABLE owner_consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_consent_audit ENABLE ROW LEVEL SECURITY;

-- owner_consent: owner lee su propio consent. Writes por API con withTenant.
DROP POLICY IF EXISTS owner_consent_self_read ON owner_consent;
CREATE POLICY owner_consent_self_read ON owner_consent
  FOR SELECT USING (auth.uid() = owner_id);

-- owner_consent_audit: owner lee su historial. Sin UPDATE/DELETE policy
-- (append-only enforcement se hace via trigger).
DROP POLICY IF EXISTS owner_consent_audit_owner_read ON owner_consent_audit;
CREATE POLICY owner_consent_audit_owner_read ON owner_consent_audit
  FOR SELECT USING (auth.uid() = owner_id);

-- -----------------------------------------------------------------------------
-- 5) Comentarios de columna para observabilidad de la DB
-- -----------------------------------------------------------------------------
COMMENT ON TABLE owner_consent IS
  'Estado único de consent por owner (RGPD Art. 6(1)(b)). Revocación soft con timestamp+reason. Ver ZAL-158.';
COMMENT ON COLUMN owner_consent.consent_proof IS
  'Origen verificable: <source>:<id> (signup:<form_id> | claim:<claim_id> | settings:<change_id>)';
COMMENT ON COLUMN owner_consent.policy_version IS
  'Versión de la política de privacidad bajo la cual se otorgó el consent (C1).';
COMMENT ON TABLE owner_consent_audit IS
  'Audit log append-only de cambios de consent. NO UPDATE, NO DELETE (trigger). Ver ZAL-158 C4.';

COMMIT;
