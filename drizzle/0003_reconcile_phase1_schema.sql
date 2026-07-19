-- Reconciliación no destructiva entre el esquema Drizzle activo y Supabase.
-- Preflight de producción (2026-07-13): las tablas que reciben índices únicos
-- no contienen duplicados; las tablas que reciben FKs no contienen huérfanos.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.rename_column_if_needed(
  p_table text,
  p_old_column text,
  p_new_column text
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table
      AND column_name = p_old_column
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table
      AND column_name = p_new_column
  ) THEN
    EXECUTE format(
      'ALTER TABLE public.%I RENAME COLUMN %I TO %I',
      p_table,
      p_old_column,
      p_new_column
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.add_fk_if_missing(
  p_table text,
  p_constraint text,
  p_definition text
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = to_regclass('public.' || p_table)
      AND conname = p_constraint
  ) THEN
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I %s',
      p_table,
      p_constraint,
      p_definition
    );
  END IF;
END;
$$;

DO $$
BEGIN
  CREATE TYPE public.event_status AS ENUM ('draft', 'published', 'cancelled', 'completed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  CREATE TYPE public.discount_category AS ENUM (
    'regular',
    'early_payment',
    'loyalty',
    'promotional'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

-- Contratos activos que tenían columnas ausentes en producción.
ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS profile_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid;

UPDATE public.coaches AS coach
SET
  profile_id = COALESCE(coach.profile_id, profile.id),
  user_id = COALESCE(coach.user_id, profile.user_id)
FROM auth.users AS auth_user
JOIN public.profiles AS profile ON profile.user_id = auth_user.id
WHERE coach.email IS NOT NULL
  AND lower(coach.email) = lower(auth_user.email)
  AND (coach.profile_id IS NULL OR coach.user_id IS NULL);

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS status public.event_status NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS max_capacity integer,
  ADD COLUMN IF NOT EXISTS registration_fee integer,
  ADD COLUMN IF NOT EXISTS allow_waitlist boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS waitlist_max_size integer;

ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS role_id uuid,
  ADD COLUMN IF NOT EXISTS custom_message text,
  ADD COLUMN IF NOT EXISTS permissions text[],
  ADD COLUMN IF NOT EXISTS send_email text NOT NULL DEFAULT 'true',
  ADD COLUMN IF NOT EXISTS resend_count text NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS last_resent_at timestamptz;

ALTER TABLE public.discounts
  ADD COLUMN IF NOT EXISTS discount_category public.discount_category NOT NULL DEFAULT 'regular',
  ADD COLUMN IF NOT EXISTS payment_due_days integer,
  ADD COLUMN IF NOT EXISTS early_payment_discount numeric(10, 2),
  ADD COLUMN IF NOT EXISTS early_payment_days integer;

-- athlete_documents conserva campos históricos, pero normaliza el contrato usado por la API actual.
ALTER TABLE public.athlete_documents
  ADD COLUMN IF NOT EXISTS issued_date date,
  ADD COLUMN IF NOT EXISTS expiry_date date,
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_by uuid,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS alert_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.athlete_documents
SET
  file_name = COALESCE(file_name, title, 'documento'),
  expiry_date = COALESCE(expiry_date, expires_at::date),
  updated_at = COALESCE(updated_at, uploaded_at, created_at, now());

ALTER TABLE public.athlete_documents
  ALTER COLUMN document_type TYPE text USING document_type::text,
  ALTER COLUMN file_name TYPE text USING file_name::text,
  ALTER COLUMN file_name SET NOT NULL,
  ALTER COLUMN file_size TYPE text USING file_size::text,
  ALTER COLUMN mime_type TYPE text USING mime_type::text,
  ALTER COLUMN title TYPE text USING title::text,
  ALTER COLUMN title DROP NOT NULL;

-- Renombres históricos: se preservan las columnas auxiliares aún existentes.
SELECT pg_temp.rename_column_if_needed('academy_diagnostics', 'yes_count', 'score');
SELECT pg_temp.rename_column_if_needed('academy_diagnostics', 'recommendations', 'recommended_tasks');
SELECT pg_temp.rename_column_if_needed('academy_diagnostics', 'completed_by', 'created_by_profile_id');
SELECT pg_temp.rename_column_if_needed('academy_diagnostics', 'completed_at', 'created_at');
SELECT pg_temp.rename_column_if_needed('academy_expenses', 'allocation_type', 'applies_to_type');
SELECT pg_temp.rename_column_if_needed('academy_expenses', 'effective_from', 'expense_date');
SELECT pg_temp.rename_column_if_needed('churn_reasons', 'created_by', 'created_by_profile_id');

ALTER TABLE public.academy_expenses
  ADD COLUMN IF NOT EXISTS applies_to_id uuid,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

UPDATE public.academy_expenses
SET
  applies_to_type = CASE WHEN applies_to_type = 'general' THEN 'academy' ELSE applies_to_type END,
  expense_date = COALESCE(expense_date, created_at::date, CURRENT_DATE);

ALTER TABLE public.academy_expenses
  ALTER COLUMN applies_to_type SET DEFAULT 'academy',
  ALTER COLUMN applies_to_type SET NOT NULL,
  ALTER COLUMN expense_date SET NOT NULL;

ALTER TABLE public.coach_compensation
  ADD COLUMN IF NOT EXISTS estimated_weekly_hours integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS effective_from date,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

UPDATE public.coach_compensation
SET
  hourly_rate_cents = COALESCE(hourly_rate_cents, 0),
  monthly_salary_cents = COALESCE(monthly_salary_cents, 0),
  estimated_weekly_hours = COALESCE(
    estimated_weekly_hours,
    round(COALESCE(estimated_weekly_minutes, 0) / 60.0)::integer,
    0
  ),
  effective_from = COALESCE(effective_from, created_at::date, CURRENT_DATE),
  is_active = COALESCE(is_active, true);

ALTER TABLE public.coach_compensation
  ALTER COLUMN hourly_rate_cents SET DEFAULT 0,
  ALTER COLUMN hourly_rate_cents SET NOT NULL,
  ALTER COLUMN monthly_salary_cents SET DEFAULT 0,
  ALTER COLUMN monthly_salary_cents SET NOT NULL,
  ALTER COLUMN estimated_weekly_hours SET DEFAULT 0,
  ALTER COLUMN estimated_weekly_hours SET NOT NULL,
  ALTER COLUMN effective_from SET NOT NULL,
  ALTER COLUMN is_active SET DEFAULT true,
  ALTER COLUMN is_active SET NOT NULL;

-- user_preferences usaba auth.users.id en una fila válida. Se remapea a profiles.id.
UPDATE public.user_preferences AS preference
SET user_id = profile.id
FROM public.profiles AS profile
WHERE preference.user_id = profile.user_id
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles AS current_profile WHERE current_profile.id = preference.user_id
  );

