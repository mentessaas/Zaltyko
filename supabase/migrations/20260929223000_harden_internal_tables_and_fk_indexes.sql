-- Endurecimiento de rendimiento y de superficie interna.
--
-- 1. Cada clave foranea listada por el linter de Supabase
--    (0001_unindexed_foreign_keys) recibe un indice que cubre la columna
--    referenciada. Evita secuencias de busqueda en cascada al validar o
--    borrar filas hijas.
-- 2. Las tablas de libro interno quedan sin privilegios para los roles que
--    expone la Data API. Mantienen RLS habilitado y sin policies, de modo que
--    el acceso queda denegado por dos capas: privilegio y politica.

begin;

-- ---------------------------------------------------------------------------
-- Indices para claves foraneas sin cobertura
-- ---------------------------------------------------------------------------

create index if not exists idx_academies_fraud_hold_actor_id_fkey
  on public.academies (fraud_hold_actor_id);
create index if not exists idx_academies_fraud_hold_cleared_actor_id_fkey
  on public.academies (fraud_hold_cleared_actor_id);
create index if not exists idx_academies_owner_id_fkey
  on public.academies (owner_id);
create index if not exists idx_academy_diagnostics_created_by_profile_id_fkey
  on public.academy_diagnostics (created_by_profile_id);
create index if not exists idx_academy_expenses_class_id_fkey
  on public.academy_expenses (class_id);
create index if not exists idx_academy_link_requests_requested_by_profile_id_fkey
  on public.academy_link_requests (requested_by_profile_id);
create index if not exists idx_academy_sport_configs_sport_locale_config_id_fkey
  on public.academy_sport_configs (sport_locale_config_id);
create index if not exists idx_academy_trials_started_by_fkey
  on public.academy_trials (started_by);
create index if not exists idx_advertisements_created_by_fkey
  on public.advertisements (created_by);
create index if not exists idx_assessment_scores_skill_id_fkey
  on public.assessment_scores (skill_id);
create index if not exists idx_athlete_assessments_assessed_by_fkey
  on public.athlete_assessments (assessed_by);
create index if not exists idx_athlete_import_batches_initiated_by_fkey
  on public.athlete_import_batches (initiated_by);
create index if not exists idx_athlete_invitations_athlete_id_fkey
  on public.athlete_invitations (athlete_id);
create index if not exists idx_athlete_invitations_invited_by_fkey
  on public.athlete_invitations (invited_by);
create index if not exists idx_athletes_group_id_fkey
  on public.athletes (group_id);
create index if not exists idx_athletes_template_id_fkey
  on public.athletes (template_id);
create index if not exists idx_attendance_records_athlete_id_fkey
  on public.attendance_records (athlete_id);
create index if not exists idx_billing_events_academy_id_fkey
  on public.billing_events (academy_id);
create index if not exists idx_charges_athlete_id_fkey
  on public.charges (athlete_id);
create index if not exists idx_charges_billing_item_id_fkey
  on public.charges (billing_item_id);
create index if not exists idx_churn_reasons_created_by_profile_id_fkey
  on public.churn_reasons (created_by_profile_id);
create index if not exists idx_class_sessions_coach_id_fkey
  on public.class_sessions (coach_id);
create index if not exists idx_class_waiting_list_academy_id_fkey
  on public.class_waiting_list (academy_id);
create index if not exists idx_classes_academy_id_fkey
  on public.classes (academy_id);
create index if not exists idx_coach_notes_academy_id_fkey
  on public.coach_notes (academy_id);
create index if not exists idx_coach_notes_author_id_fkey
  on public.coach_notes (author_id);
create index if not exists idx_coaches_academy_id_fkey
  on public.coaches (academy_id);
create index if not exists idx_coaches_profile_id_fkey
  on public.coaches (profile_id);
create index if not exists idx_commercial_interviews_created_by_profile_id_fkey
  on public.commercial_interviews (created_by_profile_id);
create index if not exists idx_commercial_interviews_updated_by_profile_id_fkey
  on public.commercial_interviews (updated_by_profile_id);
create index if not exists idx_discount_campaigns_academy_id_fkey
  on public.discount_campaigns (academy_id);
