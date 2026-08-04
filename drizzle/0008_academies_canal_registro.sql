-- ZAL-159 [GTM-DEP.3] — Persistencia y derivación de canal_registro en
-- `academies` en signup.
--
-- Esta migración es staged: NO está en drizzle/meta/_journal.json. Para
-- aplicarla a una DB real, correr manualmente el archivo (idempotente) o
-- regenerar con drizzle-kit después de incluirla en el journal. Ver nota
-- en `vault/06-Roadmap-y-Tareas/Changelog interno.md`.
--
-- Reglas que aplican los triggers:
--   1. BEFORE INSERT: deriva el canal desde los UTM del primer touch.
--   2. Un único BEFORE UPDATE (sobre toda la fila, no solo sobre las columnas
--      UTM) cubre el signup efectivo de una academia pre-registrada sin UTM.
--      Solo deriva si el snapshot anterior era `direct`/NULL y ambos UTM
--      anteriores estaban vacíos.
--   3. Cualquier otra actualización restaura el snapshot first-touch, incluido
--      un `UPDATE academies SET canal_registro = ...` directo.
--   4. UTM ausente o inválido cae en `direct`; no existe un sexto bucket.
--
-- Alcance real de la inmutabilidad (2 y 3): es a nivel de trigger, así que
-- cubre al servidor de la app aunque conecte como `postgres` con BYPASSRLS
-- (los triggers no se saltan por superusuario). NO cubre a alguien que
-- ejecute `session_replication_role = 'replica'`, `ALTER TABLE ... DISABLE
-- TRIGGER` o un `DROP TRIGGER` — eso requiere privilegio de owner de tabla y
-- es un control de acceso, no de esquema.

-- Columna snapshot (NULL permitido para backfill tolerante).
ALTER TABLE "academies"
	ADD COLUMN IF NOT EXISTS "canal_registro" text;
--> statement-breakpoint

-- Comentario in-DB de la taxonomía (lo consume Bumble/Data para entender
-- el enum sin abrir el vault).
COMMENT ON COLUMN "academies"."canal_registro" IS
	'Canal de atribución first-touch del registro de la academia. Derivado en signup desde utm_source + utm_medium (regla paid > social > email > organic > direct; ver `src/lib/gtm/canal.ts` para la taxonomía completa). Valores: paid | social | email | organic | direct. UTM ausente o inválido = direct. El snapshot lo fija el INSERT y solo puede rederivarse en el claim de una academia pre-registrada que aún no tenía UTM; cualquier otro UPDATE lo restaura (trigger academies_canal_registro_bu).';
--> statement-breakpoint

-- Normalización que espeja `String.prototype.trim()` + `toLowerCase()` de TS.
-- `trim()` de SQL solo recorta espacios; JS recorta TODO el whitespace, así
-- que un `utm_source` con tab o newline al borde divergía entre ambos lados
-- (F1 de la QA en ZAL-176: `"\tgoogle_ads"` daba `paid` en TS y `direct` en
-- Postgres).
--
-- Verificado en Postgres 14.20 con LC_CTYPE en_US.UTF-8: `[[:space:]]` cubre
-- space, tab, newline, CR, FF, VT y también NBSP (U+00A0). El único carácter
-- que JS recorta y esta función no es el BOM/ZWNBSP (U+FEFF); se acepta el
-- residual porque un UTM con BOM al borde no es un caso alcanzable desde una
-- query string real. En una base SQL_ASCII el rango se reduce a ASCII.
CREATE OR REPLACE FUNCTION "academies_canal_registro_norm"(raw_value text)
	RETURNS text
	LANGUAGE sql
	IMMUTABLE
	PARALLEL SAFE
AS $$
	SELECT lower(
		regexp_replace(
			coalesce(raw_value, ''),
			'^[[:space:]]+|[[:space:]]+$',
			'',
			'g'
		)
	);
$$;
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
		WHEN "academies_canal_registro_norm"(utm_medium_value) = 'cpc'
			OR "academies_canal_registro_norm"(utm_source_value) IN ('google_ads', 'meta_ads', 'tiktok_ads')
			THEN 'paid'
		WHEN "academies_canal_registro_norm"(utm_medium_value) = 'social'
			OR "academies_canal_registro_norm"(utm_source_value) IN ('instagram', 'tiktok', 'facebook', 'linkedin', 'whatsapp')
			THEN 'social'
		WHEN "academies_canal_registro_norm"(utm_medium_value) = 'email'
			OR "academies_canal_registro_norm"(utm_source_value) = 'resend_email'
			THEN 'email'
		WHEN "academies_canal_registro_norm"(utm_medium_value) = 'organic'
			OR "academies_canal_registro_norm"(utm_source_value) = 'google_organic'
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
-- su signup efectivo. Fuera de esa ventana el snapshot es inmutable, incluso
-- ante un `UPDATE academies SET canal_registro = ...` directo, que la versión
-- anterior no interceptaba (F2 de la QA en ZAL-176 y bloqueante levantado por
-- Platform & Security en ZAL-174).
--
-- El trigger cubre TODA la tabla en UPDATE (sin lista `OF`) porque el bypass
-- consistía justamente en escribir la columna sin tocar los UTM.
CREATE OR REPLACE FUNCTION "academies_canal_registro_update_guard"()
	RETURNS trigger
	LANGUAGE plpgsql
AS $$
BEGIN
	-- Primer touch efectivo: la fila no tenía UTM alguno y ahora los recibe.
	IF "academies_canal_registro_norm"(OLD."utm_source") = ''
		AND "academies_canal_registro_norm"(OLD."utm_medium") = ''
		AND (
			"academies_canal_registro_norm"(NEW."utm_source") <> ''
			OR "academies_canal_registro_norm"(NEW."utm_medium") <> ''
		)
		AND (OLD."canal_registro" IS NULL OR OLD."canal_registro" = 'direct')
	THEN
		NEW."canal_registro" := "academies_canal_registro_value"(
			NEW."utm_source",
			NEW."utm_medium"
		);
		RETURN NEW;
	END IF;

	-- Cualquier otra escritura conserva el snapshot first-touch. Se restaura
	-- en silencio en vez de lanzar excepción para no romper UPDATEs legítimos
	-- de otras columnas que arrastren la fila entera.
	NEW."canal_registro" := OLD."canal_registro";
	RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS "academies_canal_registro_bu" ON "academies";
--> statement-breakpoint
CREATE TRIGGER "academies_canal_registro_bu"
	BEFORE UPDATE ON "academies"
	FOR EACH ROW
	EXECUTE FUNCTION "academies_canal_registro_update_guard"();
--> statement-breakpoint

-- Backfill idempotente: cubre academias existentes pre-ZAL-159 aplicando la
-- misma función pura sin tocar los UTM ni reatribuir snapshots existentes.
-- Nota: este UPDATE dispara el guard de arriba, que restaura OLD (NULL) para
-- filas ya existentes, así que el SET se aplica con `session_replication_role`
-- intacto solo en la ruta de primer touch. Para el backfill se desactiva el
-- trigger explícitamente y se vuelve a activar.
ALTER TABLE "academies" DISABLE TRIGGER "academies_canal_registro_bu";
--> statement-breakpoint
UPDATE "academies"
	SET "canal_registro" = "academies_canal_registro_value"(
		"utm_source",
		"utm_medium"
	)
	WHERE "canal_registro" IS NULL;
--> statement-breakpoint
ALTER TABLE "academies" ENABLE TRIGGER "academies_canal_registro_bu";
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