-- Una preferencia inaccesible sin perfil se archiva antes de retirarla del contrato activo.
WITH orphaned AS (
  DELETE FROM public.user_preferences AS preference
  WHERE NOT EXISTS (
    SELECT 1 FROM public.profiles AS profile WHERE profile.id = preference.user_id
  )
  RETURNING preference.*
)
INSERT INTO public.audit_logs (
  user_id,
  action,
  module,
  resource_type,
  resource_id,
  resource_name,
  description,
  meta,
  status
)
SELECT
  orphaned.user_id,
  'settings.preference_orphan_archived',
  'settings',
  'user_preferences',
  orphaned.user_id,
  'Preferencia sin perfil asociado',
  'Archivada durante la reconciliación de esquema de Fase 1',
  to_jsonb(orphaned),
  'warning'
FROM orphaned;

-- Las operaciones de suscripción deben ser idempotentes y libres de carreras.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.announcement_read_status GROUP BY announcement_id, user_id HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM public.conversation_participants GROUP BY conversation_id, user_id HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM public.message_read_receipts GROUP BY message_id, user_id HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM public.group_athletes GROUP BY group_id, athlete_id HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM public.push_subscriptions GROUP BY user_id, endpoint HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM public.user_preferences GROUP BY user_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'No se pueden crear índices únicos: el preflight encontró duplicados';
  END IF;
END;
$$;

DROP INDEX IF EXISTS public.announcement_read_status_unique;
CREATE UNIQUE INDEX announcement_read_status_unique
  ON public.announcement_read_status (announcement_id, user_id);
DROP INDEX IF EXISTS public.conversation_participants_conversation_user_unique;
CREATE UNIQUE INDEX conversation_participants_conversation_user_unique
  ON public.conversation_participants (conversation_id, user_id);
DROP INDEX IF EXISTS public.message_read_receipts_message_user_unique;
CREATE UNIQUE INDEX message_read_receipts_message_user_unique
  ON public.message_read_receipts (message_id, user_id);
