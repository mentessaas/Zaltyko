-- ZAL-157 [GTM-DEP.1] UTM capture en signup (first-touch, sessionStorage)
-- Persiste los 5 parámetros UTM en academies para atribución del canal
-- de registro (ZAL-159). Regla first-touch: si el owner llegó con UTMs
-- desde una landing anterior y luego navegó hasta /onboarding/owner, esos
-- valores originales se preservan. El claim path (OwnerClaimCard) también
-- persiste para no perder atribución cuando el email matchea la seed list.
--
-- Esta migración NO activa un trigger para sobreescribir UTMs: la API es
-- la única fuente de escritura. Regla §4 de la taxonomía:
-- snake_case, minúsculas, sin espacios, max 200 chars por columna.

ALTER TABLE "academies"
	ADD COLUMN IF NOT EXISTS "utm_source" text,
	ADD COLUMN IF NOT EXISTS "utm_medium" text,
	ADD COLUMN IF NOT EXISTS "utm_campaign" text,
	ADD COLUMN IF NOT EXISTS "utm_term" text,
	ADD COLUMN IF NOT EXISTS "utm_content" text,
	ADD COLUMN IF NOT EXISTS "utm_captured_at" timestamp with time zone,
	ADD COLUMN IF NOT EXISTS "utm_landing_path" text;
--> statement-breakpoint

-- Lookup por fuente para queries de ROI por canal (ZAL-159 + Bumble).
CREATE INDEX IF NOT EXISTS "academies_utm_source_idx"
	ON "academies" ("utm_source");
--> statement-breakpoint

-- Lookup por medium (paid/social/email/organic) — acelera filtros de
-- atribución cuando solo nos interesa el medium (ej. cohort paid).
CREATE INDEX IF NOT EXISTS "academies_utm_medium_idx"
	ON "academies" ("utm_medium");
--> statement-breakpoint

-- Comentario de taxonomía sobre la columna source (documentación in-DB
-- para que Bumble/Data no tenga que abrir el vault para entender el enum).
COMMENT ON COLUMN "academies"."utm_source" IS
	'utm_source del primer touch. Taxonomía reconciliada §4: google_ads, meta_ads, tiktok_ads, instagram, tiktok, facebook, linkedin, whatsapp, resend_email, google_organic, google (alias). Vacío = direct.';
COMMENT ON COLUMN "academies"."utm_medium" IS
	'utm_medium del primer touch (paid/social/email/organic o libre).';
COMMENT ON COLUMN "academies"."utm_captured_at" IS
	'Timestamp del primer page view con UTMs válidos. NULL si el owner llegó directo sin parámetros.';
COMMENT ON COLUMN "academies"."utm_landing_path" IS
	'Path del landing donde se capturaron los UTMs (ej. /es/artistica/mexico). Útil para atribuir a la página de entrada, no solo al canal.';