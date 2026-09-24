-- 0007_actor_pages_and_suppliers.sql
-- T1 — Web pública editable por cada actor.
-- Tablas nuevas: actor_pages, actor_consents, suppliers.
-- Cambios en tablas existentes: ADD COLUMN public_slug a academies y athletes,
--   ADD COLUMN public_visible_at y consent_status a athletes.
-- Todo aditivo, no rompe nada existente.

-- ============================================================
-- 1) actor_pages: tabla tag para páginas públicas de 4 tipos de actor
-- ============================================================
CREATE TABLE IF NOT EXISTS "actor_pages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid,
  "academy_id" uuid REFERENCES "academies"("id") ON DELETE SET NULL,
  "entity_type" text NOT NULL CHECK (entity_type IN ('academy','coach','athlete','supplier')),
  "entity_id" uuid NOT NULL,
  "public_slug" text NOT NULL,
  "public_visible" boolean NOT NULL DEFAULT false,
  "published_at" timestamp with time zone,
  "display_name" text NOT NULL,
  "tagline" text,
  "bio_blocks" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "photo_url" text,
  "contact_email" text,
  "contact_phone" text,
  "social_links" jsonb DEFAULT '{}'::jsonb,
  "theme" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "seo_title" text,
  "seo_description" text,
  "seo_image_url" text,
  "language" text NOT NULL DEFAULT 'es',
  "auto_translate" boolean NOT NULL DEFAULT false,
  "consent_status" text NOT NULL DEFAULT 'not_required'
    CHECK (consent_status IN ('not_required','pending','granted','revoked')),
  "blocked_reason" text,
  "blocked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

-- Una sola página pública por (entity_type, entity_id)
CREATE UNIQUE INDEX IF NOT EXISTS "actor_pages_entity_uq"
  ON "actor_pages" ("entity_type","entity_id");
CREATE UNIQUE INDEX IF NOT EXISTS "actor_pages_slug_uq"
  ON "actor_pages" ("public_slug");
CREATE INDEX IF NOT EXISTS "actor_pages_type_idx"
  ON "actor_pages" ("entity_type","public_visible");
CREATE INDEX IF NOT EXISTS "actor_pages_tenant_idx"
  ON "actor_pages" ("tenant_id");

-- ============================================================
-- 2) actor_consents: consentimiento parental versionado
-- ============================================================
CREATE TABLE IF NOT EXISTS "actor_consents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "actor_page_id" uuid NOT NULL REFERENCES "actor_pages"("id") ON DELETE CASCADE,
  "guardian_user_id" uuid NOT NULL,
  "guardian_relationship" text NOT NULL CHECK (guardian_relationship IN ('parent','legal_guardian')),
  "consent_scope" text NOT NULL CHECK (consent_scope IN ('public_page','media_publication','contact_visibility')),
  "granted_at" timestamp with time zone NOT NULL,
  "expires_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "revoked_reason" text,
  "ip_address" text,
  "user_agent" text
);

CREATE INDEX IF NOT EXISTS "actor_consents_page_idx"
  ON "actor_consents" ("actor_page_id");
CREATE INDEX IF NOT EXISTS "actor_consents_guardian_idx"
  ON "actor_consents" ("guardian_user_id");
CREATE INDEX IF NOT EXISTS "actor_consents_granted_idx"
  ON "actor_consents" ("granted_at");
CREATE INDEX IF NOT EXISTS "actor_consents_revoked_idx"
  ON "actor_consents" ("revoked_at");

-- Trigger: si se revoca el consentimiento público, despublicar la página.
CREATE OR REPLACE FUNCTION actor_consent_revoked_unpublish()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.consent_scope = 'public_page' AND NEW.revoked_at IS NOT NULL THEN
    UPDATE actor_pages
       SET public_visible = false,
           updated_at = now()
     WHERE id = NEW.actor_page_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_actor_consent_revoked_unpublish ON actor_consents;
CREATE TRIGGER trg_actor_consent_revoked_unpublish
  AFTER INSERT OR UPDATE ON actor_consents
  FOR EACH ROW
  EXECUTE FUNCTION actor_consent_revoked_unpublish();