DROP INDEX IF EXISTS public.group_athletes_unique;
CREATE UNIQUE INDEX group_athletes_unique ON public.group_athletes (group_id, athlete_id);
CREATE UNIQUE INDEX IF NOT EXISTS user_preferences_user_id_unique
  ON public.user_preferences (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_user_endpoint_unique
  ON public.push_subscriptions (user_id, endpoint);

-- push_tokens era usado por la API pero no existía físicamente.
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token text NOT NULL,
  platform text NOT NULL DEFAULT 'web',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_tokens_user_idx ON public.push_tokens (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS push_tokens_user_token_unique
  ON public.push_tokens (user_id, token);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_tokens TO authenticated, service_role;
REVOKE ALL ON TABLE public.push_tokens FROM anon;
DROP POLICY IF EXISTS "push_tokens_user_access" ON public.push_tokens;
CREATE POLICY "push_tokens_user_access" ON public.push_tokens
  FOR ALL
  USING (is_admin() OR user_id = auth.uid())
  WITH CHECK (is_admin() OR user_id = auth.uid());

-- Relaciones semánticas ausentes en producción.
SELECT pg_temp.add_fk_if_missing('announcements', 'announcements_academy_id_academies_id_fk',
  'FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE');
SELECT pg_temp.add_fk_if_missing('announcements', 'announcements_author_id_profiles_id_fk',
  'FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE');
SELECT pg_temp.add_fk_if_missing('announcement_read_status', 'announcement_read_status_announcement_id_announcements_id_fk',
  'FOREIGN KEY (announcement_id) REFERENCES public.announcements(id) ON DELETE CASCADE');
SELECT pg_temp.add_fk_if_missing('announcement_read_status', 'announcement_read_status_user_id_profiles_id_fk',
  'FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE');
SELECT pg_temp.add_fk_if_missing('conversations', 'conversations_academy_id_academies_id_fk',
  'FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE');
SELECT pg_temp.add_fk_if_missing('conversation_participants', 'conversation_participants_conversation_id_conversations_id_fk',
  'FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE');
SELECT pg_temp.add_fk_if_missing('conversation_participants', 'conversation_participants_user_id_profiles_id_fk',
  'FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE');
SELECT pg_temp.add_fk_if_missing('conversation_messages', 'conversation_messages_conversation_id_conversations_id_fk',
  'FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE');
SELECT pg_temp.add_fk_if_missing('conversation_messages', 'conversation_messages_sender_id_profiles_id_fk',
  'FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE');
SELECT pg_temp.add_fk_if_missing('message_read_receipts', 'message_read_receipts_message_id_conversation_messages_id_fk',
  'FOREIGN KEY (message_id) REFERENCES public.conversation_messages(id) ON DELETE CASCADE');
SELECT pg_temp.add_fk_if_missing('message_read_receipts', 'message_read_receipts_user_id_profiles_id_fk',
  'FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE');
SELECT pg_temp.add_fk_if_missing('coaches', 'coaches_profile_id_profiles_id_fk',
  'FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE');
SELECT pg_temp.add_fk_if_missing('user_preferences', 'user_preferences_user_id_profiles_id_fk',
  'FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE');
SELECT pg_temp.add_fk_if_missing('discount_usage_history', 'discount_usage_history_discount_id_discounts_id_fk',
  'FOREIGN KEY (discount_id) REFERENCES public.discounts(id) ON DELETE CASCADE');
SELECT pg_temp.add_fk_if_missing('discount_usage_history', 'discount_usage_history_athlete_id_athletes_id_fk',
  'FOREIGN KEY (athlete_id) REFERENCES public.athletes(id) ON DELETE SET NULL');
SELECT pg_temp.add_fk_if_missing('discount_usage_history', 'discount_usage_history_charge_id_charges_id_fk',
  'FOREIGN KEY (charge_id) REFERENCES public.charges(id) ON DELETE SET NULL');
SELECT pg_temp.add_fk_if_missing('ticket_attachments', 'ticket_attachments_ticket_id_tickets_id_fk',
  'FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE');
SELECT pg_temp.add_fk_if_missing('ticket_attachments', 'ticket_attachments_response_id_ticket_responses_id_fk',
  'FOREIGN KEY (response_id) REFERENCES public.ticket_responses(id) ON DELETE CASCADE');
SELECT pg_temp.add_fk_if_missing('ticket_attachments', 'ticket_attachments_uploaded_by_profiles_id_fk',
  'FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE CASCADE');
SELECT pg_temp.add_fk_if_missing('ticket_responses', 'ticket_responses_ticket_id_tickets_id_fk',
  'FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE');
SELECT pg_temp.add_fk_if_missing('ticket_responses', 'ticket_responses_user_id_profiles_id_fk',
  'FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE');
SELECT pg_temp.add_fk_if_missing('tickets', 'tickets_academy_id_academies_id_fk',
  'FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE');
SELECT pg_temp.add_fk_if_missing('tickets', 'tickets_created_by_profiles_id_fk',
  'FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE CASCADE');
SELECT pg_temp.add_fk_if_missing('tickets', 'tickets_assigned_to_profiles_id_fk',
  'FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL');
SELECT pg_temp.add_fk_if_missing('marketplace_ratings', 'marketplace_ratings_listing_id_marketplace_listings_id_fk',
  'FOREIGN KEY (listing_id) REFERENCES public.marketplace_listings(id) ON DELETE CASCADE');
SELECT pg_temp.add_fk_if_missing('marketplace_ratings', 'marketplace_ratings_seller_id_profiles_id_fk',
  'FOREIGN KEY (seller_id) REFERENCES public.profiles(id) ON DELETE CASCADE');
SELECT pg_temp.add_fk_if_missing('marketplace_ratings', 'marketplace_ratings_reviewer_id_profiles_id_fk',
  'FOREIGN KEY (reviewer_id) REFERENCES public.profiles(id) ON DELETE CASCADE');
SELECT pg_temp.add_fk_if_missing('advertisements', 'advertisements_created_by_profiles_id_fk',
  'FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL');
SELECT pg_temp.add_fk_if_missing('push_subscriptions', 'push_subscriptions_user_id_profiles_user_id_fk',
  'FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE');
SELECT pg_temp.add_fk_if_missing('push_tokens', 'push_tokens_user_id_profiles_user_id_fk',
  'FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE');

-- Índices declarados por el ORM que faltaban físicamente.
CREATE INDEX IF NOT EXISTS athletes_deleted_at_idx ON public.athletes (deleted_at);
CREATE INDEX IF NOT EXISTS athletes_status_idx ON public.athletes (status);
CREATE INDEX IF NOT EXISTS athletes_academy_status_idx ON public.athletes (academy_id, status);
CREATE INDEX IF NOT EXISTS application_listing_idx ON public.empleo_applications (listing_id);
CREATE INDEX IF NOT EXISTS application_user_idx ON public.empleo_applications (user_id);
CREATE INDEX IF NOT EXISTS empleo_academy_idx ON public.empleo_listings (academy_id);
CREATE INDEX IF NOT EXISTS empleo_category_idx ON public.empleo_listings (category);
CREATE INDEX IF NOT EXISTS empleo_status_idx ON public.empleo_listings (status);
CREATE INDEX IF NOT EXISTS empleo_created_at_idx ON public.empleo_listings (created_at);
CREATE INDEX IF NOT EXISTS classes_deleted_at_idx ON public.classes (deleted_at);
CREATE INDEX IF NOT EXISTS events_status_idx ON public.events (status);
CREATE INDEX IF NOT EXISTS audit_logs_user_idx ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS audit_logs_module_idx ON public.audit_logs (module);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS audit_logs_resource_idx ON public.audit_logs (resource_type, resource_id);
CREATE INDEX IF NOT EXISTS audit_logs_tenant_module_idx ON public.audit_logs (tenant_id, module, created_at);
CREATE INDEX IF NOT EXISTS attendance_records_date_tenant_idx
  ON public.attendance_records (recorded_at, tenant_id);
CREATE INDEX IF NOT EXISTS invitations_role_idx ON public.invitations (role_id);
CREATE INDEX IF NOT EXISTS groups_deleted_at_idx ON public.groups (deleted_at);
CREATE INDEX IF NOT EXISTS notifications_user_read_created_idx
  ON public.notifications (user_id, read, created_at);
CREATE INDEX IF NOT EXISTS discount_campaigns_tenant_academy_idx
  ON public.discount_campaigns (tenant_id, academy_id);
CREATE INDEX IF NOT EXISTS discount_campaigns_discount_idx ON public.discount_campaigns (discount_id);
CREATE INDEX IF NOT EXISTS discount_campaigns_active_dates_idx
  ON public.discount_campaigns (is_active, start_date, end_date);
CREATE INDEX IF NOT EXISTS discount_usage_history_tenant_academy_idx
  ON public.discount_usage_history (tenant_id, academy_id);
CREATE INDEX IF NOT EXISTS discount_usage_history_discount_idx
  ON public.discount_usage_history (discount_id);
CREATE INDEX IF NOT EXISTS discount_usage_history_athlete_idx
  ON public.discount_usage_history (athlete_id);
CREATE INDEX IF NOT EXISTS discount_usage_history_charge_idx
  ON public.discount_usage_history (charge_id);
CREATE INDEX IF NOT EXISTS discount_usage_history_used_at_idx
  ON public.discount_usage_history (used_at);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx ON public.push_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS push_subscriptions_endpoint_idx ON public.push_subscriptions (endpoint);
CREATE INDEX IF NOT EXISTS ticket_attachments_ticket_id_idx ON public.ticket_attachments (ticket_id);
CREATE INDEX IF NOT EXISTS ticket_attachments_response_id_idx ON public.ticket_attachments (response_id);
CREATE INDEX IF NOT EXISTS ticket_responses_ticket_id_idx ON public.ticket_responses (ticket_id);
CREATE INDEX IF NOT EXISTS ticket_responses_user_id_idx ON public.ticket_responses (user_id);
CREATE INDEX IF NOT EXISTS tickets_academy_id_idx ON public.tickets (academy_id);
CREATE INDEX IF NOT EXISTS tickets_created_by_idx ON public.tickets (created_by);
CREATE INDEX IF NOT EXISTS tickets_assigned_to_idx ON public.tickets (assigned_to);
CREATE INDEX IF NOT EXISTS tickets_status_idx ON public.tickets (status);
CREATE INDEX IF NOT EXISTS marketplace_user_idx ON public.marketplace_listings (user_id);
CREATE INDEX IF NOT EXISTS marketplace_category_idx ON public.marketplace_listings (category);
CREATE INDEX IF NOT EXISTS marketplace_type_idx ON public.marketplace_listings (type);
CREATE INDEX IF NOT EXISTS marketplace_status_idx ON public.marketplace_listings (status);
CREATE INDEX IF NOT EXISTS marketplace_created_at_idx ON public.marketplace_listings (created_at);
CREATE INDEX IF NOT EXISTS rating_seller_idx ON public.marketplace_ratings (seller_id);
CREATE INDEX IF NOT EXISTS rating_listing_idx ON public.marketplace_ratings (listing_id);
CREATE INDEX IF NOT EXISTS ad_position_idx ON public.advertisements (position);
CREATE INDEX IF NOT EXISTS ad_active_idx ON public.advertisements (is_active);
CREATE INDEX IF NOT EXISTS ad_dates_idx ON public.advertisements (start_date, end_date);
CREATE INDEX IF NOT EXISTS athlete_documents_expiry_idx ON public.athlete_documents (expiry_date);
CREATE INDEX IF NOT EXISTS templates_country_idx ON public.templates (country);
CREATE INDEX IF NOT EXISTS templates_discipline_idx ON public.templates (discipline);
CREATE INDEX IF NOT EXISTS templates_active_idx ON public.templates (is_active);
CREATE INDEX IF NOT EXISTS template_age_categories_template_idx
  ON public.template_age_categories (template_id);
CREATE INDEX IF NOT EXISTS template_age_categories_sort_idx
  ON public.template_age_categories (template_id, sort_order);
CREATE INDEX IF NOT EXISTS template_competition_flow_template_idx
  ON public.template_competition_flow (template_id);
CREATE INDEX IF NOT EXISTS template_competition_flow_stage_idx
  ON public.template_competition_flow (template_id, stage_order);
CREATE INDEX IF NOT EXISTS academy_diagnostics_tenant_idx ON public.academy_diagnostics (tenant_id);
CREATE INDEX IF NOT EXISTS academy_diagnostics_academy_created_idx
  ON public.academy_diagnostics (academy_id, created_at);
CREATE INDEX IF NOT EXISTS academy_expenses_tenant_idx ON public.academy_expenses (tenant_id);
CREATE INDEX IF NOT EXISTS academy_expenses_academy_idx ON public.academy_expenses (academy_id);
CREATE INDEX IF NOT EXISTS academy_expenses_applies_to_idx
  ON public.academy_expenses (applies_to_type, applies_to_id);
CREATE INDEX IF NOT EXISTS churn_reasons_tenant_idx ON public.churn_reasons (tenant_id);
CREATE INDEX IF NOT EXISTS churn_reasons_academy_athlete_idx
  ON public.churn_reasons (academy_id, athlete_id);
CREATE INDEX IF NOT EXISTS coach_compensation_tenant_idx ON public.coach_compensation (tenant_id);
CREATE INDEX IF NOT EXISTS coach_compensation_academy_coach_idx
  ON public.coach_compensation (academy_id, coach_id);

COMMIT;
