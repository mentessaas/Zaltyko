-- ZAL-138 [D-006] Magic links Supabase para primeras atletas
-- Tabla de invitaciones + columnas de tracking en athletes.
-- Atleta confirmado = magic_link_opened_at IS NOT NULL AND profile_completed_at IS NOT NULL.
-- Esta migración NO crea índices únicos en auth.users; el aislamiento lo gestiona
-- la API (withTenant + verificación por academyId), no RLS (BYPASSRLS en servidor).

CREATE TABLE IF NOT EXISTS "athlete_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"academy_id" uuid NOT NULL REFERENCES "academies"("id") ON DELETE CASCADE,
	"email" text NOT NULL,
	"email_normalized" text NOT NULL,
	"status" text NOT NULL DEFAULT 'pending',
	"template" text NOT NULL DEFAULT 'first_athlete_v1',
	"custom_message" text,
	"magic_link_token" text NOT NULL,
	"magic_link_sent_at" timestamp with time zone,
	"magic_link_opened_at" timestamp with time zone,
	"profile_completed_at" timestamp with time zone,
	"athlete_id" uuid REFERENCES "athletes"("id") ON DELETE SET NULL,
	"invited_by" uuid NOT NULL,
	"attempt_count" integer NOT NULL DEFAULT 0,
	"last_error" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Idempotencia: una invitación activa por (academyId, email_normalized) para
-- los estados vivos (pending/sent/opened). Permite reintento seguro sin duplicar.
CREATE UNIQUE INDEX IF NOT EXISTS "athlete_invitations_active_unique"
	ON "athlete_invitations" ("academy_id", "email_normalized")
	WHERE "status" IN ('pending', 'sent', 'opened');
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "athlete_invitations_token_idx"
	ON "athlete_invitations" ("magic_link_token");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "athlete_invitations_tenant_academy_idx"
	ON "athlete_invitations" ("tenant_id", "academy_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "athlete_invitations_status_idx"
	ON "athlete_invitations" ("status");
--> statement-breakpoint

-- Columnas para KPI TTFAA en athletes (D-006 v0 SPEC).
ALTER TABLE "athletes"
	ADD COLUMN IF NOT EXISTS "invite_email" text,
	ADD COLUMN IF NOT EXISTS "magic_link_opened_at" timestamp with time zone,
	ADD COLUMN IF NOT EXISTS "profile_completed_at" timestamp with time zone;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "athletes_invite_email_idx"
	ON "athletes" ("invite_email");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "athletes_activation_idx"
	ON "athletes" ("academy_id", "magic_link_opened_at", "profile_completed_at");