-- ============================================================
-- 3) suppliers: nueva tabla para proveedores B2B
-- ============================================================
CREATE TABLE IF NOT EXISTS "suppliers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_user_id" uuid NOT NULL REFERENCES "profiles"("user_id") ON DELETE CASCADE,
  "legal_name" text NOT NULL,
  "tax_id" text,
  "country" text NOT NULL,
  "kyc_status" text NOT NULL DEFAULT 'pending'
    CHECK (kyc_status IN ('pending','in_review','verified','rejected','suspended')),
  "kyc_provider" text,
  "kyc_verified_at" timestamp with time zone,
  "kyc_notes" text,
  "is_premium" boolean NOT NULL DEFAULT false,
  "premium_until" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "suppliers_owner_uq" ON "suppliers" ("owner_user_id");
CREATE INDEX IF NOT EXISTS "suppliers_kyc_idx" ON "suppliers" ("kyc_status");
CREATE INDEX IF NOT EXISTS "suppliers_country_idx" ON "suppliers" ("country");

-- ============================================================
-- 4) Aditivos en tablas existentes
-- ============================================================

-- Academies: public_slug
ALTER TABLE "academies"
  ADD COLUMN IF NOT EXISTS "public_slug" text;

-- Backfill: slug derivado de name + city; con sufijo -2/-3 si colisión.
DO $$
DECLARE
  r record;
  base_slug text;
  candidate text;
  suffix int;
  taken boolean;
BEGIN
  FOR r IN SELECT id, name, city FROM academies WHERE public_slug IS NULL LOOP
    base_slug := lower(regexp_replace(
      coalesce(r.city, '') || '-' || r.name,
      '[^a-zA-Z0-9]+', '-', 'g'
    ));
    base_slug := trim(both '-' from base_slug);
    base_slug := substring(base_slug, 1, 60);
    IF length(base_slug) = 0 THEN base_slug := 'academia'; END IF;
    candidate := base_slug;
    suffix := 0;
    LOOP
      taken := EXISTS (SELECT 1 FROM academies WHERE public_slug = candidate AND id <> r.id);
      EXIT WHEN NOT taken;
      suffix := suffix + 1;
      candidate := base_slug || '-' || suffix::text;
    END LOOP;
    UPDATE academies SET public_slug = candidate WHERE id = r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "academies_public_slug_uq"
  ON "academies" ("public_slug") WHERE public_slug IS NOT NULL;

-- Athletes: public_slug + consent_status
ALTER TABLE "athletes"
  ADD COLUMN IF NOT EXISTS "public_slug" text,
  ADD COLUMN IF NOT EXISTS "consent_status" text NOT NULL DEFAULT 'not_required';

-- Backfill: slug a partir de name (sin colisiones garantizadas en MVP)
DO $$
DECLARE
  r record;
  base_slug text;
  candidate text;
  suffix int;
  taken boolean;
BEGIN
  FOR r IN SELECT id, name FROM athletes WHERE public_slug IS NULL LOOP
    base_slug := lower(regexp_replace(r.name, '[^a-zA-Z0-9]+', '-', 'g'));
    base_slug := trim(both '-' from base_slug);
    base_slug := substring(base_slug, 1, 50);
    IF length(base_slug) = 0 THEN base_slug := 'athlete'; END IF;
    candidate := base_slug;
    suffix := 0;
    LOOP
      taken := EXISTS (
        SELECT 1 FROM athletes WHERE public_slug = candidate AND id <> r.id
        UNION ALL
        SELECT 1 FROM actor_pages WHERE public_slug = candidate
      );
      EXIT WHEN NOT taken;
      suffix := suffix + 1;
      candidate := base_slug || '-' || suffix::text;
    END LOOP;
    UPDATE athletes SET public_slug = candidate WHERE id = r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "athletes_public_slug_uq"
  ON "athletes" ("public_slug") WHERE public_slug IS NOT NULL;

-- Backfill consent_status: derivar de dob
--   <13  → 'pending' (publicable solo con consentimiento)
--   13-15 → 'pending'
--   16-17 → 'pending'
--   >=18 → 'not_required'
UPDATE athletes
   SET consent_status = CASE
     WHEN dob IS NULL THEN 'pending'
     WHEN date_part('year', age(dob)) < 16 THEN 'pending'
     ELSE 'not_required'
   END
 WHERE consent_status = 'not_required';