create index if not exists idx_discount_campaigns_created_by_fkey
  on public.discount_campaigns (created_by);
create index if not exists idx_discount_usage_history_academy_id_fkey
  on public.discount_usage_history (academy_id);
create index if not exists idx_discounts_created_by_fkey
  on public.discounts (created_by);
create index if not exists idx_event_invitations_event_id_fkey
  on public.event_invitations (event_id);
create index if not exists idx_event_invitations_invited_by_fkey
  on public.event_invitations (invited_by);
create index if not exists idx_event_waitlist_profile_id_fkey
  on public.event_waitlist (profile_id);
create index if not exists idx_events_academy_id_fkey
  on public.events (academy_id);
create index if not exists idx_family_stripe_customers_profile_id_fkey
  on public.family_stripe_customers (profile_id);
create index if not exists idx_groups_billing_item_id_fkey
  on public.groups (billing_item_id);
create index if not exists idx_growth_events_user_id_fkey
  on public.growth_events (user_id);
create index if not exists idx_invitations_default_academy_id_fkey
  on public.invitations (default_academy_id);
create index if not exists idx_invitations_invited_by_fkey
  on public.invitations (invited_by);
create index if not exists idx_lead_trial_outcomes_academy_id_fkey
  on public.lead_trial_outcomes (academy_id);
create index if not exists idx_lead_trial_outcomes_lead_trial_id_fkey
  on public.lead_trial_outcomes (lead_trial_id);
create index if not exists idx_lead_trial_outcomes_recorded_by_fkey
  on public.lead_trial_outcomes (recorded_by);
create index if not exists idx_lead_trials_created_by_fkey
  on public.lead_trials (created_by);
create index if not exists idx_lead_trials_lead_id_fkey
  on public.lead_trials (lead_id);
create index if not exists idx_leads_academy_id_fkey
  on public.leads (academy_id);
create index if not exists idx_marketplace_ratings_reviewer_id_fkey
  on public.marketplace_ratings (reviewer_id);
create index if not exists idx_onboarding_states_owner_profile_id_fkey
  on public.onboarding_states (owner_profile_id);
create index if not exists idx_owner_consent_audit_previous_audit_id_fkey
  on public.owner_consent_audit (previous_audit_id);
create index if not exists idx_payment_attempts_academy_id_fkey
  on public.payment_attempts (academy_id);
create index if not exists idx_receipts_created_by_fkey
  on public.receipts (created_by);
create index if not exists idx_refunds_academy_id_fkey
  on public.refunds (academy_id);
create index if not exists idx_refunds_created_by_fkey
  on public.refunds (created_by);
create index if not exists idx_scholarships_academy_id_fkey
  on public.scholarships (academy_id);
create index if not exists idx_scholarships_created_by_fkey
  on public.scholarships (created_by);
create index if not exists idx_sport_locale_configs_discipline_id_fkey
  on public.sport_locale_configs (discipline_id);
create index if not exists idx_ticket_attachments_uploaded_by_fkey
  on public.ticket_attachments (uploaded_by);

-- ---------------------------------------------------------------------------
-- Tablas internas: sin privilegio para roles expuestos por la Data API
-- ---------------------------------------------------------------------------

-- __drizzle_migrations / zaltyko_schema_migrations son libros de migraciones.
-- lead_interactions se escribe desde la API con el rol de servidor y nunca se
-- consulta desde el navegador. RLS sigue activo y sin policies, por lo que la
-- negacion queda doblemente garantizada.
revoke all on public.__drizzle_migrations from anon, authenticated, public;
revoke all on public.zaltyko_schema_migrations from anon, authenticated, public;
revoke all on public.lead_interactions from anon, authenticated, public;

comment on table public.__drizzle_migrations is
  'Interno. Libro de migraciones de Drizzle. Solo rol de servidor o postgres.';
comment on table public.zaltyko_schema_migrations is
  'Interno. Libro de migraciones SQL de Zaltyko. Solo rol de servidor o postgres.';
comment on table public.lead_interactions is
  'Interno. Escrituras desde la API de contacto con rol de servidor; sin acceso desde la Data API.';

commit;
