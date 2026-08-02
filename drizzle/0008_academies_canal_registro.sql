-- ZAL-159 [GTM-DEP.3] — Persistencia y derivación de canal_registro en
-- `academies` en signup.
--
-- Esta migración es staged: NO está en drizzle/meta/_journal.json. Para
-- aplicarla a una DB real, correr manualmente el archivo (idempotente) o
-- regenerar con drizzle-kit después de incluirla en el journal. Ver nota
-- en `vault/06-Roadmap-y-Tareas/Changelog interno.md`.
--
-- Reglas que aplica el trigger:
--   1. BEFORE INSERT: deriva el canal desde los UTM del primer touch y lo
--      guarda como snapshot inmutable. Si la academia entra sin UTMs, queda
--      como `direct` — es dato, no falla.
--   2. BEFORE UPDATE OF utm_source, utm_medium: recalcula SOLO cuando se
--      tocan explícitamente las columnas UTM (p.ej. claim path rellena
--      UTMs sobre un pre-registro vacío). Updates no relacionados con UTM
--      dejan el snapshot intacto (regla first-touch §3).
--   3. La taxonomía deriva `paid > social > email > organic > direct` con
--      `unknown` cuando hay datos parciales no normalizables. Está
--      espejada en `src/lib/gtm/canal.ts::resolveCanal()` y, en PL/pgSQL,
--      en la función `academies_canal_registro_derive()` más abajo — los
--      tests verifican que ambas coinciden.

-- Columna snapshot (NULL permitido para backfill tolerante).
ALTER TABLE "academies"
	ADD COLUMN IF NOT EXISTS "canal_registro" text;
--> statement-breakpoint

-- Comentario in-DB de la taxonomía (lo consume Bumble/Data para entender
-- el enum sin abrir el vault).
COMMENT ON COLUMN "academies"."canal_registro" IS
	'Canal de atribución first-touch del registro de la academia. Derivado en signup desde utm_source + utm_medium (regla paid > social > email > organic > direct; ver `src/lib/gtm/canal.ts` para la taxonomía completa). Valores: paid | social | email | organic | direct | unknown. Snapshot inmutable — solo se recalcula si se hace UPDATE explícito sobre utm_source/utm_medium.';
--> statement-breakpoint

-- Función PL/pgSQL que espeja `resolveCanal()` 1:1. Mantener ambas en sync:
-- si se modifica la taxonomía en TS, propagar el cambio aquí.
CREATE OR REPLACE FUNCTION "academies_canal_registro_derive"()
	RETURNS trigger
	LANGUAGE plpgsql
AS $$
DECLARE
	source text;
	medium text;
BEGIN
	source := lower(coalesce(trim(NEW."utm_source"), ''));
	medium := lower(coalesce(trim(NEW."utm_medium"), ''));

	-- Sin UTM → direct (default; el owner llegó sin parámetros).
	IF source = '' AND medium = '' THEN
		NEW."canal_registro" := 'direct';
		RETURN NEW;
	END IF;

	-- 1) paid — sources específicas de ads o medium=cpc/ppc/paid.
	IF source IN ('google_ads', 'meta_ads', 'tiktok_ads') THEN
		NEW."canal_registro" := 'paid';
		RETURN NEW;
	END IF;

	-- 2) social — incluye whatsapp explícitamente (no es direct).
	IF source IN ('instagram', 'tiktok', 'facebook', 'linkedin', 'whatsapp') THEN
		NEW."canal_registro" := 'social';
		RETURN NEW;
	END IF;

	-- 3) email.
	IF source = 'resend_email' THEN
		NEW."canal_registro" := 'email';
		RETURN NEW;
	END IF;

	-- 4) organic.
	IF source = 'google_organic' THEN
		NEW."canal_registro" := 'organic';
		RETURN NEW;
	END IF;

	-- `google` (alias) → según medium. Sin medium se conserva el default
	-- conservador de Search Ads (paid).
	IF source = 'google' THEN
		IF medium = '' THEN
			NEW."canal_registro" := 'paid';
		ELSIF medium IN ('cpc', 'ppc', 'paid') THEN
			NEW."canal_registro" := 'paid';
		ELSIF medium = 'organic' THEN
			NEW."canal_registro" := 'organic';
		ELSIF medium = 'email' THEN
			NEW."canal_registro" := 'email';
		ELSIF medium = 'social' THEN
			NEW."canal_registro" := 'social';
		ELSE
			NEW."canal_registro" := 'unknown';
		END IF;
		RETURN NEW;
	END IF;

	-- Medium informativo rescata un source desconocido o ausente (cubre
	-- `utm_medium=cpc` sin source, `spam_site + cpc`, etc.).
	IF medium <> '' THEN
		IF medium IN ('cpc', 'ppc', 'paid') THEN
			NEW."canal_registro" := 'paid';
		ELSIF medium = 'social' THEN
			NEW."canal_registro" := 'social';
		ELSIF medium = 'email' THEN
			NEW."canal_registro" := 'email';
		ELSIF medium = 'organic' THEN
			NEW."canal_registro" := 'organic';
		ELSE
			NEW."canal_registro" := 'unknown';
		END IF;
		RETURN NEW;
	END IF;

	-- Source presente pero desconocido, sin medium que rescate.
	NEW."canal_registro" := 'unknown';
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

-- BEFORE UPDATE OF utm_source, utm_medium: solo se recalcula cuando se
-- hace un UPDATE explícito sobre los campos UTM. Updates sobre otras
-- columnas dejan el snapshot intacto (regla first-touch §3).
DROP TRIGGER IF EXISTS "academies_canal_registro_bu" ON "academies";
--> statement-breakpoint
CREATE TRIGGER "academies_canal_registro_bu"
	BEFORE UPDATE OF "utm_source", "utm_medium" ON "academies"
	FOR EACH ROW
	EXECUTE FUNCTION "academies_canal_registro_derive"();
--> statement-breakpoint

-- Backfill idempotente: cubre academias existentes pre-ZAL-159 aplicando la
-- misma lógica. Si ya tienen canal_registro seteado por el trigger tras la
-- última migración, el UPDATE OF utm_source/utm_medium lo recalcula pero
-- es determinístico (mismas reglas → mismo resultado).
UPDATE "academies"
	SET "utm_source" = "utm_source"
	WHERE "canal_registro" IS NULL;
--> statement-breakpoint

-- Bumble/ROI query: filtro por canal. Índices parciales para los canales
-- frecuentes (paid, social, email, organic) — direct y unknown suelen ser
-- la mayoría ruidosa.
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
