-- ZAL-159 [GTM-DEP.3] — Persistencia y derivación de canal_registro en
-- `academies` en signup.
--
-- Esta migración es staged: NO está en drizzle/meta/_journal.json. Para
-- aplicarla a una DB real, correr manualmente el archivo (idempotente) o
-- regenerar con drizzle-kit después de incluirla en el journal. Ver nota
-- en `vault/06-Roadmap-y-Tareas/Changelog interno.md`.
--
-- Reglas que aplica el trigger:
--   1. BEFORE INSERT: deriva el canal desde los UTM del primer touch.
--   2. Un único BEFORE UPDATE cubre el signup efectivo de una academia
--      pre-registrada sin UTM. Solo actúa si el snapshot anterior era
--      `direct`/NULL y ambos UTM anteriores estaban vacíos.
--   3. Cualquier actualización posterior conserva el snapshot first-touch.
--   4. UTM ausente o inválido cae en `direct`; no existe un sexto bucket.

-- Columna snapshot (NULL permitido para backfill tolerante).
ALTER TABLE "academies"
	ADD COLUMN IF NOT EXISTS "canal_registro" text;
--> statement-breakpoint

-- Comentario in-DB de la taxonomía (lo consume Bumble/Data para entender
-- el enum sin abrir el vault).
COMMENT ON COLUMN "academies"."canal_registro" IS
	'Canal de atribución first-touch del registro de la academia. Derivado en signup desde utm_source + utm_medium (regla paid > social > email > organic > direct; ver `src/lib/gtm/canal.ts` para la taxonomía completa). Valores: paid | social | email | organic | direct. UTM ausente o inválido = direct. Snapshot inmutable tras la primera captura.';
--> statement-breakpoint

-- Función pura SQL que espeja `derivar_canal()` 1:1. El orden de los CASE
-- expresa la precedencia completa: medium=cpc gana sobre una fuente social,
-- y una fuente paid gana sobre medium=email/social/organic.
CREATE OR REPLACE FUNCTION "academies_canal_registro_value"(
	utm_source_value text,
	utm_medium_value text
)
	RETURNS text
	LANGUAGE sql
	IMMUTABLE
	PARALLEL SAFE
AS $$
	SELECT CASE
		WHEN lower(coalesce(trim(utm_medium_value), '')) = 'cpc'
			OR lower(coalesce(trim(utm_source_value), '')) IN ('google_ads', 'meta_ads', 'tiktok_ads')
			THEN 'paid'
		WHEN lower(coalesce(trim(utm_medium_value), '')) = 'social'
			OR lower(coalesce(trim(utm_source_value), '')) IN ('instagram', 'tiktok', 'facebook', 'linkedin', 'whatsapp')
			THEN 'social'
		WHEN lower(coalesce(trim(utm_medium_value), '')) = 'email'
			OR lower(coalesce(trim(utm_source_value), '')) = 'resend_email'
			THEN 'email'
		WHEN lower(coalesce(trim(utm_medium_value), '')) = 'organic'
			OR lower(coalesce(trim(utm_source_value), '')) = 'google_organic'
			THEN 'organic'
		ELSE 'direct'
	END;
$$;
--> statement-breakpoint

-- Wrapper de trigger: toda escritura usa la misma función pura, incluido el
-- backfill de filas históricas.
CREATE OR REPLACE FUNCTION "academies_canal_registro_derive"()
	RETURNS trigger
	LANGUAGE plpgsql
AS $$
BEGIN
	NEW."canal_registro" := "academies_canal_registro_value"(
		NEW."utm_source",
		NEW."utm_medium"
	);
	RETURN NEW;
END;
$$;
--> statement-breakpoint

-- BEFORE INSERT: snapshot inmutable en signup.
DROP TRIGGER IF EXISTS "academies_canal_registro_bi" ON "academies";
--> statement-breakpoint
CREATE TRIGGER "academies_canal_registro_bi"
	BEFORE INSERT ON "academies"
	FOR EACH ROW
	EXECUTE FUNCTION "academies_canal_registro_derive"();
--> statement-breakpoint

-- Excepción acotada para academias pre-registradas: el claim del owner es
-- su signup efectivo. La condición impide cualquier recálculo posterior.
DROP TRIGGER IF EXISTS "academies_canal_registro_bu" ON "academies";
--> statement-breakpoint
CREATE TRIGGER "academies_canal_registro_bu"
	BEFORE UPDATE OF "utm_source", "utm_medium" ON "academies"
	FOR EACH ROW
	WHEN (
		coalesce(trim(OLD."utm_source"), '') = ''
		AND coalesce(trim(OLD."utm_medium"), '') = ''
		AND (
			coalesce(trim(NEW."utm_source"), '') <> ''
			OR coalesce(trim(NEW."utm_medium"), '') <> ''
		)
		AND (OLD."canal_registro" IS NULL OR OLD."canal_registro" = 'direct')
	)
	EXECUTE FUNCTION "academies_canal_registro_derive"();
--> statement-breakpoint

-- Backfill idempotente: cubre academias existentes pre-ZAL-159 aplicando la
-- misma función pura sin tocar los UTM ni reatribuir snapshots existentes.
UPDATE "academies"
	SET "canal_registro" = "academies_canal_registro_value"(
		"utm_source",
		"utm_medium"
	)
	WHERE "canal_registro" IS NULL;
--> statement-breakpoint

-- Bumble/ROI query: filtro por canal. Índices parciales para los canales
-- frecuentes (paid, social, email, organic) — direct suele ser la mayoría.
CREATE INDEX IF NOT EXISTS "academies_canal_paid_idx"
	ON "academies" ("tenant_id", "created_at")
	WHERE "canal_registro" = 'paid';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "academies_canal_social_idx"
	ON "academies" ("tenant_id", "created_at")
	WHERE "canal_registro" = 'social';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "academies_canal_email_idx"
	ON "academies" ("tenant_id", "created_at")
	WHERE "canal_registro" = 'email';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "academies_canal_organic_idx"
	ON "academies" ("tenant_id", "created_at")
	WHERE "canal_registro" = 'organic';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "academies_canal_direct_idx"
	ON "academies" ("tenant_id", "created_at")
	WHERE "canal_registro" = 'direct';
