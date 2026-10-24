-- CURRENT-STATE SCHEMA SNAPSHOT; NOT RECOVERED MIGRATION HISTORY.
-- Captured read-only from pg_catalog/information_schema on the authorized
-- Zaltyko E2E Sandbox project aeeootdmuiqkfeernskw on 2026-10-24 UTC,
-- after the assay observation recorded at 17:54 Europe/Madrid.
-- No application rows, credentials, API keys, or operational role memberships
-- are included. Supabase-managed auth/storage schemas and role definitions are
-- supplied by the pinned local Supabase stack in remote CI.
-- This baseline may run only when the four application schemas contain no
-- application relations, routines, or user-defined types, and an explicit
-- database-local CI marker is present. The guard below runs before any
-- CREATE/ALTER statement and refuses existing or unmarked databases.

DO $baseline_empty_schema_guard$
DECLARE
  v_existing text;
BEGIN
  IF current_setting('app.schema_snapshot_replay', true) IS DISTINCT FROM 'ci-empty-replay' THEN
    RAISE EXCEPTION 'Refusing current-state schema baseline: isolated CI replay marker is missing';
  END IF;

  SELECT string_agg(item, ', ' ORDER BY item)
    INTO v_existing
  FROM (
    SELECT item FROM (
      SELECT format('%I.%I [relation]', n.nspname, c.relname) AS item
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ('public','zaltyko','zaltyko_domain_private','zaltyko_private')
        AND c.relkind IN ('r','p','v','m','S','f')
      UNION ALL
      SELECT format('%I.%I [routine]', n.nspname, p.proname)
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname IN ('public','zaltyko','zaltyko_domain_private','zaltyko_private')
      UNION ALL
      SELECT format('%I.%I [type]', n.nspname, t.typname)
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname IN ('public','zaltyko','zaltyko_domain_private','zaltyko_private')
        AND t.typtype <> 'p'
    ) all_objects
    ORDER BY item
    LIMIT 20
  ) existing;
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'Refusing current-state schema baseline: application schemas are not empty: %', v_existing;
  END IF;
END
$baseline_empty_schema_guard$;

CREATE SCHEMA IF NOT EXISTS extensions;

CREATE SCHEMA IF NOT EXISTS vault;

CREATE SCHEMA IF NOT EXISTS public;
ALTER SCHEMA public OWNER TO pg_database_owner;

CREATE SCHEMA IF NOT EXISTS zaltyko;
ALTER SCHEMA zaltyko OWNER TO postgres;

CREATE SCHEMA IF NOT EXISTS zaltyko_domain_private;
ALTER SCHEMA zaltyko_domain_private OWNER TO postgres;

CREATE SCHEMA IF NOT EXISTS zaltyko_private;
ALTER SCHEMA zaltyko_private OWNER TO postgres;

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions VERSION '1.7';

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions VERSION '1.11';

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions VERSION '1.3';

CREATE EXTENSION IF NOT EXISTS plpgsql WITH SCHEMA pg_catalog VERSION '1.0';

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault VERSION '0.3.1';

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions VERSION '1.1';

CREATE TYPE public.academy_type AS ENUM ('artistica', 'ritmica', 'trampolin', 'general', 'parkour', 'danza');

CREATE TYPE public.ad_position AS ENUM ('marketplace_top', 'marketplace_sidebar', 'marketplace_between', 'empleo_top', 'empleo_sidebar', 'empleo_between', 'events_top', 'events_sidebar', 'events_between');

CREATE TYPE public.ad_type AS ENUM ('banner', 'featured');

CREATE TYPE public.application_status AS ENUM ('pending', 'reviewed', 'accepted', 'rejected');

CREATE TYPE public.assessment_type AS ENUM ('technical', 'artistic', 'execution', 'coach_feedback', 'competition', 'practice');

CREATE TYPE public.billing_item_periodicity AS ENUM ('one_time', 'monthly', 'yearly');

CREATE TYPE public.charge_status AS ENUM ('pending', 'paid', 'overdue', 'cancelled', 'partial', 'failed', 'refunded');

CREATE TYPE public.discount_category AS ENUM ('regular', 'early_payment', 'loyalty', 'promotional', 'sibling');

CREATE TYPE public.document_type AS ENUM ('identity_document', 'medical_certificate', 'consent_form', 'birth_certificate', 'federative_license', 'insurance', 'photo', 'other');

CREATE TYPE public.event_discipline AS ENUM ('artistic_female', 'artistic_male', 'rhythmic', 'trampoline', 'parkour');

CREATE TYPE public.event_level AS ENUM ('internal', 'local', 'national', 'international');

CREATE TYPE public.event_payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded');

CREATE TYPE public.event_registration_status AS ENUM ('pending', 'confirmed', 'cancelled', 'waitlisted');

CREATE TYPE public.event_status AS ENUM ('draft', 'published', 'cancelled', 'completed');

CREATE TYPE public.event_type AS ENUM ('competitions', 'courses', 'camps', 'workshops', 'clinics', 'evaluations', 'other');

CREATE TYPE public.event_waitlist_status AS ENUM ('waiting', 'notified', 'converted', 'expired');

CREATE TYPE public.job_category AS ENUM ('coach', 'assistant_coach', 'administrative', 'physiotherapist', 'psychologist', 'other');

CREATE TYPE public.job_listing_status AS ENUM ('active', 'closed', 'draft');

CREATE TYPE public.job_type AS ENUM ('full_time', 'part_time', 'internship');

CREATE TYPE public.license_status AS ENUM ('active', 'expired', 'suspended', 'pending');

CREATE TYPE public.marketplace_category AS ENUM ('equipment', 'clothing', 'supplements', 'books', 'particular_training', 'personal_training', 'clinics', 'arbitration', 'physiotherapy', 'photography', 'other');

CREATE TYPE public.marketplace_listing_status AS ENUM ('active', 'sold', 'hidden');

CREATE TYPE public.marketplace_listing_type AS ENUM ('product', 'service');

CREATE TYPE public.marketplace_price_type AS ENUM ('fixed', 'negotiable', 'contact');

CREATE TYPE public.membership_role AS ENUM ('owner', 'coach', 'viewer');

CREATE TYPE public.onboarding_checklist_status AS ENUM ('pending', 'completed', 'skipped');

CREATE TYPE public.payment_method AS ENUM ('cash', 'transfer', 'bizum', 'card_manual', 'other', 'card');

CREATE TYPE public.permission AS ENUM ('athletes:read', 'athletes:create', 'athletes:update', 'athletes:delete', 'classes:read', 'classes:create', 'classes:update', 'classes:delete', 'classes:schedule', 'billing:read', 'billing:create', 'billing:update', 'billing:payments', 'billing:invoices', 'billing:reports', 'coaches:read', 'coaches:create', 'coaches:update', 'coaches:delete', 'reports:read', 'reports:create', 'reports:export', 'settings:read', 'settings:write', 'settings:branding', 'settings:users', 'events:read', 'events:create', 'events:update', 'events:delete', 'communications:read', 'communications:send', 'communications:templates');

CREATE TYPE public.person_type AS ENUM ('athlete', 'coach', 'judge');

CREATE TYPE public.profile_role AS ENUM ('super_admin', 'admin', 'owner', 'coach', 'athlete', 'parent', 'provider');

CREATE TYPE public.subscription_status AS ENUM ('active', 'past_due', 'trialing', 'canceled', 'incomplete');

CREATE TYPE public.ticket_category AS ENUM ('technical', 'billing', 'account', 'feature_request', 'other');

CREATE TYPE public.ticket_priority AS ENUM ('low', 'medium', 'high', 'urgent');

CREATE TYPE public.ticket_status AS ENUM ('open', 'in_progress', 'waiting', 'resolved', 'closed');

CREATE TYPE zaltyko.attendance_status AS ENUM ('present', 'absent', 'excused', 'late');

CREATE TYPE zaltyko.benchmark_profile_status AS ENUM ('draft', 'active', 'retired');

CREATE TYPE zaltyko.billing_cadence AS ENUM ('one_time', 'weekly', 'monthly', 'quarterly', 'annual');

CREATE TYPE zaltyko.charge_status AS ENUM ('due', 'partially_paid', 'paid', 'void');

CREATE TYPE zaltyko.contact_consent_status AS ENUM ('unknown', 'granted', 'denied', 'revoked');

CREATE TYPE zaltyko.data_quality_issue_status AS ENUM ('open', 'resolved');

CREATE TYPE zaltyko.enrollment_source AS ENUM ('import', 'owner', 'parent', 'trial', 'waitlist', 'transfer', 'api');

CREATE TYPE zaltyko.enrollment_status AS ENUM ('pending', 'trial', 'active', 'paused', 'cancelled', 'completed');

CREATE TYPE zaltyko.entitlement_source AS ENUM ('bootstrap', 'stripe_subscription', 'contract', 'trial', 'trial_expired');

CREATE TYPE zaltyko.family_collection_mode AS ENUM ('manual', 'automatic');

CREATE TYPE zaltyko.family_relationship AS ENUM ('parent', 'legal_guardian', 'foster_guardian', 'other');

CREATE TYPE zaltyko.group_membership_status AS ENUM ('pending', 'active', 'paused', 'ended');

CREATE TYPE zaltyko.guardian_contact_kind AS ENUM ('email', 'phone');

CREATE TYPE zaltyko.health_dimension AS ENUM ('enrollment', 'financial', 'operational', 'workforce');

CREATE TYPE zaltyko.health_score_status AS ENUM ('critical', 'needs_attention', 'healthy', 'excellent', 'insufficient_data');

CREATE TYPE zaltyko.insight_action_status AS ENUM ('recorded', 'completed', 'failed');

CREATE TYPE zaltyko.insight_delivery_channel AS ENUM ('in_app', 'email');

CREATE TYPE zaltyko.insight_delivery_status AS ENUM ('pending', 'sent', 'failed', 'suppressed');

CREATE TYPE zaltyko.insight_outcome AS ENUM ('pending', 'positive', 'neutral', 'negative', 'not_measurable');

CREATE TYPE zaltyko.insight_rule_status AS ENUM ('draft', 'active', 'retired');

CREATE TYPE zaltyko.insight_run_status AS ENUM ('running', 'succeeded', 'failed');

CREATE TYPE zaltyko.insight_severity AS ENUM ('info', 'warning', 'critical');

CREATE TYPE zaltyko.insight_status AS ENUM ('open', 'viewed', 'actioned', 'snoozed', 'dismissed', 'resolved');

CREATE TYPE zaltyko.invoice_status AS ENUM ('draft', 'issued', 'partially_paid', 'paid', 'void');

CREATE TYPE zaltyko.lifecycle_status AS ENUM ('draft', 'active', 'archived');

CREATE TYPE zaltyko.location_scope_mode AS ENUM ('all', 'selected');

CREATE TYPE zaltyko.manual_payment_method AS ENUM ('cash', 'bank_transfer', 'card_terminal', 'other');

CREATE TYPE zaltyko.member_role AS ENUM ('owner', 'manager', 'admin', 'coach');

CREATE TYPE zaltyko.member_status AS ENUM ('invited', 'active', 'suspended', 'revoked');

CREATE TYPE zaltyko.metric_direction AS ENUM ('higher_better', 'lower_better', 'neutral');

CREATE TYPE zaltyko.metric_grain AS ENUM ('day', 'week', 'month', 'season', 'year');

CREATE TYPE zaltyko.metric_quality AS ENUM ('complete', 'partial', 'insufficient', 'stale', 'invalid');

CREATE TYPE zaltyko.metric_run_status AS ENUM ('running', 'succeeded', 'failed');

CREATE TYPE zaltyko.metric_unit AS ENUM ('count', 'ratio', 'currency_minor');

CREATE TYPE zaltyko.normalization_direction AS ENUM ('higher_better', 'lower_better');

CREATE TYPE zaltyko.organization_payment_account_status AS ENUM ('pending', 'onboarding', 'restricted', 'active', 'disabled');

CREATE TYPE zaltyko.organization_saas_trial_status AS ENUM ('active', 'expired', 'converted', 'cancelled');

CREATE TYPE zaltyko.organization_sport_role AS ENUM ('primary', 'additional');

CREATE TYPE zaltyko.organization_sport_status AS ENUM ('active', 'inactive');

CREATE TYPE zaltyko.organization_status AS ENUM ('trial', 'active', 'suspended', 'closed');

CREATE TYPE zaltyko.outbox_status AS ENUM ('pending', 'processing', 'processed', 'failed');

CREATE TYPE zaltyko.payment_attempt_status AS ENUM ('pending', 'succeeded', 'failed');

CREATE TYPE zaltyko.payment_authorization_status AS ENUM ('pending', 'active', 'revoked', 'expired');

CREATE TYPE zaltyko.payment_source AS ENUM ('manual', 'provider');

CREATE TYPE zaltyko.payment_status AS ENUM ('pending', 'succeeded', 'partially_refunded', 'refunded', 'failed');

CREATE TYPE zaltyko.program_kind AS ENUM ('gymnastics_sport', 'complementary_activity');

CREATE TYPE zaltyko.provider_environment AS ENUM ('sandbox', 'live');

CREATE TYPE zaltyko.provider_event_status AS ENUM ('received', 'processing', 'processed', 'failed');

CREATE TYPE zaltyko.reconciliation_status AS ENUM ('balanced', 'unbalanced');

CREATE TYPE zaltyko.refund_status AS ENUM ('pending', 'succeeded', 'failed');

CREATE TYPE zaltyko.saas_billing_interval AS ENUM ('month', 'year');

CREATE TYPE zaltyko.saas_plan_code AS ENUM ('free', 'starter', 'growth', 'network');

CREATE TYPE zaltyko.score_version_status AS ENUM ('draft', 'active', 'retired');

CREATE TYPE zaltyko.session_status AS ENUM ('scheduled', 'completed', 'cancelled');

CREATE TYPE zaltyko.sport_profile_status AS ENUM ('identity_only', 'verified', 'draft', 'retired');

CREATE TYPE zaltyko.stripe_environment AS ENUM ('test', 'live');

CREATE TYPE zaltyko.trial_followup_channel AS ENUM ('email', 'phone', 'sms', 'in_person');

CREATE TYPE zaltyko.trial_followup_outcome AS ENUM ('contacted', 'no_answer', 'converted', 'waitlisted', 'not_interested', 'follow_up_needed');

CREATE TYPE zaltyko.trial_status AS ENUM ('booked', 'attended', 'completed', 'no_show', 'cancelled', 'converted');

CREATE TYPE zaltyko.waitlist_offer_status AS ENUM ('pending', 'accepted', 'declined', 'expired', 'revoked');

CREATE TYPE zaltyko.waitlist_status AS ENUM ('waiting', 'offered', 'converted', 'withdrawn', 'expired');

-- Exact owner reconstruction for the captured user-defined types.
ALTER TYPE public.academy_type OWNER TO postgres;
ALTER TYPE public.ad_position OWNER TO postgres;
ALTER TYPE public.ad_type OWNER TO postgres;
ALTER TYPE public.application_status OWNER TO postgres;
ALTER TYPE public.assessment_type OWNER TO postgres;
ALTER TYPE public.billing_item_periodicity OWNER TO postgres;
ALTER TYPE public.charge_status OWNER TO postgres;
ALTER TYPE public.discount_category OWNER TO postgres;
ALTER TYPE public.document_type OWNER TO postgres;
ALTER TYPE public.event_discipline OWNER TO postgres;
ALTER TYPE public.event_level OWNER TO postgres;
ALTER TYPE public.event_payment_status OWNER TO postgres;
ALTER TYPE public.event_registration_status OWNER TO postgres;
ALTER TYPE public.event_status OWNER TO postgres;
ALTER TYPE public.event_type OWNER TO postgres;
ALTER TYPE public.event_waitlist_status OWNER TO postgres;
ALTER TYPE public.job_category OWNER TO postgres;
ALTER TYPE public.job_listing_status OWNER TO postgres;
ALTER TYPE public.job_type OWNER TO postgres;
ALTER TYPE public.license_status OWNER TO postgres;
ALTER TYPE public.marketplace_category OWNER TO postgres;
ALTER TYPE public.marketplace_listing_status OWNER TO postgres;
ALTER TYPE public.marketplace_listing_type OWNER TO postgres;
ALTER TYPE public.marketplace_price_type OWNER TO postgres;
ALTER TYPE public.membership_role OWNER TO postgres;
ALTER TYPE public.onboarding_checklist_status OWNER TO postgres;
ALTER TYPE public.payment_method OWNER TO postgres;
ALTER TYPE public.permission OWNER TO postgres;
ALTER TYPE public.person_type OWNER TO postgres;
ALTER TYPE public.profile_role OWNER TO postgres;
ALTER TYPE public.subscription_status OWNER TO postgres;
ALTER TYPE public.ticket_category OWNER TO postgres;
ALTER TYPE public.ticket_priority OWNER TO postgres;
ALTER TYPE public.ticket_status OWNER TO postgres;
ALTER TYPE zaltyko.attendance_status OWNER TO postgres;
ALTER TYPE zaltyko.benchmark_profile_status OWNER TO postgres;
ALTER TYPE zaltyko.billing_cadence OWNER TO postgres;
ALTER TYPE zaltyko.charge_status OWNER TO postgres;
ALTER TYPE zaltyko.contact_consent_status OWNER TO postgres;
ALTER TYPE zaltyko.data_quality_issue_status OWNER TO postgres;
ALTER TYPE zaltyko.enrollment_source OWNER TO postgres;
ALTER TYPE zaltyko.enrollment_status OWNER TO postgres;
ALTER TYPE zaltyko.entitlement_source OWNER TO postgres;
ALTER TYPE zaltyko.family_collection_mode OWNER TO postgres;
ALTER TYPE zaltyko.family_relationship OWNER TO postgres;
ALTER TYPE zaltyko.group_membership_status OWNER TO postgres;
ALTER TYPE zaltyko.guardian_contact_kind OWNER TO postgres;
ALTER TYPE zaltyko.health_dimension OWNER TO postgres;
ALTER TYPE zaltyko.health_score_status OWNER TO postgres;
ALTER TYPE zaltyko.insight_action_status OWNER TO postgres;
ALTER TYPE zaltyko.insight_delivery_channel OWNER TO postgres;
ALTER TYPE zaltyko.insight_delivery_status OWNER TO postgres;
ALTER TYPE zaltyko.insight_outcome OWNER TO postgres;
ALTER TYPE zaltyko.insight_rule_status OWNER TO postgres;
ALTER TYPE zaltyko.insight_run_status OWNER TO postgres;
ALTER TYPE zaltyko.insight_severity OWNER TO postgres;
ALTER TYPE zaltyko.insight_status OWNER TO postgres;
ALTER TYPE zaltyko.invoice_status OWNER TO postgres;
ALTER TYPE zaltyko.lifecycle_status OWNER TO postgres;
ALTER TYPE zaltyko.location_scope_mode OWNER TO postgres;
ALTER TYPE zaltyko.manual_payment_method OWNER TO postgres;
ALTER TYPE zaltyko.member_role OWNER TO postgres;
ALTER TYPE zaltyko.member_status OWNER TO postgres;
ALTER TYPE zaltyko.metric_direction OWNER TO postgres;
ALTER TYPE zaltyko.metric_grain OWNER TO postgres;
ALTER TYPE zaltyko.metric_quality OWNER TO postgres;
ALTER TYPE zaltyko.metric_run_status OWNER TO postgres;
ALTER TYPE zaltyko.metric_unit OWNER TO postgres;
ALTER TYPE zaltyko.normalization_direction OWNER TO postgres;
ALTER TYPE zaltyko.organization_payment_account_status OWNER TO postgres;
ALTER TYPE zaltyko.organization_saas_trial_status OWNER TO postgres;
ALTER TYPE zaltyko.organization_sport_role OWNER TO postgres;
ALTER TYPE zaltyko.organization_sport_status OWNER TO postgres;
ALTER TYPE zaltyko.organization_status OWNER TO postgres;
ALTER TYPE zaltyko.outbox_status OWNER TO postgres;
ALTER TYPE zaltyko.payment_attempt_status OWNER TO postgres;
ALTER TYPE zaltyko.payment_authorization_status OWNER TO postgres;
ALTER TYPE zaltyko.payment_source OWNER TO postgres;
ALTER TYPE zaltyko.payment_status OWNER TO postgres;
ALTER TYPE zaltyko.program_kind OWNER TO postgres;
ALTER TYPE zaltyko.provider_environment OWNER TO postgres;
ALTER TYPE zaltyko.provider_event_status OWNER TO postgres;
ALTER TYPE zaltyko.reconciliation_status OWNER TO postgres;
ALTER TYPE zaltyko.refund_status OWNER TO postgres;
ALTER TYPE zaltyko.saas_billing_interval OWNER TO postgres;
ALTER TYPE zaltyko.saas_plan_code OWNER TO postgres;
ALTER TYPE zaltyko.score_version_status OWNER TO postgres;
ALTER TYPE zaltyko.session_status OWNER TO postgres;
ALTER TYPE zaltyko.sport_profile_status OWNER TO postgres;
ALTER TYPE zaltyko.stripe_environment OWNER TO postgres;
ALTER TYPE zaltyko.trial_followup_channel OWNER TO postgres;
ALTER TYPE zaltyko.trial_followup_outcome OWNER TO postgres;
ALTER TYPE zaltyko.trial_status OWNER TO postgres;
ALTER TYPE zaltyko.waitlist_offer_status OWNER TO postgres;
ALTER TYPE zaltyko.waitlist_status OWNER TO postgres;

-- Normalize only app-schema scoped default ACLs, then replay the captured
-- app defaults. Global Supabase platform defaults remain supplied by CLI.
DO $baseline_default_acl_reset$
DECLARE
  v_creator text;
  v_schema text;
  v_role text;
  v_kind text;
  v_kinds text[] := ARRAY['TABLES','SEQUENCES','FUNCTIONS','TYPES'];
BEGIN
  FOREACH v_creator IN ARRAY ARRAY['postgres','supabase_admin'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_creator) THEN
      RAISE EXCEPTION 'Supabase platform role % is required for schema default ACL replay', v_creator;
    END IF;
    FOREACH v_schema IN ARRAY ARRAY['public','zaltyko','zaltyko_domain_private','zaltyko_private'] LOOP
      FOREACH v_kind IN ARRAY v_kinds LOOP
        EXECUTE format(
          'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I REVOKE ALL ON %s FROM PUBLIC',
          v_creator, v_schema, v_kind
        );
        FOR v_role IN
          SELECT rolname FROM pg_roles WHERE rolname <> v_creator ORDER BY rolname
        LOOP
          EXECUTE format(
            'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I REVOKE ALL ON %s FROM %I',
            v_creator, v_schema, v_kind, v_role
          );
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;
END
$baseline_default_acl_reset$;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA zaltyko GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA zaltyko GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO service_role;

-- Tables are deliberately created before their FK/check/unique constraints.
CREATE TABLE public.academies (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  country text,
  region text,
  city text,
  academy_type public.academy_type DEFAULT 'artistica'::public.academy_type NOT NULL,
  public_description text,
  is_public boolean DEFAULT true NOT NULL,
  logo_url text,
  website text,
  contact_email text,
  contact_phone text,
  address text,
  social_instagram text,
  social_facebook text,
  social_twitter text,
  social_youtube text,
  owner_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  is_suspended boolean DEFAULT false NOT NULL,
  suspended_at timestamp with time zone,
  trial_starts_at timestamp with time zone,
  trial_ends_at timestamp with time zone,
  is_trial_active boolean DEFAULT false NOT NULL,
  payments_configured_at timestamp with time zone,
  timezone text,
  branding_colors text,
  schedule_config text,
  stripe_public_key text,
  stripe_secret_key text,
  stripe_webhook_secret text,
  tax_id text,
  invoice_prefix text DEFAULT 'INV'::text,
  country_code text,
  discipline text,
  discipline_variant text,
  federation_config_version text,
  specialization_status text DEFAULT 'legacy'::text NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  status_updated_at timestamp with time zone,
  churned_at timestamp with time zone,
  churned_reason text,
  churned_reason_notes text,
  fraud_hold_at timestamp with time zone,
  fraud_hold_reason text,
  fraud_hold_reason_notes text,
  fraud_hold_actor_id uuid,
  fraud_hold_cleared_at timestamp with time zone,
  fraud_hold_cleared_actor_id uuid,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  utm_captured_at timestamp with time zone
);

CREATE TABLE public.academy_diagnostics (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL,
  answers jsonb NOT NULL,
  score integer NOT NULL,
  level text NOT NULL,
  recommended_tasks jsonb DEFAULT '[]'::jsonb NOT NULL,
  created_by_profile_id uuid,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.academy_expenses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL,
  label text NOT NULL,
  category text DEFAULT 'other'::text NOT NULL,
  amount_cents integer NOT NULL,
  currency text DEFAULT 'EUR'::text NOT NULL,
  recurrence text DEFAULT 'monthly'::text NOT NULL,
  applies_to_type text DEFAULT 'academy'::text NOT NULL,
  group_id uuid,
  class_id uuid,
  coach_id uuid,
  period text,
  expense_date date NOT NULL,
  effective_to date,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  applies_to_id uuid,
  is_active boolean DEFAULT true NOT NULL
);

CREATE TABLE public.academy_geo_groups (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  country text,
  region text,
  city text,
  academy_id uuid NOT NULL
);

CREATE TABLE public.academy_link_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL,
  target_profile_id uuid NOT NULL,
  requested_by_profile_id uuid NOT NULL,
  requested_profile_role public.profile_role NOT NULL,
  requested_membership_role public.membership_role NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  message text,
  responded_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.academy_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  sender_academy_id uuid NOT NULL,
  receiver_academy_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  read_at timestamp with time zone
);

CREATE TABLE public.academy_roles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  academy_id uuid NOT NULL,
  name character varying(100) NOT NULL,
  description text,
  permissions jsonb DEFAULT '[]'::jsonb NOT NULL,
  is_default boolean DEFAULT false NOT NULL,
  type text DEFAULT 'custom'::text NOT NULL,
  inherits_from uuid,
  is_active boolean DEFAULT true NOT NULL,
  updated_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid
);

CREATE TABLE public.academy_sport_configs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL,
  sport_locale_config_id uuid NOT NULL,
  academy_kind text DEFAULT 'mixed'::text NOT NULL,
  active_program_codes text[],
  active_apparatus_codes text[],
  terminology_overrides jsonb,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.academy_trials (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  granted_plan_code text DEFAULT 'pro'::text NOT NULL,
  source text DEFAULT 'self_serve'::text NOT NULL,
  started_by uuid,
  started_at timestamp with time zone DEFAULT now() NOT NULL,
  ends_at timestamp with time zone NOT NULL,
  ended_at timestamp with time zone,
  converted_at timestamp with time zone,
  day_five_notified_at timestamp with time zone,
  expiry_notified_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  lead_id uuid
);

CREATE TABLE public.advertisements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  type public.ad_type NOT NULL,
  "position" public.ad_position NOT NULL,
  title text NOT NULL,
  image_url text,
  link_url text NOT NULL,
  alt_text text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_active boolean DEFAULT true,
  views integer DEFAULT 0,
  clicks integer DEFAULT 0,
  created_by uuid,
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE public.announcement_read_status (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  announcement_id uuid NOT NULL,
  user_id uuid NOT NULL,
  read_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.announcements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  academy_id uuid NOT NULL,
  author_id uuid NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  action_url text,
  action_label text,
  priority text DEFAULT 'normal'::text NOT NULL,
  category text DEFAULT 'general'::text NOT NULL,
  metadata jsonb,
  sent_count text DEFAULT '0'::text NOT NULL,
  read_count text DEFAULT '0'::text NOT NULL,
  status text DEFAULT 'published'::text NOT NULL,
  published_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.app_config (
  key text NOT NULL,
  value text NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.apparatus (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  sport_locale_config_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  short_name text,
  is_optional boolean DEFAULT false NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.assessment_rubrics (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid,
  name character varying(200) NOT NULL,
  description text,
  type character varying(100) NOT NULL,
  is_active text DEFAULT 'true'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.assessment_scores (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  assessment_id uuid NOT NULL,
  skill_id uuid NOT NULL,
  score integer NOT NULL,
  comments text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.assessment_types (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name character varying(100) NOT NULL,
  description text,
  is_active text DEFAULT 'true'::text NOT NULL
);

CREATE TABLE public.assessment_videos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  assessment_id uuid NOT NULL,
  url text NOT NULL,
  title character varying(200),
  description text,
  thumbnail_url text,
  duration text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.athlete_assessments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL,
  athlete_id uuid NOT NULL,
  assessed_by uuid,
  assessment_date date NOT NULL,
  assessment_type public.assessment_type DEFAULT 'technical'::public.assessment_type NOT NULL,
  rubric_id uuid,
  apparatus text,
  overall_comment text,
  total_score text,
  created_at timestamp with time zone DEFAULT now(),
  session_id uuid,
  sport_config_id uuid,
  visible_to_guardians boolean DEFAULT false NOT NULL
);

CREATE TABLE public.athlete_documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  athlete_id uuid NOT NULL,
  document_type text NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_size text,
  mime_type text,
  issued_date date,
  expiry_date date,
  is_verified boolean DEFAULT false NOT NULL,
  verified_by uuid,
  verified_at timestamp with time zone,
  alert_sent boolean DEFAULT false NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  title text,
  uploaded_at timestamp with time zone,
  expires_at timestamp with time zone,
  uploaded_by uuid
);

CREATE TABLE public.athlete_extra_classes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL,
  athlete_id uuid NOT NULL,
  class_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.athlete_import_batches (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid,
  initiated_by uuid,
  file_hash text NOT NULL,
  total_rows integer DEFAULT 0 NOT NULL,
  created_count integer DEFAULT 0 NOT NULL,
  skipped_count integer DEFAULT 0 NOT NULL,
  status text DEFAULT 'processing'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  completed_at timestamp with time zone,
  failed_at timestamp with time zone,
  rolled_back_at timestamp with time zone
);

CREATE TABLE public.athlete_invitations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  academy_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  email text NOT NULL,
  invited_by uuid,
  status text DEFAULT 'pending'::text NOT NULL,
  state_token text NOT NULL,
  custom_message text,
  sent_at timestamp with time zone,
  opened_at timestamp with time zone,
  profile_completed_at timestamp with time zone,
  supabase_user_id uuid,
  athlete_id uuid,
  expires_at timestamp with time zone NOT NULL,
  resend_count integer DEFAULT 0 NOT NULL,
  last_resent_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.athlete_sport_configs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  athlete_id uuid NOT NULL,
  academy_sport_config_id uuid NOT NULL,
  program_code text,
  level_code text,
  category_code text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.athletes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL,
  user_id uuid,
  name text NOT NULL,
  dob date,
  level text,
  status text DEFAULT 'active'::text NOT NULL,
  group_id uuid,
  template_id uuid,
  age_category text,
  competitive_level text,
  primary_apparatus text,
  created_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  primary_sport_config_id uuid,
  program_code text,
  level_code text,
  category_code text,
  import_batch_id uuid
);

CREATE TABLE public.attendance_records (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  session_id uuid NOT NULL,
  athlete_id uuid NOT NULL,
  status text DEFAULT 'present'::text NOT NULL,
  notes text,
  recorded_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.audit_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid,
  user_id uuid,
  user_email text,
  action text NOT NULL,
  module text NOT NULL,
  resource_type text,
  resource_id uuid,
  resource_name text,
  description text,
  ip_address text,
  user_agent text,
  meta jsonb,
  status text DEFAULT 'success'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.billing_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  stripe_event_id text NOT NULL,
  type text NOT NULL,
  status text DEFAULT 'received'::text NOT NULL,
  error_message text,
  academy_id uuid,
  tenant_id uuid,
  payload jsonb,
  created_at timestamp with time zone DEFAULT now(),
  processed_at timestamp with time zone,
  attempt_count integer DEFAULT 1 NOT NULL,
  stripe_created_at timestamp with time zone,
  stripe_object_id text,
  livemode boolean DEFAULT false NOT NULL,
  last_attempt_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.billing_invoices (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid,
  academy_id uuid NOT NULL,
  stripe_invoice_id text NOT NULL,
  status text NOT NULL,
  amount_due integer,
  amount_paid integer,
  currency text DEFAULT 'eur'::text NOT NULL,
  billing_reason text,
  hosted_invoice_url text,
  invoice_pdf text,
  period_start timestamp with time zone,
  period_end timestamp with time zone,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  metadata jsonb
);

CREATE TABLE public.billing_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  amount_cents integer NOT NULL,
  currency text DEFAULT 'EUR'::text NOT NULL,
  periodicity public.billing_item_periodicity NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.categories (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  sport_locale_config_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  min_age integer,
  max_age integer,
  sort_order integer DEFAULT 0 NOT NULL,
  is_active boolean DEFAULT true NOT NULL
);

CREATE TABLE public.charges (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL,
  athlete_id uuid NOT NULL,
  billing_item_id uuid,
  class_id uuid,
  label text NOT NULL,
  amount_cents integer NOT NULL,
  currency text DEFAULT 'EUR'::text NOT NULL,
  period text NOT NULL,
  due_date date,
  status public.charge_status DEFAULT 'pending'::public.charge_status NOT NULL,
  payment_method public.payment_method,
  paid_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  stripe_payment_intent_id text,
  stripe_charge_id text,
  stripe_account_id text,
  attempt_count integer DEFAULT 0 NOT NULL,
  last_attempt_at timestamp with time zone
);

CREATE TABLE public.churn_reasons (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL,
  athlete_id uuid NOT NULL,
  previous_status text,
  new_status text NOT NULL,
  reason text DEFAULT 'unregistered'::text NOT NULL,
  notes text,
  created_by_profile_id uuid,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.class_coach_assignments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  class_id uuid NOT NULL,
  coach_id uuid NOT NULL,
  role text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.class_enrollments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL,
  class_id uuid NOT NULL,
  athlete_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.class_exceptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  class_id uuid NOT NULL,
  exception_date date NOT NULL,
  exception_type text DEFAULT 'holiday'::text NOT NULL,
  reason text,
  tenant_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.class_groups (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  class_id uuid NOT NULL,
  group_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.class_sessions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  class_id uuid NOT NULL,
  coach_id uuid,
  session_date date NOT NULL,
  start_time text,
  end_time text,
  status text DEFAULT 'scheduled'::text NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  sport_config_id uuid
);

CREATE TABLE public.class_waiting_list (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  class_id uuid NOT NULL,
  athlete_id uuid NOT NULL,
  "position" integer NOT NULL,
  added_at timestamp with time zone DEFAULT now(),
  notes character varying(500),
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL
);

CREATE TABLE public.class_weekdays (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  class_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  weekday integer NOT NULL
);

CREATE TABLE public.classes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL,
  name text NOT NULL,
  weekday integer,
  start_time time without time zone,
  end_time time without time zone,
  capacity integer DEFAULT 1,
  is_extra boolean DEFAULT false NOT NULL,
  group_id uuid,
  auto_generate_sessions boolean DEFAULT false NOT NULL,
  auto_generate_frequency text DEFAULT 'monthly'::text,
  last_auto_generated_at timestamp with time zone,
  auto_generate_days_ahead integer DEFAULT 30,
  allows_free_trial boolean DEFAULT false NOT NULL,
  waiting_list_enabled boolean DEFAULT false NOT NULL,
  cancellation_hours_before integer DEFAULT 24,
  cancellation_policy text DEFAULT 'standard'::text,
  created_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  technical_focus text,
  apparatus text[],
  sport_config_id uuid
);

CREATE TABLE public.coach_compensation (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL,
  coach_id uuid NOT NULL,
  hourly_rate_cents integer DEFAULT 0 NOT NULL,
  monthly_salary_cents integer DEFAULT 0 NOT NULL,
  estimated_weekly_minutes integer,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  estimated_weekly_hours integer DEFAULT 0 NOT NULL,
  effective_from date NOT NULL,
  is_active boolean DEFAULT true NOT NULL
);

CREATE TABLE public.coach_notes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL,
  athlete_id uuid NOT NULL,
  author_id uuid NOT NULL,
  note text NOT NULL,
  shared_with_parents boolean DEFAULT false NOT NULL,
  updated_at timestamp with time zone,
  tags text[],
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.coach_sport_configs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  coach_id uuid NOT NULL,
  academy_sport_config_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.coaches (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL,
  name text NOT NULL,
  email text,
  phone text,
  bio text,
  photo_url text,
  slug text,
  profile_id uuid,
  user_id uuid,
  is_public boolean DEFAULT false NOT NULL,
  specialties text[],
  public_bio text,
  years_experience text,
  certifications jsonb DEFAULT '[]'::jsonb,
  photo_gallery text[],
  achievements jsonb DEFAULT '[]'::jsonb,
  social_links jsonb,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.commercial_interviews (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  lead_id uuid,
  academy_fingerprint text NOT NULL,
  academy_name text NOT NULL,
  contact_name text,
  contact_email text,
  country_code text,
  city text,
  modality text,
  athlete_count integer,
  coach_count integer,
  location_count integer DEFAULT 1 NOT NULL,
  current_tools text,
  biggest_pain text,
  most_valuable_feature text,
  primary_objection text,
  easy_price_eur_cents integer,
  limit_price_eur_cents integer,
  preferred_pricing_model text,
  free_plan_expectation text,
  upgrade_trigger text,
  beta_interest text DEFAULT 'unknown'::text NOT NULL,
  willingness_to_pay text DEFAULT 'unknown'::text NOT NULL,
  status text DEFAULT 'scheduled'::text NOT NULL,
  scheduled_at timestamp with time zone,
  completed_at timestamp with time zone,
  notes text,
  created_by_profile_id uuid,
  updated_by_profile_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.competition_results (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  athlete_id uuid NOT NULL,
  event_id uuid,
  apparatus text,
  d_score integer,
  e_score integer,
  final_score integer,
  rank integer,
  qualification_points integer,
  judge_panel text,
  round text,
  subdivision text,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  sport_config_id uuid
);

CREATE TABLE public.competition_types (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  sport_locale_config_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  is_active boolean DEFAULT true NOT NULL
);

CREATE TABLE public.contact_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  academy_id uuid NOT NULL,
  contact_name text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text,
  message text NOT NULL,
  read boolean DEFAULT false NOT NULL,
  read_at timestamp with time zone,
  responded boolean DEFAULT false NOT NULL,
  responded_at timestamp with time zone,
  archived boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.conversation_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  conversation_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  content text NOT NULL,
  attachment_url text,
  attachment_type text,
  attachment_name text,
  reply_to_id uuid,
  edited_at timestamp with time zone,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.conversation_participants (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  conversation_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text DEFAULT 'member'::text NOT NULL,
  last_read_at timestamp with time zone,
  notifications_enabled text DEFAULT 'true'::text NOT NULL,
  hidden_at timestamp with time zone,
  muted_until timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.conversations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid,
  title text,
  last_message_preview text,
  last_message_at timestamp with time zone,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.countries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  locale text DEFAULT 'es-ES'::text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.directory_audit (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  entry_id uuid,
  actor_id uuid,
  action text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.directory_batches (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  source_id uuid NOT NULL,
  fingerprint text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  summary jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.directory_claims (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  entry_id uuid NOT NULL,
  user_id uuid NOT NULL,
  relationship text NOT NULL,
  evidence text,
  evidence_path text,
  status text DEFAULT 'pending'::text NOT NULL,
  decision text,
  decided_by uuid,
  decided_at timestamp with time zone,
  retain_evidence boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.directory_deliveries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  subscription_id uuid NOT NULL,
  dedupe_key text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  attempts integer DEFAULT 0 NOT NULL,
  lease_until timestamp with time zone,
  provider_id text,
  error text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  sent_at timestamp with time zone
);

CREATE TABLE public.directory_entries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  kind text NOT NULL,
  data jsonb NOT NULL,
  slug text NOT NULL,
  publication text DEFAULT 'draft'::text NOT NULL,
  representation text DEFAULT 'unclaimed'::text NOT NULL,
  academy_id uuid,
  event_id uuid,
  merged_into uuid,
  reviewed_at timestamp with time zone,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.directory_favorites (
  user_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.directory_grants (
  entry_id uuid NOT NULL,
  user_id uuid NOT NULL,
  approved_by uuid NOT NULL,
  approved_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.directory_import_rows (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  batch_id uuid NOT NULL,
  source_id uuid NOT NULL,
  external_id text NOT NULL,
  entry_id uuid,
  candidate jsonb NOT NULL,
  error text,
  status text DEFAULT 'pending'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.directory_revisions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  entry_id uuid,
  user_id uuid,
  kind text NOT NULL,
  data jsonb NOT NULL,
  base_version timestamp with time zone,
  status text DEFAULT 'pending'::text NOT NULL,
  decision text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  decided_at timestamp with time zone
);

CREATE TABLE public.directory_sources (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  url text NOT NULL,
  country_code text NOT NULL,
  adapter text DEFAULT 'manual'::text NOT NULL,
  terms_url text,
  "authorization" text,
  enabled boolean DEFAULT false NOT NULL,
  checked_at timestamp with time zone,
  last_error text,
  last_result jsonb
);

CREATE TABLE public.directory_subscriptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  email text NOT NULL,
  purpose text NOT NULL,
  filters jsonb DEFAULT '{}'::jsonb NOT NULL,
  policy_version text NOT NULL,
  source text NOT NULL,
  confirmed_at timestamp with time zone,
  withdrawn_at timestamp with time zone,
  token_hash text NOT NULL,
  token_expires_at timestamp with time zone NOT NULL,
  bounce_at timestamp with time zone,
  complaint_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.discount_campaigns (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL,
  discount_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  start_date date NOT NULL,
  end_date date,
  max_uses integer,
  current_uses integer DEFAULT 0 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.discount_usage_history (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL,
  discount_id uuid NOT NULL,
  athlete_id uuid,
  charge_id uuid,
  code text,
  discount_amount numeric(10,2) NOT NULL,
  original_amount numeric(10,2) NOT NULL,
  final_amount numeric(10,2) NOT NULL,
  used_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.discounts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL,
  code text,
  name text NOT NULL,
  description text,
  discount_category public.discount_category DEFAULT 'regular'::public.discount_category NOT NULL,
  discount_type text DEFAULT 'percentage'::text NOT NULL,
  discount_value numeric(10,2) NOT NULL,
  applicable_to text DEFAULT 'all'::text NOT NULL,
  min_amount numeric(10,2),
  max_discount numeric(10,2),
  start_date date NOT NULL,
  end_date date,
  max_uses integer,
  current_uses integer DEFAULT 0 NOT NULL,
  payment_due_days integer,
  early_payment_discount numeric(10,2),
  early_payment_days integer,
  is_active boolean DEFAULT true NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.email_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid,
  academy_id uuid,
  user_id uuid,
  to_email text NOT NULL,
  subject text NOT NULL,
  template text,
  status text DEFAULT 'pending'::text NOT NULL,
  error_message text,
  sent_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  metadata jsonb,
  idempotency_key text
);

CREATE TABLE public.empleo_applications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  listing_id uuid,
  user_id uuid,
  status public.application_status DEFAULT 'pending'::public.application_status,
  message text,
  resume_url text,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone
);

CREATE TABLE public.empleo_listings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  academy_id uuid,
  user_id uuid,
  title text NOT NULL,
  category public.job_category NOT NULL,
  description text,
  requirements text,
  location jsonb,
  job_type public.job_type NOT NULL,
  salary jsonb,
  how_to_apply text DEFAULT 'internal'::text,
  external_url text,
  deadline date,
  status public.job_listing_status DEFAULT 'active'::public.job_listing_status,
  views integer DEFAULT 0,
  is_featured boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone
);

CREATE TABLE public.event_categories (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  event_id uuid NOT NULL,
  name character varying(100) NOT NULL,
  description text,
  tenant_id uuid NOT NULL
);

CREATE TABLE public.event_invitations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  event_id uuid NOT NULL,
  athlete_id uuid,
  guardian_id uuid,
  email text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  invited_by uuid,
  sent_at timestamp with time zone,
  responded_at timestamp with time zone,
  response text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.event_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  academy_id uuid,
  event_type text NOT NULL,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.event_payments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  registration_id uuid NOT NULL,
  amount integer NOT NULL,
  currency character varying(10) DEFAULT 'EUR'::character varying NOT NULL,
  status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
  paid_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  tenant_id uuid NOT NULL
);

CREATE TABLE public.event_registrations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  event_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
  registered_at timestamp with time zone DEFAULT now(),
  notes text,
  tenant_id uuid NOT NULL
);

CREATE TABLE public.event_waitlist (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  event_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  "position" integer NOT NULL,
  added_at timestamp with time zone DEFAULT now(),
  tenant_id uuid NOT NULL
);

CREATE TABLE public.events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  category text[],
  is_public boolean DEFAULT false NOT NULL,
  level public.event_level DEFAULT 'internal'::public.event_level NOT NULL,
  discipline public.event_discipline,
  event_type public.event_type,
  start_date date NOT NULL,
  end_date date,
  registration_start_date date,
  registration_end_date date,
  country_code text,
  country_name text,
  province_name text,
  city_name text,
  country text,
  province text,
  city text,
  contact_email text,
  contact_phone text,
  contact_instagram text,
  contact_website text,
  images text[],
  attachments jsonb,
  notify_internal_staff boolean DEFAULT false,
  notify_city_academies boolean DEFAULT false,
  notify_province_academies boolean DEFAULT false,
  notify_country_academies boolean DEFAULT false,
  status public.event_status DEFAULT 'draft'::public.event_status NOT NULL,
  max_capacity integer,
  registration_fee integer,
  allow_waitlist boolean DEFAULT true NOT NULL,
  waitlist_max_size integer,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  sport_config_id uuid,
  competition_type_code text
);

CREATE TABLE public.family_contacts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  athlete_id uuid NOT NULL,
  name text NOT NULL,
  relationship text,
  email text,
  phone text,
  notify_email boolean DEFAULT true,
  notify_sms boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.family_stripe_customers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  stripe_customer_id text NOT NULL,
  default_payment_method_id text,
  card_brand text,
  card_last4 text,
  card_exp_month integer,
  card_exp_year integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.featured_listings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  marketplace_listing_id uuid,
  empleo_listing_id uuid,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE public.federative_licenses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  person_id uuid NOT NULL,
  person_type text NOT NULL,
  license_number text NOT NULL,
  license_type text NOT NULL,
  federation text NOT NULL,
  country text DEFAULT 'ES'::text NOT NULL,
  valid_from date NOT NULL,
  valid_until date NOT NULL,
  medical_certificate_expiry date,
  status text DEFAULT 'active'::text NOT NULL,
  annual_fee_cents integer,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  sport_config_id uuid
);

CREATE TABLE public.group_athletes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  group_id uuid NOT NULL,
  athlete_id uuid NOT NULL,
  custom_fee_cents integer,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.groups (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL,
  name text NOT NULL,
  discipline text NOT NULL,
  level text,
  coach_id uuid,
  assistant_ids uuid[],
  color text,
  monthly_fee_cents integer,
  billing_item_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  technical_focus text,
  apparatus text[],
  session_blocks text[],
  sport_config_id uuid,
  program_code text,
  level_code text,
  category_code text
);

CREATE TABLE public.growth_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  event_name text NOT NULL,
  visitor_id text,
  user_id uuid,
  academy_id uuid,
  tenant_id uuid,
  plan_code text,
  source text DEFAULT 'app'::text NOT NULL,
  properties jsonb,
  idempotency_key text,
  occurred_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  event_id uuid,
  schema_version smallint,
  environment text,
  evidence_scope text,
  alias_source text,
  transaction_id text
);

CREATE TABLE public.guardian_athletes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  guardian_id uuid NOT NULL,
  athlete_id uuid NOT NULL,
  relationship text,
  is_primary boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.guardians (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  profile_id uuid,
  name text NOT NULL,
  email text,
  phone text,
  relationship text,
  notify_email boolean DEFAULT true NOT NULL,
  notify_sms boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.invitations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  email text NOT NULL,
  role public.profile_role NOT NULL,
  role_id uuid,
  token text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  invited_by uuid NOT NULL,
  academy_ids uuid[],
  expires_at timestamp with time zone NOT NULL,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  supabase_user_id uuid,
  default_academy_id uuid,
  custom_message text,
  permissions text[],
  send_email text DEFAULT 'true'::text NOT NULL,
  resend_count text DEFAULT '0'::text NOT NULL,
  last_resent_at timestamp with time zone
);

CREATE TABLE public.lead_interactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  lead_id uuid NOT NULL,
  submission_id uuid NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  academy text,
  reason text NOT NULL,
  plan text,
  source text NOT NULL,
  message text NOT NULL,
  visitor_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.lead_trial_outcomes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL,
  lead_trial_id uuid NOT NULL,
  outcome text NOT NULL,
  notes text,
  next_action_at timestamp with time zone,
  recorded_by uuid,
  idempotency_key text,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.lead_trials (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL,
  lead_id uuid,
  status text DEFAULT 'scheduled'::text NOT NULL,
  scheduled_at timestamp with time zone,
  attended_at timestamp with time zone,
  created_by uuid,
  idempotency_key text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.leads (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  name text,
  source text DEFAULT 'landing_page'::text,
  plan text,
  metadata text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  tenant_id uuid,
  academy_id uuid
);

CREATE TABLE public.leak_action_history (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL,
  action_type text NOT NULL,
  athlete_id uuid,
  class_id uuid,
  channel text DEFAULT 'whatsapp'::text NOT NULL,
  message text,
  payload jsonb DEFAULT '{}'::jsonb,
  created_by_profile_id uuid,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.levels (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  sport_locale_config_id uuid NOT NULL,
  program_code text,
  code text NOT NULL,
  name text NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  is_active boolean DEFAULT true NOT NULL
);

CREATE TABLE public.marketplace_listings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  seller_type text NOT NULL,
  type public.marketplace_listing_type NOT NULL,
  category public.marketplace_category NOT NULL,
  title text NOT NULL,
  description text,
  price_cents integer,
  currency text DEFAULT 'eur'::text,
  price_type public.marketplace_price_type DEFAULT 'contact'::public.marketplace_price_type,
  contact jsonb,
  images text[],
  location jsonb,
  status public.marketplace_listing_status DEFAULT 'active'::public.marketplace_listing_status,
  views integer DEFAULT 0,
  is_featured boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone
);

CREATE TABLE public.marketplace_ratings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  listing_id uuid,
  seller_id uuid,
  reviewer_id uuid,
  rating integer NOT NULL,
  comment text,
  verified boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE public.memberships (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  academy_id uuid NOT NULL,
  role public.membership_role DEFAULT 'coach'::public.membership_role NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.message_groups (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid,
  name character varying(200) NOT NULL,
  description text,
  recipient_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  academy_id uuid
);

CREATE TABLE public.message_history (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid,
  profile_id uuid,
  phone text NOT NULL,
  channel text DEFAULT 'whatsapp'::text NOT NULL,
  direction text DEFAULT 'outbound'::text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  message text NOT NULL,
  template_id uuid,
  meta jsonb,
  sent_at timestamp with time zone,
  delivered_at timestamp with time zone,
  failed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  sport_config_id uuid
);

CREATE TABLE public.message_read_receipts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  message_id uuid NOT NULL,
  user_id uuid NOT NULL,
  read_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.message_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid,
  name character varying(200) NOT NULL,
  description text,
  channel character varying(50) DEFAULT 'whatsapp'::character varying NOT NULL,
  template_type character varying(100) NOT NULL,
  subject character varying(200),
  body text NOT NULL,
  variables jsonb,
  is_system boolean DEFAULT false NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  usage_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone,
  sport_config_id uuid,
  academy_id uuid
);

CREATE TABLE public.notification_preferences (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  profile_id uuid NOT NULL,
  channel character varying(50) DEFAULT 'whatsapp'::character varying NOT NULL,
  enabled boolean DEFAULT true NOT NULL,
  updated_at timestamp with time zone
);

CREATE TABLE public.notifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text,
  data jsonb,
  read boolean DEFAULT false NOT NULL,
  read_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.onboarding_checklist_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  academy_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  key text NOT NULL,
  label text NOT NULL,
  description text,
  status public.onboarding_checklist_status DEFAULT 'pending'::public.onboarding_checklist_status NOT NULL,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.onboarding_states (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  academy_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  owner_profile_id uuid,
  current_step integer DEFAULT 1 NOT NULL,
  completed_wizard boolean DEFAULT false NOT NULL,
  steps jsonb,
  last_completed_at timestamp with time zone,
  last_reminder_sent_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  notes text
);

CREATE TABLE public.owner_consent (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  owner_id uuid NOT NULL,
  state text DEFAULT 'granted'::text NOT NULL,
  granted_at timestamp with time zone DEFAULT now() NOT NULL,
  policy_version text NOT NULL,
  source text NOT NULL,
  consent_proof text NOT NULL,
  revoked_at timestamp with time zone,
  revocation_reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.owner_consent_audit (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  owner_id uuid NOT NULL,
  event text NOT NULL,
  policy_version text NOT NULL,
  source text NOT NULL,
  consent_proof text NOT NULL,
  actor text NOT NULL,
  reason text,
  previous_audit_id uuid,
  recorded_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.payment_attempts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL,
  charge_id uuid NOT NULL,
  stripe_payment_intent_id text,
  stripe_account_id text,
  status text NOT NULL,
  amount_cents integer NOT NULL,
  currency text DEFAULT 'eur'::text NOT NULL,
  error_code text,
  error_message text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.plans (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code text NOT NULL,
  athlete_limit integer,
  academy_limit integer,
  stripe_price_id text,
  stripe_product_id text,
  currency text DEFAULT 'eur'::text NOT NULL,
  billing_interval text,
  nickname text,
  is_archived boolean DEFAULT false NOT NULL,
  price_eur integer NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  stripe_annual_price_id text,
  annual_price_eur integer
);

CREATE TABLE public.profiles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  name text,
  role public.profile_role DEFAULT 'owner'::public.profile_role NOT NULL,
  active_academy_id uuid,
  can_login boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  is_suspended boolean DEFAULT false NOT NULL,
  photo_url text,
  phone text,
  bio text
);

CREATE TABLE public.programs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  sport_locale_config_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  sort_order integer DEFAULT 0 NOT NULL,
  is_active boolean DEFAULT true NOT NULL
);

CREATE TABLE public.push_subscriptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.push_tokens (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  token text NOT NULL,
  platform text DEFAULT 'web'::text NOT NULL,
  is_active text DEFAULT 'true'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.receipts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL,
  charge_id uuid,
  athlete_id uuid,
  receipt_number text NOT NULL,
  amount numeric(10,2) NOT NULL,
  currency text DEFAULT 'EUR'::text NOT NULL,
  payment_method text,
  payment_date date,
  pdf_url text,
  template_id text,
  metadata jsonb,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.refunds (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL,
  charge_id uuid NOT NULL,
  stripe_refund_id text NOT NULL,
  stripe_payment_intent_id text,
  amount_cents integer NOT NULL,
  currency text DEFAULT 'eur'::text NOT NULL,
  reason text,
  status text DEFAULT 'pending'::text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.role_members (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  role_id uuid NOT NULL,
  user_id uuid NOT NULL,
  academy_id uuid NOT NULL,
  member_role text DEFAULT 'viewer'::text NOT NULL,
  permissions jsonb,
  assigned_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone,
  custom_permissions jsonb,
  assigned_by uuid,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.rubric_criteria (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  rubric_id uuid NOT NULL,
  name character varying(200) NOT NULL,
  description text,
  max_points integer DEFAULT 0,
  weight integer DEFAULT 0,
  order_index integer DEFAULT 0
);

CREATE TABLE public.scheduled_notifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid,
  group_id uuid,
  template_id uuid,
  channel character varying(50) DEFAULT 'whatsapp'::character varying NOT NULL,
  scheduled_for timestamp with time zone NOT NULL,
  status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
  sent_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  academy_id uuid
);

CREATE TABLE public.scheduled_reports (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  academy_id uuid NOT NULL,
  name character varying(200) NOT NULL,
  report_type character varying(100) NOT NULL,
  schedule character varying(100) NOT NULL,
  params jsonb,
  last_run_at timestamp with time zone,
  next_run_at timestamp with time zone,
  is_active text DEFAULT 'true'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.scholarships (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL,
  athlete_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  discount_type text DEFAULT 'percentage'::text NOT NULL,
  discount_value numeric(10,2) NOT NULL,
  start_date date NOT NULL,
  end_date date,
  auto_renew boolean DEFAULT false NOT NULL,
  required_documents text[],
  is_active boolean DEFAULT true NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.skill_catalog (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  apparatus text NOT NULL,
  skill_code text NOT NULL,
  name text NOT NULL,
  description text,
  difficulty integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.sport_branches (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  discipline_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.sport_disciplines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.sport_locale_configs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  country_id uuid NOT NULL,
  discipline_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  locale text DEFAULT 'es-ES'::text NOT NULL,
  federation text,
  config_version text DEFAULT 'custom-v1'::text NOT NULL,
  default_academy_type text DEFAULT 'general'::text NOT NULL,
  default_discipline_variant text DEFAULT 'general'::text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.stripe_accounts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL,
  stripe_account_id text NOT NULL,
  country text,
  default_currency text DEFAULT 'eur'::text NOT NULL,
  charges_enabled boolean DEFAULT false NOT NULL,
  payouts_enabled boolean DEFAULT false NOT NULL,
  details_submitted boolean DEFAULT false NOT NULL,
  onboarding_status text DEFAULT 'pending'::text NOT NULL,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.subscriptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  plan_id uuid,
  status text,
  current_period_end timestamp with time zone,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  cancel_at_period_end boolean DEFAULT false NOT NULL,
  updated_at timestamp with time zone DEFAULT now(),
  last_stripe_event_id text,
  last_stripe_event_created_at timestamp with time zone
);

CREATE TABLE public.template_age_categories (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  template_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  min_age integer NOT NULL,
  max_age integer NOT NULL,
  is_competitive text DEFAULT 'false'::text NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.template_apparatus (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  template_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  short_name text,
  has_rotation boolean DEFAULT false NOT NULL,
  is_optional boolean DEFAULT false NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.template_competition_flow (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  template_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  level text DEFAULT 'local'::text NOT NULL,
  stage_order integer DEFAULT 0 NOT NULL,
  requirements jsonb,
  is_active text DEFAULT 'true'::text NOT NULL
);

CREATE TABLE public.template_competition_levels (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  template_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  is_competitive boolean DEFAULT false NOT NULL,
  min_age integer,
  max_age integer,
  sort_order integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.template_license_config (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  template_id uuid NOT NULL,
  required_for_competition boolean DEFAULT true NOT NULL,
  required_for_training boolean DEFAULT false NOT NULL,
  renewal_months integer DEFAULT 12 NOT NULL,
  documents_required jsonb DEFAULT '[]'::jsonb,
  annual_fee_cents integer,
  medical_certificate_required boolean DEFAULT true NOT NULL,
  medical_certificate_validity_months integer DEFAULT 12 NOT NULL
);

CREATE TABLE public.template_scoring_config (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  template_id uuid NOT NULL,
  scoring_type text DEFAULT 'd_e'::text NOT NULL,
  max_difficulties integer DEFAULT 6 NOT NULL,
  max_per_group integer DEFAULT 1 NOT NULL,
  deductions_small integer DEFAULT 1 NOT NULL,
  deductions_medium integer DEFAULT 3 NOT NULL,
  deductions_large integer DEFAULT 5 NOT NULL,
  deductions_fall integer DEFAULT 10 NOT NULL,
  combo_bonus_2_elements integer DEFAULT 1 NOT NULL,
  combo_bonus_3_plus_elements integer DEFAULT 2 NOT NULL,
  min_difficulty_value integer DEFAULT 1 NOT NULL,
  max_difficulty_value integer DEFAULT 26 NOT NULL,
  extra_config jsonb
);

CREATE TABLE public.templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  country text NOT NULL,
  country_code text NOT NULL,
  discipline text NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT true NOT NULL,
  is_default boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.terminology_dictionary (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  sport_locale_config_id uuid NOT NULL,
  terms jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.ticket_attachments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ticket_id uuid NOT NULL,
  response_id uuid,
  file_name character varying(255) NOT NULL,
  file_url character varying(500) NOT NULL,
  file_type character varying(100),
  file_size character varying(20),
  uploaded_by uuid NOT NULL,
  created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ticket_responses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ticket_id uuid NOT NULL,
  user_id uuid NOT NULL,
  message text NOT NULL,
  is_internal boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.tickets (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title character varying(255) NOT NULL,
  description text NOT NULL,
  status public.ticket_status DEFAULT 'open'::public.ticket_status NOT NULL,
  priority public.ticket_priority DEFAULT 'medium'::public.ticket_priority NOT NULL,
  category public.ticket_category NOT NULL,
  academy_id uuid,
  created_by uuid NOT NULL,
  assigned_to uuid,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  updated_at timestamp without time zone DEFAULT now() NOT NULL,
  resolved_at timestamp without time zone,
  closed_at timestamp without time zone
);

CREATE TABLE public.user_preferences (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  tenant_id uuid,
  tooltip_flags jsonb,
  first_time_flags jsonb,
  timezone text DEFAULT 'Europe/Madrid'::text,
  language text DEFAULT 'es'::text,
  email_notifications jsonb DEFAULT '{}'::jsonb,
  in_app_notifications jsonb DEFAULT '{"types": {}, "enabled": true}'::jsonb,
  class_reminders jsonb DEFAULT '{"enabled": true, "1h_before": false, "24h_before": true}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.zaltyko_schema_migrations (
  version text NOT NULL,
  filename text NOT NULL,
  checksum text NOT NULL,
  execution_mode text NOT NULL,
  applied_at timestamp with time zone DEFAULT now() NOT NULL,
  applied_by text DEFAULT CURRENT_USER NOT NULL
);

CREATE TABLE zaltyko.athletes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  person_id uuid NOT NULL,
  external_reference text,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.attendance_records (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  location_id uuid NOT NULL,
  session_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  athlete_id uuid NOT NULL,
  status zaltyko.attendance_status NOT NULL,
  recorded_by_member_id uuid,
  recorded_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.audit_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  location_id uuid,
  actor_user_id uuid,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  request_id text,
  idempotency_key text,
  before jsonb,
  after jsonb,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.benchmark_metric_targets (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  benchmark_profile_id uuid NOT NULL,
  metric_key text NOT NULL,
  target_numeric numeric(24,8) NOT NULL,
  currency text,
  grain zaltyko.metric_grain NOT NULL,
  normalization_direction zaltyko.normalization_direction NOT NULL,
  notes text DEFAULT ''::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.benchmark_profiles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid,
  key text NOT NULL,
  name text NOT NULL,
  market text NOT NULL,
  currency text,
  organization_type text NOT NULL,
  discipline_scope text NOT NULL,
  source_title text NOT NULL,
  source_year integer,
  source_page text,
  methodology_notes text NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  version integer NOT NULL,
  status zaltyko.benchmark_profile_status DEFAULT 'draft'::zaltyko.benchmark_profile_status NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.charges (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  location_id uuid,
  invoice_id uuid NOT NULL,
  invoice_line_id uuid NOT NULL,
  family_id uuid NOT NULL,
  family_payer_id uuid,
  enrollment_id uuid,
  status zaltyko.charge_status DEFAULT 'due'::zaltyko.charge_status NOT NULL,
  amount_cents bigint NOT NULL,
  currency text NOT NULL,
  due_at timestamp with time zone NOT NULL,
  service_period_start date NOT NULL,
  service_period_end date NOT NULL,
  idempotency_key text NOT NULL,
  version integer DEFAULT 1 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  collection_mode zaltyko.family_collection_mode DEFAULT 'manual'::zaltyko.family_collection_mode NOT NULL
);

CREATE TABLE zaltyko.class_template_groups (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  class_template_id uuid NOT NULL,
  group_id uuid NOT NULL
);

CREATE TABLE zaltyko.class_template_weekdays (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  class_template_id uuid NOT NULL,
  iso_weekday integer NOT NULL,
  starts_at_local time without time zone NOT NULL,
  ends_at_local time without time zone NOT NULL
);

CREATE TABLE zaltyko.class_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  location_id uuid NOT NULL,
  program_id uuid,
  default_space_id uuid,
  name text NOT NULL,
  capacity integer NOT NULL,
  status zaltyko.lifecycle_status DEFAULT 'draft'::zaltyko.lifecycle_status NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.data_quality_issues (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  metric_run_id uuid NOT NULL,
  location_id uuid,
  metric_key text,
  issue_code text NOT NULL,
  severity text NOT NULL,
  status zaltyko.data_quality_issue_status DEFAULT 'open'::zaltyko.data_quality_issue_status NOT NULL,
  evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
  detected_at timestamp with time zone DEFAULT now() NOT NULL,
  resolved_at timestamp with time zone
);

CREATE TABLE zaltyko.enrollment_pauses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  starts_on date NOT NULL,
  ends_on date,
  reason_code text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.enrollment_price_assignments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  location_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  price_plan_id uuid NOT NULL,
  unit_amount_cents bigint NOT NULL,
  currency text NOT NULL,
  starts_on date NOT NULL,
  ends_on date,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.enrollment_status_history (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  from_status zaltyko.enrollment_status,
  to_status zaltyko.enrollment_status NOT NULL,
  reason_code text,
  changed_by_member_id uuid,
  idempotency_key text NOT NULL,
  changed_at timestamp with time zone DEFAULT now() NOT NULL,
  effective_on date NOT NULL
);

CREATE TABLE zaltyko.enrollments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  location_id uuid NOT NULL,
  athlete_id uuid NOT NULL,
  class_template_id uuid NOT NULL,
  price_plan_id uuid,
  status zaltyko.enrollment_status DEFAULT 'pending'::zaltyko.enrollment_status NOT NULL,
  starts_on date NOT NULL,
  ends_on date,
  source zaltyko.enrollment_source NOT NULL,
  source_entity_id uuid,
  version integer DEFAULT 1 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.facilities (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  location_id uuid NOT NULL,
  name text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.families (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  external_reference text,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.family_collection_preferences (
  organization_id uuid NOT NULL,
  family_id uuid NOT NULL,
  requested_mode zaltyko.family_collection_mode DEFAULT 'manual'::zaltyko.family_collection_mode NOT NULL,
  version integer DEFAULT 1 NOT NULL,
  entitlement_revision integer,
  updated_by_member_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.family_guardians (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  family_id uuid NOT NULL,
  guardian_id uuid NOT NULL,
  relationship zaltyko.family_relationship NOT NULL,
  can_view_athletes boolean DEFAULT true NOT NULL,
  can_manage_enrollments boolean DEFAULT false NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.family_members (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  family_id uuid NOT NULL,
  athlete_id uuid NOT NULL,
  relationship zaltyko.family_relationship NOT NULL,
  starts_on date NOT NULL,
  ends_on date,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.family_payers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  family_id uuid NOT NULL,
  guardian_id uuid NOT NULL,
  is_primary boolean DEFAULT false NOT NULL,
  starts_on date NOT NULL,
  ends_on date,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.family_payment_authorizations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  family_id uuid NOT NULL,
  family_payer_id uuid NOT NULL,
  payment_provider_account_id uuid NOT NULL,
  status zaltyko.payment_authorization_status DEFAULT 'pending'::zaltyko.payment_authorization_status NOT NULL,
  provider_setup_reference text NOT NULL,
  payment_method_reference text NOT NULL,
  mandate_reference text,
  consent_version text,
  consent_evidence_reference text,
  consent_evidence_sha256 text,
  consented_at timestamp with time zone,
  consented_by_guardian_id uuid,
  valid_until timestamp with time zone,
  revoked_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.financial_reconciliation_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  currency text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  expected_cents bigint NOT NULL,
  allocated_cents bigint NOT NULL,
  refunded_cents bigint NOT NULL,
  net_collected_cents bigint NOT NULL,
  outstanding_cents bigint NOT NULL,
  status zaltyko.reconciliation_status NOT NULL,
  formula_version integer DEFAULT 1 NOT NULL,
  source_watermark timestamp with time zone NOT NULL,
  idempotency_key text NOT NULL,
  computed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.group_membership_history (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  from_status zaltyko.group_membership_status,
  to_status zaltyko.group_membership_status NOT NULL,
  reason_code text,
  changed_by_member_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  effective_on date NOT NULL,
  changed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.group_memberships (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  group_id uuid NOT NULL,
  athlete_id uuid NOT NULL,
  status zaltyko.group_membership_status DEFAULT 'active'::zaltyko.group_membership_status NOT NULL,
  starts_on date NOT NULL,
  ends_on date,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.groups (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  location_id uuid NOT NULL,
  program_id uuid,
  name text NOT NULL,
  capacity integer,
  status zaltyko.lifecycle_status DEFAULT 'active'::zaltyko.lifecycle_status NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.guardian_contacts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  guardian_id uuid NOT NULL,
  kind zaltyko.guardian_contact_kind NOT NULL,
  value text NOT NULL,
  normalized_value text NOT NULL,
  is_primary boolean DEFAULT false NOT NULL,
  verified_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.guardians (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  person_id uuid NOT NULL,
  auth_user_id uuid,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.health_score_dimension_snapshots (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  health_score_snapshot_id uuid NOT NULL,
  dimension zaltyko.health_dimension NOT NULL,
  score numeric(5,2),
  status zaltyko.health_score_status NOT NULL,
  coverage numeric(5,4) NOT NULL,
  available_metric_weight numeric(5,4) NOT NULL,
  configured_metric_weight numeric(5,4) NOT NULL,
  explanation jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.health_score_dimension_weights (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  health_score_version_id uuid NOT NULL,
  dimension zaltyko.health_dimension NOT NULL,
  weight numeric(5,4) NOT NULL
);

CREATE TABLE zaltyko.health_score_metric_contributions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  health_score_snapshot_id uuid NOT NULL,
  dimension zaltyko.health_dimension NOT NULL,
  metric_key text NOT NULL,
  metric_run_value_id uuid,
  benchmark_target_id uuid,
  actual_value numeric(24,8),
  target_value numeric(24,8),
  normalized_score numeric(5,2),
  metric_weight numeric(5,4) NOT NULL,
  metric_coverage numeric(5,4) NOT NULL,
  effective_weight numeric(8,6) NOT NULL,
  quality zaltyko.metric_quality NOT NULL,
  formula_version integer,
  explanation jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.health_score_metric_weights (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  health_score_version_id uuid NOT NULL,
  dimension zaltyko.health_dimension NOT NULL,
  metric_key text NOT NULL,
  weight numeric(5,4) NOT NULL
);

CREATE TABLE zaltyko.health_score_snapshots (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  location_id uuid,
  metric_run_id uuid NOT NULL,
  health_score_version_id uuid NOT NULL,
  benchmark_profile_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  score numeric(5,2),
  status zaltyko.health_score_status NOT NULL,
  coverage numeric(5,4) NOT NULL,
  computed_at timestamp with time zone NOT NULL,
  source_watermark timestamp with time zone NOT NULL,
  idempotency_key text NOT NULL,
  explanation jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.health_score_versions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  key text NOT NULL,
  version integer NOT NULL,
  name text NOT NULL,
  status zaltyko.score_version_status DEFAULT 'draft'::zaltyko.score_version_status NOT NULL,
  min_valid_dimensions integer NOT NULL,
  min_global_coverage numeric(5,4) NOT NULL,
  min_dimension_available_weight numeric(5,4) NOT NULL,
  notes text DEFAULT ''::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.insight_actions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  location_id uuid,
  insight_id uuid NOT NULL,
  action_key text NOT NULL,
  status zaltyko.insight_action_status DEFAULT 'recorded'::zaltyko.insight_action_status NOT NULL,
  actor_user_id uuid NOT NULL,
  actor_member_id uuid NOT NULL,
  target_entity_type text NOT NULL,
  target_entity_id uuid,
  before_value jsonb DEFAULT '{}'::jsonb NOT NULL,
  after_value jsonb,
  evaluation_ends_at timestamp with time zone NOT NULL,
  outcome zaltyko.insight_outcome DEFAULT 'pending'::zaltyko.insight_outcome NOT NULL,
  outcome_notes text,
  idempotency_key text NOT NULL,
  correlation_id uuid DEFAULT gen_random_uuid() NOT NULL,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.insight_notifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  insight_id uuid NOT NULL,
  channel zaltyko.insight_delivery_channel NOT NULL,
  delivery_window_key text NOT NULL,
  status zaltyko.insight_delivery_status DEFAULT 'pending'::zaltyko.insight_delivery_status NOT NULL,
  available_at timestamp with time zone NOT NULL,
  sent_at timestamp with time zone,
  last_error text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.insight_rule_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  location_id uuid,
  rule_version_id uuid NOT NULL,
  status zaltyko.insight_run_status DEFAULT 'running'::zaltyko.insight_run_status NOT NULL,
  evaluated_at timestamp with time zone NOT NULL,
  source_watermark timestamp with time zone NOT NULL,
  idempotency_key text NOT NULL,
  candidate_count integer DEFAULT 0 NOT NULL,
  result jsonb DEFAULT '{}'::jsonb NOT NULL,
  error_code text,
  error_detail text,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.insight_rule_versions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  key text NOT NULL,
  version integer NOT NULL,
  name text NOT NULL,
  status zaltyko.insight_rule_status DEFAULT 'draft'::zaltyko.insight_rule_status NOT NULL,
  severity zaltyko.insight_severity NOT NULL,
  cooldown_hours integer NOT NULL,
  config jsonb DEFAULT '{}'::jsonb NOT NULL,
  default_cta_key text NOT NULL,
  notes text DEFAULT ''::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.insight_run_observations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  rule_run_id uuid NOT NULL,
  insight_id uuid NOT NULL,
  observed_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.insight_status_history (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  insight_id uuid NOT NULL,
  from_status zaltyko.insight_status,
  to_status zaltyko.insight_status NOT NULL,
  reason_code text NOT NULL,
  actor_user_id uuid,
  rule_run_id uuid,
  idempotency_key text,
  changed_at timestamp with time zone DEFAULT now() NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE zaltyko.insights (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  location_id uuid,
  rule_version_id uuid NOT NULL,
  series_key text NOT NULL,
  occurrence integer DEFAULT 1 NOT NULL,
  status zaltyko.insight_status DEFAULT 'open'::zaltyko.insight_status NOT NULL,
  severity zaltyko.insight_severity NOT NULL,
  priority_score numeric(5,2) NOT NULL,
  impact_score numeric(5,2) NOT NULL,
  urgency_score numeric(5,2) NOT NULL,
  confidence_score numeric(5,2) NOT NULL,
  actionability_score numeric(5,2) NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  title text NOT NULL,
  detail text NOT NULL,
  evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
  assumptions jsonb DEFAULT '[]'::jsonb NOT NULL,
  cta_key text NOT NULL,
  cta_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  estimated_value_min_minor numeric(20,0),
  estimated_value_max_minor numeric(20,0),
  estimate_currency text,
  source_metric_run_id uuid,
  source_health_score_snapshot_id uuid,
  detected_at timestamp with time zone NOT NULL,
  last_seen_at timestamp with time zone NOT NULL,
  viewed_at timestamp with time zone,
  snoozed_until timestamp with time zone,
  resolved_at timestamp with time zone,
  resolution_reason text,
  version integer DEFAULT 1 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.invoice_line_enrollments (
  organization_id uuid NOT NULL,
  location_id uuid NOT NULL,
  athlete_id uuid NOT NULL,
  invoice_line_id uuid NOT NULL,
  price_plan_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  class_template_id uuid NOT NULL,
  price_assignment_id uuid NOT NULL,
  class_name_snapshot text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.invoice_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  enrollment_id uuid,
  price_plan_id uuid,
  line_type text NOT NULL,
  quantity integer NOT NULL,
  unit_amount_cents bigint NOT NULL,
  amount_cents bigint NOT NULL,
  currency text NOT NULL,
  service_period_start date NOT NULL,
  service_period_end date NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  location_id uuid,
  athlete_id uuid
);

CREATE TABLE zaltyko.invoices (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  location_id uuid,
  family_id uuid NOT NULL,
  family_payer_id uuid,
  reference text NOT NULL,
  status zaltyko.invoice_status DEFAULT 'draft'::zaltyko.invoice_status NOT NULL,
  currency text NOT NULL,
  total_amount_cents bigint NOT NULL,
  issued_at timestamp with time zone,
  due_at timestamp with time zone NOT NULL,
  voided_at timestamp with time zone,
  idempotency_key text NOT NULL,
  version integer DEFAULT 1 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.locations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  timezone text DEFAULT 'Europe/Madrid'::text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.member_location_scopes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  member_id uuid NOT NULL,
  location_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.metric_definitions (
  key text NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  unit zaltyko.metric_unit NOT NULL,
  direction zaltyko.metric_direction NOT NULL,
  grain zaltyko.metric_grain NOT NULL,
  formula_version integer NOT NULL,
  owner text NOT NULL,
  active boolean DEFAULT true NOT NULL,
  formula text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.metric_event_consumptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  outbox_event_id uuid NOT NULL,
  handler_key text NOT NULL,
  handler_version integer NOT NULL,
  consumed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.metric_invalidations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  location_id uuid,
  outbox_event_id uuid NOT NULL,
  handler_key text NOT NULL,
  handler_version integer NOT NULL,
  reason_event_name text NOT NULL,
  affected_from date NOT NULL,
  affected_to date NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  processed_at timestamp with time zone
);

CREATE TABLE zaltyko.metric_run_values (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  metric_run_id uuid NOT NULL,
  location_id uuid,
  metric_key text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  value_numeric numeric(24,8),
  currency text,
  numerator numeric(24,8),
  denominator numeric(24,8),
  coverage numeric(5,4) NOT NULL,
  quality zaltyko.metric_quality NOT NULL,
  dimensions jsonb DEFAULT '{}'::jsonb NOT NULL,
  dimensions_sha256 text NOT NULL,
  formula_version integer NOT NULL,
  computed_at timestamp with time zone NOT NULL,
  source_watermark timestamp with time zone NOT NULL,
  diagnostics jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.metric_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  authorization_location_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  currency text NOT NULL,
  formula_set_version text NOT NULL,
  status zaltyko.metric_run_status DEFAULT 'running'::zaltyko.metric_run_status NOT NULL,
  parameters jsonb DEFAULT '{}'::jsonb NOT NULL,
  source_watermark timestamp with time zone NOT NULL,
  idempotency_key text NOT NULL,
  started_at timestamp with time zone DEFAULT now() NOT NULL,
  completed_at timestamp with time zone,
  error_code text,
  error_detail text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.metric_values (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  metric_run_id uuid NOT NULL,
  location_id uuid,
  metric_key text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  value_numeric numeric(24,8),
  currency text,
  numerator numeric(24,8),
  denominator numeric(24,8),
  coverage numeric(5,4) NOT NULL,
  quality zaltyko.metric_quality NOT NULL,
  dimensions jsonb DEFAULT '{}'::jsonb NOT NULL,
  dimensions_sha256 text NOT NULL,
  formula_version integer NOT NULL,
  computed_at timestamp with time zone NOT NULL,
  source_watermark timestamp with time zone NOT NULL,
  diagnostics jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.organization_bootstrap_commands (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  organization_id uuid NOT NULL,
  location_id uuid NOT NULL,
  member_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.organization_entitlement_changes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  revision integer NOT NULL,
  plan_code zaltyko.saas_plan_code NOT NULL,
  source zaltyko.entitlement_source NOT NULL,
  source_reference text NOT NULL,
  subscription_id uuid,
  effective_from timestamp with time zone NOT NULL,
  effective_until timestamp with time zone,
  changed_at timestamp with time zone DEFAULT now() NOT NULL,
  trial_id uuid
);

CREATE TABLE zaltyko.organization_entitlements (
  organization_id uuid NOT NULL,
  plan_code zaltyko.saas_plan_code NOT NULL,
  revision integer DEFAULT 1 NOT NULL,
  source zaltyko.entitlement_source NOT NULL,
  source_reference text NOT NULL,
  subscription_id uuid,
  effective_from timestamp with time zone NOT NULL,
  effective_until timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  trial_id uuid
);

CREATE TABLE zaltyko.organization_members (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role zaltyko.member_role NOT NULL,
  status zaltyko.member_status DEFAULT 'invited'::zaltyko.member_status NOT NULL,
  location_scope_mode zaltyko.location_scope_mode DEFAULT 'selected'::zaltyko.location_scope_mode NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.organization_payment_provider_accounts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  processor text DEFAULT 'stripe'::text NOT NULL,
  environment zaltyko.stripe_environment NOT NULL,
  provider_account_reference text NOT NULL,
  accounts_api_generation integer DEFAULT 2 NOT NULL,
  charge_model text DEFAULT 'direct'::text NOT NULL,
  dashboard_access text DEFAULT 'full'::text NOT NULL,
  fees_collector text DEFAULT 'stripe'::text NOT NULL,
  losses_collector text DEFAULT 'stripe'::text NOT NULL,
  status zaltyko.organization_payment_account_status DEFAULT 'pending'::zaltyko.organization_payment_account_status NOT NULL,
  card_payments_capability_status text DEFAULT 'pending'::text NOT NULL,
  revision integer DEFAULT 1 NOT NULL,
  last_provider_event_reference text,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.organization_saas_checkout_operations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  requested_by_member_id uuid NOT NULL,
  environment zaltyko.stripe_environment NOT NULL,
  provider_account_reference text NOT NULL,
  customer_id uuid,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  plan_code zaltyko.saas_plan_code NOT NULL,
  billing_interval zaltyko.saas_billing_interval NOT NULL,
  status text DEFAULT 'requested'::text NOT NULL,
  stripe_idempotency_key text NOT NULL,
  checkout_session_reference text,
  session_expires_at timestamp with time zone,
  lease_token uuid,
  lease_until timestamp with time zone,
  fencing_version bigint DEFAULT 0 NOT NULL,
  attempts integer DEFAULT 0 NOT NULL,
  last_error_code text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  completed_at timestamp with time zone
);

CREATE TABLE zaltyko.organization_saas_customers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  provider text DEFAULT 'stripe'::text NOT NULL,
  environment zaltyko.stripe_environment NOT NULL,
  provider_account_reference text NOT NULL,
  customer_reference text,
  status text DEFAULT 'creating'::text NOT NULL,
  creation_idempotency_key text NOT NULL,
  creation_request_hash text NOT NULL,
  attempts integer DEFAULT 0 NOT NULL,
  last_error_code text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.organization_saas_subscriptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  provider text DEFAULT 'stripe'::text NOT NULL,
  environment zaltyko.stripe_environment NOT NULL,
  provider_account_reference text NOT NULL,
  customer_reference text NOT NULL,
  subscription_reference text NOT NULL,
  price_reference text NOT NULL,
  plan_code zaltyko.saas_plan_code NOT NULL,
  provider_status text NOT NULL,
  billing_interval zaltyko.saas_billing_interval NOT NULL,
  current_period_started_at timestamp with time zone NOT NULL,
  current_period_ends_at timestamp with time zone NOT NULL,
  cancel_at_period_end boolean DEFAULT false NOT NULL,
  canceled_at timestamp with time zone,
  last_provider_event_reference text,
  last_synced_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.organization_saas_trials (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  started_by_member_id uuid NOT NULL,
  status zaltyko.organization_saas_trial_status DEFAULT 'active'::zaltyko.organization_saas_trial_status NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  started_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
  ends_at timestamp with time zone NOT NULL,
  cooldown_ends_at timestamp with time zone NOT NULL,
  ended_at timestamp with time zone,
  converted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.organization_saas_webhook_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  provider text DEFAULT 'stripe'::text NOT NULL,
  provider_account_reference text NOT NULL,
  environment zaltyko.stripe_environment NOT NULL,
  provider_event_id text NOT NULL,
  event_account_reference text,
  event_type text NOT NULL,
  event_created_at timestamp with time zone,
  provider_object_type text,
  provider_object_reference text,
  livemode boolean NOT NULL,
  signature_verified boolean NOT NULL,
  payload_sha256 text NOT NULL,
  organization_id uuid,
  status text DEFAULT 'received'::text NOT NULL,
  attempts integer DEFAULT 0 NOT NULL,
  lease_token uuid,
  lease_until timestamp with time zone,
  fencing_version bigint DEFAULT 0 NOT NULL,
  received_at timestamp with time zone DEFAULT now() NOT NULL,
  processed_at timestamp with time zone,
  last_error_code text,
  reconciliation_decision_id uuid,
  reconciliation_next_attempt_at timestamp with time zone
);

CREATE TABLE zaltyko.organization_saas_webhook_payload_conflicts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  webhook_event_id uuid NOT NULL,
  observed_payload_sha256 text NOT NULL,
  first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
  last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
  occurrences integer DEFAULT 1 NOT NULL
);

CREATE TABLE zaltyko.organization_saas_webhook_reconciliation_decisions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  webhook_event_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  request_id text NOT NULL,
  idempotency_key text NOT NULL,
  confirmation_request_sha256 text NOT NULL,
  resolution_kind text NOT NULL,
  reason text NOT NULL,
  provider_account_reference text NOT NULL,
  environment zaltyko.stripe_environment NOT NULL,
  provider_event_id text NOT NULL,
  event_created_at timestamp with time zone NOT NULL,
  provider_object_reference text NOT NULL,
  payload_sha256 text NOT NULL,
  preview_token_sha256 text NOT NULL,
  preview_issued_at timestamp with time zone NOT NULL,
  preview_expires_at timestamp with time zone NOT NULL,
  expected_fencing_version bigint NOT NULL,
  expected_last_provider_event_reference text,
  expected_subscription_updated_at timestamp with time zone NOT NULL,
  expected_subscription_plan_code zaltyko.saas_plan_code NOT NULL,
  expected_subscription_price_reference text NOT NULL,
  expected_subscription_billing_interval zaltyko.saas_billing_interval NOT NULL,
  expected_subscription_provider_status text NOT NULL,
  expected_subscription_cancel_at_period_end boolean NOT NULL,
  expected_subscription_canceled_at timestamp with time zone,
  expected_subscription_period_started_at timestamp with time zone NOT NULL,
  expected_subscription_period_ends_at timestamp with time zone NOT NULL,
  expected_entitlement_revision integer NOT NULL,
  expected_entitlement_plan_code zaltyko.saas_plan_code NOT NULL,
  expected_entitlement_source zaltyko.entitlement_source NOT NULL,
  expected_entitlement_source_reference text NOT NULL,
  expected_entitlement_subscription_id uuid,
  expected_entitlement_trial_id uuid,
  expected_entitlement_effective_from timestamp with time zone NOT NULL,
  expected_entitlement_effective_until timestamp with time zone,
  evidence_observed_at timestamp with time zone NOT NULL,
  execution_expires_at timestamp with time zone NOT NULL,
  snapshot_sha256 text NOT NULL,
  observed_subscription_reference text NOT NULL,
  observed_customer_reference text NOT NULL,
  observed_plan_code zaltyko.saas_plan_code NOT NULL,
  observed_provider_status text NOT NULL,
  observed_cancel_at_period_end boolean NOT NULL,
  observed_canceled_at timestamp with time zone,
  observed_current_period_started_at timestamp with time zone NOT NULL,
  observed_current_period_ends_at timestamp with time zone NOT NULL,
  observed_price_reference text NOT NULL,
  observed_latest_invoice_reference text,
  invoice_reference text,
  invoice_status text,
  invoice_customer_reference text,
  invoice_subscription_reference text,
  invoice_currency text,
  invoice_paid_amount bigint,
  invoice_period_started_at timestamp with time zone,
  invoice_period_ends_at timestamp with time zone,
  invoice_price_reference text,
  invoice_plan_code zaltyko.saas_plan_code,
  created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);

CREATE TABLE zaltyko.organization_saas_webhook_reconciliation_results (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  decision_id uuid NOT NULL,
  outcome text NOT NULL,
  processor_fencing_version bigint NOT NULL,
  observed_snapshot_sha256 text,
  entitlement_revision_before integer NOT NULL,
  entitlement_revision_after integer NOT NULL,
  entitlement_source_reference_before text NOT NULL,
  entitlement_source_reference_after text NOT NULL,
  result_code text NOT NULL,
  recorded_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);

CREATE TABLE zaltyko.organization_sports (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  country_code text NOT NULL,
  sport_profile_id uuid NOT NULL,
  role zaltyko.organization_sport_role NOT NULL,
  status zaltyko.organization_sport_status DEFAULT 'active'::zaltyko.organization_sport_status NOT NULL,
  starts_on date DEFAULT CURRENT_DATE NOT NULL,
  ends_on date,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.organizations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  legal_name text,
  status zaltyko.organization_status DEFAULT 'trial'::zaltyko.organization_status NOT NULL,
  country_code text DEFAULT 'ES'::text NOT NULL,
  default_timezone text DEFAULT 'Europe/Madrid'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  default_currency text DEFAULT 'EUR'::text NOT NULL
);

CREATE TABLE zaltyko.outbox_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  location_id uuid,
  event_name text NOT NULL,
  event_version integer DEFAULT 1 NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  payload jsonb NOT NULL,
  status zaltyko.outbox_status DEFAULT 'pending'::zaltyko.outbox_status NOT NULL,
  attempts integer DEFAULT 0 NOT NULL,
  occurred_at timestamp with time zone NOT NULL,
  available_at timestamp with time zone DEFAULT now() NOT NULL,
  processed_at timestamp with time zone,
  last_error text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.owner_dashboard_layouts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  module_order text[] NOT NULL,
  version integer DEFAULT 1 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.owner_signup_consent_audits (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  event text DEFAULT 'grant'::text NOT NULL,
  policy_version text NOT NULL,
  source text NOT NULL,
  consent_proof text NOT NULL,
  recorded_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.owner_signup_consent_policy (
  singleton boolean DEFAULT true NOT NULL,
  policy_version text NOT NULL,
  rollout_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);

CREATE TABLE zaltyko.owner_signup_consents (
  user_id uuid NOT NULL,
  state text DEFAULT 'granted'::text NOT NULL,
  policy_version text NOT NULL,
  source text NOT NULL,
  consent_proof text NOT NULL,
  granted_at timestamp with time zone DEFAULT now() NOT NULL,
  revoked_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.payment_allocations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  payment_id uuid NOT NULL,
  charge_id uuid NOT NULL,
  amount_cents bigint NOT NULL,
  currency text NOT NULL,
  allocated_at timestamp with time zone NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.payment_attempts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  location_id uuid,
  family_id uuid NOT NULL,
  family_payer_id uuid,
  invoice_id uuid,
  payment_id uuid,
  status zaltyko.payment_attempt_status NOT NULL,
  amount_cents bigint NOT NULL,
  currency text NOT NULL,
  processor text NOT NULL,
  environment zaltyko.provider_environment NOT NULL,
  provider_attempt_id text NOT NULL,
  failure_code text,
  attempted_at timestamp with time zone NOT NULL,
  provider_event_id uuid,
  idempotency_key text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.payment_provider_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  processor text NOT NULL,
  environment zaltyko.provider_environment NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  payload_sha256 text NOT NULL,
  payload jsonb NOT NULL,
  signature_verified boolean NOT NULL,
  status zaltyko.provider_event_status DEFAULT 'received'::zaltyko.provider_event_status NOT NULL,
  effect_type text,
  effect_id uuid,
  received_at timestamp with time zone DEFAULT now() NOT NULL,
  processed_at timestamp with time zone,
  attempts integer DEFAULT 0 NOT NULL,
  last_error text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.payments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  location_id uuid,
  family_id uuid NOT NULL,
  family_payer_id uuid,
  source zaltyko.payment_source DEFAULT 'provider'::zaltyko.payment_source NOT NULL,
  status zaltyko.payment_status NOT NULL,
  amount_cents bigint NOT NULL,
  currency text NOT NULL,
  processor text,
  environment zaltyko.provider_environment,
  provider_payment_id text,
  manual_method zaltyko.manual_payment_method,
  manual_reference text,
  recorded_by_user_id uuid,
  received_at timestamp with time zone NOT NULL,
  idempotency_key text NOT NULL,
  version integer DEFAULT 1 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.people (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  given_name text NOT NULL,
  family_name text NOT NULL,
  preferred_name text,
  date_of_birth date,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.price_plan_class_template_coverage (
  id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  location_id uuid NOT NULL,
  price_plan_id uuid NOT NULL,
  class_template_id uuid NOT NULL,
  starts_on date NOT NULL,
  ends_on date,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.price_plans (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  name text NOT NULL,
  cadence zaltyko.billing_cadence NOT NULL,
  amount_cents integer NOT NULL,
  currency text DEFAULT 'EUR'::text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.programs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  name text NOT NULL,
  status zaltyko.lifecycle_status DEFAULT 'draft'::zaltyko.lifecycle_status NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  kind zaltyko.program_kind NOT NULL,
  organization_sport_id uuid,
  activity_key text
);

CREATE TABLE zaltyko.refunds (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  payment_id uuid NOT NULL,
  payment_allocation_id uuid NOT NULL,
  status zaltyko.refund_status NOT NULL,
  amount_cents bigint NOT NULL,
  currency text NOT NULL,
  processor text NOT NULL,
  environment zaltyko.provider_environment NOT NULL,
  provider_refund_id text NOT NULL,
  reason_code text NOT NULL,
  refunded_at timestamp with time zone NOT NULL,
  provider_event_id uuid,
  idempotency_key text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.retention_cohort_projection_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  metric_run_id uuid NOT NULL,
  location_id uuid,
  formula_version integer NOT NULL,
  source_watermark timestamp with time zone NOT NULL,
  status text DEFAULT 'running'::text NOT NULL,
  idempotency_key text NOT NULL,
  row_count integer DEFAULT 0 NOT NULL,
  started_at timestamp with time zone DEFAULT now() NOT NULL,
  completed_at timestamp with time zone,
  error_code text
);

CREATE TABLE zaltyko.retention_cohort_projections (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  projection_run_id uuid NOT NULL,
  location_id uuid,
  program_id uuid,
  group_id uuid,
  cohort_month date NOT NULL,
  observation_month date NOT NULL,
  cohort_size integer NOT NULL,
  active_count integer NOT NULL,
  paused_count integer NOT NULL,
  retention_rate numeric(5,4),
  quality zaltyko.metric_quality NOT NULL,
  numerator integer NOT NULL,
  denominator integer NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.session_staff (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  session_id uuid NOT NULL,
  staff_profile_id uuid NOT NULL,
  assignment_role text DEFAULT 'coach'::text NOT NULL
);

CREATE TABLE zaltyko.sessions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  location_id uuid NOT NULL,
  class_template_id uuid NOT NULL,
  space_id uuid,
  status zaltyko.session_status DEFAULT 'scheduled'::zaltyko.session_status NOT NULL,
  starts_at timestamp with time zone NOT NULL,
  ends_at timestamp with time zone NOT NULL,
  capacity_override integer,
  cancellation_reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.spaces (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  location_id uuid NOT NULL,
  facility_id uuid NOT NULL,
  name text NOT NULL,
  capacity integer,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.sport_profiles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  country_code text NOT NULL,
  discipline_key text NOT NULL,
  federation_code text DEFAULT 'unconfigured'::text NOT NULL,
  profile_version text NOT NULL,
  status zaltyko.sport_profile_status DEFAULT 'identity_only'::zaltyko.sport_profile_status NOT NULL,
  configuration_schema_version integer DEFAULT 1 NOT NULL,
  configuration jsonb DEFAULT '{}'::jsonb NOT NULL,
  source_title text,
  source_url text,
  source_verified_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.staff_profiles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  person_id uuid NOT NULL,
  member_id uuid,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.trial_followups (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  location_id uuid NOT NULL,
  trial_id uuid NOT NULL,
  channel zaltyko.trial_followup_channel NOT NULL,
  outcome zaltyko.trial_followup_outcome NOT NULL,
  completed_by_member_id uuid,
  completed_at timestamp with time zone NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.trial_status_history (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  location_id uuid NOT NULL,
  trial_id uuid NOT NULL,
  from_status zaltyko.trial_status,
  to_status zaltyko.trial_status NOT NULL,
  effective_at timestamp with time zone NOT NULL,
  changed_by_member_id uuid,
  idempotency_key text NOT NULL,
  changed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.trials (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  location_id uuid NOT NULL,
  athlete_id uuid NOT NULL,
  session_id uuid NOT NULL,
  trial_enrollment_id uuid NOT NULL,
  converted_enrollment_id uuid,
  status zaltyko.trial_status DEFAULT 'booked'::zaltyko.trial_status NOT NULL,
  version integer DEFAULT 1 NOT NULL,
  booked_at timestamp with time zone DEFAULT now() NOT NULL,
  attended_at timestamp with time zone,
  completed_at timestamp with time zone,
  converted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.waitlist_entries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  location_id uuid NOT NULL,
  athlete_id uuid NOT NULL,
  class_template_id uuid,
  program_id uuid,
  source_trial_id uuid,
  contact_guardian_id uuid,
  contactable boolean DEFAULT false NOT NULL,
  contact_consent_status zaltyko.contact_consent_status DEFAULT 'unknown'::zaltyko.contact_consent_status NOT NULL,
  contact_consent_recorded_at timestamp with time zone,
  priority integer DEFAULT 0 NOT NULL,
  preferences jsonb DEFAULT '{}'::jsonb NOT NULL,
  status zaltyko.waitlist_status DEFAULT 'waiting'::zaltyko.waitlist_status NOT NULL,
  converted_enrollment_id uuid,
  joined_at timestamp with time zone DEFAULT now() NOT NULL,
  version integer DEFAULT 1 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko.waitlist_offers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  location_id uuid NOT NULL,
  waitlist_entry_id uuid NOT NULL,
  class_template_id uuid NOT NULL,
  reserved_enrollment_id uuid NOT NULL,
  status zaltyko.waitlist_offer_status DEFAULT 'pending'::zaltyko.waitlist_offer_status NOT NULL,
  sent_at timestamp with time zone NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  responded_at timestamp with time zone,
  idempotency_key text NOT NULL,
  version integer DEFAULT 1 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE zaltyko_domain_private.e2e_schema_migrations (
  filename text NOT NULL,
  version text NOT NULL,
  checksum text NOT NULL,
  applied_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Preserve captured ownership before adding constraints and routines.
ALTER TABLE public.academies OWNER TO postgres;
ALTER TABLE public.academy_diagnostics OWNER TO postgres;
ALTER TABLE public.academy_expenses OWNER TO postgres;
ALTER TABLE public.academy_geo_groups OWNER TO postgres;
ALTER TABLE public.academy_link_requests OWNER TO postgres;
ALTER TABLE public.academy_messages OWNER TO postgres;
ALTER TABLE public.academy_roles OWNER TO postgres;
ALTER TABLE public.academy_sport_configs OWNER TO postgres;
ALTER TABLE public.academy_trials OWNER TO postgres;
ALTER TABLE public.advertisements OWNER TO postgres;
ALTER TABLE public.announcement_read_status OWNER TO postgres;
ALTER TABLE public.announcements OWNER TO postgres;
ALTER TABLE public.app_config OWNER TO postgres;
ALTER TABLE public.apparatus OWNER TO postgres;
ALTER TABLE public.assessment_rubrics OWNER TO postgres;
ALTER TABLE public.assessment_scores OWNER TO postgres;
ALTER TABLE public.assessment_types OWNER TO postgres;
ALTER TABLE public.assessment_videos OWNER TO postgres;
ALTER TABLE public.athlete_assessments OWNER TO postgres;
ALTER TABLE public.athlete_documents OWNER TO postgres;
ALTER TABLE public.athlete_extra_classes OWNER TO postgres;
ALTER TABLE public.athlete_import_batches OWNER TO postgres;
ALTER TABLE public.athlete_invitations OWNER TO postgres;
ALTER TABLE public.athlete_sport_configs OWNER TO postgres;
ALTER TABLE public.athletes OWNER TO postgres;
ALTER TABLE public.attendance_records OWNER TO postgres;
ALTER TABLE public.audit_logs OWNER TO postgres;
ALTER TABLE public.billing_events OWNER TO postgres;
ALTER TABLE public.billing_invoices OWNER TO postgres;
ALTER TABLE public.billing_items OWNER TO postgres;
ALTER TABLE public.categories OWNER TO postgres;
ALTER TABLE public.charges OWNER TO postgres;
ALTER TABLE public.churn_reasons OWNER TO postgres;
ALTER TABLE public.class_coach_assignments OWNER TO postgres;
ALTER TABLE public.class_enrollments OWNER TO postgres;
ALTER TABLE public.class_exceptions OWNER TO postgres;
ALTER TABLE public.class_groups OWNER TO postgres;
ALTER TABLE public.class_sessions OWNER TO postgres;
ALTER TABLE public.class_waiting_list OWNER TO postgres;
ALTER TABLE public.class_weekdays OWNER TO postgres;
ALTER TABLE public.classes OWNER TO postgres;
ALTER TABLE public.coach_compensation OWNER TO postgres;
ALTER TABLE public.coach_notes OWNER TO postgres;
ALTER TABLE public.coach_sport_configs OWNER TO postgres;
ALTER TABLE public.coaches OWNER TO postgres;
ALTER TABLE public.commercial_interviews OWNER TO postgres;
ALTER TABLE public.competition_results OWNER TO postgres;
ALTER TABLE public.competition_types OWNER TO postgres;
ALTER TABLE public.contact_messages OWNER TO postgres;
ALTER TABLE public.conversation_messages OWNER TO postgres;
ALTER TABLE public.conversation_participants OWNER TO postgres;
ALTER TABLE public.conversations OWNER TO postgres;
ALTER TABLE public.countries OWNER TO postgres;
ALTER TABLE public.directory_audit OWNER TO postgres;
ALTER TABLE public.directory_batches OWNER TO postgres;
ALTER TABLE public.directory_claims OWNER TO postgres;
ALTER TABLE public.directory_deliveries OWNER TO postgres;
ALTER TABLE public.directory_entries OWNER TO postgres;
ALTER TABLE public.directory_favorites OWNER TO postgres;
ALTER TABLE public.directory_grants OWNER TO postgres;
ALTER TABLE public.directory_import_rows OWNER TO postgres;
ALTER TABLE public.directory_revisions OWNER TO postgres;
ALTER TABLE public.directory_sources OWNER TO postgres;
ALTER TABLE public.directory_subscriptions OWNER TO postgres;
ALTER TABLE public.discount_campaigns OWNER TO postgres;
ALTER TABLE public.discount_usage_history OWNER TO postgres;
ALTER TABLE public.discounts OWNER TO postgres;
ALTER TABLE public.email_logs OWNER TO postgres;
ALTER TABLE public.empleo_applications OWNER TO postgres;
ALTER TABLE public.empleo_listings OWNER TO postgres;
ALTER TABLE public.event_categories OWNER TO postgres;
ALTER TABLE public.event_invitations OWNER TO postgres;
ALTER TABLE public.event_logs OWNER TO postgres;
ALTER TABLE public.event_payments OWNER TO postgres;
ALTER TABLE public.event_registrations OWNER TO postgres;
ALTER TABLE public.event_waitlist OWNER TO postgres;
ALTER TABLE public.events OWNER TO postgres;
ALTER TABLE public.family_contacts OWNER TO postgres;
ALTER TABLE public.family_stripe_customers OWNER TO postgres;
ALTER TABLE public.featured_listings OWNER TO postgres;
ALTER TABLE public.federative_licenses OWNER TO postgres;
ALTER TABLE public.group_athletes OWNER TO postgres;
ALTER TABLE public.groups OWNER TO postgres;
ALTER TABLE public.growth_events OWNER TO postgres;
ALTER TABLE public.guardian_athletes OWNER TO postgres;
ALTER TABLE public.guardians OWNER TO postgres;
ALTER TABLE public.invitations OWNER TO postgres;
ALTER TABLE public.lead_interactions OWNER TO postgres;
ALTER TABLE public.lead_trial_outcomes OWNER TO postgres;
ALTER TABLE public.lead_trials OWNER TO postgres;
ALTER TABLE public.leads OWNER TO postgres;
ALTER TABLE public.leak_action_history OWNER TO postgres;
ALTER TABLE public.levels OWNER TO postgres;
ALTER TABLE public.marketplace_listings OWNER TO postgres;
ALTER TABLE public.marketplace_ratings OWNER TO postgres;
ALTER TABLE public.memberships OWNER TO postgres;
ALTER TABLE public.message_groups OWNER TO postgres;
ALTER TABLE public.message_history OWNER TO postgres;
ALTER TABLE public.message_read_receipts OWNER TO postgres;
ALTER TABLE public.message_templates OWNER TO postgres;
ALTER TABLE public.notification_preferences OWNER TO postgres;
ALTER TABLE public.notifications OWNER TO postgres;
ALTER TABLE public.onboarding_checklist_items OWNER TO postgres;
ALTER TABLE public.onboarding_states OWNER TO postgres;
ALTER TABLE public.owner_consent OWNER TO postgres;
ALTER TABLE public.owner_consent_audit OWNER TO postgres;
ALTER TABLE public.payment_attempts OWNER TO postgres;
ALTER TABLE public.plans OWNER TO postgres;
ALTER TABLE public.profiles OWNER TO postgres;
ALTER TABLE public.programs OWNER TO postgres;
ALTER TABLE public.push_subscriptions OWNER TO postgres;
ALTER TABLE public.push_tokens OWNER TO postgres;
ALTER TABLE public.receipts OWNER TO postgres;
ALTER TABLE public.refunds OWNER TO postgres;
ALTER TABLE public.role_members OWNER TO postgres;
ALTER TABLE public.rubric_criteria OWNER TO postgres;
ALTER TABLE public.scheduled_notifications OWNER TO postgres;
ALTER TABLE public.scheduled_reports OWNER TO postgres;
ALTER TABLE public.scholarships OWNER TO postgres;
ALTER TABLE public.skill_catalog OWNER TO postgres;
ALTER TABLE public.sport_branches OWNER TO postgres;
ALTER TABLE public.sport_disciplines OWNER TO postgres;
ALTER TABLE public.sport_locale_configs OWNER TO postgres;
ALTER TABLE public.stripe_accounts OWNER TO postgres;
ALTER TABLE public.subscriptions OWNER TO postgres;
ALTER TABLE public.template_age_categories OWNER TO postgres;
ALTER TABLE public.template_apparatus OWNER TO postgres;
ALTER TABLE public.template_competition_flow OWNER TO postgres;
ALTER TABLE public.template_competition_levels OWNER TO postgres;
ALTER TABLE public.template_license_config OWNER TO postgres;
ALTER TABLE public.template_scoring_config OWNER TO postgres;
ALTER TABLE public.templates OWNER TO postgres;
ALTER TABLE public.terminology_dictionary OWNER TO postgres;
ALTER TABLE public.ticket_attachments OWNER TO postgres;
ALTER TABLE public.ticket_responses OWNER TO postgres;
ALTER TABLE public.tickets OWNER TO postgres;
ALTER TABLE public.user_preferences OWNER TO postgres;
ALTER TABLE public.zaltyko_schema_migrations OWNER TO postgres;
ALTER TABLE zaltyko.athletes OWNER TO postgres;
ALTER TABLE zaltyko.attendance_records OWNER TO postgres;
ALTER TABLE zaltyko.audit_log OWNER TO postgres;
ALTER TABLE zaltyko.benchmark_metric_targets OWNER TO postgres;
ALTER TABLE zaltyko.benchmark_profiles OWNER TO postgres;
ALTER TABLE zaltyko.charges OWNER TO postgres;
ALTER TABLE zaltyko.class_template_groups OWNER TO postgres;
ALTER TABLE zaltyko.class_template_weekdays OWNER TO postgres;
ALTER TABLE zaltyko.class_templates OWNER TO postgres;
ALTER TABLE zaltyko.data_quality_issues OWNER TO postgres;
ALTER TABLE zaltyko.enrollment_pauses OWNER TO postgres;
ALTER TABLE zaltyko.enrollment_price_assignments OWNER TO postgres;
ALTER TABLE zaltyko.enrollment_status_history OWNER TO postgres;
ALTER TABLE zaltyko.enrollments OWNER TO postgres;
ALTER TABLE zaltyko.facilities OWNER TO postgres;
ALTER TABLE zaltyko.families OWNER TO postgres;
ALTER TABLE zaltyko.family_collection_preferences OWNER TO postgres;
ALTER TABLE zaltyko.family_guardians OWNER TO postgres;
ALTER TABLE zaltyko.family_members OWNER TO postgres;
ALTER TABLE zaltyko.family_payers OWNER TO postgres;
ALTER TABLE zaltyko.family_payment_authorizations OWNER TO postgres;
ALTER TABLE zaltyko.financial_reconciliation_runs OWNER TO postgres;
ALTER TABLE zaltyko.group_membership_history OWNER TO postgres;
ALTER TABLE zaltyko.group_memberships OWNER TO postgres;
ALTER TABLE zaltyko.groups OWNER TO postgres;
ALTER TABLE zaltyko.guardian_contacts OWNER TO postgres;
ALTER TABLE zaltyko.guardians OWNER TO postgres;
ALTER TABLE zaltyko.health_score_dimension_snapshots OWNER TO postgres;
ALTER TABLE zaltyko.health_score_dimension_weights OWNER TO postgres;
ALTER TABLE zaltyko.health_score_metric_contributions OWNER TO postgres;
ALTER TABLE zaltyko.health_score_metric_weights OWNER TO postgres;
ALTER TABLE zaltyko.health_score_snapshots OWNER TO postgres;
ALTER TABLE zaltyko.health_score_versions OWNER TO postgres;
ALTER TABLE zaltyko.insight_actions OWNER TO postgres;
ALTER TABLE zaltyko.insight_notifications OWNER TO postgres;
ALTER TABLE zaltyko.insight_rule_runs OWNER TO postgres;
ALTER TABLE zaltyko.insight_rule_versions OWNER TO postgres;
ALTER TABLE zaltyko.insight_run_observations OWNER TO postgres;
ALTER TABLE zaltyko.insight_status_history OWNER TO postgres;
ALTER TABLE zaltyko.insights OWNER TO postgres;
ALTER TABLE zaltyko.invoice_line_enrollments OWNER TO postgres;
ALTER TABLE zaltyko.invoice_lines OWNER TO postgres;
ALTER TABLE zaltyko.invoices OWNER TO postgres;
ALTER TABLE zaltyko.locations OWNER TO postgres;
ALTER TABLE zaltyko.member_location_scopes OWNER TO postgres;
ALTER TABLE zaltyko.metric_definitions OWNER TO postgres;
ALTER TABLE zaltyko.metric_event_consumptions OWNER TO postgres;
ALTER TABLE zaltyko.metric_invalidations OWNER TO postgres;
ALTER TABLE zaltyko.metric_run_values OWNER TO postgres;
ALTER TABLE zaltyko.metric_runs OWNER TO postgres;
ALTER TABLE zaltyko.metric_values OWNER TO postgres;
ALTER TABLE zaltyko.organization_bootstrap_commands OWNER TO postgres;
ALTER TABLE zaltyko.organization_entitlement_changes OWNER TO postgres;
ALTER TABLE zaltyko.organization_entitlements OWNER TO postgres;
ALTER TABLE zaltyko.organization_members OWNER TO postgres;
ALTER TABLE zaltyko.organization_payment_provider_accounts OWNER TO postgres;
ALTER TABLE zaltyko.organization_saas_checkout_operations OWNER TO postgres;
ALTER TABLE zaltyko.organization_saas_customers OWNER TO postgres;
ALTER TABLE zaltyko.organization_saas_subscriptions OWNER TO postgres;
ALTER TABLE zaltyko.organization_saas_trials OWNER TO postgres;
ALTER TABLE zaltyko.organization_saas_webhook_events OWNER TO postgres;
ALTER TABLE zaltyko.organization_saas_webhook_payload_conflicts OWNER TO postgres;
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions OWNER TO postgres;
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_results OWNER TO postgres;
ALTER TABLE zaltyko.organization_sports OWNER TO postgres;
ALTER TABLE zaltyko.organizations OWNER TO postgres;
ALTER TABLE zaltyko.outbox_events OWNER TO postgres;
ALTER TABLE zaltyko.owner_dashboard_layouts OWNER TO postgres;
ALTER TABLE zaltyko.owner_signup_consent_audits OWNER TO postgres;
ALTER TABLE zaltyko.owner_signup_consent_policy OWNER TO postgres;
ALTER TABLE zaltyko.owner_signup_consents OWNER TO postgres;
ALTER TABLE zaltyko.payment_allocations OWNER TO postgres;
ALTER TABLE zaltyko.payment_attempts OWNER TO postgres;
ALTER TABLE zaltyko.payment_provider_events OWNER TO postgres;
ALTER TABLE zaltyko.payments OWNER TO postgres;
ALTER TABLE zaltyko.people OWNER TO postgres;
ALTER TABLE zaltyko.price_plan_class_template_coverage OWNER TO postgres;
ALTER TABLE zaltyko.price_plans OWNER TO postgres;
ALTER TABLE zaltyko.programs OWNER TO postgres;
ALTER TABLE zaltyko.refunds OWNER TO postgres;
ALTER TABLE zaltyko.retention_cohort_projection_runs OWNER TO postgres;
ALTER TABLE zaltyko.retention_cohort_projections OWNER TO postgres;
ALTER TABLE zaltyko.session_staff OWNER TO postgres;
ALTER TABLE zaltyko.sessions OWNER TO postgres;
ALTER TABLE zaltyko.spaces OWNER TO postgres;
ALTER TABLE zaltyko.sport_profiles OWNER TO postgres;
ALTER TABLE zaltyko.staff_profiles OWNER TO postgres;
ALTER TABLE zaltyko.trial_followups OWNER TO postgres;
ALTER TABLE zaltyko.trial_status_history OWNER TO postgres;
ALTER TABLE zaltyko.trials OWNER TO postgres;
ALTER TABLE zaltyko.waitlist_entries OWNER TO postgres;
ALTER TABLE zaltyko.waitlist_offers OWNER TO postgres;
ALTER TABLE zaltyko_domain_private.e2e_schema_migrations OWNER TO postgres;

-- Constraints are grouped so keys exist before foreign keys.
ALTER TABLE public.academies ADD CONSTRAINT academies_pkey PRIMARY KEY (id);
ALTER TABLE public.academy_diagnostics ADD CONSTRAINT academy_diagnostics_pkey PRIMARY KEY (id);
ALTER TABLE public.academy_expenses ADD CONSTRAINT academy_expenses_pkey PRIMARY KEY (id);
ALTER TABLE public.academy_geo_groups ADD CONSTRAINT academy_geo_groups_pkey PRIMARY KEY (id);
ALTER TABLE public.academy_link_requests ADD CONSTRAINT academy_link_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.academy_messages ADD CONSTRAINT academy_messages_pkey PRIMARY KEY (id);
ALTER TABLE public.academy_roles ADD CONSTRAINT academy_roles_pkey PRIMARY KEY (id);
ALTER TABLE public.academy_sport_configs ADD CONSTRAINT academy_sport_configs_pkey PRIMARY KEY (id);
ALTER TABLE public.academy_trials ADD CONSTRAINT academy_trials_pkey PRIMARY KEY (id);
ALTER TABLE public.advertisements ADD CONSTRAINT advertisements_pkey PRIMARY KEY (id);
ALTER TABLE public.announcement_read_status ADD CONSTRAINT announcement_read_status_pkey PRIMARY KEY (id);
ALTER TABLE public.announcements ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);
ALTER TABLE public.app_config ADD CONSTRAINT app_config_pkey PRIMARY KEY (key);
ALTER TABLE public.apparatus ADD CONSTRAINT apparatus_pkey PRIMARY KEY (id);
ALTER TABLE public.assessment_rubrics ADD CONSTRAINT assessment_rubrics_pkey PRIMARY KEY (id);
ALTER TABLE public.assessment_scores ADD CONSTRAINT assessment_scores_pkey PRIMARY KEY (id);
ALTER TABLE public.assessment_types ADD CONSTRAINT assessment_types_pkey PRIMARY KEY (id);
ALTER TABLE public.assessment_videos ADD CONSTRAINT assessment_videos_pkey PRIMARY KEY (id);
ALTER TABLE public.athlete_assessments ADD CONSTRAINT athlete_assessments_pkey PRIMARY KEY (id);
ALTER TABLE public.athlete_documents ADD CONSTRAINT athlete_documents_pkey PRIMARY KEY (id);
ALTER TABLE public.athlete_extra_classes ADD CONSTRAINT athlete_extra_classes_pkey PRIMARY KEY (id);
ALTER TABLE public.athlete_import_batches ADD CONSTRAINT athlete_import_batches_pkey PRIMARY KEY (id);
ALTER TABLE public.athlete_invitations ADD CONSTRAINT athlete_invitations_pkey PRIMARY KEY (id);
ALTER TABLE public.athlete_sport_configs ADD CONSTRAINT athlete_sport_configs_pkey PRIMARY KEY (id);
ALTER TABLE public.athletes ADD CONSTRAINT athletes_pkey PRIMARY KEY (id);
ALTER TABLE public.attendance_records ADD CONSTRAINT attendance_records_pkey PRIMARY KEY (id);
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.billing_events ADD CONSTRAINT billing_events_pkey PRIMARY KEY (id);
ALTER TABLE public.billing_invoices ADD CONSTRAINT billing_invoices_pkey PRIMARY KEY (id);
ALTER TABLE public.billing_items ADD CONSTRAINT billing_items_pkey PRIMARY KEY (id);
ALTER TABLE public.categories ADD CONSTRAINT categories_pkey PRIMARY KEY (id);
ALTER TABLE public.charges ADD CONSTRAINT charges_pkey PRIMARY KEY (id);
ALTER TABLE public.churn_reasons ADD CONSTRAINT churn_reasons_pkey PRIMARY KEY (id);
ALTER TABLE public.class_coach_assignments ADD CONSTRAINT class_coach_assignments_pkey PRIMARY KEY (id);
ALTER TABLE public.class_enrollments ADD CONSTRAINT class_enrollments_pkey PRIMARY KEY (id);
ALTER TABLE public.class_exceptions ADD CONSTRAINT class_exceptions_pkey PRIMARY KEY (id);
ALTER TABLE public.class_groups ADD CONSTRAINT class_groups_pkey PRIMARY KEY (id);
ALTER TABLE public.class_sessions ADD CONSTRAINT class_sessions_pkey PRIMARY KEY (id);
ALTER TABLE public.class_waiting_list ADD CONSTRAINT class_waiting_list_pkey PRIMARY KEY (id);
ALTER TABLE public.class_weekdays ADD CONSTRAINT class_weekdays_pkey PRIMARY KEY (id);
ALTER TABLE public.classes ADD CONSTRAINT classes_pkey PRIMARY KEY (id);
ALTER TABLE public.coach_compensation ADD CONSTRAINT coach_compensation_pkey PRIMARY KEY (id);
ALTER TABLE public.coach_notes ADD CONSTRAINT coach_notes_pkey PRIMARY KEY (id);
ALTER TABLE public.coach_sport_configs ADD CONSTRAINT coach_sport_configs_pkey PRIMARY KEY (id);
ALTER TABLE public.coaches ADD CONSTRAINT coaches_pkey PRIMARY KEY (id);
ALTER TABLE public.commercial_interviews ADD CONSTRAINT commercial_interviews_pkey PRIMARY KEY (id);
ALTER TABLE public.competition_results ADD CONSTRAINT competition_results_pkey PRIMARY KEY (id);
ALTER TABLE public.competition_types ADD CONSTRAINT competition_types_pkey PRIMARY KEY (id);
ALTER TABLE public.contact_messages ADD CONSTRAINT contact_messages_pkey PRIMARY KEY (id);
ALTER TABLE public.conversation_messages ADD CONSTRAINT conversation_messages_pkey PRIMARY KEY (id);
ALTER TABLE public.conversation_participants ADD CONSTRAINT conversation_participants_pkey PRIMARY KEY (id);
ALTER TABLE public.conversations ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);
ALTER TABLE public.countries ADD CONSTRAINT countries_pkey PRIMARY KEY (id);
ALTER TABLE public.directory_audit ADD CONSTRAINT directory_audit_pkey PRIMARY KEY (id);
ALTER TABLE public.directory_batches ADD CONSTRAINT directory_batches_pkey PRIMARY KEY (id);
ALTER TABLE public.directory_claims ADD CONSTRAINT directory_claims_pkey PRIMARY KEY (id);
ALTER TABLE public.directory_deliveries ADD CONSTRAINT directory_deliveries_pkey PRIMARY KEY (id);
ALTER TABLE public.directory_entries ADD CONSTRAINT directory_entries_pkey PRIMARY KEY (id);
ALTER TABLE public.directory_favorites ADD CONSTRAINT directory_favorites_pkey PRIMARY KEY (user_id, entry_id);
ALTER TABLE public.directory_grants ADD CONSTRAINT directory_grants_pkey PRIMARY KEY (entry_id);
ALTER TABLE public.directory_import_rows ADD CONSTRAINT directory_import_rows_pkey PRIMARY KEY (id);
ALTER TABLE public.directory_revisions ADD CONSTRAINT directory_revisions_pkey PRIMARY KEY (id);
ALTER TABLE public.directory_sources ADD CONSTRAINT directory_sources_pkey PRIMARY KEY (id);
ALTER TABLE public.directory_subscriptions ADD CONSTRAINT directory_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE public.discount_campaigns ADD CONSTRAINT discount_campaigns_pkey PRIMARY KEY (id);
ALTER TABLE public.discount_usage_history ADD CONSTRAINT discount_usage_history_pkey PRIMARY KEY (id);
ALTER TABLE public.discounts ADD CONSTRAINT discounts_pkey PRIMARY KEY (id);
ALTER TABLE public.email_logs ADD CONSTRAINT email_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.empleo_applications ADD CONSTRAINT empleo_applications_pkey PRIMARY KEY (id);
ALTER TABLE public.empleo_listings ADD CONSTRAINT empleo_listings_pkey PRIMARY KEY (id);
ALTER TABLE public.event_categories ADD CONSTRAINT event_categories_pkey PRIMARY KEY (id);
ALTER TABLE public.event_invitations ADD CONSTRAINT event_invitations_pkey PRIMARY KEY (id);
ALTER TABLE public.event_logs ADD CONSTRAINT event_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.event_payments ADD CONSTRAINT event_payments_pkey PRIMARY KEY (id);
ALTER TABLE public.event_registrations ADD CONSTRAINT event_registrations_pkey PRIMARY KEY (id);
ALTER TABLE public.event_waitlist ADD CONSTRAINT event_waitlist_pkey PRIMARY KEY (id);
ALTER TABLE public.events ADD CONSTRAINT events_pkey PRIMARY KEY (id);
ALTER TABLE public.family_contacts ADD CONSTRAINT family_contacts_pkey PRIMARY KEY (id);
ALTER TABLE public.family_stripe_customers ADD CONSTRAINT family_stripe_customers_pkey PRIMARY KEY (id);
ALTER TABLE public.featured_listings ADD CONSTRAINT featured_listings_pkey PRIMARY KEY (id);
ALTER TABLE public.federative_licenses ADD CONSTRAINT federative_licenses_pkey PRIMARY KEY (id);
ALTER TABLE public.group_athletes ADD CONSTRAINT group_athletes_pkey PRIMARY KEY (id);
ALTER TABLE public.groups ADD CONSTRAINT groups_pkey PRIMARY KEY (id);
ALTER TABLE public.growth_events ADD CONSTRAINT growth_events_pkey PRIMARY KEY (id);
ALTER TABLE public.guardian_athletes ADD CONSTRAINT guardian_athletes_pkey PRIMARY KEY (id);
ALTER TABLE public.guardians ADD CONSTRAINT guardians_pkey PRIMARY KEY (id);
ALTER TABLE public.invitations ADD CONSTRAINT invitations_pkey PRIMARY KEY (id);
ALTER TABLE public.lead_interactions ADD CONSTRAINT lead_interactions_pkey PRIMARY KEY (id);
ALTER TABLE public.lead_trial_outcomes ADD CONSTRAINT lead_trial_outcomes_pkey PRIMARY KEY (id);
ALTER TABLE public.lead_trials ADD CONSTRAINT lead_trials_pkey PRIMARY KEY (id);
ALTER TABLE public.leads ADD CONSTRAINT leads_pkey PRIMARY KEY (id);
ALTER TABLE public.leak_action_history ADD CONSTRAINT leak_action_history_pkey PRIMARY KEY (id);
ALTER TABLE public.levels ADD CONSTRAINT levels_pkey PRIMARY KEY (id);
ALTER TABLE public.marketplace_listings ADD CONSTRAINT marketplace_listings_pkey PRIMARY KEY (id);
ALTER TABLE public.marketplace_ratings ADD CONSTRAINT marketplace_ratings_pkey PRIMARY KEY (id);
ALTER TABLE public.memberships ADD CONSTRAINT memberships_pkey PRIMARY KEY (id);
ALTER TABLE public.message_groups ADD CONSTRAINT message_groups_pkey PRIMARY KEY (id);
ALTER TABLE public.message_history ADD CONSTRAINT message_history_pkey PRIMARY KEY (id);
ALTER TABLE public.message_read_receipts ADD CONSTRAINT message_read_receipts_pkey PRIMARY KEY (id);
ALTER TABLE public.message_templates ADD CONSTRAINT message_templates_pkey PRIMARY KEY (id);
ALTER TABLE public.notification_preferences ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (id);
ALTER TABLE public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
ALTER TABLE public.onboarding_checklist_items ADD CONSTRAINT onboarding_checklist_items_pkey PRIMARY KEY (id);
ALTER TABLE public.onboarding_states ADD CONSTRAINT onboarding_states_pkey PRIMARY KEY (id);
ALTER TABLE public.owner_consent ADD CONSTRAINT owner_consent_pkey PRIMARY KEY (id);
ALTER TABLE public.owner_consent_audit ADD CONSTRAINT owner_consent_audit_pkey PRIMARY KEY (id);
ALTER TABLE public.payment_attempts ADD CONSTRAINT payment_attempts_pkey PRIMARY KEY (id);
ALTER TABLE public.plans ADD CONSTRAINT plans_pkey PRIMARY KEY (id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.programs ADD CONSTRAINT programs_pkey PRIMARY KEY (id);
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE public.push_tokens ADD CONSTRAINT push_tokens_pkey PRIMARY KEY (id);
ALTER TABLE public.receipts ADD CONSTRAINT receipts_pkey PRIMARY KEY (id);
ALTER TABLE public.refunds ADD CONSTRAINT refunds_pkey PRIMARY KEY (id);
ALTER TABLE public.role_members ADD CONSTRAINT role_members_pkey PRIMARY KEY (id);
ALTER TABLE public.rubric_criteria ADD CONSTRAINT rubric_criteria_pkey PRIMARY KEY (id);
ALTER TABLE public.scheduled_notifications ADD CONSTRAINT scheduled_notifications_pkey PRIMARY KEY (id);
ALTER TABLE public.scheduled_reports ADD CONSTRAINT scheduled_reports_pkey PRIMARY KEY (id);
ALTER TABLE public.scholarships ADD CONSTRAINT scholarships_pkey PRIMARY KEY (id);
ALTER TABLE public.skill_catalog ADD CONSTRAINT skill_catalog_pkey PRIMARY KEY (id);
ALTER TABLE public.sport_branches ADD CONSTRAINT sport_branches_pkey PRIMARY KEY (id);
ALTER TABLE public.sport_disciplines ADD CONSTRAINT sport_disciplines_pkey PRIMARY KEY (id);
ALTER TABLE public.sport_locale_configs ADD CONSTRAINT sport_locale_configs_pkey PRIMARY KEY (id);
ALTER TABLE public.stripe_accounts ADD CONSTRAINT stripe_accounts_pkey PRIMARY KEY (id);
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE public.template_age_categories ADD CONSTRAINT template_age_categories_pkey PRIMARY KEY (id);
ALTER TABLE public.template_apparatus ADD CONSTRAINT template_apparatus_pkey PRIMARY KEY (id);
ALTER TABLE public.template_competition_flow ADD CONSTRAINT template_competition_flow_pkey PRIMARY KEY (id);
ALTER TABLE public.template_competition_levels ADD CONSTRAINT template_competition_levels_pkey PRIMARY KEY (id);
ALTER TABLE public.template_license_config ADD CONSTRAINT template_license_config_pkey PRIMARY KEY (id);
ALTER TABLE public.template_scoring_config ADD CONSTRAINT template_scoring_config_pkey PRIMARY KEY (id);
ALTER TABLE public.templates ADD CONSTRAINT templates_pkey PRIMARY KEY (id);
ALTER TABLE public.terminology_dictionary ADD CONSTRAINT terminology_dictionary_pkey PRIMARY KEY (id);
ALTER TABLE public.ticket_attachments ADD CONSTRAINT ticket_attachments_pkey PRIMARY KEY (id);
ALTER TABLE public.ticket_responses ADD CONSTRAINT ticket_responses_pkey PRIMARY KEY (id);
ALTER TABLE public.tickets ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);
ALTER TABLE public.user_preferences ADD CONSTRAINT user_preferences_pkey PRIMARY KEY (id);
ALTER TABLE public.zaltyko_schema_migrations ADD CONSTRAINT zaltyko_schema_migrations_pkey PRIMARY KEY (filename);
ALTER TABLE zaltyko.athletes ADD CONSTRAINT athletes_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.attendance_records ADD CONSTRAINT attendance_records_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.audit_log ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.benchmark_metric_targets ADD CONSTRAINT benchmark_metric_targets_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.benchmark_profiles ADD CONSTRAINT benchmark_profiles_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.charges ADD CONSTRAINT charges_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.class_template_groups ADD CONSTRAINT class_template_groups_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.class_template_weekdays ADD CONSTRAINT class_template_weekdays_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.class_templates ADD CONSTRAINT class_templates_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.data_quality_issues ADD CONSTRAINT data_quality_issues_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.enrollment_pauses ADD CONSTRAINT enrollment_pauses_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.enrollment_price_assignments ADD CONSTRAINT enrollment_price_assignments_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.enrollment_status_history ADD CONSTRAINT enrollment_status_history_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.enrollments ADD CONSTRAINT enrollments_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.facilities ADD CONSTRAINT facilities_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.families ADD CONSTRAINT families_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.family_collection_preferences ADD CONSTRAINT family_collection_preferences_pkey PRIMARY KEY (organization_id, family_id);
ALTER TABLE zaltyko.family_guardians ADD CONSTRAINT family_guardians_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.family_members ADD CONSTRAINT family_members_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.family_payers ADD CONSTRAINT family_payers_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.family_payment_authorizations ADD CONSTRAINT family_payment_authorizations_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.financial_reconciliation_runs ADD CONSTRAINT financial_reconciliation_runs_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.group_membership_history ADD CONSTRAINT group_membership_history_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.group_memberships ADD CONSTRAINT group_memberships_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.groups ADD CONSTRAINT groups_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.guardian_contacts ADD CONSTRAINT guardian_contacts_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.guardians ADD CONSTRAINT guardians_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.health_score_dimension_snapshots ADD CONSTRAINT health_score_dimension_snapshots_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.health_score_dimension_weights ADD CONSTRAINT health_score_dimension_weights_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.health_score_metric_contributions ADD CONSTRAINT health_score_metric_contributions_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.health_score_metric_weights ADD CONSTRAINT health_score_metric_weights_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.health_score_snapshots ADD CONSTRAINT health_score_snapshots_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.health_score_versions ADD CONSTRAINT health_score_versions_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.insight_actions ADD CONSTRAINT insight_actions_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.insight_notifications ADD CONSTRAINT insight_notifications_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.insight_rule_runs ADD CONSTRAINT insight_rule_runs_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.insight_rule_versions ADD CONSTRAINT insight_rule_versions_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.insight_run_observations ADD CONSTRAINT insight_run_observations_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.insight_status_history ADD CONSTRAINT insight_status_history_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.invoice_line_enrollments ADD CONSTRAINT invoice_line_enrollments_pkey PRIMARY KEY (organization_id, invoice_line_id, enrollment_id);
ALTER TABLE zaltyko.invoice_lines ADD CONSTRAINT invoice_lines_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.invoices ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.locations ADD CONSTRAINT locations_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.member_location_scopes ADD CONSTRAINT member_location_scopes_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.metric_definitions ADD CONSTRAINT metric_definitions_pkey PRIMARY KEY (key);
ALTER TABLE zaltyko.metric_event_consumptions ADD CONSTRAINT metric_event_consumptions_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.metric_invalidations ADD CONSTRAINT metric_invalidations_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.metric_run_values ADD CONSTRAINT metric_run_values_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.metric_runs ADD CONSTRAINT metric_runs_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.metric_values ADD CONSTRAINT metric_values_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.organization_bootstrap_commands ADD CONSTRAINT organization_bootstrap_commands_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.organization_entitlement_changes ADD CONSTRAINT organization_entitlement_changes_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.organization_entitlements ADD CONSTRAINT organization_entitlements_pkey PRIMARY KEY (organization_id);
ALTER TABLE zaltyko.organization_members ADD CONSTRAINT organization_members_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.organization_payment_provider_accounts ADD CONSTRAINT organization_payment_provider_accounts_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operations_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.organization_saas_customers ADD CONSTRAINT organization_saas_customers_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.organization_saas_subscriptions ADD CONSTRAINT organization_saas_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.organization_saas_trials ADD CONSTRAINT organization_saas_trials_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT organization_saas_webhook_events_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.organization_saas_webhook_payload_conflicts ADD CONSTRAINT organization_saas_webhook_payload_conflicts_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_reconciliation_decisions_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_results ADD CONSTRAINT organization_saas_webhook_reconciliation_results_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.organization_sports ADD CONSTRAINT organization_sports_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.organizations ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.outbox_events ADD CONSTRAINT outbox_events_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.owner_dashboard_layouts ADD CONSTRAINT owner_dashboard_layouts_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.owner_signup_consent_audits ADD CONSTRAINT owner_signup_consent_audits_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.owner_signup_consent_policy ADD CONSTRAINT owner_signup_consent_policy_pkey PRIMARY KEY (singleton);
ALTER TABLE zaltyko.owner_signup_consents ADD CONSTRAINT owner_signup_consents_pkey PRIMARY KEY (user_id);
ALTER TABLE zaltyko.payment_allocations ADD CONSTRAINT payment_allocations_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.payment_attempts ADD CONSTRAINT payment_attempts_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.payment_provider_events ADD CONSTRAINT payment_provider_events_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.payments ADD CONSTRAINT payments_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.people ADD CONSTRAINT people_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.price_plan_class_template_coverage ADD CONSTRAINT price_plan_class_template_coverage_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.price_plans ADD CONSTRAINT price_plans_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.programs ADD CONSTRAINT programs_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.refunds ADD CONSTRAINT refunds_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.retention_cohort_projection_runs ADD CONSTRAINT retention_cohort_projection_runs_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.retention_cohort_projections ADD CONSTRAINT retention_cohort_projections_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.session_staff ADD CONSTRAINT session_staff_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.sessions ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.spaces ADD CONSTRAINT spaces_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.sport_profiles ADD CONSTRAINT sport_profiles_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.staff_profiles ADD CONSTRAINT staff_profiles_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.trial_followups ADD CONSTRAINT trial_followups_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.trial_status_history ADD CONSTRAINT trial_status_history_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.trials ADD CONSTRAINT trials_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.waitlist_entries ADD CONSTRAINT waitlist_entries_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko.waitlist_offers ADD CONSTRAINT waitlist_offers_pkey PRIMARY KEY (id);
ALTER TABLE zaltyko_domain_private.e2e_schema_migrations ADD CONSTRAINT e2e_schema_migrations_pkey PRIMARY KEY (filename);
ALTER TABLE public.athlete_invitations ADD CONSTRAINT athlete_invitations_state_token_key UNIQUE (state_token);
ALTER TABLE public.billing_events ADD CONSTRAINT billing_events_stripe_event_id_unique UNIQUE (stripe_event_id);
ALTER TABLE public.billing_invoices ADD CONSTRAINT billing_invoices_stripe_invoice_id_unique UNIQUE (stripe_invoice_id);
ALTER TABLE public.coaches ADD CONSTRAINT coaches_slug_unique UNIQUE (slug);
ALTER TABLE public.directory_batches ADD CONSTRAINT directory_batches_source_id_fingerprint_key UNIQUE (source_id, fingerprint);
ALTER TABLE public.directory_deliveries ADD CONSTRAINT directory_deliveries_dedupe_key_key UNIQUE (dedupe_key);
ALTER TABLE public.directory_entries ADD CONSTRAINT directory_entries_academy_id_key UNIQUE (academy_id);
ALTER TABLE public.directory_entries ADD CONSTRAINT directory_entries_event_id_key UNIQUE (event_id);
ALTER TABLE public.directory_import_rows ADD CONSTRAINT directory_import_rows_batch_id_external_id_key UNIQUE (batch_id, external_id);
ALTER TABLE public.directory_sources ADD CONSTRAINT directory_sources_url_key UNIQUE (url);
ALTER TABLE public.directory_subscriptions ADD CONSTRAINT directory_subscriptions_token_hash_key UNIQUE (token_hash);
ALTER TABLE public.guardians ADD CONSTRAINT guardians_profile_id_unique UNIQUE (profile_id);
ALTER TABLE public.leads ADD CONSTRAINT leads_email_key UNIQUE (email);
ALTER TABLE public.owner_consent ADD CONSTRAINT owner_consent_owner_id_key UNIQUE (owner_id);
ALTER TABLE public.plans ADD CONSTRAINT plans_code_unique UNIQUE (code);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_unique UNIQUE (user_id);
ALTER TABLE public.template_license_config ADD CONSTRAINT template_license_config_template_id_unique UNIQUE (template_id);
ALTER TABLE public.template_scoring_config ADD CONSTRAINT template_scoring_config_template_id_unique UNIQUE (template_id);
ALTER TABLE zaltyko.athletes ADD CONSTRAINT athletes_organization_id_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.athletes ADD CONSTRAINT athletes_organization_person_uq UNIQUE (organization_id, person_id);
ALTER TABLE zaltyko.attendance_records ADD CONSTRAINT attendance_records_session_enrollment_uq UNIQUE (organization_id, session_id, enrollment_id);
ALTER TABLE zaltyko.benchmark_metric_targets ADD CONSTRAINT benchmark_metric_targets_uq UNIQUE (benchmark_profile_id, metric_key, currency);
ALTER TABLE zaltyko.charges ADD CONSTRAINT charges_idempotency_uq UNIQUE (organization_id, idempotency_key);
ALTER TABLE zaltyko.charges ADD CONSTRAINT charges_invoice_line_uq UNIQUE (organization_id, invoice_line_id);
ALTER TABLE zaltyko.charges ADD CONSTRAINT charges_organization_id_currency_uq UNIQUE (organization_id, id, currency);
ALTER TABLE zaltyko.charges ADD CONSTRAINT charges_organization_id_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.class_template_groups ADD CONSTRAINT class_template_groups_uq UNIQUE (organization_id, class_template_id, group_id);
ALTER TABLE zaltyko.class_template_weekdays ADD CONSTRAINT class_template_weekdays_uq UNIQUE (organization_id, class_template_id, iso_weekday, starts_at_local);
ALTER TABLE zaltyko.class_templates ADD CONSTRAINT class_templates_organization_id_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.enrollment_price_assignments ADD CONSTRAINT enrollment_price_assignments_coverage_fk_uq UNIQUE (organization_id, location_id, price_plan_id, enrollment_id, id);
ALTER TABLE zaltyko.enrollment_price_assignments ADD CONSTRAINT enrollment_price_assignments_organization_id_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.enrollment_status_history ADD CONSTRAINT enrollment_status_history_idempotency_uq UNIQUE (organization_id, idempotency_key);
ALTER TABLE zaltyko.enrollments ADD CONSTRAINT enrollments_billing_coverage_fk_uq UNIQUE (organization_id, location_id, athlete_id, class_template_id, id);
ALTER TABLE zaltyko.enrollments ADD CONSTRAINT enrollments_organization_id_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.facilities ADD CONSTRAINT facilities_organization_id_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.families ADD CONSTRAINT families_organization_id_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.family_guardians ADD CONSTRAINT family_guardians_family_guardian_uq UNIQUE (organization_id, family_id, guardian_id);
ALTER TABLE zaltyko.family_payers ADD CONSTRAINT family_payers_family_guardian_uq UNIQUE (organization_id, family_id, guardian_id, starts_on);
ALTER TABLE zaltyko.family_payment_authorizations ADD CONSTRAINT family_payment_authorizations_organization_id_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.family_payment_authorizations ADD CONSTRAINT family_payment_authorizations_setup_uq UNIQUE (organization_id, payment_provider_account_id, provider_setup_reference);
ALTER TABLE zaltyko.financial_reconciliation_runs ADD CONSTRAINT financial_reconciliation_idempotency_uq UNIQUE (organization_id, idempotency_key);
ALTER TABLE zaltyko.financial_reconciliation_runs ADD CONSTRAINT financial_reconciliation_natural_uq UNIQUE (organization_id, currency, period_start, period_end, formula_version);
ALTER TABLE zaltyko.group_membership_history ADD CONSTRAINT group_membership_history_idempotency_uq UNIQUE (organization_id, idempotency_key);
ALTER TABLE zaltyko.groups ADD CONSTRAINT groups_organization_id_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.guardian_contacts ADD CONSTRAINT guardian_contacts_value_uq UNIQUE (organization_id, guardian_id, kind, normalized_value);
ALTER TABLE zaltyko.guardians ADD CONSTRAINT guardians_organization_auth_user_uq UNIQUE (organization_id, auth_user_id);
ALTER TABLE zaltyko.guardians ADD CONSTRAINT guardians_organization_id_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.guardians ADD CONSTRAINT guardians_organization_person_uq UNIQUE (organization_id, person_id);
ALTER TABLE zaltyko.health_score_dimension_snapshots ADD CONSTRAINT health_score_dimension_snapshots_uq UNIQUE (health_score_snapshot_id, dimension);
ALTER TABLE zaltyko.health_score_dimension_weights ADD CONSTRAINT health_score_dimension_weights_uq UNIQUE (health_score_version_id, dimension);
ALTER TABLE zaltyko.health_score_metric_contributions ADD CONSTRAINT health_score_metric_contributions_uq UNIQUE (health_score_snapshot_id, dimension, metric_key);
ALTER TABLE zaltyko.health_score_metric_weights ADD CONSTRAINT health_score_metric_weights_uq UNIQUE (health_score_version_id, dimension, metric_key);
ALTER TABLE zaltyko.health_score_snapshots ADD CONSTRAINT health_score_snapshots_idempotency_uq UNIQUE (organization_id, idempotency_key);
ALTER TABLE zaltyko.health_score_snapshots ADD CONSTRAINT health_score_snapshots_org_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.health_score_versions ADD CONSTRAINT health_score_versions_key_version_uq UNIQUE (key, version);
ALTER TABLE zaltyko.insight_actions ADD CONSTRAINT insight_actions_idempotency_uq UNIQUE (organization_id, idempotency_key);
ALTER TABLE zaltyko.insight_notifications ADD CONSTRAINT insight_notifications_dedupe_uq UNIQUE (organization_id, insight_id, channel, delivery_window_key);
ALTER TABLE zaltyko.insight_rule_runs ADD CONSTRAINT insight_rule_runs_idempotency_uq UNIQUE (organization_id, idempotency_key);
ALTER TABLE zaltyko.insight_rule_runs ADD CONSTRAINT insight_rule_runs_org_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.insight_rule_versions ADD CONSTRAINT insight_rule_versions_key_version_uq UNIQUE (key, version);
ALTER TABLE zaltyko.insight_run_observations ADD CONSTRAINT insight_run_observations_uq UNIQUE (rule_run_id, insight_id);
ALTER TABLE zaltyko.insight_status_history ADD CONSTRAINT insight_status_history_idempotency_uq UNIQUE (organization_id, idempotency_key);
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_org_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_series_occurrence_uq UNIQUE (organization_id, series_key, occurrence);
ALTER TABLE zaltyko.invoice_line_enrollments ADD CONSTRAINT invoice_line_enrollments_line_template_uq UNIQUE (organization_id, invoice_line_id, class_template_id);
ALTER TABLE zaltyko.invoice_lines ADD CONSTRAINT invoice_lines_organization_id_currency_uq UNIQUE (organization_id, id, currency);
ALTER TABLE zaltyko.invoice_lines ADD CONSTRAINT invoice_lines_organization_id_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.invoices ADD CONSTRAINT invoices_billing_line_location_fk_uq UNIQUE (organization_id, location_id, id);
ALTER TABLE zaltyko.invoices ADD CONSTRAINT invoices_idempotency_uq UNIQUE (organization_id, idempotency_key);
ALTER TABLE zaltyko.invoices ADD CONSTRAINT invoices_organization_id_currency_uq UNIQUE (organization_id, id, currency);
ALTER TABLE zaltyko.invoices ADD CONSTRAINT invoices_organization_id_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.invoices ADD CONSTRAINT invoices_reference_uq UNIQUE (organization_id, reference);
ALTER TABLE zaltyko.locations ADD CONSTRAINT locations_organization_code_uq UNIQUE (organization_id, code);
ALTER TABLE zaltyko.locations ADD CONSTRAINT locations_organization_id_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.member_location_scopes ADD CONSTRAINT member_location_scopes_member_location_uq UNIQUE (organization_id, member_id, location_id);
ALTER TABLE zaltyko.metric_event_consumptions ADD CONSTRAINT metric_event_consumptions_uq UNIQUE (outbox_event_id, handler_key, handler_version);
ALTER TABLE zaltyko.metric_invalidations ADD CONSTRAINT metric_invalidations_event_uq UNIQUE (outbox_event_id, handler_key, handler_version);
ALTER TABLE zaltyko.metric_runs ADD CONSTRAINT metric_runs_idempotency_uq UNIQUE (organization_id, idempotency_key);
ALTER TABLE zaltyko.metric_runs ADD CONSTRAINT metric_runs_organization_id_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.organization_bootstrap_commands ADD CONSTRAINT organization_bootstrap_commands_user_key_uq UNIQUE (user_id, idempotency_key);
ALTER TABLE zaltyko.organization_entitlement_changes ADD CONSTRAINT organization_entitlement_changes_revision_uq UNIQUE (organization_id, revision);
ALTER TABLE zaltyko.organization_entitlement_changes ADD CONSTRAINT organization_entitlement_changes_snapshot_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.organization_members ADD CONSTRAINT organization_members_organization_id_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.organization_members ADD CONSTRAINT organization_members_user_uq UNIQUE (organization_id, user_id);
ALTER TABLE zaltyko.organization_payment_provider_accounts ADD CONSTRAINT organization_payment_provider_accounts_org_processor_env_uq UNIQUE (organization_id, processor, environment);
ALTER TABLE zaltyko.organization_payment_provider_accounts ADD CONSTRAINT organization_payment_provider_accounts_organization_id_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.organization_payment_provider_accounts ADD CONSTRAINT organization_payment_provider_accounts_provider_reference_uq UNIQUE (processor, environment, provider_account_reference);
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operations_idempotency_uq UNIQUE (organization_id, environment, idempotency_key);
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operations_org_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operations_provider_session_uq UNIQUE (environment, provider_account_reference, checkout_session_reference);
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operations_stripe_key_uq UNIQUE (stripe_idempotency_key);
ALTER TABLE zaltyko.organization_saas_customers ADD CONSTRAINT organization_saas_customers_idempotency_uq UNIQUE (organization_id, environment, creation_idempotency_key);
ALTER TABLE zaltyko.organization_saas_customers ADD CONSTRAINT organization_saas_customers_one_per_env_uq UNIQUE (organization_id, environment);
ALTER TABLE zaltyko.organization_saas_customers ADD CONSTRAINT organization_saas_customers_operation_fk_key_uq UNIQUE (organization_id, id, environment, provider_account_reference);
ALTER TABLE zaltyko.organization_saas_customers ADD CONSTRAINT organization_saas_customers_org_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.organization_saas_customers ADD CONSTRAINT organization_saas_customers_provider_id_uq UNIQUE (environment, provider_account_reference, customer_reference);
ALTER TABLE zaltyko.organization_saas_customers ADD CONSTRAINT organization_saas_customers_subscription_fk_key_uq UNIQUE (organization_id, environment, provider_account_reference, customer_reference);
ALTER TABLE zaltyko.organization_saas_subscriptions ADD CONSTRAINT organization_saas_subscriptions_organization_id_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.organization_saas_subscriptions ADD CONSTRAINT organization_saas_subscriptions_provider_reference_uq UNIQUE (environment, provider_account_reference, subscription_reference);
ALTER TABLE zaltyko.organization_saas_trials ADD CONSTRAINT organization_saas_trials_idempotency_uq UNIQUE (organization_id, idempotency_key);
ALTER TABLE zaltyko.organization_saas_trials ADD CONSTRAINT organization_saas_trials_org_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT organization_saas_webhook_event_uq UNIQUE (provider_account_reference, environment, provider_event_id);
ALTER TABLE zaltyko.organization_saas_webhook_payload_conflicts ADD CONSTRAINT organization_saas_webhook_payload_conflict_uq UNIQUE (webhook_event_id, observed_payload_sha256);
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT saas_webhook_reconciliation_idempotency_uq UNIQUE (webhook_event_id, idempotency_key);
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT saas_webhook_reconciliation_identity_uq UNIQUE (organization_id, webhook_event_id, id);
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_results ADD CONSTRAINT organization_saas_webhook_reconciliation_result_decision_id_key UNIQUE (decision_id);
ALTER TABLE zaltyko.organization_sports ADD CONSTRAINT organization_sports_organization_id_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.organizations ADD CONSTRAINT organizations_id_country_uq UNIQUE (id, country_code);
ALTER TABLE zaltyko.outbox_events ADD CONSTRAINT outbox_events_idempotency_uq UNIQUE (organization_id, event_name, idempotency_key);
ALTER TABLE zaltyko.owner_dashboard_layouts ADD CONSTRAINT owner_dashboard_layouts_organization_user_uq UNIQUE (organization_id, user_id);
ALTER TABLE zaltyko.payment_allocations ADD CONSTRAINT payment_allocations_idempotency_uq UNIQUE (organization_id, idempotency_key);
ALTER TABLE zaltyko.payment_allocations ADD CONSTRAINT payment_allocations_organization_id_currency_uq UNIQUE (organization_id, id, currency);
ALTER TABLE zaltyko.payment_allocations ADD CONSTRAINT payment_allocations_organization_id_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.payment_attempts ADD CONSTRAINT payment_attempts_idempotency_uq UNIQUE (organization_id, idempotency_key);
ALTER TABLE zaltyko.payment_attempts ADD CONSTRAINT payment_attempts_organization_id_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.payment_attempts ADD CONSTRAINT payment_attempts_provider_uq UNIQUE (processor, environment, provider_attempt_id);
ALTER TABLE zaltyko.payment_provider_events ADD CONSTRAINT payment_provider_events_organization_id_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.payment_provider_events ADD CONSTRAINT payment_provider_events_provider_uq UNIQUE (processor, environment, provider_event_id);
ALTER TABLE zaltyko.payments ADD CONSTRAINT payments_idempotency_uq UNIQUE (organization_id, idempotency_key);
ALTER TABLE zaltyko.payments ADD CONSTRAINT payments_organization_id_currency_uq UNIQUE (organization_id, id, currency);
ALTER TABLE zaltyko.payments ADD CONSTRAINT payments_organization_id_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.people ADD CONSTRAINT people_organization_id_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.price_plan_class_template_coverage ADD CONSTRAINT price_plan_class_template_coverage_org_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.price_plans ADD CONSTRAINT price_plans_organization_id_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.programs ADD CONSTRAINT programs_organization_id_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.refunds ADD CONSTRAINT refunds_idempotency_uq UNIQUE (organization_id, idempotency_key);
ALTER TABLE zaltyko.refunds ADD CONSTRAINT refunds_organization_id_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.refunds ADD CONSTRAINT refunds_provider_uq UNIQUE (processor, environment, provider_refund_id);
ALTER TABLE zaltyko.retention_cohort_projection_runs ADD CONSTRAINT retention_cohort_projection_runs_idempotency_uq UNIQUE (organization_id, idempotency_key);
ALTER TABLE zaltyko.retention_cohort_projection_runs ADD CONSTRAINT retention_cohort_projection_runs_organization_id_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.session_staff ADD CONSTRAINT session_staff_uq UNIQUE (organization_id, session_id, staff_profile_id);
ALTER TABLE zaltyko.sessions ADD CONSTRAINT sessions_organization_id_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.sessions ADD CONSTRAINT sessions_template_start_uq UNIQUE (organization_id, class_template_id, starts_at);
ALTER TABLE zaltyko.spaces ADD CONSTRAINT spaces_organization_id_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.sport_profiles ADD CONSTRAINT sport_profiles_country_id_uq UNIQUE (country_code, id);
ALTER TABLE zaltyko.sport_profiles ADD CONSTRAINT sport_profiles_version_uq UNIQUE (country_code, discipline_key, federation_code, profile_version);
ALTER TABLE zaltyko.staff_profiles ADD CONSTRAINT staff_profiles_organization_id_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.staff_profiles ADD CONSTRAINT staff_profiles_organization_person_uq UNIQUE (organization_id, person_id);
ALTER TABLE zaltyko.trial_followups ADD CONSTRAINT trial_followups_idempotency_uq UNIQUE (organization_id, idempotency_key);
ALTER TABLE zaltyko.trial_status_history ADD CONSTRAINT trial_status_history_idempotency_uq UNIQUE (organization_id, idempotency_key);
ALTER TABLE zaltyko.trials ADD CONSTRAINT trials_athlete_session_uq UNIQUE (organization_id, athlete_id, session_id);
ALTER TABLE zaltyko.trials ADD CONSTRAINT trials_enrollment_uq UNIQUE (organization_id, trial_enrollment_id);
ALTER TABLE zaltyko.trials ADD CONSTRAINT trials_organization_id_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.trials ADD CONSTRAINT trials_organization_location_id_uq UNIQUE (organization_id, location_id, id);
ALTER TABLE zaltyko.waitlist_entries ADD CONSTRAINT waitlist_entries_organization_id_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.waitlist_entries ADD CONSTRAINT waitlist_entries_organization_location_id_uq UNIQUE (organization_id, location_id, id);
ALTER TABLE zaltyko.waitlist_offers ADD CONSTRAINT waitlist_offers_idempotency_uq UNIQUE (organization_id, idempotency_key);
ALTER TABLE zaltyko.waitlist_offers ADD CONSTRAINT waitlist_offers_organization_id_id_uq UNIQUE (organization_id, id);
ALTER TABLE zaltyko.price_plan_class_template_coverage ADD CONSTRAINT price_plan_class_template_coverage_no_overlap EXCLUDE USING gist (organization_id WITH =, location_id WITH =, price_plan_id WITH =, class_template_id WITH =, daterange(starts_on, ends_on, '[]'::text) WITH &&);
ALTER TABLE public.academies ADD CONSTRAINT academies_churned_reason_check CHECK (churned_reason IS NULL OR (churned_reason = ANY (ARRAY['trial_expired_no_payment'::text, 'owner_cancellation'::text, 'manual_closure'::text, 'other'::text])));
ALTER TABLE public.academies ADD CONSTRAINT academies_fraud_hold_audit_required CHECK (status <> 'fraud_hold'::text OR fraud_hold_at IS NOT NULL AND fraud_hold_reason IS NOT NULL);
ALTER TABLE public.academies ADD CONSTRAINT academies_fraud_hold_reason_check CHECK (fraud_hold_reason IS NULL OR (fraud_hold_reason = ANY (ARRAY['payment_fraud_signal'::text, 'owner_identity_failure'::text, 'chargeback_threshold'::text, 'manual_review'::text, 'other'::text])));
ALTER TABLE public.academies ADD CONSTRAINT academies_status_values_check CHECK (status = ANY (ARRAY['active'::text, 'trial'::text, 'suspended'::text, 'churned'::text, 'fraud_hold'::text]));
ALTER TABLE public.academy_trials ADD CONSTRAINT academy_trials_granted_plan_code_check CHECK (granted_plan_code = 'pro'::text);
ALTER TABLE public.academy_trials ADD CONSTRAINT academy_trials_status_check CHECK (status = ANY (ARRAY['active'::text, 'expired'::text, 'converted'::text, 'cancelled'::text]));
ALTER TABLE public.athlete_import_batches ADD CONSTRAINT athlete_import_batches_created_count_check CHECK (created_count >= 0);
ALTER TABLE public.athlete_import_batches ADD CONSTRAINT athlete_import_batches_file_hash_check CHECK (length(file_hash) = 64);
ALTER TABLE public.athlete_import_batches ADD CONSTRAINT athlete_import_batches_skipped_count_check CHECK (skipped_count >= 0);
ALTER TABLE public.athlete_import_batches ADD CONSTRAINT athlete_import_batches_status_check CHECK (status = ANY (ARRAY['processing'::text, 'completed'::text, 'failed'::text, 'rolled_back'::text]));
ALTER TABLE public.athlete_import_batches ADD CONSTRAINT athlete_import_batches_total_rows_check CHECK (total_rows >= 0);
ALTER TABLE public.athlete_invitations ADD CONSTRAINT athlete_invitations_status_check CHECK (status = ANY (ARRAY['pending'::text, 'opened'::text, 'profile_complete'::text, 'cancelled'::text, 'expired'::text]));
ALTER TABLE public.commercial_interviews ADD CONSTRAINT commercial_interviews_beta_interest_check CHECK (beta_interest = ANY (ARRAY['unknown'::text, 'yes'::text, 'no'::text, 'maybe'::text]));
ALTER TABLE public.commercial_interviews ADD CONSTRAINT commercial_interviews_completed_evidence_check CHECK (status <> 'completed'::text OR completed_at IS NOT NULL AND athlete_count IS NOT NULL AND NULLIF(btrim(current_tools), ''::text) IS NOT NULL AND NULLIF(btrim(biggest_pain), ''::text) IS NOT NULL AND NULLIF(btrim(primary_objection), ''::text) IS NOT NULL AND easy_price_eur_cents IS NOT NULL AND limit_price_eur_cents IS NOT NULL);
ALTER TABLE public.commercial_interviews ADD CONSTRAINT commercial_interviews_non_negative_counts_check CHECK (COALESCE(athlete_count, 0) >= 0 AND COALESCE(coach_count, 0) >= 0 AND location_count > 0);
ALTER TABLE public.commercial_interviews ADD CONSTRAINT commercial_interviews_price_range_check CHECK (COALESCE(easy_price_eur_cents, 0) >= 0 AND COALESCE(limit_price_eur_cents, 0) >= COALESCE(easy_price_eur_cents, 0));
ALTER TABLE public.commercial_interviews ADD CONSTRAINT commercial_interviews_status_check CHECK (status = ANY (ARRAY['scheduled'::text, 'completed'::text, 'no_show'::text, 'cancelled'::text]));
ALTER TABLE public.commercial_interviews ADD CONSTRAINT commercial_interviews_willingness_to_pay_check CHECK (willingness_to_pay = ANY (ARRAY['unknown'::text, 'yes'::text, 'no'::text, 'maybe'::text]));
ALTER TABLE public.directory_claims ADD CONSTRAINT directory_claims_status_check CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'disputed'::text, 'withdrawn'::text]));
ALTER TABLE public.directory_entries ADD CONSTRAINT directory_entries_check CHECK (academy_id IS NULL OR kind = 'academy'::text);
ALTER TABLE public.directory_entries ADD CONSTRAINT directory_entries_check1 CHECK (event_id IS NULL OR kind = 'event'::text);
ALTER TABLE public.directory_entries ADD CONSTRAINT directory_entries_check2 CHECK (merged_into IS NULL OR merged_into <> id);
ALTER TABLE public.directory_entries ADD CONSTRAINT directory_entries_data_check CHECK (jsonb_typeof(data) = 'object'::text);
ALTER TABLE public.directory_entries ADD CONSTRAINT directory_entries_kind_check CHECK (kind = ANY (ARRAY['academy'::text, 'event'::text, 'organization'::text]));
ALTER TABLE public.directory_entries ADD CONSTRAINT directory_entries_publication_check CHECK (publication = ANY (ARRAY['draft'::text, 'pending'::text, 'published'::text, 'withdrawn'::text]));
ALTER TABLE public.directory_entries ADD CONSTRAINT directory_entries_representation_check CHECK (representation = ANY (ARRAY['unclaimed'::text, 'verified'::text, 'disputed'::text]));
ALTER TABLE public.directory_revisions ADD CONSTRAINT directory_revisions_kind_check CHECK (kind = ANY (ARRAY['edit'::text, 'proposal'::text, 'correction'::text, 'removal'::text, 'import'::text]));
ALTER TABLE public.directory_revisions ADD CONSTRAINT directory_revisions_status_check CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]));
ALTER TABLE public.directory_subscriptions ADD CONSTRAINT directory_subscriptions_purpose_check CHECK (purpose = ANY (ARRAY['calendar'::text, 'favorite_changes'::text, 'marketing'::text, 'kit'::text, 'claim_updates'::text]));
ALTER TABLE public.growth_events ADD CONSTRAINT growth_events_environment_check CHECK (environment IS NULL OR (environment = ANY (ARRAY['local'::text, 'sandbox'::text, 'preview'::text, 'production_authorized'::text])));
ALTER TABLE public.growth_events ADD CONSTRAINT growth_events_evidence_scope_check CHECK (evidence_scope IS NULL OR (evidence_scope = ANY (ARRAY['L'::text, 'T'::text, 'P'::text, 'X'::text, 'H'::text])));
ALTER TABLE public.growth_events ADD CONSTRAINT growth_events_schema_version_check CHECK (schema_version IS NULL OR schema_version = 1);
ALTER TABLE public.growth_events ADD CONSTRAINT growth_events_transaction_id_check CHECK (transaction_id IS NULL OR transaction_id ~ '^sha256:[a-f0-9]{64}$'::text);
ALTER TABLE public.owner_consent ADD CONSTRAINT owner_consent_consent_proof_check CHECK (consent_proof ~ '^(signup|claim|settings):[a-zA-Z0-9_-]{1,128}$'::text);
ALTER TABLE public.owner_consent ADD CONSTRAINT owner_consent_policy_version_check CHECK (policy_version ~ '^v[0-9]+-[0-9]{4}-[0-9]{2}-[0-9]{2}$'::text);
ALTER TABLE public.owner_consent ADD CONSTRAINT owner_consent_source_check CHECK (source = ANY (ARRAY['signup'::text, 'claim'::text, 'settings'::text]));
ALTER TABLE public.owner_consent ADD CONSTRAINT owner_consent_state_check CHECK (state = ANY (ARRAY['granted'::text, 'revoked'::text]));
ALTER TABLE public.owner_consent_audit ADD CONSTRAINT owner_consent_audit_actor_check CHECK (actor ~ '^(owner|system|admin):[a-zA-Z0-9_-]{1,128}$'::text);
ALTER TABLE public.owner_consent_audit ADD CONSTRAINT owner_consent_audit_consent_proof_check CHECK (consent_proof ~ '^(signup|claim|settings):[a-zA-Z0-9_-]{1,128}$'::text);
ALTER TABLE public.owner_consent_audit ADD CONSTRAINT owner_consent_audit_event_check CHECK (event = ANY (ARRAY['grant'::text, 'revoke'::text, 'policy_bump'::text, 're_grant'::text]));
ALTER TABLE public.owner_consent_audit ADD CONSTRAINT owner_consent_audit_policy_version_check CHECK (policy_version ~ '^v[0-9]+-[0-9]{4}-[0-9]{2}-[0-9]{2}$'::text);
ALTER TABLE public.owner_consent_audit ADD CONSTRAINT owner_consent_audit_source_check CHECK (source = ANY (ARRAY['signup'::text, 'claim'::text, 'settings'::text]));
ALTER TABLE public.zaltyko_schema_migrations ADD CONSTRAINT zaltyko_schema_migrations_checksum_check CHECK (checksum ~ '^[a-f0-9]{64}$'::text);
ALTER TABLE public.zaltyko_schema_migrations ADD CONSTRAINT zaltyko_schema_migrations_execution_mode_check CHECK (execution_mode = ANY (ARRAY['ledger'::text, 'baseline_verified'::text]));
ALTER TABLE zaltyko.audit_log ADD CONSTRAINT audit_log_action_check CHECK (btrim(action) <> ''::text);
ALTER TABLE zaltyko.audit_log ADD CONSTRAINT audit_log_target_type_check CHECK (btrim(target_type) <> ''::text);
ALTER TABLE zaltyko.benchmark_metric_targets ADD CONSTRAINT benchmark_metric_targets_currency_check CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'::text);
ALTER TABLE zaltyko.benchmark_metric_targets ADD CONSTRAINT benchmark_metric_targets_target_numeric_check CHECK (target_numeric > 0::numeric);
ALTER TABLE zaltyko.benchmark_profiles ADD CONSTRAINT benchmark_profiles_currency_check CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'::text);
ALTER TABLE zaltyko.benchmark_profiles ADD CONSTRAINT benchmark_profiles_dates_valid CHECK (effective_to IS NULL OR effective_to >= effective_from);
ALTER TABLE zaltyko.benchmark_profiles ADD CONSTRAINT benchmark_profiles_discipline_scope_check CHECK (btrim(discipline_scope) <> ''::text);
ALTER TABLE zaltyko.benchmark_profiles ADD CONSTRAINT benchmark_profiles_key_check CHECK (btrim(key) <> ''::text);
ALTER TABLE zaltyko.benchmark_profiles ADD CONSTRAINT benchmark_profiles_market_check CHECK (btrim(market) <> ''::text);
ALTER TABLE zaltyko.benchmark_profiles ADD CONSTRAINT benchmark_profiles_name_check CHECK (btrim(name) <> ''::text);
ALTER TABLE zaltyko.benchmark_profiles ADD CONSTRAINT benchmark_profiles_organization_type_check CHECK (btrim(organization_type) <> ''::text);
ALTER TABLE zaltyko.benchmark_profiles ADD CONSTRAINT benchmark_profiles_source_title_check CHECK (btrim(source_title) <> ''::text);
ALTER TABLE zaltyko.benchmark_profiles ADD CONSTRAINT benchmark_profiles_version_check CHECK (version > 0);
ALTER TABLE zaltyko.charges ADD CONSTRAINT charges_amount_cents_check CHECK (amount_cents > 0);
ALTER TABLE zaltyko.charges ADD CONSTRAINT charges_currency_check CHECK (currency ~ '^[A-Z]{3}$'::text);
ALTER TABLE zaltyko.charges ADD CONSTRAINT charges_idempotency_key_check CHECK (btrim(idempotency_key) <> ''::text);
ALTER TABLE zaltyko.charges ADD CONSTRAINT charges_period_valid CHECK (service_period_end >= service_period_start);
ALTER TABLE zaltyko.charges ADD CONSTRAINT charges_version_check CHECK (version > 0);
ALTER TABLE zaltyko.class_template_weekdays ADD CONSTRAINT class_template_weekdays_iso_weekday_check CHECK (iso_weekday >= 1 AND iso_weekday <= 7);
ALTER TABLE zaltyko.class_template_weekdays ADD CONSTRAINT class_template_weekdays_time_valid CHECK (ends_at_local > starts_at_local);
ALTER TABLE zaltyko.class_templates ADD CONSTRAINT class_templates_capacity_check CHECK (capacity > 0);
ALTER TABLE zaltyko.class_templates ADD CONSTRAINT class_templates_dates_valid CHECK (effective_to IS NULL OR effective_to >= effective_from);
ALTER TABLE zaltyko.class_templates ADD CONSTRAINT class_templates_name_check CHECK (btrim(name) <> ''::text);
ALTER TABLE zaltyko.data_quality_issues ADD CONSTRAINT data_quality_issues_evidence_check CHECK (jsonb_typeof(evidence) = 'object'::text);
ALTER TABLE zaltyko.data_quality_issues ADD CONSTRAINT data_quality_issues_issue_code_check CHECK (btrim(issue_code) <> ''::text);
ALTER TABLE zaltyko.data_quality_issues ADD CONSTRAINT data_quality_issues_severity_check CHECK (severity = ANY (ARRAY['info'::text, 'warning'::text, 'error'::text]));
ALTER TABLE zaltyko.enrollment_pauses ADD CONSTRAINT enrollment_pauses_dates_valid CHECK (ends_on IS NULL OR ends_on >= starts_on);
ALTER TABLE zaltyko.enrollment_price_assignments ADD CONSTRAINT enrollment_price_assignments_currency_check CHECK (currency ~ '^[A-Z]{3}$'::text);
ALTER TABLE zaltyko.enrollment_price_assignments ADD CONSTRAINT enrollment_price_assignments_dates_valid CHECK (ends_on IS NULL OR ends_on >= starts_on);
ALTER TABLE zaltyko.enrollment_price_assignments ADD CONSTRAINT enrollment_price_assignments_unit_amount_cents_check CHECK (unit_amount_cents >= 0);
ALTER TABLE zaltyko.enrollments ADD CONSTRAINT enrollments_dates_valid CHECK (ends_on IS NULL OR ends_on >= starts_on);
ALTER TABLE zaltyko.enrollments ADD CONSTRAINT enrollments_version_check CHECK (version > 0);
ALTER TABLE zaltyko.facilities ADD CONSTRAINT facilities_name_check CHECK (btrim(name) <> ''::text);
ALTER TABLE zaltyko.family_collection_preferences ADD CONSTRAINT family_collection_preferences_entitlement_revision_positive CHECK (entitlement_revision IS NULL OR entitlement_revision > 0);
ALTER TABLE zaltyko.family_collection_preferences ADD CONSTRAINT family_collection_preferences_version_check CHECK (version > 0);
ALTER TABLE zaltyko.family_members ADD CONSTRAINT family_members_dates_valid CHECK (ends_on IS NULL OR ends_on >= starts_on);
ALTER TABLE zaltyko.family_payers ADD CONSTRAINT family_payers_dates_valid CHECK (ends_on IS NULL OR ends_on >= starts_on);
ALTER TABLE zaltyko.family_payment_authorizations ADD CONSTRAINT family_payment_authorizations_active_consent_valid CHECK (status <> 'active'::zaltyko.payment_authorization_status OR consent_version IS NOT NULL AND btrim(consent_version) <> ''::text AND consent_evidence_reference IS NOT NULL AND consent_evidence_sha256 IS NOT NULL AND consented_at IS NOT NULL AND consented_by_guardian_id IS NOT NULL AND (valid_until IS NULL OR valid_until > consented_at) AND revoked_at IS NULL);
ALTER TABLE zaltyko.family_payment_authorizations ADD CONSTRAINT family_payment_authorizations_consent_evidence_reference_check CHECK (consent_evidence_reference IS NULL OR btrim(consent_evidence_reference) <> ''::text);
ALTER TABLE zaltyko.family_payment_authorizations ADD CONSTRAINT family_payment_authorizations_consent_evidence_sha256_check CHECK (consent_evidence_sha256 IS NULL OR consent_evidence_sha256 ~ '^[a-f0-9]{64}$'::text);
ALTER TABLE zaltyko.family_payment_authorizations ADD CONSTRAINT family_payment_authorizations_mandate_reference_check CHECK (mandate_reference IS NULL OR btrim(mandate_reference) <> ''::text);
ALTER TABLE zaltyko.family_payment_authorizations ADD CONSTRAINT family_payment_authorizations_payment_method_reference_check CHECK (btrim(payment_method_reference) <> ''::text);
ALTER TABLE zaltyko.family_payment_authorizations ADD CONSTRAINT family_payment_authorizations_provider_setup_reference_check CHECK (btrim(provider_setup_reference) <> ''::text);
ALTER TABLE zaltyko.family_payment_authorizations ADD CONSTRAINT family_payment_authorizations_revocation_valid CHECK (status = 'revoked'::zaltyko.payment_authorization_status AND revoked_at IS NOT NULL OR status <> 'revoked'::zaltyko.payment_authorization_status AND revoked_at IS NULL);
ALTER TABLE zaltyko.financial_reconciliation_runs ADD CONSTRAINT financial_reconciliation_amounts_valid CHECK (expected_cents >= 0 AND allocated_cents >= 0 AND refunded_cents >= 0 AND allocated_cents <= expected_cents AND refunded_cents <= allocated_cents AND net_collected_cents = (allocated_cents - refunded_cents) AND outstanding_cents = (expected_cents - allocated_cents));
ALTER TABLE zaltyko.financial_reconciliation_runs ADD CONSTRAINT financial_reconciliation_period_valid CHECK (period_end >= period_start);
ALTER TABLE zaltyko.financial_reconciliation_runs ADD CONSTRAINT financial_reconciliation_runs_currency_check CHECK (currency ~ '^[A-Z]{3}$'::text);
ALTER TABLE zaltyko.financial_reconciliation_runs ADD CONSTRAINT financial_reconciliation_runs_formula_version_check CHECK (formula_version > 0);
ALTER TABLE zaltyko.financial_reconciliation_runs ADD CONSTRAINT financial_reconciliation_runs_idempotency_key_check CHECK (btrim(idempotency_key) <> ''::text);
ALTER TABLE zaltyko.group_membership_history ADD CONSTRAINT group_membership_history_idempotency_not_blank CHECK (btrim(idempotency_key) <> ''::text);
ALTER TABLE zaltyko.group_membership_history ADD CONSTRAINT group_membership_history_reason_code_valid CHECK (reason_code IS NULL OR (reason_code = ANY (ARRAY['academy_request'::text, 'family_request'::text, 'athlete_request'::text, 'schedule_change'::text, 'temporary_pause'::text, 'other'::text])));
ALTER TABLE zaltyko.group_memberships ADD CONSTRAINT group_memberships_dates_valid CHECK (ends_on IS NULL OR ends_on >= starts_on);
ALTER TABLE zaltyko.groups ADD CONSTRAINT groups_capacity_check CHECK (capacity IS NULL OR capacity > 0);
ALTER TABLE zaltyko.groups ADD CONSTRAINT groups_name_check CHECK (btrim(name) <> ''::text);
ALTER TABLE zaltyko.guardian_contacts ADD CONSTRAINT guardian_contacts_normalized_value_check CHECK (btrim(normalized_value) <> ''::text);
ALTER TABLE zaltyko.guardian_contacts ADD CONSTRAINT guardian_contacts_value_check CHECK (btrim(value) <> ''::text);
ALTER TABLE zaltyko.health_score_dimension_snapshots ADD CONSTRAINT health_score_dimension_score_valid CHECK (score IS NULL OR score >= 0::numeric AND score <= 100::numeric);
ALTER TABLE zaltyko.health_score_dimension_snapshots ADD CONSTRAINT health_score_dimension_snapshots_available_metric_weight_check CHECK (available_metric_weight >= 0::numeric AND available_metric_weight <= 1::numeric);
ALTER TABLE zaltyko.health_score_dimension_snapshots ADD CONSTRAINT health_score_dimension_snapshots_configured_metric_weight_check CHECK (configured_metric_weight >= 0::numeric AND configured_metric_weight <= 1::numeric);
ALTER TABLE zaltyko.health_score_dimension_snapshots ADD CONSTRAINT health_score_dimension_snapshots_coverage_check CHECK (coverage >= 0::numeric AND coverage <= 1::numeric);
ALTER TABLE zaltyko.health_score_dimension_snapshots ADD CONSTRAINT health_score_dimension_snapshots_explanation_check CHECK (jsonb_typeof(explanation) = 'object'::text);
ALTER TABLE zaltyko.health_score_dimension_snapshots ADD CONSTRAINT health_score_dimension_status_value_valid CHECK (status = 'insufficient_data'::zaltyko.health_score_status AND score IS NULL OR status <> 'insufficient_data'::zaltyko.health_score_status AND score IS NOT NULL);
ALTER TABLE zaltyko.health_score_dimension_weights ADD CONSTRAINT health_score_dimension_weights_weight_check CHECK (weight > 0::numeric AND weight <= 1::numeric);
ALTER TABLE zaltyko.health_score_metric_contributions ADD CONSTRAINT health_score_metric_contributions_effective_weight_check CHECK (effective_weight >= 0::numeric);
ALTER TABLE zaltyko.health_score_metric_contributions ADD CONSTRAINT health_score_metric_contributions_explanation_check CHECK (jsonb_typeof(explanation) = 'object'::text);
ALTER TABLE zaltyko.health_score_metric_contributions ADD CONSTRAINT health_score_metric_contributions_metric_coverage_check CHECK (metric_coverage >= 0::numeric AND metric_coverage <= 1::numeric);
ALTER TABLE zaltyko.health_score_metric_contributions ADD CONSTRAINT health_score_metric_contributions_metric_weight_check CHECK (metric_weight > 0::numeric AND metric_weight <= 1::numeric);
ALTER TABLE zaltyko.health_score_metric_contributions ADD CONSTRAINT health_score_metric_contributions_score_valid CHECK (normalized_score IS NULL OR normalized_score >= 0::numeric AND normalized_score <= 100::numeric);
ALTER TABLE zaltyko.health_score_metric_weights ADD CONSTRAINT health_score_metric_weights_weight_check CHECK (weight > 0::numeric AND weight <= 1::numeric);
ALTER TABLE zaltyko.health_score_snapshots ADD CONSTRAINT health_score_snapshots_coverage_check CHECK (coverage >= 0::numeric AND coverage <= 1::numeric);
ALTER TABLE zaltyko.health_score_snapshots ADD CONSTRAINT health_score_snapshots_explanation_check CHECK (jsonb_typeof(explanation) = 'object'::text);
ALTER TABLE zaltyko.health_score_snapshots ADD CONSTRAINT health_score_snapshots_idempotency_key_check CHECK (btrim(idempotency_key) <> ''::text);
ALTER TABLE zaltyko.health_score_snapshots ADD CONSTRAINT health_score_snapshots_period_valid CHECK (period_end >= period_start);
ALTER TABLE zaltyko.health_score_snapshots ADD CONSTRAINT health_score_snapshots_score_valid CHECK (score IS NULL OR score >= 0::numeric AND score <= 100::numeric);
ALTER TABLE zaltyko.health_score_snapshots ADD CONSTRAINT health_score_snapshots_status_value_valid CHECK (status = 'insufficient_data'::zaltyko.health_score_status AND score IS NULL OR status <> 'insufficient_data'::zaltyko.health_score_status AND score IS NOT NULL);
ALTER TABLE zaltyko.health_score_versions ADD CONSTRAINT health_score_versions_key_check CHECK (btrim(key) <> ''::text);
ALTER TABLE zaltyko.health_score_versions ADD CONSTRAINT health_score_versions_min_dimension_available_weight_check CHECK (min_dimension_available_weight >= 0::numeric AND min_dimension_available_weight <= 1::numeric);
ALTER TABLE zaltyko.health_score_versions ADD CONSTRAINT health_score_versions_min_global_coverage_check CHECK (min_global_coverage >= 0::numeric AND min_global_coverage <= 1::numeric);
ALTER TABLE zaltyko.health_score_versions ADD CONSTRAINT health_score_versions_min_valid_dimensions_check CHECK (min_valid_dimensions >= 1 AND min_valid_dimensions <= 4);
ALTER TABLE zaltyko.health_score_versions ADD CONSTRAINT health_score_versions_name_check CHECK (btrim(name) <> ''::text);
ALTER TABLE zaltyko.health_score_versions ADD CONSTRAINT health_score_versions_version_check CHECK (version > 0);
ALTER TABLE zaltyko.insight_actions ADD CONSTRAINT insight_actions_action_key_check CHECK (btrim(action_key) <> ''::text);
ALTER TABLE zaltyko.insight_actions ADD CONSTRAINT insight_actions_after_value_check CHECK (after_value IS NULL OR jsonb_typeof(after_value) = 'object'::text);
ALTER TABLE zaltyko.insight_actions ADD CONSTRAINT insight_actions_before_value_check CHECK (jsonb_typeof(before_value) = 'object'::text);
ALTER TABLE zaltyko.insight_actions ADD CONSTRAINT insight_actions_idempotency_key_check CHECK (btrim(idempotency_key) <> ''::text);
ALTER TABLE zaltyko.insight_actions ADD CONSTRAINT insight_actions_target_entity_type_check CHECK (btrim(target_entity_type) <> ''::text);
ALTER TABLE zaltyko.insight_notifications ADD CONSTRAINT insight_notifications_delivery_window_key_check CHECK (btrim(delivery_window_key) <> ''::text);
ALTER TABLE zaltyko.insight_rule_runs ADD CONSTRAINT insight_rule_runs_candidate_count_check CHECK (candidate_count >= 0);
ALTER TABLE zaltyko.insight_rule_runs ADD CONSTRAINT insight_rule_runs_idempotency_key_check CHECK (btrim(idempotency_key) <> ''::text);
ALTER TABLE zaltyko.insight_rule_runs ADD CONSTRAINT insight_rule_runs_result_check CHECK (jsonb_typeof(result) = 'object'::text);
ALTER TABLE zaltyko.insight_rule_versions ADD CONSTRAINT insight_rule_versions_config_check CHECK (jsonb_typeof(config) = 'object'::text);
ALTER TABLE zaltyko.insight_rule_versions ADD CONSTRAINT insight_rule_versions_cooldown_hours_check CHECK (cooldown_hours >= 1 AND cooldown_hours <= 8760);
ALTER TABLE zaltyko.insight_rule_versions ADD CONSTRAINT insight_rule_versions_default_cta_key_check CHECK (btrim(default_cta_key) <> ''::text);
ALTER TABLE zaltyko.insight_rule_versions ADD CONSTRAINT insight_rule_versions_key_check CHECK (key ~ '^[a-z][a-z0-9_]+$'::text);
ALTER TABLE zaltyko.insight_rule_versions ADD CONSTRAINT insight_rule_versions_name_check CHECK (btrim(name) <> ''::text);
ALTER TABLE zaltyko.insight_rule_versions ADD CONSTRAINT insight_rule_versions_version_check CHECK (version > 0);
ALTER TABLE zaltyko.insight_status_history ADD CONSTRAINT insight_status_history_metadata_check CHECK (jsonb_typeof(metadata) = 'object'::text);
ALTER TABLE zaltyko.insight_status_history ADD CONSTRAINT insight_status_history_reason_code_check CHECK (btrim(reason_code) <> ''::text);
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_actionability_score_check CHECK (actionability_score >= 0::numeric AND actionability_score <= 100::numeric);
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_assumptions_check CHECK (jsonb_typeof(assumptions) = 'array'::text);
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_confidence_score_check CHECK (confidence_score >= 0::numeric AND confidence_score <= 100::numeric);
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_cta_key_check CHECK (btrim(cta_key) <> ''::text);
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_cta_payload_check CHECK (jsonb_typeof(cta_payload) = 'object'::text);
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_detail_check CHECK (btrim(detail) <> ''::text);
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_entity_type_check CHECK (btrim(entity_type) <> ''::text);
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_estimate_currency_valid CHECK (estimated_value_min_minor IS NULL AND estimated_value_max_minor IS NULL OR estimate_currency ~ '^[A-Z]{3}$'::text);
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_estimate_range_valid CHECK (estimated_value_min_minor IS NULL OR estimated_value_max_minor IS NULL OR estimated_value_max_minor >= estimated_value_min_minor);
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_evidence_check CHECK (jsonb_typeof(evidence) = 'object'::text);
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_impact_score_check CHECK (impact_score >= 0::numeric AND impact_score <= 100::numeric);
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_occurrence_check CHECK (occurrence > 0);
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_priority_score_check CHECK (priority_score >= 0::numeric AND priority_score <= 100::numeric);
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_series_key_check CHECK (btrim(series_key) <> ''::text);
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_snooze_valid CHECK (status <> 'snoozed'::zaltyko.insight_status OR snoozed_until IS NOT NULL);
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_title_check CHECK (btrim(title) <> ''::text);
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_urgency_score_check CHECK (urgency_score >= 0::numeric AND urgency_score <= 100::numeric);
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_version_check CHECK (version > 0);
ALTER TABLE zaltyko.invoice_line_enrollments ADD CONSTRAINT invoice_line_enrollments_class_name_not_blank CHECK (char_length(btrim(class_name_snapshot)) >= 2 AND char_length(btrim(class_name_snapshot)) <= 120);
ALTER TABLE zaltyko.invoice_lines ADD CONSTRAINT invoice_lines_amount_cents_check CHECK (amount_cents >= 0);
ALTER TABLE zaltyko.invoice_lines ADD CONSTRAINT invoice_lines_amount_valid CHECK (amount_cents = (quantity::bigint * unit_amount_cents));
ALTER TABLE zaltyko.invoice_lines ADD CONSTRAINT invoice_lines_athlete_monthly_shape CHECK (athlete_id IS NULL OR line_type = 'monthly_fee'::text AND location_id IS NOT NULL AND price_plan_id IS NOT NULL AND enrollment_id IS NULL AND quantity = 1 AND service_period_start = date_trunc('month'::text, service_period_start::timestamp with time zone)::date AND service_period_end = (date_trunc('month'::text, service_period_start::timestamp with time zone) + '1 mon -1 days'::interval)::date);
ALTER TABLE zaltyko.invoice_lines ADD CONSTRAINT invoice_lines_currency_check CHECK (currency ~ '^[A-Z]{3}$'::text);
ALTER TABLE zaltyko.invoice_lines ADD CONSTRAINT invoice_lines_line_type_check CHECK (btrim(line_type) <> ''::text);
ALTER TABLE zaltyko.invoice_lines ADD CONSTRAINT invoice_lines_period_valid CHECK (service_period_end >= service_period_start);
ALTER TABLE zaltyko.invoice_lines ADD CONSTRAINT invoice_lines_quantity_check CHECK (quantity > 0);
ALTER TABLE zaltyko.invoice_lines ADD CONSTRAINT invoice_lines_unit_amount_cents_check CHECK (unit_amount_cents >= 0);
ALTER TABLE zaltyko.invoices ADD CONSTRAINT invoices_currency_check CHECK (currency ~ '^[A-Z]{3}$'::text);
ALTER TABLE zaltyko.invoices ADD CONSTRAINT invoices_idempotency_key_check CHECK (btrim(idempotency_key) <> ''::text);
ALTER TABLE zaltyko.invoices ADD CONSTRAINT invoices_reference_check CHECK (btrim(reference) <> ''::text);
ALTER TABLE zaltyko.invoices ADD CONSTRAINT invoices_total_amount_cents_check CHECK (total_amount_cents >= 0);
ALTER TABLE zaltyko.invoices ADD CONSTRAINT invoices_version_check CHECK (version > 0);
ALTER TABLE zaltyko.locations ADD CONSTRAINT locations_code_check CHECK (code ~ '^[a-z0-9][a-z0-9-]{1,31}$'::text);
ALTER TABLE zaltyko.locations ADD CONSTRAINT locations_name_check CHECK (btrim(name) <> ''::text);
ALTER TABLE zaltyko.metric_definitions ADD CONSTRAINT metric_definitions_description_check CHECK (btrim(description) <> ''::text);
ALTER TABLE zaltyko.metric_definitions ADD CONSTRAINT metric_definitions_formula_check CHECK (btrim(formula) <> ''::text);
ALTER TABLE zaltyko.metric_definitions ADD CONSTRAINT metric_definitions_formula_version_check CHECK (formula_version > 0);
ALTER TABLE zaltyko.metric_definitions ADD CONSTRAINT metric_definitions_key_check CHECK (key ~ '^[a-z][a-z0-9_]+$'::text);
ALTER TABLE zaltyko.metric_definitions ADD CONSTRAINT metric_definitions_name_check CHECK (btrim(name) <> ''::text);
ALTER TABLE zaltyko.metric_definitions ADD CONSTRAINT metric_definitions_owner_check CHECK (btrim(owner) <> ''::text);
ALTER TABLE zaltyko.metric_event_consumptions ADD CONSTRAINT metric_event_consumptions_handler_key_check CHECK (btrim(handler_key) <> ''::text);
ALTER TABLE zaltyko.metric_event_consumptions ADD CONSTRAINT metric_event_consumptions_handler_version_check CHECK (handler_version > 0);
ALTER TABLE zaltyko.metric_invalidations ADD CONSTRAINT metric_invalidations_handler_key_check CHECK (btrim(handler_key) <> ''::text);
ALTER TABLE zaltyko.metric_invalidations ADD CONSTRAINT metric_invalidations_handler_version_check CHECK (handler_version > 0);
ALTER TABLE zaltyko.metric_invalidations ADD CONSTRAINT metric_invalidations_period_valid CHECK (affected_to >= affected_from);
ALTER TABLE zaltyko.metric_invalidations ADD CONSTRAINT metric_invalidations_reason_event_name_check CHECK (btrim(reason_event_name) <> ''::text);
ALTER TABLE zaltyko.metric_invalidations ADD CONSTRAINT metric_invalidations_status_check CHECK (status = ANY (ARRAY['pending'::text, 'processed'::text]));
ALTER TABLE zaltyko.metric_run_values ADD CONSTRAINT metric_run_values_coverage_valid CHECK (coverage >= 0::numeric AND coverage <= 1::numeric);
ALTER TABLE zaltyko.metric_run_values ADD CONSTRAINT metric_run_values_currency_check CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'::text);
ALTER TABLE zaltyko.metric_run_values ADD CONSTRAINT metric_run_values_diagnostics_check CHECK (jsonb_typeof(diagnostics) = 'object'::text);
ALTER TABLE zaltyko.metric_run_values ADD CONSTRAINT metric_run_values_dimensions_check CHECK (jsonb_typeof(dimensions) = 'object'::text);
ALTER TABLE zaltyko.metric_run_values ADD CONSTRAINT metric_run_values_dimensions_sha256_check CHECK (dimensions_sha256 ~ '^[a-f0-9]{64}$'::text);
ALTER TABLE zaltyko.metric_run_values ADD CONSTRAINT metric_run_values_formula_version_check CHECK (formula_version > 0);
ALTER TABLE zaltyko.metric_run_values ADD CONSTRAINT metric_run_values_period_valid CHECK (period_end >= period_start);
ALTER TABLE zaltyko.metric_run_values ADD CONSTRAINT metric_run_values_value_quality_valid CHECK ((quality = ANY (ARRAY['insufficient'::zaltyko.metric_quality, 'invalid'::zaltyko.metric_quality])) AND value_numeric IS NULL OR (quality = ANY (ARRAY['complete'::zaltyko.metric_quality, 'partial'::zaltyko.metric_quality, 'stale'::zaltyko.metric_quality])) AND value_numeric IS NOT NULL);
ALTER TABLE zaltyko.metric_runs ADD CONSTRAINT metric_runs_currency_check CHECK (currency ~ '^[A-Z]{3}$'::text);
ALTER TABLE zaltyko.metric_runs ADD CONSTRAINT metric_runs_formula_set_version_check CHECK (btrim(formula_set_version) <> ''::text);
ALTER TABLE zaltyko.metric_runs ADD CONSTRAINT metric_runs_idempotency_key_check CHECK (btrim(idempotency_key) <> ''::text);
ALTER TABLE zaltyko.metric_runs ADD CONSTRAINT metric_runs_parameters_check CHECK (jsonb_typeof(parameters) = 'object'::text);
ALTER TABLE zaltyko.metric_runs ADD CONSTRAINT metric_runs_period_valid CHECK (period_end >= period_start);
ALTER TABLE zaltyko.metric_values ADD CONSTRAINT metric_values_coverage_valid CHECK (coverage >= 0::numeric AND coverage <= 1::numeric);
ALTER TABLE zaltyko.metric_values ADD CONSTRAINT metric_values_currency_check CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'::text);
ALTER TABLE zaltyko.metric_values ADD CONSTRAINT metric_values_diagnostics_check CHECK (jsonb_typeof(diagnostics) = 'object'::text);
ALTER TABLE zaltyko.metric_values ADD CONSTRAINT metric_values_dimensions_check CHECK (jsonb_typeof(dimensions) = 'object'::text);
ALTER TABLE zaltyko.metric_values ADD CONSTRAINT metric_values_dimensions_sha256_check CHECK (dimensions_sha256 ~ '^[a-f0-9]{64}$'::text);
ALTER TABLE zaltyko.metric_values ADD CONSTRAINT metric_values_formula_version_check CHECK (formula_version > 0);
ALTER TABLE zaltyko.metric_values ADD CONSTRAINT metric_values_period_valid CHECK (period_end >= period_start);
ALTER TABLE zaltyko.metric_values ADD CONSTRAINT metric_values_value_quality_valid CHECK ((quality = ANY (ARRAY['insufficient'::zaltyko.metric_quality, 'invalid'::zaltyko.metric_quality])) AND value_numeric IS NULL OR (quality = ANY (ARRAY['complete'::zaltyko.metric_quality, 'partial'::zaltyko.metric_quality, 'stale'::zaltyko.metric_quality])) AND value_numeric IS NOT NULL);
ALTER TABLE zaltyko.organization_bootstrap_commands ADD CONSTRAINT organization_bootstrap_commands_idempotency_key_check CHECK (length(btrim(idempotency_key)) >= 8 AND length(btrim(idempotency_key)) <= 150);
ALTER TABLE zaltyko.organization_bootstrap_commands ADD CONSTRAINT organization_bootstrap_commands_request_hash_check CHECK (request_hash ~ '^[a-f0-9]{64}$'::text);
ALTER TABLE zaltyko.organization_entitlement_changes ADD CONSTRAINT organization_entitlement_changes_period_valid CHECK (effective_until IS NULL OR effective_until > effective_from);
ALTER TABLE zaltyko.organization_entitlement_changes ADD CONSTRAINT organization_entitlement_changes_revision_check CHECK (revision > 0);
ALTER TABLE zaltyko.organization_entitlement_changes ADD CONSTRAINT organization_entitlement_changes_source_reference_check CHECK (btrim(source_reference) <> ''::text);
ALTER TABLE zaltyko.organization_entitlement_changes ADD CONSTRAINT organization_entitlement_changes_source_valid CHECK (source = 'bootstrap'::zaltyko.entitlement_source AND plan_code = 'free'::zaltyko.saas_plan_code AND subscription_id IS NULL AND trial_id IS NULL OR source = 'stripe_subscription'::zaltyko.entitlement_source AND plan_code <> 'free'::zaltyko.saas_plan_code AND subscription_id IS NOT NULL AND trial_id IS NULL OR source = 'contract'::zaltyko.entitlement_source AND subscription_id IS NULL AND trial_id IS NULL OR source = 'trial'::zaltyko.entitlement_source AND plan_code = 'starter'::zaltyko.saas_plan_code AND subscription_id IS NULL AND trial_id IS NOT NULL OR source = 'trial_expired'::zaltyko.entitlement_source AND plan_code = 'free'::zaltyko.saas_plan_code AND subscription_id IS NULL AND trial_id IS NOT NULL);
ALTER TABLE zaltyko.organization_entitlements ADD CONSTRAINT organization_entitlements_period_valid CHECK (effective_until IS NULL OR effective_until > effective_from);
ALTER TABLE zaltyko.organization_entitlements ADD CONSTRAINT organization_entitlements_revision_check CHECK (revision > 0);
ALTER TABLE zaltyko.organization_entitlements ADD CONSTRAINT organization_entitlements_source_reference_check CHECK (btrim(source_reference) <> ''::text);
ALTER TABLE zaltyko.organization_entitlements ADD CONSTRAINT organization_entitlements_source_valid CHECK (source = 'bootstrap'::zaltyko.entitlement_source AND plan_code = 'free'::zaltyko.saas_plan_code AND subscription_id IS NULL AND trial_id IS NULL OR source = 'stripe_subscription'::zaltyko.entitlement_source AND plan_code <> 'free'::zaltyko.saas_plan_code AND subscription_id IS NOT NULL AND trial_id IS NULL OR source = 'contract'::zaltyko.entitlement_source AND subscription_id IS NULL AND trial_id IS NULL OR source = 'trial'::zaltyko.entitlement_source AND plan_code = 'starter'::zaltyko.saas_plan_code AND subscription_id IS NULL AND trial_id IS NOT NULL OR source = 'trial_expired'::zaltyko.entitlement_source AND plan_code = 'free'::zaltyko.saas_plan_code AND subscription_id IS NULL AND trial_id IS NOT NULL);
ALTER TABLE zaltyko.organization_payment_provider_accounts ADD CONSTRAINT organization_payment_provide_card_payments_capability_sta_check CHECK (btrim(card_payments_capability_status) <> ''::text);
ALTER TABLE zaltyko.organization_payment_provider_accounts ADD CONSTRAINT organization_payment_provider__provider_account_reference_check CHECK (provider_account_reference ~ '^acct_[A-Za-z0-9]+$'::text);
ALTER TABLE zaltyko.organization_payment_provider_accounts ADD CONSTRAINT organization_payment_provider_acc_accounts_api_generation_check CHECK (accounts_api_generation = 2);
ALTER TABLE zaltyko.organization_payment_provider_accounts ADD CONSTRAINT organization_payment_provider_accounts_charge_model_check CHECK (charge_model = 'direct'::text);
ALTER TABLE zaltyko.organization_payment_provider_accounts ADD CONSTRAINT organization_payment_provider_accounts_dashboard_access_check CHECK (dashboard_access = 'full'::text);
ALTER TABLE zaltyko.organization_payment_provider_accounts ADD CONSTRAINT organization_payment_provider_accounts_fees_collector_check CHECK (fees_collector = 'stripe'::text);
ALTER TABLE zaltyko.organization_payment_provider_accounts ADD CONSTRAINT organization_payment_provider_accounts_losses_collector_check CHECK (losses_collector = 'stripe'::text);
ALTER TABLE zaltyko.organization_payment_provider_accounts ADD CONSTRAINT organization_payment_provider_accounts_processor_check CHECK (processor = 'stripe'::text);
ALTER TABLE zaltyko.organization_payment_provider_accounts ADD CONSTRAINT organization_payment_provider_accounts_revision_check CHECK (revision > 0);
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_ope_provider_account_reference_check CHECK (btrim(provider_account_reference) <> ''::text);
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operati_stripe_idempotency_key_check CHECK (btrim(stripe_idempotency_key) <> ''::text);
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operations_attempts_check CHECK (attempts >= 0);
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operations_completion_valid CHECK (status = 'completed'::text AND completed_at IS NOT NULL AND completed_at >= created_at OR status <> 'completed'::text AND completed_at IS NULL);
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operations_fencing_version_check CHECK (fencing_version >= 0);
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operations_idempotency_key_check CHECK (length(btrim(idempotency_key)) >= 8 AND length(btrim(idempotency_key)) <= 150);
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operations_lease_valid CHECK ((status = ANY (ARRAY['creating_customer'::text, 'creating_session'::text])) AND lease_token IS NOT NULL AND lease_until IS NOT NULL OR (status <> ALL (ARRAY['creating_customer'::text, 'creating_session'::text])) AND lease_token IS NULL AND lease_until IS NULL);
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operations_plan_code_check CHECK (plan_code = ANY (ARRAY['starter'::zaltyko.saas_plan_code, 'growth'::zaltyko.saas_plan_code]));
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operations_request_hash_check CHECK (request_hash ~ '^[a-f0-9]{64}$'::text);
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operations_session_ref_not_blank CHECK (checkout_session_reference IS NULL OR btrim(checkout_session_reference) <> ''::text);
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operations_session_ref_pair CHECK ((checkout_session_reference IS NULL) = (session_expires_at IS NULL));
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operations_session_state_valid CHECK ((status = ANY (ARRAY['open'::text, 'completed'::text, 'expired'::text])) AND checkout_session_reference IS NOT NULL AND session_expires_at IS NOT NULL OR (status = ANY (ARRAY['requested'::text, 'creating_customer'::text, 'creating_session'::text, 'failed'::text])) AND checkout_session_reference IS NULL AND session_expires_at IS NULL OR status = 'recovery_required'::text);
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operations_status_check CHECK (status = ANY (ARRAY['requested'::text, 'creating_customer'::text, 'creating_session'::text, 'open'::text, 'completed'::text, 'failed'::text, 'expired'::text, 'recovery_required'::text]));
ALTER TABLE zaltyko.organization_saas_customers ADD CONSTRAINT organization_saas_customers_attempts_check CHECK (attempts >= 0);
ALTER TABLE zaltyko.organization_saas_customers ADD CONSTRAINT organization_saas_customers_creation_idempotency_key_check CHECK (btrim(creation_idempotency_key) <> ''::text);
ALTER TABLE zaltyko.organization_saas_customers ADD CONSTRAINT organization_saas_customers_creation_request_hash_check CHECK (creation_request_hash ~ '^[a-f0-9]{64}$'::text);
ALTER TABLE zaltyko.organization_saas_customers ADD CONSTRAINT organization_saas_customers_provider_account_reference_check CHECK (btrim(provider_account_reference) <> ''::text);
ALTER TABLE zaltyko.organization_saas_customers ADD CONSTRAINT organization_saas_customers_provider_check CHECK (provider = 'stripe'::text);
ALTER TABLE zaltyko.organization_saas_customers ADD CONSTRAINT organization_saas_customers_ref_not_blank CHECK (customer_reference IS NULL OR btrim(customer_reference) <> ''::text);
ALTER TABLE zaltyko.organization_saas_customers ADD CONSTRAINT organization_saas_customers_state_valid CHECK (status = 'creating'::text AND customer_reference IS NULL OR status = 'ready'::text AND customer_reference IS NOT NULL OR status = 'recovery_required'::text);
ALTER TABLE zaltyko.organization_saas_customers ADD CONSTRAINT organization_saas_customers_status_check CHECK (status = ANY (ARRAY['creating'::text, 'ready'::text, 'recovery_required'::text]));
ALTER TABLE zaltyko.organization_saas_subscriptions ADD CONSTRAINT organization_saas_subscription_provider_account_reference_check CHECK (btrim(provider_account_reference) <> ''::text);
ALTER TABLE zaltyko.organization_saas_subscriptions ADD CONSTRAINT organization_saas_subscriptions_customer_reference_check CHECK (btrim(customer_reference) <> ''::text);
ALTER TABLE zaltyko.organization_saas_subscriptions ADD CONSTRAINT organization_saas_subscriptions_event_reference_valid CHECK (last_provider_event_reference IS NULL OR btrim(last_provider_event_reference) <> ''::text);
ALTER TABLE zaltyko.organization_saas_subscriptions ADD CONSTRAINT organization_saas_subscriptions_period_valid CHECK (current_period_ends_at > current_period_started_at);
ALTER TABLE zaltyko.organization_saas_subscriptions ADD CONSTRAINT organization_saas_subscriptions_plan_code_check CHECK (plan_code = ANY (ARRAY['starter'::zaltyko.saas_plan_code, 'growth'::zaltyko.saas_plan_code, 'network'::zaltyko.saas_plan_code]));
ALTER TABLE zaltyko.organization_saas_subscriptions ADD CONSTRAINT organization_saas_subscriptions_price_reference_check CHECK (btrim(price_reference) <> ''::text);
ALTER TABLE zaltyko.organization_saas_subscriptions ADD CONSTRAINT organization_saas_subscriptions_provider_check CHECK (provider = 'stripe'::text);
ALTER TABLE zaltyko.organization_saas_subscriptions ADD CONSTRAINT organization_saas_subscriptions_provider_status_check CHECK (provider_status = ANY (ARRAY['incomplete'::text, 'incomplete_expired'::text, 'trialing'::text, 'active'::text, 'past_due'::text, 'canceled'::text, 'unpaid'::text, 'paused'::text]));
ALTER TABLE zaltyko.organization_saas_subscriptions ADD CONSTRAINT organization_saas_subscriptions_subscription_reference_check CHECK (btrim(subscription_reference) <> ''::text);
ALTER TABLE zaltyko.organization_saas_trials ADD CONSTRAINT organization_saas_trials_converted_after_start CHECK (converted_at IS NULL OR converted_at >= started_at);
ALTER TABLE zaltyko.organization_saas_trials ADD CONSTRAINT organization_saas_trials_end_state_valid CHECK (status = 'active'::zaltyko.organization_saas_trial_status AND ended_at IS NULL AND converted_at IS NULL OR status = 'converted'::zaltyko.organization_saas_trial_status AND ended_at IS NOT NULL AND converted_at IS NOT NULL OR (status = ANY (ARRAY['expired'::zaltyko.organization_saas_trial_status, 'cancelled'::zaltyko.organization_saas_trial_status])) AND ended_at IS NOT NULL AND converted_at IS NULL);
ALTER TABLE zaltyko.organization_saas_trials ADD CONSTRAINT organization_saas_trials_ended_after_start CHECK (ended_at IS NULL OR ended_at >= started_at);
ALTER TABLE zaltyko.organization_saas_trials ADD CONSTRAINT organization_saas_trials_idempotency_key_check CHECK (length(btrim(idempotency_key)) >= 8 AND length(btrim(idempotency_key)) <= 150);
ALTER TABLE zaltyko.organization_saas_trials ADD CONSTRAINT organization_saas_trials_periods_valid CHECK (ends_at > started_at AND cooldown_ends_at > started_at);
ALTER TABLE zaltyko.organization_saas_trials ADD CONSTRAINT organization_saas_trials_request_hash_check CHECK (request_hash ~ '^[a-f0-9]{64}$'::text);
ALTER TABLE zaltyko.organization_saas_trials ADD CONSTRAINT organization_saas_trials_starter_only CHECK (status = ANY (ARRAY['active'::zaltyko.organization_saas_trial_status, 'expired'::zaltyko.organization_saas_trial_status, 'converted'::zaltyko.organization_saas_trial_status, 'cancelled'::zaltyko.organization_saas_trial_status]));
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT organization_saas_webhook_even_provider_account_reference_check CHECK (btrim(provider_account_reference) <> ''::text);
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT organization_saas_webhook_event_account_not_blank CHECK (event_account_reference IS NULL OR btrim(event_account_reference) <> ''::text);
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT organization_saas_webhook_event_lease_valid CHECK (status = 'processing'::text AND lease_token IS NOT NULL AND lease_until IS NOT NULL AND fencing_version > 0 OR status <> 'processing'::text AND lease_token IS NULL AND lease_until IS NULL);
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT organization_saas_webhook_event_mode_valid CHECK (environment = 'live'::zaltyko.stripe_environment AND livemode OR environment = 'test'::zaltyko.stripe_environment AND NOT livemode);
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT organization_saas_webhook_event_object_not_blank CHECK (provider_object_reference IS NULL OR btrim(provider_object_reference) <> ''::text);
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT organization_saas_webhook_event_object_type_not_blank CHECK (provider_object_type IS NULL OR btrim(provider_object_type) <> ''::text);
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT organization_saas_webhook_event_processed_valid CHECK ((status = ANY (ARRAY['processed'::text, 'ignored'::text])) AND processed_at IS NOT NULL OR (status <> ALL (ARRAY['processed'::text, 'ignored'::text])) AND processed_at IS NULL);
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT organization_saas_webhook_events_attempts_check CHECK (attempts >= 0);
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT organization_saas_webhook_events_event_type_check CHECK (btrim(event_type) <> ''::text);
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT organization_saas_webhook_events_fencing_version_check CHECK (fencing_version >= 0);
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT organization_saas_webhook_events_payload_sha256_check CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'::text);
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT organization_saas_webhook_events_provider_check CHECK (provider = 'stripe'::text);
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT organization_saas_webhook_events_provider_event_id_check CHECK (btrim(provider_event_id) <> ''::text);
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT organization_saas_webhook_events_signature_verified_check CHECK (signature_verified);
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT organization_saas_webhook_events_status_check CHECK (status = ANY (ARRAY['received'::text, 'processing'::text, 'processed'::text, 'failed'::text, 'quarantined'::text, 'ignored'::text]));
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT saas_webhook_event_reconciliation_org_check CHECK (reconciliation_decision_id IS NULL OR organization_id IS NOT NULL);
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT saas_webhook_reconciliation_retry_requires_decision CHECK (reconciliation_next_attempt_at IS NULL OR reconciliation_decision_id IS NOT NULL AND (status = ANY (ARRAY['received'::text, 'failed'::text])));
ALTER TABLE zaltyko.organization_saas_webhook_payload_conflicts ADD CONSTRAINT organization_saas_webhook_payload_conflict_times_valid CHECK (last_seen_at >= first_seen_at);
ALTER TABLE zaltyko.organization_saas_webhook_payload_conflicts ADD CONSTRAINT organization_saas_webhook_payload_conflicts_occurrences_check CHECK (occurrences > 0);
ALTER TABLE zaltyko.organization_saas_webhook_payload_conflicts ADD CONSTRAINT organization_saas_webhook_payload_observed_payload_sha256_check CHECK (observed_payload_sha256 ~ '^[a-f0-9]{64}$'::text);
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_re_expected_entitlement_revisio_check CHECK (expected_entitlement_revision > 0);
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_re_expected_entitlement_source__check CHECK (btrim(expected_entitlement_source_reference) <> ''::text);
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_re_expected_subscription_price__check CHECK (btrim(expected_subscription_price_reference) <> ''::text);
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_re_expected_subscription_provid_check CHECK (expected_subscription_provider_status = ANY (ARRAY['incomplete'::text, 'incomplete_expired'::text, 'trialing'::text, 'active'::text, 'past_due'::text, 'canceled'::text, 'unpaid'::text, 'paused'::text]));
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_re_observed_subscription_refere_check CHECK (btrim(observed_subscription_reference) <> ''::text);
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_rec_confirmation_request_sha256_check CHECK (confirmation_request_sha256 ~ '^[a-f0-9]{64}$'::text);
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_rec_observed_customer_reference_check CHECK (btrim(observed_customer_reference) <> ''::text);
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_reco_provider_account_reference_check CHECK (btrim(provider_account_reference) <> ''::text);
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_recon_provider_object_reference_check CHECK (btrim(provider_object_reference) <> ''::text);
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_reconc_expected_fencing_version_check CHECK (expected_fencing_version >= 0);
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_reconc_observed_price_reference_check CHECK (btrim(observed_price_reference) <> ''::text);
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_reconc_observed_provider_status_check CHECK (observed_provider_status = ANY (ARRAY['incomplete'::text, 'incomplete_expired'::text, 'trialing'::text, 'active'::text, 'past_due'::text, 'canceled'::text, 'unpaid'::text, 'paused'::text]));
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_reconcilia_preview_token_sha256_check CHECK (preview_token_sha256 ~ '^[a-f0-9]{64}$'::text);
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_reconciliati_observed_plan_code_check CHECK (observed_plan_code = ANY (ARRAY['starter'::zaltyko.saas_plan_code, 'growth'::zaltyko.saas_plan_code, 'network'::zaltyko.saas_plan_code]));
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_reconciliatio_provider_event_id_check CHECK (btrim(provider_event_id) <> ''::text);
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_reconciliation__idempotency_key_check CHECK (length(btrim(idempotency_key)) >= 8 AND length(btrim(idempotency_key)) <= 150);
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_reconciliation__resolution_kind_check CHECK (resolution_kind = ANY (ARRAY['status_snapshot'::text, 'paid_invoice_grant'::text]));
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_reconciliation__snapshot_sha256_check CHECK (snapshot_sha256 ~ '^[a-f0-9]{64}$'::text);
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_reconciliation_d_payload_sha256_check CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'::text);
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_reconciliation_decis_request_id_check CHECK (btrim(request_id) <> ''::text AND length(request_id) <= 200);
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_reconciliation_decisions_reason_check CHECK (length(btrim(reason)) >= 20 AND length(btrim(reason)) <= 1000);
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT saas_webhook_reconciliation_execution_ttl CHECK (execution_expires_at > evidence_observed_at AND execution_expires_at <= (evidence_observed_at + '00:02:00'::interval));
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT saas_webhook_reconciliation_expected_period CHECK (expected_subscription_period_ends_at > expected_subscription_period_started_at);
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT saas_webhook_reconciliation_invoice_shape CHECK ((resolution_kind = 'status_snapshot'::text AND invoice_reference IS NULL AND invoice_status IS NULL AND invoice_customer_reference IS NULL AND invoice_subscription_reference IS NULL AND invoice_currency IS NULL AND invoice_paid_amount IS NULL AND invoice_period_started_at IS NULL AND invoice_period_ends_at IS NULL AND invoice_price_reference IS NULL AND invoice_plan_code IS NULL OR resolution_kind = 'status_snapshot'::text AND invoice_reference IS NOT NULL AND invoice_status IS NOT NULL AND invoice_customer_reference = observed_customer_reference AND invoice_subscription_reference = observed_subscription_reference AND invoice_currency IS NULL AND invoice_paid_amount IS NULL AND invoice_period_started_at IS NULL AND invoice_period_ends_at IS NULL AND invoice_price_reference IS NULL AND invoice_plan_code IS NULL OR resolution_kind = 'paid_invoice_grant'::text AND invoice_reference IS NOT NULL AND invoice_status = 'paid'::text AND invoice_customer_reference = observed_customer_reference AND invoice_subscription_reference = observed_subscription_reference AND invoice_currency = 'eur'::text AND invoice_paid_amount >= 0 AND invoice_period_started_at IS NOT NULL AND invoice_period_ends_at > invoice_period_started_at AND invoice_price_reference IS NOT NULL AND (invoice_plan_code = ANY (ARRAY['starter'::zaltyko.saas_plan_code, 'growth'::zaltyko.saas_plan_code]))) IS TRUE);
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT saas_webhook_reconciliation_preview_ttl CHECK (preview_expires_at > preview_issued_at AND preview_expires_at <= (preview_issued_at + '00:05:00'::interval) AND created_at < preview_expires_at);
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT saas_webhook_reconciliation_snapshot_period CHECK (observed_current_period_ends_at > observed_current_period_started_at);
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_results ADD CONSTRAINT organization_saas_webhook_re_entitlement_source_referenc_check1 CHECK (btrim(entitlement_source_reference_after) <> ''::text);
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_results ADD CONSTRAINT organization_saas_webhook_re_entitlement_source_reference_check CHECK (btrim(entitlement_source_reference_before) <> ''::text);
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_results ADD CONSTRAINT organization_saas_webhook_rec_entitlement_revision_before_check CHECK (entitlement_revision_before > 0);
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_results ADD CONSTRAINT organization_saas_webhook_reco_entitlement_revision_after_check CHECK (entitlement_revision_after > 0);
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_results ADD CONSTRAINT organization_saas_webhook_recon_processor_fencing_version_check CHECK (processor_fencing_version > 0);
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_results ADD CONSTRAINT organization_saas_webhook_reconc_observed_snapshot_sha256_check CHECK (observed_snapshot_sha256 IS NULL OR observed_snapshot_sha256 ~ '^[a-f0-9]{64}$'::text);
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_results ADD CONSTRAINT organization_saas_webhook_reconciliation_resu_result_code_check CHECK (btrim(result_code) <> ''::text);
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_results ADD CONSTRAINT organization_saas_webhook_reconciliation_results_outcome_check CHECK (outcome = ANY (ARRAY['applied'::text, 'already_applied'::text, 'ignored'::text, 'stale'::text]));
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_results ADD CONSTRAINT saas_webhook_reconciliation_result_revision CHECK (outcome = 'applied'::text AND entitlement_revision_after >= entitlement_revision_before OR outcome = 'already_applied'::text AND entitlement_revision_after = entitlement_revision_before AND entitlement_source_reference_after = entitlement_source_reference_before OR outcome = 'ignored'::text AND entitlement_revision_after = entitlement_revision_before AND entitlement_source_reference_after = entitlement_source_reference_before OR outcome = 'stale'::text AND entitlement_revision_after = entitlement_revision_before AND entitlement_source_reference_after = entitlement_source_reference_before);
ALTER TABLE zaltyko.organization_sports ADD CONSTRAINT organization_sports_dates_valid CHECK (ends_on IS NULL OR ends_on >= starts_on);
ALTER TABLE zaltyko.organizations ADD CONSTRAINT organizations_country_code_check CHECK (country_code ~ '^[A-Z]{2}$'::text);
ALTER TABLE zaltyko.organizations ADD CONSTRAINT organizations_default_currency_check CHECK (default_currency ~ '^[A-Z]{3}$'::text);
ALTER TABLE zaltyko.organizations ADD CONSTRAINT organizations_name_check CHECK (btrim(name) <> ''::text);
ALTER TABLE zaltyko.outbox_events ADD CONSTRAINT outbox_events_aggregate_type_check CHECK (btrim(aggregate_type) <> ''::text);
ALTER TABLE zaltyko.outbox_events ADD CONSTRAINT outbox_events_attempts_check CHECK (attempts >= 0);
ALTER TABLE zaltyko.outbox_events ADD CONSTRAINT outbox_events_event_name_check CHECK (btrim(event_name) <> ''::text);
ALTER TABLE zaltyko.outbox_events ADD CONSTRAINT outbox_events_event_version_check CHECK (event_version > 0);
ALTER TABLE zaltyko.outbox_events ADD CONSTRAINT outbox_events_idempotency_key_check CHECK (btrim(idempotency_key) <> ''::text);
ALTER TABLE zaltyko.owner_dashboard_layouts ADD CONSTRAINT owner_dashboard_layouts_order_cardinality CHECK (cardinality(module_order) = 4);
ALTER TABLE zaltyko.owner_dashboard_layouts ADD CONSTRAINT owner_dashboard_layouts_version_positive CHECK (version > 0);
ALTER TABLE zaltyko.owner_signup_consent_audits ADD CONSTRAINT owner_signup_consent_audits_consent_proof_check CHECK (consent_proof ~ '^(signup|setup):[a-zA-Z0-9_-]{1,128}$'::text);
ALTER TABLE zaltyko.owner_signup_consent_audits ADD CONSTRAINT owner_signup_consent_audits_event_check CHECK (event = ANY (ARRAY['grant'::text, 're_grant'::text]));
ALTER TABLE zaltyko.owner_signup_consent_audits ADD CONSTRAINT owner_signup_consent_audits_policy_version_check CHECK (policy_version ~ '^v[0-9]+-[0-9]{4}-[0-9]{2}-[0-9]{2}$'::text);
ALTER TABLE zaltyko.owner_signup_consent_audits ADD CONSTRAINT owner_signup_consent_audits_source_check CHECK (source = ANY (ARRAY['signup'::text, 'setup'::text]));
ALTER TABLE zaltyko.owner_signup_consent_policy ADD CONSTRAINT owner_signup_consent_policy_policy_version_check CHECK (policy_version ~ '^v[0-9]+-[0-9]{4}-[0-9]{2}-[0-9]{2}$'::text);
ALTER TABLE zaltyko.owner_signup_consent_policy ADD CONSTRAINT owner_signup_consent_policy_singleton_check CHECK (singleton = true);
ALTER TABLE zaltyko.owner_signup_consents ADD CONSTRAINT owner_signup_consents_consent_proof_check CHECK (consent_proof ~ '^(signup|setup):[a-zA-Z0-9_-]{1,128}$'::text);
ALTER TABLE zaltyko.owner_signup_consents ADD CONSTRAINT owner_signup_consents_policy_version_check CHECK (policy_version ~ '^v[0-9]+-[0-9]{4}-[0-9]{2}-[0-9]{2}$'::text);
ALTER TABLE zaltyko.owner_signup_consents ADD CONSTRAINT owner_signup_consents_source_check CHECK (source = ANY (ARRAY['signup'::text, 'setup'::text]));
ALTER TABLE zaltyko.owner_signup_consents ADD CONSTRAINT owner_signup_consents_state_check CHECK (state = ANY (ARRAY['granted'::text, 'revoked'::text]));
ALTER TABLE zaltyko.payment_allocations ADD CONSTRAINT payment_allocations_amount_cents_check CHECK (amount_cents > 0);
ALTER TABLE zaltyko.payment_allocations ADD CONSTRAINT payment_allocations_currency_check CHECK (currency ~ '^[A-Z]{3}$'::text);
ALTER TABLE zaltyko.payment_allocations ADD CONSTRAINT payment_allocations_idempotency_key_check CHECK (btrim(idempotency_key) <> ''::text);
ALTER TABLE zaltyko.payment_attempts ADD CONSTRAINT payment_attempts_amount_cents_check CHECK (amount_cents > 0);
ALTER TABLE zaltyko.payment_attempts ADD CONSTRAINT payment_attempts_currency_check CHECK (currency ~ '^[A-Z]{3}$'::text);
ALTER TABLE zaltyko.payment_attempts ADD CONSTRAINT payment_attempts_idempotency_key_check CHECK (btrim(idempotency_key) <> ''::text);
ALTER TABLE zaltyko.payment_attempts ADD CONSTRAINT payment_attempts_processor_check CHECK (btrim(processor) <> ''::text);
ALTER TABLE zaltyko.payment_attempts ADD CONSTRAINT payment_attempts_provider_attempt_id_check CHECK (btrim(provider_attempt_id) <> ''::text);
ALTER TABLE zaltyko.payment_provider_events ADD CONSTRAINT payment_provider_events_attempts_check CHECK (attempts >= 0);
ALTER TABLE zaltyko.payment_provider_events ADD CONSTRAINT payment_provider_events_event_type_check CHECK (btrim(event_type) <> ''::text);
ALTER TABLE zaltyko.payment_provider_events ADD CONSTRAINT payment_provider_events_payload_check CHECK (jsonb_typeof(payload) = 'object'::text);
ALTER TABLE zaltyko.payment_provider_events ADD CONSTRAINT payment_provider_events_payload_sha256_check CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'::text);
ALTER TABLE zaltyko.payment_provider_events ADD CONSTRAINT payment_provider_events_processor_check CHECK (btrim(processor) <> ''::text);
ALTER TABLE zaltyko.payment_provider_events ADD CONSTRAINT payment_provider_events_provider_event_id_check CHECK (btrim(provider_event_id) <> ''::text);
ALTER TABLE zaltyko.payment_provider_events ADD CONSTRAINT payment_provider_events_signature_verified_check CHECK (signature_verified);
ALTER TABLE zaltyko.payments ADD CONSTRAINT payments_amount_cents_check CHECK (amount_cents > 0);
ALTER TABLE zaltyko.payments ADD CONSTRAINT payments_currency_check CHECK (currency ~ '^[A-Z]{3}$'::text);
ALTER TABLE zaltyko.payments ADD CONSTRAINT payments_idempotency_key_check CHECK (btrim(idempotency_key) <> ''::text);
ALTER TABLE zaltyko.payments ADD CONSTRAINT payments_manual_reference_check CHECK (manual_reference IS NULL OR length(btrim(manual_reference)) <= 200);
ALTER TABLE zaltyko.payments ADD CONSTRAINT payments_source_fields_valid CHECK (source = 'provider'::zaltyko.payment_source AND processor IS NOT NULL AND btrim(processor) <> ''::text AND environment IS NOT NULL AND provider_payment_id IS NOT NULL AND btrim(provider_payment_id) <> ''::text AND manual_method IS NULL AND recorded_by_user_id IS NULL OR source = 'manual'::zaltyko.payment_source AND processor IS NULL AND environment IS NULL AND provider_payment_id IS NULL AND manual_method IS NOT NULL AND recorded_by_user_id IS NOT NULL);
ALTER TABLE zaltyko.payments ADD CONSTRAINT payments_version_check CHECK (version > 0);
ALTER TABLE zaltyko.people ADD CONSTRAINT people_family_name_check CHECK (btrim(family_name) <> ''::text);
ALTER TABLE zaltyko.people ADD CONSTRAINT people_given_name_check CHECK (btrim(given_name) <> ''::text);
ALTER TABLE zaltyko.price_plan_class_template_coverage ADD CONSTRAINT price_plan_class_template_coverage_dates_valid CHECK (ends_on IS NULL OR ends_on >= starts_on);
ALTER TABLE zaltyko.price_plans ADD CONSTRAINT price_plans_amount_cents_check CHECK (amount_cents >= 0);
ALTER TABLE zaltyko.price_plans ADD CONSTRAINT price_plans_currency_check CHECK (currency ~ '^[A-Z]{3}$'::text);
ALTER TABLE zaltyko.price_plans ADD CONSTRAINT price_plans_name_check CHECK (btrim(name) <> ''::text);
ALTER TABLE zaltyko.programs ADD CONSTRAINT programs_activity_key_format CHECK (activity_key IS NULL OR activity_key ~ '^[a-z][a-z0-9_]{1,47}$'::text);
ALTER TABLE zaltyko.programs ADD CONSTRAINT programs_classification_valid CHECK (kind = 'gymnastics_sport'::zaltyko.program_kind AND organization_sport_id IS NOT NULL AND activity_key IS NULL OR kind = 'complementary_activity'::zaltyko.program_kind AND organization_sport_id IS NULL AND activity_key IS NOT NULL AND btrim(activity_key) <> ''::text);
ALTER TABLE zaltyko.programs ADD CONSTRAINT programs_name_check CHECK (btrim(name) <> ''::text);
ALTER TABLE zaltyko.refunds ADD CONSTRAINT refunds_amount_cents_check CHECK (amount_cents > 0);
ALTER TABLE zaltyko.refunds ADD CONSTRAINT refunds_currency_check CHECK (currency ~ '^[A-Z]{3}$'::text);
ALTER TABLE zaltyko.refunds ADD CONSTRAINT refunds_idempotency_key_check CHECK (btrim(idempotency_key) <> ''::text);
ALTER TABLE zaltyko.refunds ADD CONSTRAINT refunds_processor_check CHECK (btrim(processor) <> ''::text);
ALTER TABLE zaltyko.refunds ADD CONSTRAINT refunds_provider_refund_id_check CHECK (btrim(provider_refund_id) <> ''::text);
ALTER TABLE zaltyko.refunds ADD CONSTRAINT refunds_reason_code_check CHECK (btrim(reason_code) <> ''::text);
ALTER TABLE zaltyko.retention_cohort_projection_runs ADD CONSTRAINT retention_cohort_projection_runs_completion_valid CHECK ((status = 'succeeded'::text) = (completed_at IS NOT NULL));
ALTER TABLE zaltyko.retention_cohort_projection_runs ADD CONSTRAINT retention_cohort_projection_runs_row_count_nonnegative CHECK (row_count >= 0);
ALTER TABLE zaltyko.retention_cohort_projection_runs ADD CONSTRAINT retention_cohort_projection_runs_status_valid CHECK (status = ANY (ARRAY['running'::text, 'succeeded'::text, 'failed'::text]));
ALTER TABLE zaltyko.retention_cohort_projection_runs ADD CONSTRAINT retention_cohort_projection_runs_version_positive CHECK (formula_version > 0);
ALTER TABLE zaltyko.retention_cohort_projections ADD CONSTRAINT retention_cohort_projections_counts_valid CHECK (cohort_size > 0 AND active_count >= 0 AND active_count <= cohort_size AND paused_count >= 0 AND paused_count <= cohort_size AND numerator = active_count AND denominator = cohort_size);
ALTER TABLE zaltyko.retention_cohort_projections ADD CONSTRAINT retention_cohort_projections_months_valid CHECK (date_trunc('month'::text, cohort_month::timestamp without time zone)::date = cohort_month AND date_trunc('month'::text, observation_month::timestamp without time zone)::date = observation_month AND observation_month >= cohort_month);
ALTER TABLE zaltyko.retention_cohort_projections ADD CONSTRAINT retention_cohort_projections_rate_quality_valid CHECK (paused_count > 0 AND retention_rate IS NULL AND quality = 'insufficient'::zaltyko.metric_quality OR paused_count = 0 AND retention_rate IS NOT NULL AND quality = 'complete'::zaltyko.metric_quality);
ALTER TABLE zaltyko.sessions ADD CONSTRAINT sessions_capacity_override_check CHECK (capacity_override IS NULL OR capacity_override > 0);
ALTER TABLE zaltyko.sessions ADD CONSTRAINT sessions_time_valid CHECK (ends_at > starts_at);
ALTER TABLE zaltyko.spaces ADD CONSTRAINT spaces_capacity_check CHECK (capacity IS NULL OR capacity > 0);
ALTER TABLE zaltyko.spaces ADD CONSTRAINT spaces_name_check CHECK (btrim(name) <> ''::text);
ALTER TABLE zaltyko.sport_profiles ADD CONSTRAINT sport_profiles_configuration_schema_version_check CHECK (configuration_schema_version > 0);
ALTER TABLE zaltyko.sport_profiles ADD CONSTRAINT sport_profiles_country_code_check CHECK (country_code ~ '^[A-Z]{2}$'::text);
ALTER TABLE zaltyko.sport_profiles ADD CONSTRAINT sport_profiles_discipline_key_check CHECK (discipline_key ~ '^[a-z][a-z0-9_]{1,47}$'::text);
ALTER TABLE zaltyko.sport_profiles ADD CONSTRAINT sport_profiles_federation_code_check CHECK (federation_code ~ '^[a-z][a-z0-9_-]{1,47}$'::text);
ALTER TABLE zaltyko.sport_profiles ADD CONSTRAINT sport_profiles_identity_only_empty CHECK (status <> 'identity_only'::zaltyko.sport_profile_status OR configuration = '{}'::jsonb);
ALTER TABLE zaltyko.sport_profiles ADD CONSTRAINT sport_profiles_profile_version_check CHECK (btrim(profile_version) <> ''::text);
ALTER TABLE zaltyko.sport_profiles ADD CONSTRAINT sport_profiles_source_url_check CHECK (source_url IS NULL OR source_url ~ '^https://'::text);
ALTER TABLE zaltyko.sport_profiles ADD CONSTRAINT sport_profiles_verified_source_required CHECK (status <> 'verified'::zaltyko.sport_profile_status OR source_title IS NOT NULL AND source_url IS NOT NULL AND source_verified_at IS NOT NULL);
ALTER TABLE zaltyko.trial_followups ADD CONSTRAINT trial_followups_idempotency_key_check CHECK (btrim(idempotency_key) <> ''::text);
ALTER TABLE zaltyko.trial_status_history ADD CONSTRAINT trial_status_history_idempotency_key_check CHECK (btrim(idempotency_key) <> ''::text);
ALTER TABLE zaltyko.trials ADD CONSTRAINT trials_version_check CHECK (version > 0);
ALTER TABLE zaltyko.waitlist_entries ADD CONSTRAINT waitlist_entries_consent_timestamp_valid CHECK (contact_consent_status = 'unknown'::zaltyko.contact_consent_status OR contact_consent_recorded_at IS NOT NULL);
ALTER TABLE zaltyko.waitlist_entries ADD CONSTRAINT waitlist_entries_contactable_valid CHECK (NOT contactable OR contact_guardian_id IS NOT NULL AND contact_consent_status = 'granted'::zaltyko.contact_consent_status);
ALTER TABLE zaltyko.waitlist_entries ADD CONSTRAINT waitlist_entries_preferences_check CHECK (jsonb_typeof(preferences) = 'object'::text);
ALTER TABLE zaltyko.waitlist_entries ADD CONSTRAINT waitlist_entries_priority_check CHECK (priority >= 0);
ALTER TABLE zaltyko.waitlist_entries ADD CONSTRAINT waitlist_entries_target_required CHECK (class_template_id IS NOT NULL AND program_id IS NULL OR class_template_id IS NULL AND program_id IS NOT NULL);
ALTER TABLE zaltyko.waitlist_entries ADD CONSTRAINT waitlist_entries_version_check CHECK (version > 0);
ALTER TABLE zaltyko.waitlist_offers ADD CONSTRAINT waitlist_offers_dates_valid CHECK (expires_at > sent_at);
ALTER TABLE zaltyko.waitlist_offers ADD CONSTRAINT waitlist_offers_idempotency_key_check CHECK (btrim(idempotency_key) <> ''::text);
ALTER TABLE zaltyko.waitlist_offers ADD CONSTRAINT waitlist_offers_version_check CHECK (version > 0);
ALTER TABLE zaltyko_domain_private.e2e_schema_migrations ADD CONSTRAINT e2e_schema_migrations_checksum_check CHECK (checksum ~ '^[a-f0-9]{64}$'::text);
ALTER TABLE public.academies ADD CONSTRAINT academies_fraud_hold_actor_id_fkey FOREIGN KEY (fraud_hold_actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.academies ADD CONSTRAINT academies_fraud_hold_cleared_actor_id_fkey FOREIGN KEY (fraud_hold_cleared_actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.academies ADD CONSTRAINT academies_owner_id_profiles_id_fk FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.academy_diagnostics ADD CONSTRAINT academy_diagnostics_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.academy_diagnostics ADD CONSTRAINT academy_diagnostics_completed_by_profiles_id_fk FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.academy_expenses ADD CONSTRAINT academy_expenses_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.academy_expenses ADD CONSTRAINT academy_expenses_class_id_classes_id_fk FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE SET NULL;
ALTER TABLE public.academy_expenses ADD CONSTRAINT academy_expenses_coach_id_coaches_id_fk FOREIGN KEY (coach_id) REFERENCES public.coaches(id) ON DELETE SET NULL;
ALTER TABLE public.academy_expenses ADD CONSTRAINT academy_expenses_group_id_groups_id_fk FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE SET NULL;
ALTER TABLE public.academy_geo_groups ADD CONSTRAINT academy_geo_groups_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.academy_link_requests ADD CONSTRAINT academy_link_requests_academy_id_fkey FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.academy_link_requests ADD CONSTRAINT academy_link_requests_requested_by_profile_id_fkey FOREIGN KEY (requested_by_profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.academy_link_requests ADD CONSTRAINT academy_link_requests_target_profile_id_fkey FOREIGN KEY (target_profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.academy_messages ADD CONSTRAINT academy_messages_receiver_academy_id_academies_id_fk FOREIGN KEY (receiver_academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.academy_messages ADD CONSTRAINT academy_messages_sender_academy_id_academies_id_fk FOREIGN KEY (sender_academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.academy_roles ADD CONSTRAINT academy_roles_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.academy_sport_configs ADD CONSTRAINT academy_sport_configs_academy_id_fkey FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.academy_sport_configs ADD CONSTRAINT academy_sport_configs_sport_locale_config_id_fkey FOREIGN KEY (sport_locale_config_id) REFERENCES public.sport_locale_configs(id) ON DELETE RESTRICT;
ALTER TABLE public.academy_trials ADD CONSTRAINT academy_trials_academy_id_fkey FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.academy_trials ADD CONSTRAINT academy_trials_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;
ALTER TABLE public.academy_trials ADD CONSTRAINT academy_trials_started_by_fkey FOREIGN KEY (started_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
ALTER TABLE public.advertisements ADD CONSTRAINT advertisements_created_by_profiles_id_fk FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.announcement_read_status ADD CONSTRAINT announcement_read_status_announcement_id_announcements_id_fk FOREIGN KEY (announcement_id) REFERENCES public.announcements(id) ON DELETE CASCADE;
ALTER TABLE public.announcement_read_status ADD CONSTRAINT announcement_read_status_user_id_profiles_id_fk FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.announcements ADD CONSTRAINT announcements_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.announcements ADD CONSTRAINT announcements_author_id_profiles_id_fk FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.apparatus ADD CONSTRAINT apparatus_sport_locale_config_id_fkey FOREIGN KEY (sport_locale_config_id) REFERENCES public.sport_locale_configs(id) ON DELETE CASCADE;
ALTER TABLE public.assessment_scores ADD CONSTRAINT assessment_scores_assessment_id_athlete_assessments_id_fk FOREIGN KEY (assessment_id) REFERENCES public.athlete_assessments(id) ON DELETE CASCADE;
ALTER TABLE public.assessment_scores ADD CONSTRAINT assessment_scores_skill_id_skill_catalog_id_fk FOREIGN KEY (skill_id) REFERENCES public.skill_catalog(id) ON DELETE CASCADE;
ALTER TABLE public.assessment_videos ADD CONSTRAINT assessment_videos_assessment_id_athlete_assessments_id_fk FOREIGN KEY (assessment_id) REFERENCES public.athlete_assessments(id) ON DELETE CASCADE;
ALTER TABLE public.athlete_assessments ADD CONSTRAINT athlete_assessments_assessed_by_coaches_id_fk FOREIGN KEY (assessed_by) REFERENCES public.coaches(id) ON DELETE SET NULL;
ALTER TABLE public.athlete_assessments ADD CONSTRAINT athlete_assessments_athlete_id_athletes_id_fk FOREIGN KEY (athlete_id) REFERENCES public.athletes(id) ON DELETE CASCADE;
ALTER TABLE public.athlete_assessments ADD CONSTRAINT athlete_assessments_session_id_class_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.class_sessions(id) ON DELETE SET NULL;
ALTER TABLE public.athlete_assessments ADD CONSTRAINT athlete_assessments_sport_config_id_fkey FOREIGN KEY (sport_config_id) REFERENCES public.academy_sport_configs(id) ON DELETE SET NULL;
ALTER TABLE public.athlete_documents ADD CONSTRAINT athlete_documents_athlete_id_athletes_id_fk FOREIGN KEY (athlete_id) REFERENCES public.athletes(id) ON DELETE CASCADE;
ALTER TABLE public.athlete_documents ADD CONSTRAINT athlete_documents_uploaded_by_profiles_id_fk FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.athlete_extra_classes ADD CONSTRAINT athlete_extra_classes_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.athlete_extra_classes ADD CONSTRAINT athlete_extra_classes_athlete_id_athletes_id_fk FOREIGN KEY (athlete_id) REFERENCES public.athletes(id) ON DELETE CASCADE;
ALTER TABLE public.athlete_extra_classes ADD CONSTRAINT athlete_extra_classes_class_id_classes_id_fk FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;
ALTER TABLE public.athlete_import_batches ADD CONSTRAINT athlete_import_batches_academy_id_fkey FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.athlete_import_batches ADD CONSTRAINT athlete_import_batches_initiated_by_fkey FOREIGN KEY (initiated_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
ALTER TABLE public.athlete_invitations ADD CONSTRAINT athlete_invitations_academy_id_fkey FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.athlete_invitations ADD CONSTRAINT athlete_invitations_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES public.athletes(id) ON DELETE SET NULL;
ALTER TABLE public.athlete_invitations ADD CONSTRAINT athlete_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
ALTER TABLE public.athlete_sport_configs ADD CONSTRAINT athlete_sport_configs_academy_sport_config_id_fkey FOREIGN KEY (academy_sport_config_id) REFERENCES public.academy_sport_configs(id) ON DELETE CASCADE;
ALTER TABLE public.athlete_sport_configs ADD CONSTRAINT athlete_sport_configs_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES public.athletes(id) ON DELETE CASCADE;
ALTER TABLE public.athletes ADD CONSTRAINT athletes_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.athletes ADD CONSTRAINT athletes_group_id_groups_id_fk FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE SET NULL;
ALTER TABLE public.athletes ADD CONSTRAINT athletes_import_batch_id_fkey FOREIGN KEY (import_batch_id) REFERENCES public.athlete_import_batches(id) ON DELETE SET NULL;
ALTER TABLE public.athletes ADD CONSTRAINT athletes_primary_sport_config_id_fkey FOREIGN KEY (primary_sport_config_id) REFERENCES public.academy_sport_configs(id) ON DELETE SET NULL;
ALTER TABLE public.athletes ADD CONSTRAINT athletes_template_id_templates_id_fk FOREIGN KEY (template_id) REFERENCES public.templates(id) ON DELETE SET NULL;
ALTER TABLE public.athletes ADD CONSTRAINT athletes_user_id_profiles_user_id_fk FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
ALTER TABLE public.attendance_records ADD CONSTRAINT attendance_records_athlete_id_athletes_id_fk FOREIGN KEY (athlete_id) REFERENCES public.athletes(id) ON DELETE CASCADE;
ALTER TABLE public.attendance_records ADD CONSTRAINT attendance_records_session_id_class_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.class_sessions(id) ON DELETE CASCADE;
ALTER TABLE public.billing_events ADD CONSTRAINT billing_events_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE SET NULL;
ALTER TABLE public.billing_invoices ADD CONSTRAINT billing_invoices_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.billing_items ADD CONSTRAINT billing_items_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.categories ADD CONSTRAINT categories_sport_locale_config_id_fkey FOREIGN KEY (sport_locale_config_id) REFERENCES public.sport_locale_configs(id) ON DELETE CASCADE;
ALTER TABLE public.charges ADD CONSTRAINT charges_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.charges ADD CONSTRAINT charges_athlete_id_athletes_id_fk FOREIGN KEY (athlete_id) REFERENCES public.athletes(id) ON DELETE CASCADE;
ALTER TABLE public.charges ADD CONSTRAINT charges_billing_item_id_billing_items_id_fk FOREIGN KEY (billing_item_id) REFERENCES public.billing_items(id) ON DELETE SET NULL;
ALTER TABLE public.charges ADD CONSTRAINT charges_class_id_classes_id_fk FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE SET NULL;
ALTER TABLE public.churn_reasons ADD CONSTRAINT churn_reasons_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.churn_reasons ADD CONSTRAINT churn_reasons_athlete_id_athletes_id_fk FOREIGN KEY (athlete_id) REFERENCES public.athletes(id) ON DELETE CASCADE;
ALTER TABLE public.churn_reasons ADD CONSTRAINT churn_reasons_created_by_profiles_id_fk FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.class_coach_assignments ADD CONSTRAINT class_coach_assignments_class_id_classes_id_fk FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;
ALTER TABLE public.class_coach_assignments ADD CONSTRAINT class_coach_assignments_coach_id_coaches_id_fk FOREIGN KEY (coach_id) REFERENCES public.coaches(id) ON DELETE CASCADE;
ALTER TABLE public.class_enrollments ADD CONSTRAINT class_enrollments_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.class_enrollments ADD CONSTRAINT class_enrollments_athlete_id_athletes_id_fk FOREIGN KEY (athlete_id) REFERENCES public.athletes(id) ON DELETE CASCADE;
ALTER TABLE public.class_enrollments ADD CONSTRAINT class_enrollments_class_id_classes_id_fk FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;
ALTER TABLE public.class_exceptions ADD CONSTRAINT class_exceptions_class_id_classes_id_fk FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;
ALTER TABLE public.class_exceptions ADD CONSTRAINT class_exceptions_tenant_id_academies_id_fk FOREIGN KEY (tenant_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.class_groups ADD CONSTRAINT class_groups_class_id_classes_id_fk FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;
ALTER TABLE public.class_groups ADD CONSTRAINT class_groups_group_id_groups_id_fk FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;
ALTER TABLE public.class_sessions ADD CONSTRAINT class_sessions_class_id_classes_id_fk FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;
ALTER TABLE public.class_sessions ADD CONSTRAINT class_sessions_coach_id_coaches_id_fk FOREIGN KEY (coach_id) REFERENCES public.coaches(id) ON DELETE SET NULL;
ALTER TABLE public.class_sessions ADD CONSTRAINT class_sessions_sport_config_id_fkey FOREIGN KEY (sport_config_id) REFERENCES public.academy_sport_configs(id) ON DELETE SET NULL;
ALTER TABLE public.class_waiting_list ADD CONSTRAINT class_waiting_list_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.class_waiting_list ADD CONSTRAINT class_waiting_list_class_id_classes_id_fk FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;
ALTER TABLE public.class_weekdays ADD CONSTRAINT class_weekdays_class_id_classes_id_fk FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;
ALTER TABLE public.classes ADD CONSTRAINT classes_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.classes ADD CONSTRAINT classes_group_id_groups_id_fk FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE SET NULL;
ALTER TABLE public.classes ADD CONSTRAINT classes_sport_config_id_fkey FOREIGN KEY (sport_config_id) REFERENCES public.academy_sport_configs(id) ON DELETE SET NULL;
ALTER TABLE public.coach_compensation ADD CONSTRAINT coach_compensation_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.coach_compensation ADD CONSTRAINT coach_compensation_coach_id_coaches_id_fk FOREIGN KEY (coach_id) REFERENCES public.coaches(id) ON DELETE CASCADE;
ALTER TABLE public.coach_notes ADD CONSTRAINT coach_notes_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.coach_notes ADD CONSTRAINT coach_notes_athlete_id_athletes_id_fk FOREIGN KEY (athlete_id) REFERENCES public.athletes(id) ON DELETE CASCADE;
ALTER TABLE public.coach_notes ADD CONSTRAINT coach_notes_author_id_profiles_id_fk FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.coach_sport_configs ADD CONSTRAINT coach_sport_configs_academy_sport_config_id_fkey FOREIGN KEY (academy_sport_config_id) REFERENCES public.academy_sport_configs(id) ON DELETE CASCADE;
ALTER TABLE public.coach_sport_configs ADD CONSTRAINT coach_sport_configs_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.coaches(id) ON DELETE CASCADE;
ALTER TABLE public.coaches ADD CONSTRAINT coaches_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.coaches ADD CONSTRAINT coaches_profile_id_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.commercial_interviews ADD CONSTRAINT commercial_interviews_created_by_profile_id_profiles_id_fk FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.commercial_interviews ADD CONSTRAINT commercial_interviews_lead_id_leads_id_fk FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;
ALTER TABLE public.commercial_interviews ADD CONSTRAINT commercial_interviews_updated_by_profile_id_profiles_id_fk FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.competition_results ADD CONSTRAINT competition_results_athlete_id_athletes_id_fk FOREIGN KEY (athlete_id) REFERENCES public.athletes(id) ON DELETE CASCADE;
ALTER TABLE public.competition_results ADD CONSTRAINT competition_results_event_id_events_id_fk FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;
ALTER TABLE public.competition_results ADD CONSTRAINT competition_results_sport_config_id_fkey FOREIGN KEY (sport_config_id) REFERENCES public.academy_sport_configs(id) ON DELETE SET NULL;
ALTER TABLE public.competition_types ADD CONSTRAINT competition_types_sport_locale_config_id_fkey FOREIGN KEY (sport_locale_config_id) REFERENCES public.sport_locale_configs(id) ON DELETE CASCADE;
ALTER TABLE public.contact_messages ADD CONSTRAINT contact_messages_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.conversation_messages ADD CONSTRAINT conversation_messages_conversation_id_conversations_id_fk FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;
ALTER TABLE public.conversation_messages ADD CONSTRAINT conversation_messages_sender_id_profiles_id_fk FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.conversation_participants ADD CONSTRAINT conversation_participants_conversation_id_conversations_id_fk FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;
ALTER TABLE public.conversation_participants ADD CONSTRAINT conversation_participants_user_id_profiles_id_fk FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.conversations ADD CONSTRAINT conversations_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.directory_audit ADD CONSTRAINT directory_audit_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id);
ALTER TABLE public.directory_audit ADD CONSTRAINT directory_audit_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.directory_entries(id);
ALTER TABLE public.directory_batches ADD CONSTRAINT directory_batches_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.directory_sources(id);
ALTER TABLE public.directory_claims ADD CONSTRAINT directory_claims_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES auth.users(id);
ALTER TABLE public.directory_claims ADD CONSTRAINT directory_claims_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.directory_entries(id);
ALTER TABLE public.directory_claims ADD CONSTRAINT directory_claims_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.directory_deliveries ADD CONSTRAINT directory_deliveries_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.directory_subscriptions(id);
ALTER TABLE public.directory_entries ADD CONSTRAINT directory_entries_academy_id_fkey FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE SET NULL;
ALTER TABLE public.directory_entries ADD CONSTRAINT directory_entries_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;
ALTER TABLE public.directory_entries ADD CONSTRAINT directory_entries_merged_into_fkey FOREIGN KEY (merged_into) REFERENCES public.directory_entries(id);
ALTER TABLE public.directory_favorites ADD CONSTRAINT directory_favorites_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.directory_entries(id);
ALTER TABLE public.directory_favorites ADD CONSTRAINT directory_favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.directory_grants ADD CONSTRAINT directory_grants_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id);
ALTER TABLE public.directory_grants ADD CONSTRAINT directory_grants_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.directory_entries(id);
ALTER TABLE public.directory_grants ADD CONSTRAINT directory_grants_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.directory_import_rows ADD CONSTRAINT directory_import_rows_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.directory_batches(id);
ALTER TABLE public.directory_import_rows ADD CONSTRAINT directory_import_rows_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.directory_entries(id);
ALTER TABLE public.directory_import_rows ADD CONSTRAINT directory_import_rows_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.directory_sources(id);
ALTER TABLE public.directory_revisions ADD CONSTRAINT directory_revisions_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.directory_entries(id);
ALTER TABLE public.directory_revisions ADD CONSTRAINT directory_revisions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.directory_subscriptions ADD CONSTRAINT directory_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.discount_campaigns ADD CONSTRAINT discount_campaigns_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.discount_campaigns ADD CONSTRAINT discount_campaigns_created_by_profiles_id_fk FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.discount_campaigns ADD CONSTRAINT discount_campaigns_discount_id_discounts_id_fk FOREIGN KEY (discount_id) REFERENCES public.discounts(id) ON DELETE CASCADE;
ALTER TABLE public.discount_usage_history ADD CONSTRAINT discount_usage_history_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.discount_usage_history ADD CONSTRAINT discount_usage_history_athlete_id_athletes_id_fk FOREIGN KEY (athlete_id) REFERENCES public.athletes(id) ON DELETE SET NULL;
ALTER TABLE public.discount_usage_history ADD CONSTRAINT discount_usage_history_charge_id_charges_id_fk FOREIGN KEY (charge_id) REFERENCES public.charges(id) ON DELETE SET NULL;
ALTER TABLE public.discount_usage_history ADD CONSTRAINT discount_usage_history_discount_id_discounts_id_fk FOREIGN KEY (discount_id) REFERENCES public.discounts(id) ON DELETE CASCADE;
ALTER TABLE public.discounts ADD CONSTRAINT discounts_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.discounts ADD CONSTRAINT discounts_created_by_profiles_id_fk FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.email_logs ADD CONSTRAINT email_logs_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE SET NULL;
ALTER TABLE public.email_logs ADD CONSTRAINT email_logs_user_id_profiles_id_fk FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.empleo_applications ADD CONSTRAINT empleo_applications_listing_id_empleo_listings_id_fk FOREIGN KEY (listing_id) REFERENCES public.empleo_listings(id) ON DELETE CASCADE;
ALTER TABLE public.empleo_applications ADD CONSTRAINT empleo_applications_user_id_profiles_id_fk FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.empleo_listings ADD CONSTRAINT empleo_listings_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.event_categories ADD CONSTRAINT event_categories_event_id_events_id_fk FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;
ALTER TABLE public.event_invitations ADD CONSTRAINT event_invitations_athlete_id_athletes_id_fk FOREIGN KEY (athlete_id) REFERENCES public.athletes(id) ON DELETE CASCADE;
ALTER TABLE public.event_invitations ADD CONSTRAINT event_invitations_event_id_events_id_fk FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;
ALTER TABLE public.event_invitations ADD CONSTRAINT event_invitations_guardian_id_guardians_id_fk FOREIGN KEY (guardian_id) REFERENCES public.guardians(id) ON DELETE CASCADE;
ALTER TABLE public.event_invitations ADD CONSTRAINT event_invitations_invited_by_profiles_id_fk FOREIGN KEY (invited_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.event_logs ADD CONSTRAINT event_logs_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE SET NULL;
ALTER TABLE public.event_payments ADD CONSTRAINT event_payments_registration_id_event_registrations_id_fk FOREIGN KEY (registration_id) REFERENCES public.event_registrations(id) ON DELETE CASCADE;
ALTER TABLE public.event_registrations ADD CONSTRAINT event_registrations_event_id_events_id_fk FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;
ALTER TABLE public.event_registrations ADD CONSTRAINT event_registrations_profile_id_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.event_waitlist ADD CONSTRAINT event_waitlist_event_id_events_id_fk FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;
ALTER TABLE public.event_waitlist ADD CONSTRAINT event_waitlist_profile_id_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.events ADD CONSTRAINT events_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.events ADD CONSTRAINT events_sport_config_id_fkey FOREIGN KEY (sport_config_id) REFERENCES public.academy_sport_configs(id) ON DELETE SET NULL;
ALTER TABLE public.family_contacts ADD CONSTRAINT family_contacts_athlete_id_athletes_id_fk FOREIGN KEY (athlete_id) REFERENCES public.athletes(id) ON DELETE CASCADE;
ALTER TABLE public.family_stripe_customers ADD CONSTRAINT family_stripe_customers_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.family_stripe_customers ADD CONSTRAINT family_stripe_customers_profile_id_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.federative_licenses ADD CONSTRAINT federative_licenses_sport_config_id_fkey FOREIGN KEY (sport_config_id) REFERENCES public.academy_sport_configs(id) ON DELETE SET NULL;
ALTER TABLE public.group_athletes ADD CONSTRAINT group_athletes_athlete_id_athletes_id_fk FOREIGN KEY (athlete_id) REFERENCES public.athletes(id) ON DELETE CASCADE;
ALTER TABLE public.group_athletes ADD CONSTRAINT group_athletes_group_id_groups_id_fk FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;
ALTER TABLE public.groups ADD CONSTRAINT groups_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.groups ADD CONSTRAINT groups_billing_item_id_billing_items_id_fk FOREIGN KEY (billing_item_id) REFERENCES public.billing_items(id) ON DELETE SET NULL;
ALTER TABLE public.groups ADD CONSTRAINT groups_coach_id_coaches_id_fk FOREIGN KEY (coach_id) REFERENCES public.coaches(id) ON DELETE SET NULL;
ALTER TABLE public.groups ADD CONSTRAINT groups_sport_config_id_fkey FOREIGN KEY (sport_config_id) REFERENCES public.academy_sport_configs(id) ON DELETE SET NULL;
ALTER TABLE public.growth_events ADD CONSTRAINT growth_events_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE SET NULL;
ALTER TABLE public.growth_events ADD CONSTRAINT growth_events_user_id_profiles_user_id_fk FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
ALTER TABLE public.guardian_athletes ADD CONSTRAINT guardian_athletes_athlete_id_athletes_id_fk FOREIGN KEY (athlete_id) REFERENCES public.athletes(id) ON DELETE CASCADE;
ALTER TABLE public.guardian_athletes ADD CONSTRAINT guardian_athletes_guardian_id_guardians_id_fk FOREIGN KEY (guardian_id) REFERENCES public.guardians(id) ON DELETE CASCADE;
ALTER TABLE public.guardians ADD CONSTRAINT guardians_profile_id_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_default_academy_id_academies_id_fk FOREIGN KEY (default_academy_id) REFERENCES public.academies(id) ON DELETE SET NULL;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_invited_by_profiles_user_id_fk FOREIGN KEY (invited_by) REFERENCES public.profiles(user_id) ON DELETE CASCADE;
ALTER TABLE public.lead_interactions ADD CONSTRAINT lead_interactions_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;
ALTER TABLE public.lead_trial_outcomes ADD CONSTRAINT lead_trial_outcomes_academy_id_fkey FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.lead_trial_outcomes ADD CONSTRAINT lead_trial_outcomes_lead_trial_id_fkey FOREIGN KEY (lead_trial_id) REFERENCES public.lead_trials(id) ON DELETE CASCADE;
ALTER TABLE public.lead_trial_outcomes ADD CONSTRAINT lead_trial_outcomes_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.lead_trials ADD CONSTRAINT lead_trials_academy_id_fkey FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.lead_trials ADD CONSTRAINT lead_trials_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.lead_trials ADD CONSTRAINT lead_trials_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD CONSTRAINT leads_academy_id_fkey FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE SET NULL;
ALTER TABLE public.leak_action_history ADD CONSTRAINT leak_action_history_academy_id_fkey FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.leak_action_history ADD CONSTRAINT leak_action_history_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES public.athletes(id) ON DELETE SET NULL;
ALTER TABLE public.leak_action_history ADD CONSTRAINT leak_action_history_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE SET NULL;
ALTER TABLE public.levels ADD CONSTRAINT levels_sport_locale_config_id_fkey FOREIGN KEY (sport_locale_config_id) REFERENCES public.sport_locale_configs(id) ON DELETE CASCADE;
ALTER TABLE public.marketplace_ratings ADD CONSTRAINT marketplace_ratings_listing_id_marketplace_listings_id_fk FOREIGN KEY (listing_id) REFERENCES public.marketplace_listings(id) ON DELETE CASCADE;
ALTER TABLE public.marketplace_ratings ADD CONSTRAINT marketplace_ratings_reviewer_id_profiles_id_fk FOREIGN KEY (reviewer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.marketplace_ratings ADD CONSTRAINT marketplace_ratings_seller_id_profiles_id_fk FOREIGN KEY (seller_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.memberships ADD CONSTRAINT memberships_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.memberships ADD CONSTRAINT memberships_user_id_profiles_user_id_fk FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;
ALTER TABLE public.message_groups ADD CONSTRAINT message_groups_academy_id_fkey FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.message_history ADD CONSTRAINT message_history_sport_config_id_fkey FOREIGN KEY (sport_config_id) REFERENCES public.academy_sport_configs(id) ON DELETE SET NULL;
ALTER TABLE public.message_read_receipts ADD CONSTRAINT message_read_receipts_message_id_conversation_messages_id_fk FOREIGN KEY (message_id) REFERENCES public.conversation_messages(id) ON DELETE CASCADE;
ALTER TABLE public.message_read_receipts ADD CONSTRAINT message_read_receipts_user_id_profiles_id_fk FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.message_templates ADD CONSTRAINT message_templates_academy_id_fkey FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.message_templates ADD CONSTRAINT message_templates_sport_config_id_fkey FOREIGN KEY (sport_config_id) REFERENCES public.academy_sport_configs(id) ON DELETE SET NULL;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_user_id_profiles_id_fk FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.onboarding_checklist_items ADD CONSTRAINT onboarding_checklist_items_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.onboarding_states ADD CONSTRAINT onboarding_states_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.onboarding_states ADD CONSTRAINT onboarding_states_owner_profile_id_profiles_id_fk FOREIGN KEY (owner_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.owner_consent ADD CONSTRAINT owner_consent_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;
ALTER TABLE public.owner_consent_audit ADD CONSTRAINT owner_consent_audit_previous_audit_id_fkey FOREIGN KEY (previous_audit_id) REFERENCES public.owner_consent_audit(id) ON DELETE SET NULL;
ALTER TABLE public.payment_attempts ADD CONSTRAINT payment_attempts_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.payment_attempts ADD CONSTRAINT payment_attempts_charge_id_charges_id_fk FOREIGN KEY (charge_id) REFERENCES public.charges(id) ON DELETE CASCADE;
ALTER TABLE public.programs ADD CONSTRAINT programs_sport_locale_config_id_fkey FOREIGN KEY (sport_locale_config_id) REFERENCES public.sport_locale_configs(id) ON DELETE CASCADE;
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_user_id_profiles_user_id_fk FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;
ALTER TABLE public.push_tokens ADD CONSTRAINT push_tokens_user_id_profiles_user_id_fk FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;
ALTER TABLE public.receipts ADD CONSTRAINT receipts_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.receipts ADD CONSTRAINT receipts_athlete_id_athletes_id_fk FOREIGN KEY (athlete_id) REFERENCES public.athletes(id) ON DELETE SET NULL;
ALTER TABLE public.receipts ADD CONSTRAINT receipts_charge_id_charges_id_fk FOREIGN KEY (charge_id) REFERENCES public.charges(id) ON DELETE SET NULL;
ALTER TABLE public.receipts ADD CONSTRAINT receipts_created_by_profiles_id_fk FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.refunds ADD CONSTRAINT refunds_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.refunds ADD CONSTRAINT refunds_charge_id_charges_id_fk FOREIGN KEY (charge_id) REFERENCES public.charges(id) ON DELETE CASCADE;
ALTER TABLE public.refunds ADD CONSTRAINT refunds_created_by_profiles_id_fk FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.rubric_criteria ADD CONSTRAINT rubric_criteria_rubric_id_assessment_rubrics_id_fk FOREIGN KEY (rubric_id) REFERENCES public.assessment_rubrics(id) ON DELETE CASCADE;
ALTER TABLE public.scheduled_notifications ADD CONSTRAINT scheduled_notifications_academy_id_fkey FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.scholarships ADD CONSTRAINT scholarships_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.scholarships ADD CONSTRAINT scholarships_athlete_id_athletes_id_fk FOREIGN KEY (athlete_id) REFERENCES public.athletes(id) ON DELETE CASCADE;
ALTER TABLE public.scholarships ADD CONSTRAINT scholarships_created_by_profiles_id_fk FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.sport_branches ADD CONSTRAINT sport_branches_discipline_id_fkey FOREIGN KEY (discipline_id) REFERENCES public.sport_disciplines(id) ON DELETE CASCADE;
ALTER TABLE public.sport_locale_configs ADD CONSTRAINT sport_locale_configs_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.sport_branches(id) ON DELETE CASCADE;
ALTER TABLE public.sport_locale_configs ADD CONSTRAINT sport_locale_configs_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.countries(id) ON DELETE CASCADE;
ALTER TABLE public.sport_locale_configs ADD CONSTRAINT sport_locale_configs_discipline_id_fkey FOREIGN KEY (discipline_id) REFERENCES public.sport_disciplines(id) ON DELETE CASCADE;
ALTER TABLE public.stripe_accounts ADD CONSTRAINT stripe_accounts_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_plan_id_plans_id_fk FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE SET NULL;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_user_id_profiles_user_id_fk FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;
ALTER TABLE public.template_age_categories ADD CONSTRAINT template_age_categories_template_id_templates_id_fk FOREIGN KEY (template_id) REFERENCES public.templates(id) ON DELETE CASCADE;
ALTER TABLE public.template_apparatus ADD CONSTRAINT template_apparatus_template_id_templates_id_fk FOREIGN KEY (template_id) REFERENCES public.templates(id) ON DELETE CASCADE;
ALTER TABLE public.template_competition_flow ADD CONSTRAINT template_competition_flow_template_id_templates_id_fk FOREIGN KEY (template_id) REFERENCES public.templates(id) ON DELETE CASCADE;
ALTER TABLE public.template_competition_levels ADD CONSTRAINT template_competition_levels_template_id_templates_id_fk FOREIGN KEY (template_id) REFERENCES public.templates(id) ON DELETE CASCADE;
ALTER TABLE public.template_license_config ADD CONSTRAINT template_license_config_template_id_templates_id_fk FOREIGN KEY (template_id) REFERENCES public.templates(id) ON DELETE CASCADE;
ALTER TABLE public.template_scoring_config ADD CONSTRAINT template_scoring_config_template_id_templates_id_fk FOREIGN KEY (template_id) REFERENCES public.templates(id) ON DELETE CASCADE;
ALTER TABLE public.terminology_dictionary ADD CONSTRAINT terminology_dictionary_sport_locale_config_id_fkey FOREIGN KEY (sport_locale_config_id) REFERENCES public.sport_locale_configs(id) ON DELETE CASCADE;
ALTER TABLE public.ticket_attachments ADD CONSTRAINT ticket_attachments_response_id_ticket_responses_id_fk FOREIGN KEY (response_id) REFERENCES public.ticket_responses(id) ON DELETE CASCADE;
ALTER TABLE public.ticket_attachments ADD CONSTRAINT ticket_attachments_ticket_id_tickets_id_fk FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;
ALTER TABLE public.ticket_attachments ADD CONSTRAINT ticket_attachments_uploaded_by_profiles_id_fk FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.ticket_responses ADD CONSTRAINT ticket_responses_ticket_id_tickets_id_fk FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;
ALTER TABLE public.ticket_responses ADD CONSTRAINT ticket_responses_user_id_profiles_id_fk FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_academy_id_academies_id_fk FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_assigned_to_profiles_id_fk FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_created_by_profiles_id_fk FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.user_preferences ADD CONSTRAINT user_preferences_user_id_profiles_id_fk FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.athletes ADD CONSTRAINT athletes_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.athletes ADD CONSTRAINT athletes_person_fk FOREIGN KEY (organization_id, person_id) REFERENCES zaltyko.people(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.attendance_records ADD CONSTRAINT attendance_records_athlete_fk FOREIGN KEY (organization_id, athlete_id) REFERENCES zaltyko.athletes(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.attendance_records ADD CONSTRAINT attendance_records_enrollment_fk FOREIGN KEY (organization_id, enrollment_id) REFERENCES zaltyko.enrollments(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.attendance_records ADD CONSTRAINT attendance_records_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.attendance_records ADD CONSTRAINT attendance_records_member_fk FOREIGN KEY (organization_id, recorded_by_member_id) REFERENCES zaltyko.organization_members(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.attendance_records ADD CONSTRAINT attendance_records_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.attendance_records ADD CONSTRAINT attendance_records_session_fk FOREIGN KEY (organization_id, session_id) REFERENCES zaltyko.sessions(organization_id, id) ON DELETE CASCADE;
ALTER TABLE zaltyko.audit_log ADD CONSTRAINT audit_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE zaltyko.audit_log ADD CONSTRAINT audit_log_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.audit_log ADD CONSTRAINT audit_log_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.benchmark_metric_targets ADD CONSTRAINT benchmark_metric_targets_benchmark_profile_id_fkey FOREIGN KEY (benchmark_profile_id) REFERENCES zaltyko.benchmark_profiles(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.benchmark_metric_targets ADD CONSTRAINT benchmark_metric_targets_metric_key_fkey FOREIGN KEY (metric_key) REFERENCES zaltyko.metric_definitions(key) ON DELETE RESTRICT;
ALTER TABLE zaltyko.benchmark_profiles ADD CONSTRAINT benchmark_profiles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.charges ADD CONSTRAINT charges_enrollment_fk FOREIGN KEY (organization_id, enrollment_id) REFERENCES zaltyko.enrollments(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.charges ADD CONSTRAINT charges_family_fk FOREIGN KEY (organization_id, family_id) REFERENCES zaltyko.families(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.charges ADD CONSTRAINT charges_family_payer_fk FOREIGN KEY (organization_id, family_id, family_payer_id) REFERENCES zaltyko.family_payers(organization_id, family_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.charges ADD CONSTRAINT charges_invoice_fk FOREIGN KEY (organization_id, invoice_id, currency) REFERENCES zaltyko.invoices(organization_id, id, currency) ON DELETE RESTRICT;
ALTER TABLE zaltyko.charges ADD CONSTRAINT charges_invoice_line_fk FOREIGN KEY (organization_id, invoice_line_id, currency) REFERENCES zaltyko.invoice_lines(organization_id, id, currency) ON DELETE RESTRICT;
ALTER TABLE zaltyko.charges ADD CONSTRAINT charges_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.charges ADD CONSTRAINT charges_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.class_template_groups ADD CONSTRAINT class_template_groups_group_fk FOREIGN KEY (organization_id, group_id) REFERENCES zaltyko.groups(organization_id, id) ON DELETE CASCADE;
ALTER TABLE zaltyko.class_template_groups ADD CONSTRAINT class_template_groups_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.class_template_groups ADD CONSTRAINT class_template_groups_template_fk FOREIGN KEY (organization_id, class_template_id) REFERENCES zaltyko.class_templates(organization_id, id) ON DELETE CASCADE;
ALTER TABLE zaltyko.class_template_weekdays ADD CONSTRAINT class_template_weekdays_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.class_template_weekdays ADD CONSTRAINT class_template_weekdays_template_fk FOREIGN KEY (organization_id, class_template_id) REFERENCES zaltyko.class_templates(organization_id, id) ON DELETE CASCADE;
ALTER TABLE zaltyko.class_templates ADD CONSTRAINT class_templates_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.class_templates ADD CONSTRAINT class_templates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.class_templates ADD CONSTRAINT class_templates_program_fk FOREIGN KEY (organization_id, program_id) REFERENCES zaltyko.programs(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.class_templates ADD CONSTRAINT class_templates_space_fk FOREIGN KEY (organization_id, default_space_id) REFERENCES zaltyko.spaces(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.data_quality_issues ADD CONSTRAINT data_quality_issues_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.data_quality_issues ADD CONSTRAINT data_quality_issues_metric_key_fkey FOREIGN KEY (metric_key) REFERENCES zaltyko.metric_definitions(key) ON DELETE RESTRICT;
ALTER TABLE zaltyko.data_quality_issues ADD CONSTRAINT data_quality_issues_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.data_quality_issues ADD CONSTRAINT data_quality_issues_run_fk FOREIGN KEY (organization_id, metric_run_id) REFERENCES zaltyko.metric_runs(organization_id, id) ON DELETE CASCADE;
ALTER TABLE zaltyko.enrollment_pauses ADD CONSTRAINT enrollment_pauses_enrollment_fk FOREIGN KEY (organization_id, enrollment_id) REFERENCES zaltyko.enrollments(organization_id, id) ON DELETE CASCADE;
ALTER TABLE zaltyko.enrollment_pauses ADD CONSTRAINT enrollment_pauses_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.enrollment_price_assignments ADD CONSTRAINT enrollment_price_assignments_enrollment_fk FOREIGN KEY (organization_id, location_id, enrollment_id) REFERENCES zaltyko.enrollments(organization_id, location_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.enrollment_price_assignments ADD CONSTRAINT enrollment_price_assignments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.enrollment_price_assignments ADD CONSTRAINT enrollment_price_assignments_plan_fk FOREIGN KEY (organization_id, price_plan_id) REFERENCES zaltyko.price_plans(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.enrollment_status_history ADD CONSTRAINT enrollment_status_history_enrollment_fk FOREIGN KEY (organization_id, enrollment_id) REFERENCES zaltyko.enrollments(organization_id, id) ON DELETE CASCADE;
ALTER TABLE zaltyko.enrollment_status_history ADD CONSTRAINT enrollment_status_history_member_fk FOREIGN KEY (organization_id, changed_by_member_id) REFERENCES zaltyko.organization_members(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.enrollment_status_history ADD CONSTRAINT enrollment_status_history_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.enrollments ADD CONSTRAINT enrollments_athlete_fk FOREIGN KEY (organization_id, athlete_id) REFERENCES zaltyko.athletes(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.enrollments ADD CONSTRAINT enrollments_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.enrollments ADD CONSTRAINT enrollments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.enrollments ADD CONSTRAINT enrollments_price_plan_fk FOREIGN KEY (organization_id, price_plan_id) REFERENCES zaltyko.price_plans(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.enrollments ADD CONSTRAINT enrollments_template_fk FOREIGN KEY (organization_id, class_template_id) REFERENCES zaltyko.class_templates(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.facilities ADD CONSTRAINT facilities_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations(organization_id, id) ON DELETE CASCADE;
ALTER TABLE zaltyko.facilities ADD CONSTRAINT facilities_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.families ADD CONSTRAINT families_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.family_collection_preferences ADD CONSTRAINT family_collection_preferences_family_fk FOREIGN KEY (organization_id, family_id) REFERENCES zaltyko.families(organization_id, id) ON DELETE CASCADE;
ALTER TABLE zaltyko.family_collection_preferences ADD CONSTRAINT family_collection_preferences_member_fk FOREIGN KEY (organization_id, updated_by_member_id) REFERENCES zaltyko.organization_members(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.family_collection_preferences ADD CONSTRAINT family_collection_preferences_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.family_guardians ADD CONSTRAINT family_guardians_family_fk FOREIGN KEY (organization_id, family_id) REFERENCES zaltyko.families(organization_id, id) ON DELETE CASCADE;
ALTER TABLE zaltyko.family_guardians ADD CONSTRAINT family_guardians_guardian_fk FOREIGN KEY (organization_id, guardian_id) REFERENCES zaltyko.guardians(organization_id, id) ON DELETE CASCADE;
ALTER TABLE zaltyko.family_guardians ADD CONSTRAINT family_guardians_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.family_members ADD CONSTRAINT family_members_athlete_fk FOREIGN KEY (organization_id, athlete_id) REFERENCES zaltyko.athletes(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.family_members ADD CONSTRAINT family_members_family_fk FOREIGN KEY (organization_id, family_id) REFERENCES zaltyko.families(organization_id, id) ON DELETE CASCADE;
ALTER TABLE zaltyko.family_members ADD CONSTRAINT family_members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.family_payers ADD CONSTRAINT family_payers_family_guardian_link_fk FOREIGN KEY (organization_id, family_id, guardian_id) REFERENCES zaltyko.family_guardians(organization_id, family_id, guardian_id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.family_payers ADD CONSTRAINT family_payers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.family_payment_authorizations ADD CONSTRAINT family_payment_authorizations_guardian_fk FOREIGN KEY (organization_id, family_id, consented_by_guardian_id) REFERENCES zaltyko.family_guardians(organization_id, family_id, guardian_id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.family_payment_authorizations ADD CONSTRAINT family_payment_authorizations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.family_payment_authorizations ADD CONSTRAINT family_payment_authorizations_payer_fk FOREIGN KEY (organization_id, family_id, family_payer_id) REFERENCES zaltyko.family_payers(organization_id, family_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.family_payment_authorizations ADD CONSTRAINT family_payment_authorizations_provider_account_fk FOREIGN KEY (organization_id, payment_provider_account_id) REFERENCES zaltyko.organization_payment_provider_accounts(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.financial_reconciliation_runs ADD CONSTRAINT financial_reconciliation_runs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.group_membership_history ADD CONSTRAINT group_membership_history_member_fk FOREIGN KEY (organization_id, changed_by_member_id) REFERENCES zaltyko.organization_members(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.group_membership_history ADD CONSTRAINT group_membership_history_membership_fk FOREIGN KEY (organization_id, membership_id) REFERENCES zaltyko.group_memberships(organization_id, id) ON DELETE CASCADE;
ALTER TABLE zaltyko.group_membership_history ADD CONSTRAINT group_membership_history_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.group_memberships ADD CONSTRAINT group_memberships_athlete_fk FOREIGN KEY (organization_id, athlete_id) REFERENCES zaltyko.athletes(organization_id, id) ON DELETE CASCADE;
ALTER TABLE zaltyko.group_memberships ADD CONSTRAINT group_memberships_group_fk FOREIGN KEY (organization_id, group_id) REFERENCES zaltyko.groups(organization_id, id) ON DELETE CASCADE;
ALTER TABLE zaltyko.group_memberships ADD CONSTRAINT group_memberships_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.groups ADD CONSTRAINT groups_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.groups ADD CONSTRAINT groups_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.groups ADD CONSTRAINT groups_program_fk FOREIGN KEY (organization_id, program_id) REFERENCES zaltyko.programs(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.guardian_contacts ADD CONSTRAINT guardian_contacts_guardian_fk FOREIGN KEY (organization_id, guardian_id) REFERENCES zaltyko.guardians(organization_id, id) ON DELETE CASCADE;
ALTER TABLE zaltyko.guardian_contacts ADD CONSTRAINT guardian_contacts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.guardians ADD CONSTRAINT guardians_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE zaltyko.guardians ADD CONSTRAINT guardians_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.guardians ADD CONSTRAINT guardians_person_fk FOREIGN KEY (organization_id, person_id) REFERENCES zaltyko.people(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.health_score_dimension_snapshots ADD CONSTRAINT health_score_dimension_snapshots_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.health_score_dimension_snapshots ADD CONSTRAINT health_score_dimension_snapshots_parent_fk FOREIGN KEY (organization_id, health_score_snapshot_id) REFERENCES zaltyko.health_score_snapshots(organization_id, id) ON DELETE CASCADE;
ALTER TABLE zaltyko.health_score_dimension_weights ADD CONSTRAINT health_score_dimension_weights_health_score_version_id_fkey FOREIGN KEY (health_score_version_id) REFERENCES zaltyko.health_score_versions(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.health_score_metric_contributions ADD CONSTRAINT health_score_metric_contributions_benchmark_target_id_fkey FOREIGN KEY (benchmark_target_id) REFERENCES zaltyko.benchmark_metric_targets(id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.health_score_metric_contributions ADD CONSTRAINT health_score_metric_contributions_metric_key_fkey FOREIGN KEY (metric_key) REFERENCES zaltyko.metric_definitions(key) ON DELETE RESTRICT;
ALTER TABLE zaltyko.health_score_metric_contributions ADD CONSTRAINT health_score_metric_contributions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.health_score_metric_contributions ADD CONSTRAINT health_score_metric_contributions_parent_fk FOREIGN KEY (organization_id, health_score_snapshot_id) REFERENCES zaltyko.health_score_snapshots(organization_id, id) ON DELETE CASCADE;
ALTER TABLE zaltyko.health_score_metric_contributions ADD CONSTRAINT health_score_metric_contributions_value_fk FOREIGN KEY (organization_id, metric_run_value_id) REFERENCES zaltyko.metric_run_values(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.health_score_metric_weights ADD CONSTRAINT health_score_metric_weights_health_score_version_id_fkey FOREIGN KEY (health_score_version_id) REFERENCES zaltyko.health_score_versions(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.health_score_metric_weights ADD CONSTRAINT health_score_metric_weights_metric_key_fkey FOREIGN KEY (metric_key) REFERENCES zaltyko.metric_definitions(key) ON DELETE RESTRICT;
ALTER TABLE zaltyko.health_score_snapshots ADD CONSTRAINT health_score_snapshots_benchmark_profile_id_fkey FOREIGN KEY (benchmark_profile_id) REFERENCES zaltyko.benchmark_profiles(id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.health_score_snapshots ADD CONSTRAINT health_score_snapshots_health_score_version_id_fkey FOREIGN KEY (health_score_version_id) REFERENCES zaltyko.health_score_versions(id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.health_score_snapshots ADD CONSTRAINT health_score_snapshots_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.health_score_snapshots ADD CONSTRAINT health_score_snapshots_metric_run_fk FOREIGN KEY (organization_id, metric_run_id) REFERENCES zaltyko.metric_runs(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.health_score_snapshots ADD CONSTRAINT health_score_snapshots_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.insight_actions ADD CONSTRAINT insight_actions_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.insight_actions ADD CONSTRAINT insight_actions_insight_fk FOREIGN KEY (organization_id, insight_id) REFERENCES zaltyko.insights(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.insight_actions ADD CONSTRAINT insight_actions_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.insight_actions ADD CONSTRAINT insight_actions_member_fk FOREIGN KEY (organization_id, actor_member_id) REFERENCES zaltyko.organization_members(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.insight_actions ADD CONSTRAINT insight_actions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.insight_notifications ADD CONSTRAINT insight_notifications_insight_fk FOREIGN KEY (organization_id, insight_id) REFERENCES zaltyko.insights(organization_id, id) ON DELETE CASCADE;
ALTER TABLE zaltyko.insight_notifications ADD CONSTRAINT insight_notifications_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.insight_rule_runs ADD CONSTRAINT insight_rule_runs_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.insight_rule_runs ADD CONSTRAINT insight_rule_runs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.insight_rule_runs ADD CONSTRAINT insight_rule_runs_rule_version_id_fkey FOREIGN KEY (rule_version_id) REFERENCES zaltyko.insight_rule_versions(id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.insight_run_observations ADD CONSTRAINT insight_run_observations_insight_fk FOREIGN KEY (organization_id, insight_id) REFERENCES zaltyko.insights(organization_id, id) ON DELETE CASCADE;
ALTER TABLE zaltyko.insight_run_observations ADD CONSTRAINT insight_run_observations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.insight_run_observations ADD CONSTRAINT insight_run_observations_run_fk FOREIGN KEY (organization_id, rule_run_id) REFERENCES zaltyko.insight_rule_runs(organization_id, id) ON DELETE CASCADE;
ALTER TABLE zaltyko.insight_status_history ADD CONSTRAINT insight_status_history_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE zaltyko.insight_status_history ADD CONSTRAINT insight_status_history_insight_fk FOREIGN KEY (organization_id, insight_id) REFERENCES zaltyko.insights(organization_id, id) ON DELETE CASCADE;
ALTER TABLE zaltyko.insight_status_history ADD CONSTRAINT insight_status_history_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.insight_status_history ADD CONSTRAINT insight_status_history_run_fk FOREIGN KEY (organization_id, rule_run_id) REFERENCES zaltyko.insight_rule_runs(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_health_snapshot_fk FOREIGN KEY (organization_id, source_health_score_snapshot_id) REFERENCES zaltyko.health_score_snapshots(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_metric_run_fk FOREIGN KEY (organization_id, source_metric_run_id) REFERENCES zaltyko.metric_runs(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_rule_version_id_fkey FOREIGN KEY (rule_version_id) REFERENCES zaltyko.insight_rule_versions(id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.invoice_line_enrollments ADD CONSTRAINT invoice_line_enrollments_athlete_fk FOREIGN KEY (organization_id, athlete_id) REFERENCES zaltyko.athletes(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.invoice_line_enrollments ADD CONSTRAINT invoice_line_enrollments_class_template_fk FOREIGN KEY (organization_id, location_id, class_template_id) REFERENCES zaltyko.class_templates(organization_id, location_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.invoice_line_enrollments ADD CONSTRAINT invoice_line_enrollments_enrollment_fk FOREIGN KEY (organization_id, location_id, athlete_id, class_template_id, enrollment_id) REFERENCES zaltyko.enrollments(organization_id, location_id, athlete_id, class_template_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.invoice_line_enrollments ADD CONSTRAINT invoice_line_enrollments_line_fk FOREIGN KEY (organization_id, location_id, athlete_id, price_plan_id, invoice_line_id) REFERENCES zaltyko.invoice_lines(organization_id, location_id, athlete_id, price_plan_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.invoice_line_enrollments ADD CONSTRAINT invoice_line_enrollments_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.invoice_line_enrollments ADD CONSTRAINT invoice_line_enrollments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.invoice_line_enrollments ADD CONSTRAINT invoice_line_enrollments_price_assignment_fk FOREIGN KEY (organization_id, location_id, price_plan_id, enrollment_id, price_assignment_id) REFERENCES zaltyko.enrollment_price_assignments(organization_id, location_id, price_plan_id, enrollment_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.invoice_lines ADD CONSTRAINT invoice_lines_athlete_fk FOREIGN KEY (organization_id, athlete_id) REFERENCES zaltyko.athletes(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.invoice_lines ADD CONSTRAINT invoice_lines_enrollment_fk FOREIGN KEY (organization_id, enrollment_id) REFERENCES zaltyko.enrollments(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.invoice_lines ADD CONSTRAINT invoice_lines_invoice_fk FOREIGN KEY (organization_id, invoice_id, currency) REFERENCES zaltyko.invoices(organization_id, id, currency) ON DELETE CASCADE;
ALTER TABLE zaltyko.invoice_lines ADD CONSTRAINT invoice_lines_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.invoice_lines ADD CONSTRAINT invoice_lines_location_invoice_fk FOREIGN KEY (organization_id, location_id, invoice_id) REFERENCES zaltyko.invoices(organization_id, location_id, id) ON DELETE CASCADE;
ALTER TABLE zaltyko.invoice_lines ADD CONSTRAINT invoice_lines_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.invoice_lines ADD CONSTRAINT invoice_lines_price_plan_fk FOREIGN KEY (organization_id, price_plan_id) REFERENCES zaltyko.price_plans(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.invoices ADD CONSTRAINT invoices_family_fk FOREIGN KEY (organization_id, family_id) REFERENCES zaltyko.families(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.invoices ADD CONSTRAINT invoices_family_payer_fk FOREIGN KEY (organization_id, family_id, family_payer_id) REFERENCES zaltyko.family_payers(organization_id, family_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.invoices ADD CONSTRAINT invoices_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.invoices ADD CONSTRAINT invoices_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.locations ADD CONSTRAINT locations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.member_location_scopes ADD CONSTRAINT member_location_scopes_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations(organization_id, id) ON DELETE CASCADE;
ALTER TABLE zaltyko.member_location_scopes ADD CONSTRAINT member_location_scopes_member_fk FOREIGN KEY (organization_id, member_id) REFERENCES zaltyko.organization_members(organization_id, id) ON DELETE CASCADE;
ALTER TABLE zaltyko.member_location_scopes ADD CONSTRAINT member_location_scopes_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.metric_event_consumptions ADD CONSTRAINT metric_event_consumptions_event_fk FOREIGN KEY (organization_id, outbox_event_id) REFERENCES zaltyko.outbox_events(organization_id, id) ON DELETE CASCADE;
ALTER TABLE zaltyko.metric_event_consumptions ADD CONSTRAINT metric_event_consumptions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.metric_invalidations ADD CONSTRAINT metric_invalidations_event_fk FOREIGN KEY (organization_id, outbox_event_id) REFERENCES zaltyko.outbox_events(organization_id, id) ON DELETE CASCADE;
ALTER TABLE zaltyko.metric_invalidations ADD CONSTRAINT metric_invalidations_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.metric_invalidations ADD CONSTRAINT metric_invalidations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.metric_run_values ADD CONSTRAINT metric_run_values_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.metric_run_values ADD CONSTRAINT metric_run_values_metric_key_fkey FOREIGN KEY (metric_key) REFERENCES zaltyko.metric_definitions(key) ON DELETE RESTRICT;
ALTER TABLE zaltyko.metric_run_values ADD CONSTRAINT metric_run_values_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.metric_run_values ADD CONSTRAINT metric_run_values_run_fk FOREIGN KEY (organization_id, metric_run_id) REFERENCES zaltyko.metric_runs(organization_id, id) ON DELETE CASCADE;
ALTER TABLE zaltyko.metric_runs ADD CONSTRAINT metric_runs_authorization_location_fk FOREIGN KEY (organization_id, authorization_location_id) REFERENCES zaltyko.locations(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.metric_runs ADD CONSTRAINT metric_runs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.metric_values ADD CONSTRAINT metric_values_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.metric_values ADD CONSTRAINT metric_values_metric_key_fkey FOREIGN KEY (metric_key) REFERENCES zaltyko.metric_definitions(key) ON DELETE RESTRICT;
ALTER TABLE zaltyko.metric_values ADD CONSTRAINT metric_values_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.metric_values ADD CONSTRAINT metric_values_run_fk FOREIGN KEY (organization_id, metric_run_id) REFERENCES zaltyko.metric_runs(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.organization_bootstrap_commands ADD CONSTRAINT organization_bootstrap_commands_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations(organization_id, id) ON DELETE CASCADE;
ALTER TABLE zaltyko.organization_bootstrap_commands ADD CONSTRAINT organization_bootstrap_commands_member_fk FOREIGN KEY (organization_id, member_id) REFERENCES zaltyko.organization_members(organization_id, id) ON DELETE CASCADE;
ALTER TABLE zaltyko.organization_bootstrap_commands ADD CONSTRAINT organization_bootstrap_commands_organization_fk FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.organization_bootstrap_commands ADD CONSTRAINT organization_bootstrap_commands_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.organization_entitlement_changes ADD CONSTRAINT organization_entitlement_changes_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.organization_entitlement_changes ADD CONSTRAINT organization_entitlement_changes_subscription_fk FOREIGN KEY (organization_id, subscription_id) REFERENCES zaltyko.organization_saas_subscriptions(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.organization_entitlement_changes ADD CONSTRAINT organization_entitlement_changes_trial_fk FOREIGN KEY (organization_id, trial_id) REFERENCES zaltyko.organization_saas_trials(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.organization_entitlements ADD CONSTRAINT organization_entitlements_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.organization_entitlements ADD CONSTRAINT organization_entitlements_subscription_fk FOREIGN KEY (organization_id, subscription_id) REFERENCES zaltyko.organization_saas_subscriptions(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.organization_entitlements ADD CONSTRAINT organization_entitlements_trial_fk FOREIGN KEY (organization_id, trial_id) REFERENCES zaltyko.organization_saas_trials(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.organization_members ADD CONSTRAINT organization_members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.organization_members ADD CONSTRAINT organization_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.organization_payment_provider_accounts ADD CONSTRAINT organization_payment_provider_accounts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operations_customer_fk FOREIGN KEY (organization_id, customer_id, environment, provider_account_reference) REFERENCES zaltyko.organization_saas_customers(organization_id, id, environment, provider_account_reference) ON DELETE RESTRICT;
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operations_owner_fk FOREIGN KEY (organization_id, requested_by_member_id) REFERENCES zaltyko.organization_members(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.organization_saas_customers ADD CONSTRAINT organization_saas_customers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.organization_saas_subscriptions ADD CONSTRAINT organization_saas_subscriptions_customer_fk FOREIGN KEY (organization_id, environment, provider_account_reference, customer_reference) REFERENCES zaltyko.organization_saas_customers(organization_id, environment, provider_account_reference, customer_reference) ON DELETE RESTRICT NOT VALID;
ALTER TABLE zaltyko.organization_saas_subscriptions ADD CONSTRAINT organization_saas_subscriptions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.organization_saas_trials ADD CONSTRAINT organization_saas_trials_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.organization_saas_trials ADD CONSTRAINT organization_saas_trials_starter_fk FOREIGN KEY (organization_id, started_by_member_id) REFERENCES zaltyko.organization_members(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT organization_saas_webhook_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE SET NULL;
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT saas_webhook_event_reconciliation_fk FOREIGN KEY (organization_id, id, reconciliation_decision_id) REFERENCES zaltyko.organization_saas_webhook_reconciliation_decisions(organization_id, webhook_event_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.organization_saas_webhook_payload_conflicts ADD CONSTRAINT organization_saas_webhook_payload_conflic_webhook_event_id_fkey FOREIGN KEY (webhook_event_id) REFERENCES zaltyko.organization_saas_webhook_events(id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_reconciliation_d_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_reconciliation_dec_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT saas_webhook_reconciliation_event_fk FOREIGN KEY (organization_id, webhook_event_id) REFERENCES zaltyko.organization_saas_webhook_events(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_results ADD CONSTRAINT organization_saas_webhook_reconciliation_resul_decision_id_fkey FOREIGN KEY (decision_id) REFERENCES zaltyko.organization_saas_webhook_reconciliation_decisions(id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.organization_sports ADD CONSTRAINT organization_sports_country_fk FOREIGN KEY (organization_id, country_code) REFERENCES zaltyko.organizations(id, country_code) ON DELETE CASCADE;
ALTER TABLE zaltyko.organization_sports ADD CONSTRAINT organization_sports_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.organization_sports ADD CONSTRAINT organization_sports_profile_fk FOREIGN KEY (country_code, sport_profile_id) REFERENCES zaltyko.sport_profiles(country_code, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.outbox_events ADD CONSTRAINT outbox_events_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.outbox_events ADD CONSTRAINT outbox_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.owner_dashboard_layouts ADD CONSTRAINT owner_dashboard_layouts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.owner_dashboard_layouts ADD CONSTRAINT owner_dashboard_layouts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.owner_signup_consents ADD CONSTRAINT owner_signup_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.payment_allocations ADD CONSTRAINT payment_allocations_charge_fk FOREIGN KEY (organization_id, charge_id, currency) REFERENCES zaltyko.charges(organization_id, id, currency) ON DELETE RESTRICT;
ALTER TABLE zaltyko.payment_allocations ADD CONSTRAINT payment_allocations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.payment_allocations ADD CONSTRAINT payment_allocations_payment_fk FOREIGN KEY (organization_id, payment_id, currency) REFERENCES zaltyko.payments(organization_id, id, currency) ON DELETE RESTRICT;
ALTER TABLE zaltyko.payment_attempts ADD CONSTRAINT payment_attempts_family_fk FOREIGN KEY (organization_id, family_id) REFERENCES zaltyko.families(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.payment_attempts ADD CONSTRAINT payment_attempts_family_payer_fk FOREIGN KEY (organization_id, family_id, family_payer_id) REFERENCES zaltyko.family_payers(organization_id, family_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.payment_attempts ADD CONSTRAINT payment_attempts_invoice_fk FOREIGN KEY (organization_id, invoice_id, currency) REFERENCES zaltyko.invoices(organization_id, id, currency) ON DELETE RESTRICT;
ALTER TABLE zaltyko.payment_attempts ADD CONSTRAINT payment_attempts_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.payment_attempts ADD CONSTRAINT payment_attempts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.payment_attempts ADD CONSTRAINT payment_attempts_payment_fk FOREIGN KEY (organization_id, payment_id, currency) REFERENCES zaltyko.payments(organization_id, id, currency) ON DELETE RESTRICT;
ALTER TABLE zaltyko.payment_attempts ADD CONSTRAINT payment_attempts_provider_event_fk FOREIGN KEY (organization_id, provider_event_id) REFERENCES zaltyko.payment_provider_events(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.payment_provider_events ADD CONSTRAINT payment_provider_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.payments ADD CONSTRAINT payments_family_fk FOREIGN KEY (organization_id, family_id) REFERENCES zaltyko.families(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.payments ADD CONSTRAINT payments_family_payer_fk FOREIGN KEY (organization_id, family_id, family_payer_id) REFERENCES zaltyko.family_payers(organization_id, family_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.payments ADD CONSTRAINT payments_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.payments ADD CONSTRAINT payments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.payments ADD CONSTRAINT payments_recorded_by_user_id_fkey FOREIGN KEY (recorded_by_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.people ADD CONSTRAINT people_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.price_plan_class_template_coverage ADD CONSTRAINT price_plan_class_template_coverage_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.price_plan_class_template_coverage ADD CONSTRAINT price_plan_class_template_coverage_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.price_plan_class_template_coverage ADD CONSTRAINT price_plan_class_template_coverage_plan_fk FOREIGN KEY (organization_id, price_plan_id) REFERENCES zaltyko.price_plans(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.price_plan_class_template_coverage ADD CONSTRAINT price_plan_class_template_coverage_template_fk FOREIGN KEY (organization_id, location_id, class_template_id) REFERENCES zaltyko.class_templates(organization_id, location_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.price_plans ADD CONSTRAINT price_plans_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.programs ADD CONSTRAINT programs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.programs ADD CONSTRAINT programs_organization_sport_fk FOREIGN KEY (organization_id, organization_sport_id) REFERENCES zaltyko.organization_sports(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.refunds ADD CONSTRAINT refunds_allocation_fk FOREIGN KEY (organization_id, payment_allocation_id, currency) REFERENCES zaltyko.payment_allocations(organization_id, id, currency) ON DELETE RESTRICT;
ALTER TABLE zaltyko.refunds ADD CONSTRAINT refunds_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.refunds ADD CONSTRAINT refunds_payment_fk FOREIGN KEY (organization_id, payment_id, currency) REFERENCES zaltyko.payments(organization_id, id, currency) ON DELETE RESTRICT;
ALTER TABLE zaltyko.refunds ADD CONSTRAINT refunds_provider_event_fk FOREIGN KEY (organization_id, provider_event_id) REFERENCES zaltyko.payment_provider_events(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.retention_cohort_projection_runs ADD CONSTRAINT retention_cohort_projection_runs_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.retention_cohort_projection_runs ADD CONSTRAINT retention_cohort_projection_runs_metric_run_fk FOREIGN KEY (organization_id, metric_run_id) REFERENCES zaltyko.metric_runs(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.retention_cohort_projection_runs ADD CONSTRAINT retention_cohort_projection_runs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.retention_cohort_projections ADD CONSTRAINT retention_cohort_projections_group_fk FOREIGN KEY (organization_id, group_id) REFERENCES zaltyko.groups(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.retention_cohort_projections ADD CONSTRAINT retention_cohort_projections_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.retention_cohort_projections ADD CONSTRAINT retention_cohort_projections_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.retention_cohort_projections ADD CONSTRAINT retention_cohort_projections_program_fk FOREIGN KEY (organization_id, program_id) REFERENCES zaltyko.programs(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.retention_cohort_projections ADD CONSTRAINT retention_cohort_projections_run_fk FOREIGN KEY (organization_id, projection_run_id) REFERENCES zaltyko.retention_cohort_projection_runs(organization_id, id) ON DELETE CASCADE;
ALTER TABLE zaltyko.session_staff ADD CONSTRAINT session_staff_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.session_staff ADD CONSTRAINT session_staff_profile_fk FOREIGN KEY (organization_id, staff_profile_id) REFERENCES zaltyko.staff_profiles(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.session_staff ADD CONSTRAINT session_staff_session_fk FOREIGN KEY (organization_id, session_id) REFERENCES zaltyko.sessions(organization_id, id) ON DELETE CASCADE;
ALTER TABLE zaltyko.sessions ADD CONSTRAINT sessions_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.sessions ADD CONSTRAINT sessions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.sessions ADD CONSTRAINT sessions_space_fk FOREIGN KEY (organization_id, space_id) REFERENCES zaltyko.spaces(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.sessions ADD CONSTRAINT sessions_template_fk FOREIGN KEY (organization_id, class_template_id) REFERENCES zaltyko.class_templates(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.spaces ADD CONSTRAINT spaces_facility_fk FOREIGN KEY (organization_id, facility_id) REFERENCES zaltyko.facilities(organization_id, id) ON DELETE CASCADE;
ALTER TABLE zaltyko.spaces ADD CONSTRAINT spaces_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations(organization_id, id) ON DELETE CASCADE;
ALTER TABLE zaltyko.spaces ADD CONSTRAINT spaces_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.staff_profiles ADD CONSTRAINT staff_profiles_member_fk FOREIGN KEY (organization_id, member_id) REFERENCES zaltyko.organization_members(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.staff_profiles ADD CONSTRAINT staff_profiles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.staff_profiles ADD CONSTRAINT staff_profiles_person_fk FOREIGN KEY (organization_id, person_id) REFERENCES zaltyko.people(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.trial_followups ADD CONSTRAINT trial_followups_member_fk FOREIGN KEY (organization_id, completed_by_member_id) REFERENCES zaltyko.organization_members(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.trial_followups ADD CONSTRAINT trial_followups_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.trial_followups ADD CONSTRAINT trial_followups_trial_fk FOREIGN KEY (organization_id, location_id, trial_id) REFERENCES zaltyko.trials(organization_id, location_id, id) ON DELETE CASCADE;
ALTER TABLE zaltyko.trial_status_history ADD CONSTRAINT trial_status_history_member_fk FOREIGN KEY (organization_id, changed_by_member_id) REFERENCES zaltyko.organization_members(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.trial_status_history ADD CONSTRAINT trial_status_history_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.trial_status_history ADD CONSTRAINT trial_status_history_trial_fk FOREIGN KEY (organization_id, location_id, trial_id) REFERENCES zaltyko.trials(organization_id, location_id, id) ON DELETE CASCADE;
ALTER TABLE zaltyko.trials ADD CONSTRAINT trials_athlete_fk FOREIGN KEY (organization_id, athlete_id) REFERENCES zaltyko.athletes(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.trials ADD CONSTRAINT trials_converted_enrollment_fk FOREIGN KEY (organization_id, location_id, converted_enrollment_id) REFERENCES zaltyko.enrollments(organization_id, location_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.trials ADD CONSTRAINT trials_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.trials ADD CONSTRAINT trials_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.trials ADD CONSTRAINT trials_session_fk FOREIGN KEY (organization_id, location_id, session_id) REFERENCES zaltyko.sessions(organization_id, location_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.trials ADD CONSTRAINT trials_trial_enrollment_fk FOREIGN KEY (organization_id, location_id, trial_enrollment_id) REFERENCES zaltyko.enrollments(organization_id, location_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.waitlist_entries ADD CONSTRAINT waitlist_entries_athlete_fk FOREIGN KEY (organization_id, athlete_id) REFERENCES zaltyko.athletes(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.waitlist_entries ADD CONSTRAINT waitlist_entries_contact_guardian_fk FOREIGN KEY (organization_id, contact_guardian_id) REFERENCES zaltyko.guardians(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.waitlist_entries ADD CONSTRAINT waitlist_entries_converted_enrollment_fk FOREIGN KEY (organization_id, location_id, converted_enrollment_id) REFERENCES zaltyko.enrollments(organization_id, location_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.waitlist_entries ADD CONSTRAINT waitlist_entries_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.waitlist_entries ADD CONSTRAINT waitlist_entries_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.waitlist_entries ADD CONSTRAINT waitlist_entries_program_fk FOREIGN KEY (organization_id, program_id) REFERENCES zaltyko.programs(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.waitlist_entries ADD CONSTRAINT waitlist_entries_source_trial_fk FOREIGN KEY (organization_id, location_id, source_trial_id) REFERENCES zaltyko.trials(organization_id, location_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.waitlist_entries ADD CONSTRAINT waitlist_entries_template_fk FOREIGN KEY (organization_id, location_id, class_template_id) REFERENCES zaltyko.class_templates(organization_id, location_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.waitlist_offers ADD CONSTRAINT waitlist_offers_enrollment_fk FOREIGN KEY (organization_id, location_id, reserved_enrollment_id) REFERENCES zaltyko.enrollments(organization_id, location_id, id) ON DELETE RESTRICT;
ALTER TABLE zaltyko.waitlist_offers ADD CONSTRAINT waitlist_offers_entry_fk FOREIGN KEY (organization_id, location_id, waitlist_entry_id) REFERENCES zaltyko.waitlist_entries(organization_id, location_id, id) ON DELETE CASCADE;
ALTER TABLE zaltyko.waitlist_offers ADD CONSTRAINT waitlist_offers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations(id) ON DELETE CASCADE;
ALTER TABLE zaltyko.waitlist_offers ADD CONSTRAINT waitlist_offers_template_fk FOREIGN KEY (organization_id, location_id, class_template_id) REFERENCES zaltyko.class_templates(organization_id, location_id, id) ON DELETE RESTRICT;

-- pg_get_functiondef does not append SQL terminators; closures were normalized.
CREATE OR REPLACE FUNCTION public.athlete_invitations_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.athlete_invitations_set_updated_at() OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.current_policy_version()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT value FROM public.app_config
  WHERE key = 'consent.policy_version'
  LIMIT 1;
$function$;

ALTER FUNCTION public.current_policy_version() OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.directory_withdraw_deleted_authority()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
 IF TG_TABLE_NAME='academies' THEN UPDATE directory_entries SET publication='withdrawn',updated_at=now() WHERE academy_id=OLD.id;
 ELSE UPDATE directory_entries SET publication='withdrawn',updated_at=now() WHERE event_id=OLD.id; END IF;
 RETURN OLD;
END $function$;

ALTER FUNCTION public.directory_withdraw_deleted_authority() OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.is_academy_blocked_from_sending(target uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.academies AS a
    WHERE a.id = target
      AND (
        a.status IN ('suspended', 'churned', 'fraud_hold')
        OR a.is_suspended = true
      )
  );
$function$;

ALTER FUNCTION public.is_academy_blocked_from_sending(target uuid) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ SELECT zaltyko_private.is_super_admin() $function$;

ALTER FUNCTION public.is_super_admin() OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.owner_consent_audit_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RAISE EXCEPTION 'owner_consent_audit is append-only (C4)';
END;
$function$;

ALTER FUNCTION public.owner_consent_audit_append_only() OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.set_updated_at() OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.sync_academy_status_from_legacy()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$;

ALTER FUNCTION public.sync_academy_status_from_legacy() OWNER TO postgres;

CREATE OR REPLACE FUNCTION zaltyko.guard_entitlement_revision()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'zaltyko'
AS $function$
BEGIN
  IF ROW(NEW.plan_code, NEW.source, NEW.source_reference, NEW.subscription_id,
         NEW.trial_id, NEW.effective_from, NEW.effective_until)
     IS DISTINCT FROM
     ROW(OLD.plan_code, OLD.source, OLD.source_reference, OLD.subscription_id,
         OLD.trial_id, OLD.effective_from, OLD.effective_until) THEN
    NEW.revision := OLD.revision + 1;
  ELSE
    NEW.revision := OLD.revision;
  END IF;
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

ALTER FUNCTION zaltyko.guard_entitlement_revision() OWNER TO postgres;

CREATE OR REPLACE FUNCTION zaltyko.guard_organization_saas_trial()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'zaltyko'
AS $function$
DECLARE
  latest_cooldown timestamptz;
  has_paid_entitlement boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Acquire the shared mutex before sampling time or checking entitlement.
    PERFORM 1 FROM zaltyko.organizations
      WHERE id = NEW.organization_id FOR UPDATE;
    IF NEW.status <> 'active' THEN
      RAISE EXCEPTION 'SaaS trial must be activated from active state'
        USING ERRCODE = '23514';
    END IF;
    -- Never accept a client-supplied timestamp that could bypass cooldown.
    NEW.status := 'active';
    NEW.started_at := clock_timestamp();
    NEW.ends_at :=
      (((NEW.started_at AT TIME ZONE 'UTC') + interval '7 days') AT TIME ZONE 'UTC');
    NEW.cooldown_ends_at :=
      (((NEW.started_at AT TIME ZONE 'UTC') + interval '12 months') AT TIME ZONE 'UTC');
    NEW.ended_at := NULL;
    NEW.converted_at := NULL;

    SELECT max(t.cooldown_ends_at)
      INTO latest_cooldown
      FROM zaltyko.organization_saas_trials AS t
      WHERE t.organization_id = NEW.organization_id;
    IF latest_cooldown IS NOT NULL AND latest_cooldown > NEW.started_at THEN
      RAISE EXCEPTION 'SaaS trial cooldown has not elapsed'
        USING ERRCODE = '23514';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM zaltyko.organization_entitlements AS e
      WHERE e.organization_id = NEW.organization_id
        AND e.plan_code <> 'free'
        AND e.effective_from <= NEW.started_at
        AND (e.effective_until IS NULL OR e.effective_until > NEW.started_at)
    ) INTO has_paid_entitlement;
    IF has_paid_entitlement THEN
      RAISE EXCEPTION 'paid SaaS entitlement is active'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF ROW(NEW.organization_id, NEW.started_by_member_id, NEW.idempotency_key,
         NEW.request_hash, NEW.started_at, NEW.ends_at, NEW.cooldown_ends_at)
     IS DISTINCT FROM
     ROW(OLD.organization_id, OLD.started_by_member_id, OLD.idempotency_key,
         OLD.request_hash, OLD.started_at, OLD.ends_at, OLD.cooldown_ends_at) THEN
    RAISE EXCEPTION 'SaaS trial identity is immutable'
      USING ERRCODE = '55000';
  END IF;
  IF OLD.status = 'active' THEN
    IF NEW.status = 'active' THEN
      IF NEW.ended_at IS NOT NULL OR NEW.converted_at IS NOT NULL THEN
        RAISE EXCEPTION 'active SaaS trial cannot have terminal timestamps'
          USING ERRCODE = '55000';
      END IF;
    ELSIF NEW.status = 'expired' THEN
      IF OLD.ends_at > clock_timestamp() THEN
        RAISE EXCEPTION 'SaaS trial cannot expire before its end'
          USING ERRCODE = '23514';
      END IF;
      NEW.ended_at := OLD.ends_at;
      NEW.converted_at := NULL;
    ELSIF NEW.status = 'converted' THEN
      NEW.converted_at := clock_timestamp();
      NEW.ended_at := NEW.converted_at;
    ELSIF NEW.status = 'cancelled' THEN
      NEW.ended_at := clock_timestamp();
      NEW.converted_at := NULL;
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.ended_at IS DISTINCT FROM OLD.ended_at
     OR NEW.converted_at IS DISTINCT FROM OLD.converted_at THEN
    RAISE EXCEPTION 'terminal SaaS trial state and timestamps are immutable'
      USING ERRCODE = '55000';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$function$;

ALTER FUNCTION zaltyko.guard_organization_saas_trial() OWNER TO postgres;

CREATE OR REPLACE FUNCTION zaltyko.guard_organization_saas_webhook_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'zaltyko'
AS $function$
BEGIN
  IF ROW(NEW.id, NEW.provider, NEW.provider_account_reference, NEW.environment,
         NEW.provider_event_id, NEW.event_account_reference, NEW.event_type,
         NEW.event_created_at, NEW.provider_object_type,
         NEW.provider_object_reference, NEW.livemode, NEW.signature_verified,
         NEW.payload_sha256, NEW.received_at)
     IS DISTINCT FROM
     ROW(OLD.id, OLD.provider, OLD.provider_account_reference, OLD.environment,
         OLD.provider_event_id, OLD.event_account_reference, OLD.event_type,
         OLD.event_created_at, OLD.provider_object_type,
         OLD.provider_object_reference, OLD.livemode, OLD.signature_verified,
         OLD.payload_sha256, OLD.received_at) THEN
    RAISE EXCEPTION 'SaaS webhook event identity is immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$function$;

ALTER FUNCTION zaltyko.guard_organization_saas_webhook_identity() OWNER TO postgres;

CREATE OR REPLACE FUNCTION zaltyko.guard_saas_reconciliation_decision_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'zaltyko'
AS $function$
DECLARE
  event_row zaltyko.organization_saas_webhook_events%ROWTYPE;
BEGIN
  SELECT * INTO event_row
    FROM zaltyko.organization_saas_webhook_events
    WHERE id = NEW.webhook_event_id
      AND organization_id = NEW.organization_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reconciliation decision has no matching inbox event'
      USING ERRCODE = '23514';
  END IF;

  IF event_row.reconciliation_decision_id IS DISTINCT FROM NEW.id
     AND NOT EXISTS (
       SELECT 1
       FROM zaltyko.organization_saas_webhook_reconciliation_results result
       WHERE result.decision_id = NEW.id
     ) THEN
    RAISE EXCEPTION 'reconciliation decision must be linked or terminal at commit'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$function$;

ALTER FUNCTION zaltyko.guard_saas_reconciliation_decision_link() OWNER TO postgres;

CREATE OR REPLACE FUNCTION zaltyko.guard_saas_reconciliation_result_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'zaltyko'
AS $function$
DECLARE
  decision_row zaltyko.organization_saas_webhook_reconciliation_decisions%ROWTYPE;
  event_row zaltyko.organization_saas_webhook_events%ROWTYPE;
  entitlement_row zaltyko.organization_entitlements%ROWTYPE;
  subscription_row zaltyko.organization_saas_subscriptions%ROWTYPE;
BEGIN
  -- The inbox row is the serialization point. Decisions are immutable and
  -- service_role has no UPDATE/DELETE privilege on them, so read them unlocked.
  SELECT * INTO decision_row
    FROM zaltyko.organization_saas_webhook_reconciliation_decisions
    WHERE id = NEW.decision_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reconciliation decision not found'
      USING ERRCODE = '55000';
  END IF;

  SELECT * INTO event_row
    FROM zaltyko.organization_saas_webhook_events
    WHERE id = decision_row.webhook_event_id
      AND organization_id = decision_row.organization_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reconciliation inbox event not found'
      USING ERRCODE = '55000';
  END IF;

  SELECT * INTO decision_row
    FROM zaltyko.organization_saas_webhook_reconciliation_decisions
    WHERE id = NEW.decision_id
      AND organization_id = event_row.organization_id
      AND webhook_event_id = event_row.id;
  IF NOT FOUND
     OR event_row.status <> 'processing'
     OR event_row.reconciliation_decision_id IS DISTINCT FROM decision_row.id
     OR event_row.fencing_version <> NEW.processor_fencing_version
     OR event_row.lease_token IS NULL
     OR event_row.lease_until <= clock_timestamp() THEN
    RAISE EXCEPTION 'reconciliation result has no active matching inbox fence'
      USING ERRCODE = '55000';
  END IF;

  IF NEW.outcome <> 'stale'
     AND NEW.observed_snapshot_sha256 IS DISTINCT FROM decision_row.snapshot_sha256 THEN
    RAISE EXCEPTION 'reconciliation snapshot differs from approved evidence'
      USING ERRCODE = '55000';
  END IF;

  IF NEW.outcome <> 'stale'
     AND decision_row.execution_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'reconciliation evidence expired before consumption'
      USING ERRCODE = '55000';
  END IF;

  IF NEW.outcome <> 'stale'
     AND (
       NEW.entitlement_revision_before IS DISTINCT FROM
         decision_row.expected_entitlement_revision
       OR NEW.entitlement_source_reference_before IS DISTINCT FROM
         decision_row.expected_entitlement_source_reference
     ) THEN
    RAISE EXCEPTION 'result before-state differs from the approved entitlement baseline'
      USING ERRCODE = '55000';
  END IF;

  SELECT * INTO entitlement_row
    FROM zaltyko.organization_entitlements
    WHERE organization_id = decision_row.organization_id;
  IF NOT FOUND
     OR entitlement_row.revision IS DISTINCT FROM NEW.entitlement_revision_after
     OR entitlement_row.source_reference IS DISTINCT FROM
       NEW.entitlement_source_reference_after THEN
    RAISE EXCEPTION 'result after-state differs from the persisted entitlement row'
      USING ERRCODE = '55000';
  END IF;

  IF NEW.outcome IN ('stale', 'ignored')
     AND (
       NEW.entitlement_revision_after <> NEW.entitlement_revision_before
       OR NEW.entitlement_source_reference_after IS DISTINCT FROM
         NEW.entitlement_source_reference_before
     ) THEN
    RAISE EXCEPTION 'stale or ignored reconciliation cannot change entitlement'
      USING ERRCODE = '55000';
  END IF;

  IF NEW.outcome <> 'stale'
     AND decision_row.resolution_kind = 'status_snapshot'
     AND (
       decision_row.observed_plan_code IS DISTINCT FROM
         decision_row.expected_subscription_plan_code
       OR decision_row.observed_price_reference IS DISTINCT FROM
         decision_row.expected_subscription_price_reference
       OR decision_row.observed_current_period_started_at IS DISTINCT FROM
         decision_row.expected_subscription_period_started_at
       OR decision_row.observed_current_period_ends_at IS DISTINCT FROM
         decision_row.expected_subscription_period_ends_at
       OR
       NEW.entitlement_revision_after <> NEW.entitlement_revision_before
       OR NEW.entitlement_source_reference_after IS DISTINCT FROM
         NEW.entitlement_source_reference_before
       OR entitlement_row.plan_code IS DISTINCT FROM
         decision_row.expected_entitlement_plan_code
       OR entitlement_row.source IS DISTINCT FROM
         decision_row.expected_entitlement_source
       OR entitlement_row.subscription_id IS DISTINCT FROM
         decision_row.expected_entitlement_subscription_id
       OR entitlement_row.trial_id IS DISTINCT FROM
         decision_row.expected_entitlement_trial_id
       OR entitlement_row.effective_from IS DISTINCT FROM
         decision_row.expected_entitlement_effective_from
       OR entitlement_row.effective_until IS DISTINCT FROM
         decision_row.expected_entitlement_effective_until
     ) THEN
    RAISE EXCEPTION 'status-only reconciliation cannot grant or change entitlement'
      USING ERRCODE = '55000';
  END IF;

  IF NEW.outcome <> 'stale'
     AND decision_row.resolution_kind = 'status_snapshot' THEN
    SELECT * INTO subscription_row
      FROM zaltyko.organization_saas_subscriptions
      WHERE organization_id = decision_row.organization_id
        AND environment = decision_row.environment
        AND provider_account_reference = decision_row.provider_account_reference
        AND subscription_reference = decision_row.observed_subscription_reference;
    IF NOT FOUND
       OR subscription_row.customer_reference IS DISTINCT FROM
         decision_row.observed_customer_reference
       OR subscription_row.plan_code IS DISTINCT FROM decision_row.observed_plan_code
       OR subscription_row.price_reference IS DISTINCT FROM
         decision_row.expected_subscription_price_reference
       OR subscription_row.billing_interval IS DISTINCT FROM
         decision_row.expected_subscription_billing_interval
       OR subscription_row.provider_status IS DISTINCT FROM
         decision_row.observed_provider_status
       OR subscription_row.cancel_at_period_end IS DISTINCT FROM
         decision_row.observed_cancel_at_period_end
       OR subscription_row.canceled_at IS DISTINCT FROM
         decision_row.observed_canceled_at
       OR subscription_row.current_period_started_at IS DISTINCT FROM
         decision_row.expected_subscription_period_started_at
       OR subscription_row.current_period_ends_at IS DISTINCT FROM
         decision_row.expected_subscription_period_ends_at
       OR subscription_row.last_provider_event_reference IS DISTINCT FROM
         decision_row.provider_event_id THEN
      RAISE EXCEPTION 'status snapshot result differs from the persisted subscription row'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  IF decision_row.resolution_kind = 'paid_invoice_grant'
     AND NEW.outcome IN ('applied', 'already_applied') THEN
    SELECT * INTO subscription_row
      FROM zaltyko.organization_saas_subscriptions
      WHERE organization_id = decision_row.organization_id
        AND environment = decision_row.environment
        AND provider_account_reference = decision_row.provider_account_reference
        AND subscription_reference = decision_row.observed_subscription_reference;
    IF NOT FOUND
       OR subscription_row.customer_reference IS DISTINCT FROM
         decision_row.observed_customer_reference
       OR entitlement_row.source <> 'stripe_subscription'
       OR entitlement_row.source_reference IS DISTINCT FROM
         'stripe-invoice:' || decision_row.invoice_reference
       OR entitlement_row.plan_code IS DISTINCT FROM decision_row.invoice_plan_code
       OR entitlement_row.subscription_id IS DISTINCT FROM subscription_row.id
       OR entitlement_row.effective_from IS DISTINCT FROM
         decision_row.invoice_period_started_at
       OR entitlement_row.effective_until IS DISTINCT FROM
         decision_row.invoice_period_ends_at THEN
      RAISE EXCEPTION 'paid invoice result does not match the persisted entitlement row'
        USING ERRCODE = '55000';
    END IF;

    IF NEW.outcome = 'applied'
       AND (
         NEW.entitlement_revision_after <> NEW.entitlement_revision_before + 1
         OR decision_row.invoice_price_reference IS DISTINCT FROM
           decision_row.observed_price_reference
         OR decision_row.observed_latest_invoice_reference IS DISTINCT FROM
           decision_row.invoice_reference
         OR decision_row.invoice_period_started_at IS DISTINCT FROM
           decision_row.observed_current_period_started_at
         OR decision_row.invoice_period_ends_at IS DISTINCT FROM
           decision_row.observed_current_period_ends_at
         OR subscription_row.price_reference IS DISTINCT FROM
           decision_row.observed_price_reference
         OR subscription_row.plan_code IS DISTINCT FROM decision_row.invoice_plan_code
         OR subscription_row.current_period_started_at IS DISTINCT FROM
           decision_row.invoice_period_started_at
         OR subscription_row.current_period_ends_at IS DISTINCT FROM
           decision_row.invoice_period_ends_at
       ) THEN
      RAISE EXCEPTION 'new paid grant is not the current subscription invoice'
        USING ERRCODE = '55000';
    END IF;

    IF NEW.outcome = 'applied'
       AND NOT EXISTS (
         SELECT 1
         FROM zaltyko.organization_entitlement_changes history
         WHERE history.organization_id = decision_row.organization_id
           AND history.revision = NEW.entitlement_revision_after
           AND history.plan_code = decision_row.invoice_plan_code
           AND history.source = 'stripe_subscription'
           AND history.source_reference =
             'stripe-invoice:' || decision_row.invoice_reference
           AND history.subscription_id = subscription_row.id
           AND history.effective_from = decision_row.invoice_period_started_at
           AND history.effective_until = decision_row.invoice_period_ends_at
       ) THEN
      RAISE EXCEPTION 'paid grant result has no matching entitlement history row'
        USING ERRCODE = '55000';
    END IF;

    IF NEW.outcome = 'already_applied'
       AND (
         NEW.entitlement_revision_after <> NEW.entitlement_revision_before
         OR NEW.entitlement_source_reference_before IS DISTINCT FROM
           'stripe-invoice:' || decision_row.invoice_reference
         OR decision_row.invoice_period_ends_at <= clock_timestamp()
       ) THEN
      RAISE EXCEPTION 'already-applied invoice must be the unchanged, still-valid grant'
        USING ERRCODE = '55000';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

ALTER FUNCTION zaltyko.guard_saas_reconciliation_result_insert() OWNER TO postgres;

CREATE OR REPLACE FUNCTION zaltyko.guard_saas_webhook_requeue()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'zaltyko'
AS $function$
DECLARE
  decision_row zaltyko.organization_saas_webhook_reconciliation_decisions%ROWTYPE;
  subscription_row zaltyko.organization_saas_subscriptions%ROWTYPE;
  entitlement_row zaltyko.organization_entitlements%ROWTYPE;
  claim_transition boolean := false;
  reclaim_transition boolean := false;
  finish_transition boolean := false;
BEGIN
  -- Full lifecycle allowlist. Terminal rows are immutable; quarantine only
  -- leaves through a validated requeue. Claims/reclaims are fenced.
  IF OLD.status IN ('processed', 'ignored') THEN
    RAISE EXCEPTION 'processed and ignored SaaS webhook events are terminal'
      USING ERRCODE = '55000';
  ELSIF OLD.status IN ('received', 'failed') AND NEW.status = 'processing' THEN
    claim_transition := true;
  ELSIF OLD.status = 'processing' AND NEW.status = 'processing' THEN
    reclaim_transition := true;
  ELSIF OLD.status = 'processing'
        AND NEW.status IN ('processed', 'ignored', 'failed', 'quarantined') THEN
    finish_transition := true;
  ELSIF OLD.status = 'quarantined' AND NEW.status = 'received' THEN
    NULL; -- Checked below with its attached decision and immutable event identity.
  ELSE
    RAISE EXCEPTION 'invalid SaaS webhook status transition'
      USING ERRCODE = '55000';
  END IF;

  IF claim_transition OR reclaim_transition THEN
    IF (reclaim_transition AND OLD.lease_until > clock_timestamp())
       OR NEW.fencing_version <> OLD.fencing_version + 1
       OR NEW.attempts <> OLD.attempts + 1
       OR NEW.lease_token IS NULL
       OR (reclaim_transition AND NEW.lease_token = OLD.lease_token)
       OR NEW.lease_until <= clock_timestamp()
       OR NEW.processed_at IS NOT NULL
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.reconciliation_decision_id IS DISTINCT FROM OLD.reconciliation_decision_id
       OR (OLD.reconciliation_decision_id IS NOT NULL
         AND OLD.reconciliation_next_attempt_at IS NOT NULL
         AND OLD.reconciliation_next_attempt_at > clock_timestamp())
       OR NEW.reconciliation_next_attempt_at IS NOT NULL
       OR NEW.last_error_code IS NOT NULL THEN
      RAISE EXCEPTION 'invalid SaaS webhook claim or fencing reclaim'
        USING ERRCODE = '55000';
    END IF;
  ELSIF finish_transition THEN
    IF OLD.lease_until <= clock_timestamp()
       OR NEW.fencing_version <> OLD.fencing_version
       OR NEW.attempts <> OLD.attempts
       OR NEW.lease_token IS NOT NULL
       OR NEW.lease_until IS NOT NULL
       OR NEW.reconciliation_decision_id IS DISTINCT FROM OLD.reconciliation_decision_id
       OR (OLD.organization_id IS NOT NULL
         AND NEW.organization_id IS DISTINCT FROM OLD.organization_id)
       OR (NEW.status IN ('processed', 'ignored', 'quarantined')
         AND NEW.reconciliation_decision_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
           FROM zaltyko.organization_saas_webhook_reconciliation_results result
           WHERE result.decision_id = NEW.reconciliation_decision_id
         ))
       OR (NEW.status <> 'failed'
         AND NEW.reconciliation_next_attempt_at IS NOT NULL)
       OR (NEW.status = 'failed'
         AND (NEW.organization_id IS DISTINCT FROM OLD.organization_id
           OR (NEW.reconciliation_decision_id IS NULL
             AND NEW.reconciliation_next_attempt_at IS NOT NULL)
           OR (NEW.reconciliation_decision_id IS NOT NULL
             AND (NEW.reconciliation_next_attempt_at IS NULL
               OR NEW.reconciliation_next_attempt_at <= clock_timestamp())))) THEN
      RAISE EXCEPTION 'invalid SaaS webhook lease finalization'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  IF NEW.reconciliation_decision_id IS DISTINCT FROM OLD.reconciliation_decision_id
     AND NOT (OLD.status = 'quarantined' AND NEW.status = 'received') THEN
    RAISE EXCEPTION 'reconciliation decision can only be attached during quarantine requeue'
      USING ERRCODE = '55000';
  END IF;

  IF OLD.status = 'quarantined' AND NEW.status = 'received' THEN
    IF NEW.reconciliation_decision_id IS NULL
       OR NEW.reconciliation_decision_id IS NOT DISTINCT FROM OLD.reconciliation_decision_id
       OR NEW.fencing_version <> OLD.fencing_version + 1
       OR NEW.lease_token IS NOT NULL
       OR NEW.lease_until IS NOT NULL
       OR NEW.processed_at IS NOT NULL
       OR NEW.attempts <> OLD.attempts
       OR NEW.last_error_code IS DISTINCT FROM OLD.last_error_code
       OR NEW.reconciliation_next_attempt_at IS NULL
       OR NEW.reconciliation_next_attempt_at > clock_timestamp()
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.provider_account_reference <> OLD.provider_account_reference
       OR NEW.environment <> OLD.environment
       OR NEW.provider_event_id <> OLD.provider_event_id
       OR NEW.event_created_at IS DISTINCT FROM OLD.event_created_at
       OR NEW.provider_object_reference IS DISTINCT FROM OLD.provider_object_reference
       OR NEW.payload_sha256 <> OLD.payload_sha256 THEN
      RAISE EXCEPTION 'invalid SaaS webhook quarantine requeue'
        USING ERRCODE = '55000';
    END IF;

    SELECT * INTO decision_row
      FROM zaltyko.organization_saas_webhook_reconciliation_decisions
      WHERE id = NEW.reconciliation_decision_id
        AND organization_id = OLD.organization_id
        AND webhook_event_id = OLD.id;
    IF NOT FOUND
       OR decision_row.expected_fencing_version <> OLD.fencing_version
       OR decision_row.provider_account_reference <> OLD.provider_account_reference
       OR decision_row.environment <> OLD.environment
       OR decision_row.provider_event_id <> OLD.provider_event_id
       OR decision_row.event_created_at IS DISTINCT FROM OLD.event_created_at
       OR decision_row.provider_object_reference IS DISTINCT FROM
         OLD.provider_object_reference
       OR decision_row.payload_sha256 <> OLD.payload_sha256
       OR decision_row.preview_expires_at <= clock_timestamp()
       OR decision_row.execution_expires_at <= clock_timestamp()
       OR EXISTS (
         SELECT 1
         FROM zaltyko.organization_saas_webhook_reconciliation_results result
         WHERE result.decision_id = decision_row.id
       )
       OR EXISTS (
         SELECT 1
         FROM zaltyko.organization_saas_webhook_reconciliation_decisions prior
         LEFT JOIN zaltyko.organization_saas_webhook_reconciliation_results prior_result
           ON prior_result.decision_id = prior.id
         WHERE prior.webhook_event_id = OLD.id
           AND prior.id <> decision_row.id
           AND prior_result.id IS NULL
       ) THEN
      RAISE EXCEPTION 'missing, stale, expired, or consumed SaaS reconciliation decision'
        USING ERRCODE = '55000';
    END IF;

    IF (decision_row.resolution_kind = 'status_snapshot'
          AND (OLD.event_type NOT IN (
            'customer.subscription.created', 'customer.subscription.updated',
            'customer.subscription.deleted', 'invoice.payment_failed'
          ) OR OLD.last_error_code IS DISTINCT FROM
            'ambiguous_event_order'
            OR (OLD.event_type IN (
              'customer.subscription.created', 'customer.subscription.updated',
              'customer.subscription.deleted'
            ) AND decision_row.observed_subscription_reference IS DISTINCT FROM
              OLD.provider_object_reference)))
       OR (decision_row.resolution_kind = 'paid_invoice_grant'
          AND (OLD.event_type <> 'invoice.paid'
            OR OLD.last_error_code IS DISTINCT FROM
              'ambiguous_event_order'))
       OR (decision_row.resolution_kind = 'paid_invoice_grant'
          AND decision_row.invoice_reference IS DISTINCT FROM
            OLD.provider_object_reference) THEN
      RAISE EXCEPTION 'reconciliation kind does not match the verified webhook object'
        USING ERRCODE = '55000';
    END IF;

    IF decision_row.resolution_kind = 'status_snapshot'
       AND (
         (OLD.event_type = 'invoice.payment_failed'
           AND (
             decision_row.invoice_reference IS DISTINCT FROM
               OLD.provider_object_reference
             OR decision_row.invoice_customer_reference IS DISTINCT FROM
               decision_row.observed_customer_reference
             OR decision_row.invoice_subscription_reference IS DISTINCT FROM
               decision_row.observed_subscription_reference
           ))
         OR (OLD.event_type <> 'invoice.payment_failed'
           AND decision_row.invoice_reference IS NOT NULL)
       ) THEN
      RAISE EXCEPTION 'status snapshot invoice evidence does not match the verified event'
        USING ERRCODE = '55000';
    END IF;

    -- The inbox UPDATE already serializes this event. Decision rows are read
    -- without a row lock; only organization/subscription state is then locked.
    PERFORM 1 FROM zaltyko.organizations
      WHERE id = OLD.organization_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'reconciliation organization no longer exists'
        USING ERRCODE = '55000';
    END IF;
    SELECT * INTO subscription_row
      FROM zaltyko.organization_saas_subscriptions
      WHERE organization_id = OLD.organization_id
        AND environment = OLD.environment
        AND provider_account_reference = OLD.provider_account_reference
        AND subscription_reference = decision_row.observed_subscription_reference
      FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'reconciliation subscription no longer exists'
        USING ERRCODE = '55000';
    END IF;
    SELECT * INTO entitlement_row
      FROM zaltyko.organization_entitlements
      WHERE organization_id = OLD.organization_id
      FOR UPDATE;
    IF NOT FOUND
       OR subscription_row.subscription_reference
            <> decision_row.observed_subscription_reference
       OR subscription_row.customer_reference
            <> decision_row.observed_customer_reference
       OR subscription_row.updated_at
            <> decision_row.expected_subscription_updated_at
       OR subscription_row.plan_code
            <> decision_row.expected_subscription_plan_code
       OR subscription_row.price_reference
            <> decision_row.expected_subscription_price_reference
       OR subscription_row.billing_interval
            <> decision_row.expected_subscription_billing_interval
       OR subscription_row.provider_status
            <> decision_row.expected_subscription_provider_status
       OR subscription_row.cancel_at_period_end
            <> decision_row.expected_subscription_cancel_at_period_end
       OR subscription_row.canceled_at
            IS DISTINCT FROM decision_row.expected_subscription_canceled_at
       OR subscription_row.current_period_started_at
            <> decision_row.expected_subscription_period_started_at
       OR subscription_row.current_period_ends_at
            <> decision_row.expected_subscription_period_ends_at
       OR subscription_row.last_provider_event_reference
            IS DISTINCT FROM decision_row.expected_last_provider_event_reference
       OR entitlement_row.revision
            <> decision_row.expected_entitlement_revision
       OR entitlement_row.plan_code
            <> decision_row.expected_entitlement_plan_code
       OR entitlement_row.source
            <> decision_row.expected_entitlement_source
       OR entitlement_row.source_reference
            <> decision_row.expected_entitlement_source_reference
       OR entitlement_row.subscription_id
            IS DISTINCT FROM decision_row.expected_entitlement_subscription_id
       OR entitlement_row.trial_id
            IS DISTINCT FROM decision_row.expected_entitlement_trial_id
       OR entitlement_row.effective_from
            IS DISTINCT FROM decision_row.expected_entitlement_effective_from
       OR entitlement_row.effective_until
            IS DISTINCT FROM decision_row.expected_entitlement_effective_until THEN
      RAISE EXCEPTION 'subscription or entitlement baseline changed after preview'
        USING ERRCODE = '55000';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

ALTER FUNCTION zaltyko.guard_saas_webhook_requeue() OWNER TO postgres;

CREATE OR REPLACE FUNCTION zaltyko.record_entitlement_revision()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'zaltyko'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.revision = OLD.revision THEN
    RETURN NEW;
  END IF;
  INSERT INTO zaltyko.organization_entitlement_changes (
    organization_id, revision, plan_code, source, source_reference,
    subscription_id, trial_id, effective_from, effective_until, changed_at
  ) VALUES (
    NEW.organization_id, NEW.revision, NEW.plan_code, NEW.source,
    NEW.source_reference, NEW.subscription_id, NEW.trial_id,
    NEW.effective_from, NEW.effective_until, NEW.updated_at
  );
  RETURN NEW;
END;
$function$;

ALTER FUNCTION zaltyko.record_entitlement_revision() OWNER TO postgres;

CREATE OR REPLACE FUNCTION zaltyko.reject_entitlement_history_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'zaltyko'
AS $function$
begin
  raise exception 'organization_entitlement_changes is append-only'
    using errcode = '55000';
end;
$function$;

ALTER FUNCTION zaltyko.reject_entitlement_history_mutation() OWNER TO postgres;

CREATE OR REPLACE FUNCTION zaltyko.reject_owner_signup_consent_audit_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
begin
  raise exception 'owner signup consent audit is append-only';
end;
$function$;

ALTER FUNCTION zaltyko.reject_owner_signup_consent_audit_mutation() OWNER TO postgres;

CREATE OR REPLACE FUNCTION zaltyko.reject_saas_reconciliation_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  RAISE EXCEPTION 'SaaS webhook reconciliation records are append-only'
    USING ERRCODE = '55000';
END
$function$;

ALTER FUNCTION zaltyko.reject_saas_reconciliation_mutation() OWNER TO postgres;

CREATE OR REPLACE FUNCTION zaltyko.seed_free_entitlement()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'zaltyko'
AS $function$
begin
  insert into zaltyko.organization_entitlements (
    organization_id, plan_code, revision, source, source_reference,
    effective_from, created_at, updated_at
  ) values (
    new.id, 'free', 1, 'bootstrap', 'organization-created:' || new.id::text,
    new.created_at, new.created_at, new.created_at
  );
  return new;
end;
$function$;

ALTER FUNCTION zaltyko.seed_free_entitlement() OWNER TO postgres;

CREATE OR REPLACE FUNCTION zaltyko_domain_private.has_location_access(target_organization_id uuid, target_location_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from zaltyko.organization_members member
    where member.organization_id = target_organization_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and (
        member.location_scope_mode = 'all'
        or exists (
          select 1
          from zaltyko.member_location_scopes scope
          where scope.organization_id = member.organization_id
            and scope.member_id = member.id
            and scope.location_id = target_location_id
        )
      )
  )
$function$;

ALTER FUNCTION zaltyko_domain_private.has_location_access(target_organization_id uuid, target_location_id uuid) OWNER TO postgres;

CREATE OR REPLACE FUNCTION zaltyko_domain_private.has_organization_access(target_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from zaltyko.organization_members member
    where member.organization_id = target_organization_id
      and member.user_id = auth.uid()
      and member.status = 'active'
  )
$function$;

ALTER FUNCTION zaltyko_domain_private.has_organization_access(target_organization_id uuid) OWNER TO postgres;

CREATE OR REPLACE FUNCTION zaltyko_domain_private.prevent_invoice_line_enrollment_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
begin
  raise exception using
    errcode = '55000',
    message = 'invoice line enrollment history is immutable';
end
$function$;

ALTER FUNCTION zaltyko_domain_private.prevent_invoice_line_enrollment_mutation() OWNER TO postgres;

CREATE OR REPLACE FUNCTION zaltyko_domain_private.reject_audit_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  raise exception 'zaltyko.audit_log is append-only' using errcode = '55000';
end
$function$;

ALTER FUNCTION zaltyko_domain_private.reject_audit_mutation() OWNER TO postgres;

CREATE OR REPLACE FUNCTION zaltyko_domain_private.reject_insight_history_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  raise exception 'zaltyko.insight_status_history is append-only' using errcode = '55000';
end
$function$;

ALTER FUNCTION zaltyko_domain_private.reject_insight_history_mutation() OWNER TO postgres;

CREATE OR REPLACE FUNCTION zaltyko_private.academy_in_current_tenant(target uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.academies AS a
    WHERE a.id = target
      AND a.tenant_id = zaltyko_private.current_tenant_id()
  )
$function$;

ALTER FUNCTION zaltyko_private.academy_in_current_tenant(target uuid) OWNER TO postgres;

CREATE OR REPLACE FUNCTION zaltyko_private.can_access_athlete(target_athlete_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.athletes AS a
    WHERE a.id = target_athlete_id
      AND (
        zaltyko_private.is_academy_manager(a.academy_id)
        OR a.user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.guardian_athletes AS ga
          JOIN public.guardians AS g ON g.id = ga.guardian_id
          WHERE ga.athlete_id = a.id
            AND g.profile_id = zaltyko_private.current_profile_id()
        )
        OR EXISTS (
          SELECT 1
          FROM public.class_enrollments AS ce
          WHERE ce.athlete_id = a.id
            AND zaltyko_private.is_assigned_coach(ce.class_id)
        )
        OR EXISTS (
          SELECT 1
          FROM public.group_athletes AS ga
          JOIN public.class_groups AS cg ON cg.group_id = ga.group_id
          WHERE ga.athlete_id = a.id
            AND zaltyko_private.is_assigned_coach(cg.class_id)
        )
        OR EXISTS (
          SELECT 1
          FROM public.group_athletes AS ga
          JOIN public.classes AS c ON c.group_id = ga.group_id
          WHERE ga.athlete_id = a.id
            AND zaltyko_private.is_assigned_coach(c.id)
        )
      )
  )
$function$;

ALTER FUNCTION zaltyko_private.can_access_athlete(target_athlete_id uuid) OWNER TO postgres;

CREATE OR REPLACE FUNCTION zaltyko_private.can_access_billing_athlete(target_athlete_id uuid, target_academy_id uuid, target_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT COALESCE(
    zaltyko_private.is_super_admin()
    OR (
      zaltyko_private.is_academy_manager(target_academy_id)
      AND zaltyko_private.row_in_current_tenant(target_tenant_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.athletes a
      WHERE a.id = target_athlete_id
        AND a.academy_id = target_academy_id
        AND a.tenant_id = target_tenant_id
        AND a.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.guardians g
        ON g.profile_id = p.id
       AND g.tenant_id = target_tenant_id
      JOIN public.guardian_athletes ga
        ON ga.guardian_id = g.id
       AND ga.tenant_id = target_tenant_id
      JOIN public.athletes a
        ON a.id = ga.athlete_id
       AND a.academy_id = target_academy_id
       AND a.tenant_id = target_tenant_id
      WHERE p.user_id = auth.uid()
        AND ga.athlete_id = target_athlete_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.family_contacts fc
      JOIN public.athletes a
        ON a.id = fc.athlete_id
       AND a.academy_id = target_academy_id
       AND a.tenant_id = target_tenant_id
      WHERE fc.tenant_id = target_tenant_id
        AND fc.athlete_id = target_athlete_id
        AND lower(fc.email) = lower(auth.jwt() ->> 'email')
    ),
    false
  );
$function$;

ALTER FUNCTION zaltyko_private.can_access_billing_athlete(target_athlete_id uuid, target_academy_id uuid, target_tenant_id uuid) OWNER TO postgres;

CREATE OR REPLACE FUNCTION zaltyko_private.can_access_class(target_class_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.classes AS c
    WHERE c.id = target_class_id
      AND (
        zaltyko_private.is_academy_manager(c.academy_id)
        OR zaltyko_private.is_assigned_coach(c.id)
        OR EXISTS (
          SELECT 1
          FROM public.class_enrollments AS ce
          WHERE ce.class_id = c.id
            AND zaltyko_private.can_access_athlete(ce.athlete_id)
        )
        OR EXISTS (
          SELECT 1
          FROM public.class_groups AS cg
          JOIN public.group_athletes AS ga ON ga.group_id = cg.group_id
          WHERE cg.class_id = c.id
            AND zaltyko_private.can_access_athlete(ga.athlete_id)
        )
        OR EXISTS (
          SELECT 1
          FROM public.group_athletes AS ga
          WHERE ga.group_id = c.group_id
            AND zaltyko_private.can_access_athlete(ga.athlete_id)
        )
      )
  )
$function$;

ALTER FUNCTION zaltyko_private.can_access_class(target_class_id uuid) OWNER TO postgres;

CREATE OR REPLACE FUNCTION zaltyko_private.can_access_guardian(target_guardian_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.guardians AS g
    WHERE g.id = target_guardian_id
      AND (
        g.profile_id = zaltyko_private.current_profile_id()
        OR EXISTS (
          SELECT 1
          FROM public.guardian_athletes AS ga
          JOIN public.athletes AS a ON a.id = ga.athlete_id
          WHERE ga.guardian_id = g.id
            AND zaltyko_private.is_academy_manager(a.academy_id)
        )
      )
  )
$function$;

ALTER FUNCTION zaltyko_private.can_access_guardian(target_guardian_id uuid) OWNER TO postgres;

CREATE OR REPLACE FUNCTION zaltyko_private.current_profile_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT p.id
  FROM public.profiles AS p
  WHERE p.user_id = auth.uid()
  LIMIT 1
$function$;

ALTER FUNCTION zaltyko_private.current_profile_id() OWNER TO postgres;

CREATE OR REPLACE FUNCTION zaltyko_private.current_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT p.tenant_id
  FROM public.profiles AS p
  WHERE p.user_id = auth.uid()
  LIMIT 1
$function$;

ALTER FUNCTION zaltyko_private.current_tenant_id() OWNER TO postgres;

CREATE OR REPLACE FUNCTION zaltyko_private.get_current_tenant()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ SELECT zaltyko_private.current_tenant_id() $function$;

ALTER FUNCTION zaltyko_private.get_current_tenant() OWNER TO postgres;

CREATE OR REPLACE FUNCTION zaltyko_private.is_academy_manager(target_academy_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT zaltyko_private.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.academies AS a
      WHERE a.id = target_academy_id
        AND a.owner_id = zaltyko_private.current_profile_id()
    )
    OR EXISTS (
      SELECT 1
      FROM public.memberships AS m
      WHERE m.academy_id = target_academy_id
        AND m.user_id = auth.uid()
        AND m.role = 'owner'::public.membership_role
    )
$function$;

ALTER FUNCTION zaltyko_private.is_academy_manager(target_academy_id uuid) OWNER TO postgres;

CREATE OR REPLACE FUNCTION zaltyko_private.is_academy_member(target_academy_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT zaltyko_private.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.academies AS a
      WHERE a.id = target_academy_id
        AND a.owner_id = zaltyko_private.current_profile_id()
    )
    OR EXISTS (
      SELECT 1
      FROM public.memberships AS m
      WHERE m.academy_id = target_academy_id
        AND m.user_id = auth.uid()
    )
$function$;

ALTER FUNCTION zaltyko_private.is_academy_member(target_academy_id uuid) OWNER TO postgres;

CREATE OR REPLACE FUNCTION zaltyko_private.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ SELECT zaltyko_private.is_super_admin() $function$;

ALTER FUNCTION zaltyko_private.is_admin() OWNER TO postgres;

CREATE OR REPLACE FUNCTION zaltyko_private.is_assigned_coach(target_class_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.coaches AS co
    WHERE co.user_id = auth.uid()
      AND (
        EXISTS (
          SELECT 1
          FROM public.class_coach_assignments AS cca
          WHERE cca.class_id = target_class_id
            AND cca.coach_id = co.id
        )
        OR EXISTS (
          SELECT 1
          FROM public.classes AS c
          JOIN public.groups AS g ON g.id = c.group_id
          WHERE c.id = target_class_id
            AND (g.coach_id = co.id OR co.id = ANY(COALESCE(g.assistant_ids, ARRAY[]::uuid[])))
        )
        OR EXISTS (
          SELECT 1
          FROM public.class_sessions AS cs
          WHERE cs.class_id = target_class_id
            AND cs.coach_id = co.id
        )
      )
  )
$function$;

ALTER FUNCTION zaltyko_private.is_assigned_coach(target_class_id uuid) OWNER TO postgres;

CREATE OR REPLACE FUNCTION zaltyko_private.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT COALESCE(
    EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.user_id = auth.uid()
        AND p.role = 'super_admin'::public.profile_role
        AND p.can_login = true
        AND p.is_suspended = false
    ),
    false
  )
$function$;

ALTER FUNCTION zaltyko_private.is_super_admin() OWNER TO postgres;

CREATE OR REPLACE FUNCTION zaltyko_private.row_in_current_tenant(target_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT zaltyko_private.is_super_admin()
    OR target_tenant_id = zaltyko_private.current_tenant_id()
$function$;

ALTER FUNCTION zaltyko_private.row_in_current_tenant(target_tenant_id uuid) OWNER TO postgres;

-- All standalone indexes, including unique indexes referenced by foreign keys.
CREATE INDEX academies_contact_email_idx ON public.academies USING btree (contact_email);
CREATE INDEX academies_contact_phone_idx ON public.academies USING btree (contact_phone);
CREATE INDEX academies_country_code_idx ON public.academies USING btree (country_code);
CREATE INDEX academies_discipline_variant_idx ON public.academies USING btree (discipline_variant);
CREATE INDEX academies_is_public_idx ON public.academies USING btree (is_public);
CREATE INDEX academies_location_idx ON public.academies USING btree (country, region, city);
CREATE INDEX academies_status_idx ON public.academies USING btree (status);
CREATE INDEX academies_status_public_idx ON public.academies USING btree (status, is_public);
CREATE INDEX academies_tenant_id_idx ON public.academies USING btree (tenant_id);
CREATE INDEX academies_type_idx ON public.academies USING btree (academy_type);
CREATE INDEX academies_utm_captured_at_idx ON public.academies USING btree (utm_captured_at);
CREATE INDEX academies_utm_source_idx ON public.academies USING btree (utm_source);
CREATE INDEX academy_diagnostics_academy_created_idx ON public.academy_diagnostics USING btree (academy_id, created_at);
CREATE INDEX academy_diagnostics_academy_idx ON public.academy_diagnostics USING btree (academy_id);
CREATE INDEX academy_diagnostics_completed_at_idx ON public.academy_diagnostics USING btree (created_at);
CREATE INDEX academy_diagnostics_tenant_idx ON public.academy_diagnostics USING btree (tenant_id);
CREATE INDEX academy_expenses_academy_idx ON public.academy_expenses USING btree (academy_id);
CREATE INDEX academy_expenses_applies_to_idx ON public.academy_expenses USING btree (applies_to_type, applies_to_id);
CREATE INDEX academy_expenses_coach_idx ON public.academy_expenses USING btree (coach_id);
CREATE INDEX academy_expenses_group_idx ON public.academy_expenses USING btree (group_id);
CREATE INDEX academy_expenses_period_idx ON public.academy_expenses USING btree (academy_id, period);
CREATE INDEX academy_expenses_tenant_idx ON public.academy_expenses USING btree (tenant_id);
CREATE INDEX academy_geo_groups_academy_id_idx ON public.academy_geo_groups USING btree (academy_id);
CREATE INDEX academy_geo_groups_location_idx ON public.academy_geo_groups USING btree (country, region, city);
CREATE INDEX academy_link_requests_academy_status_idx ON public.academy_link_requests USING btree (academy_id, status);
CREATE UNIQUE INDEX academy_link_requests_pending_unique ON public.academy_link_requests USING btree (academy_id, target_profile_id) WHERE (status = 'pending'::text);
CREATE INDEX academy_link_requests_target_status_idx ON public.academy_link_requests USING btree (target_profile_id, status);
CREATE INDEX academy_messages_created_at_idx ON public.academy_messages USING btree (created_at);
CREATE INDEX academy_messages_receiver_idx ON public.academy_messages USING btree (receiver_academy_id);
CREATE INDEX academy_messages_sender_idx ON public.academy_messages USING btree (sender_academy_id);
CREATE INDEX academy_roles_academy_idx ON public.academy_roles USING btree (academy_id);
CREATE UNIQUE INDEX academy_sport_configs_academy_config_unique ON public.academy_sport_configs USING btree (academy_id, sport_locale_config_id);
CREATE INDEX academy_sport_configs_active_idx ON public.academy_sport_configs USING btree (is_active);
CREATE INDEX academy_sport_configs_tenant_academy_idx ON public.academy_sport_configs USING btree (tenant_id, academy_id);
CREATE INDEX academy_trials_academy_started_idx ON public.academy_trials USING btree (academy_id, started_at DESC);
CREATE UNIQUE INDEX academy_trials_active_academy_unique ON public.academy_trials USING btree (academy_id, status) WHERE (status = 'active'::text);
CREATE INDEX academy_trials_lead_idx ON public.academy_trials USING btree (lead_id);
CREATE INDEX academy_trials_tenant_status_idx ON public.academy_trials USING btree (tenant_id, status);
CREATE INDEX ad_active_idx ON public.advertisements USING btree (is_active);
CREATE INDEX ad_dates_idx ON public.advertisements USING btree (start_date, end_date);
CREATE INDEX ad_position_idx ON public.advertisements USING btree ("position");
CREATE INDEX announcement_read_status_announcement_idx ON public.announcement_read_status USING btree (announcement_id);
CREATE UNIQUE INDEX announcement_read_status_unique ON public.announcement_read_status USING btree (announcement_id, user_id);
CREATE INDEX announcement_read_status_user_idx ON public.announcement_read_status USING btree (user_id);
CREATE INDEX announcements_academy_idx ON public.announcements USING btree (academy_id);
CREATE INDEX announcements_academy_status_published_idx ON public.announcements USING btree (academy_id, status, published_at);
CREATE INDEX announcements_author_idx ON public.announcements USING btree (author_id);
CREATE INDEX announcements_priority_idx ON public.announcements USING btree (priority);
CREATE INDEX announcements_published_at_idx ON public.announcements USING btree (published_at);
CREATE INDEX announcements_status_idx ON public.announcements USING btree (status);
CREATE UNIQUE INDEX apparatus_config_code_unique ON public.apparatus USING btree (sport_locale_config_id, code);
CREATE INDEX apparatus_config_sort_idx ON public.apparatus USING btree (sport_locale_config_id, sort_order);
CREATE INDEX application_listing_idx ON public.empleo_applications USING btree (listing_id);
CREATE INDEX application_user_idx ON public.empleo_applications USING btree (user_id);
CREATE INDEX assessment_rubrics_tenant_idx ON public.assessment_rubrics USING btree (tenant_id);
CREATE INDEX assessment_scores_assessment_idx ON public.assessment_scores USING btree (assessment_id);
CREATE INDEX assessment_scores_tenant_idx ON public.assessment_scores USING btree (tenant_id);
CREATE INDEX assessment_types_name_idx ON public.assessment_types USING btree (name);
CREATE INDEX assessment_videos_assessment_idx ON public.assessment_videos USING btree (assessment_id);
CREATE INDEX athlete_assessments_athlete_idx ON public.athlete_assessments USING btree (athlete_id);
CREATE INDEX athlete_assessments_session_idx ON public.athlete_assessments USING btree (session_id);
CREATE INDEX athlete_assessments_sport_config_idx ON public.athlete_assessments USING btree (sport_config_id);
CREATE INDEX athlete_assessments_tenant_idx ON public.athlete_assessments USING btree (tenant_id);
CREATE INDEX athlete_assessments_type_idx ON public.athlete_assessments USING btree (assessment_type);
CREATE INDEX athlete_documents_athlete_idx ON public.athlete_documents USING btree (athlete_id);
CREATE INDEX athlete_documents_expiry_idx ON public.athlete_documents USING btree (expiry_date);
CREATE INDEX athlete_documents_tenant_idx ON public.athlete_documents USING btree (tenant_id);
CREATE INDEX athlete_documents_type_idx ON public.athlete_documents USING btree (document_type);
CREATE INDEX athlete_documents_uploader_idx ON public.athlete_documents USING btree (uploaded_by);
CREATE INDEX athlete_extra_classes_academy_id_idx ON public.athlete_extra_classes USING btree (academy_id);
CREATE INDEX athlete_extra_classes_athlete_id_idx ON public.athlete_extra_classes USING btree (athlete_id);
CREATE INDEX athlete_extra_classes_class_id_idx ON public.athlete_extra_classes USING btree (class_id);
CREATE INDEX athlete_extra_classes_tenant_id_idx ON public.athlete_extra_classes USING btree (tenant_id);
CREATE UNIQUE INDEX athlete_extra_classes_unique ON public.athlete_extra_classes USING btree (tenant_id, athlete_id, class_id);
CREATE INDEX athlete_import_batches_academy_created_idx ON public.athlete_import_batches USING btree (academy_id, created_at);
CREATE INDEX athlete_import_batches_file_hash_idx ON public.athlete_import_batches USING btree (file_hash);
CREATE INDEX athlete_import_batches_status_idx ON public.athlete_import_batches USING btree (status);
CREATE INDEX athlete_import_batches_tenant_created_idx ON public.athlete_import_batches USING btree (tenant_id, created_at);
CREATE INDEX athlete_invitations_academy_status_idx ON public.athlete_invitations USING btree (academy_id, status);
CREATE UNIQUE INDEX athlete_invitations_active_unique ON public.athlete_invitations USING btree (academy_id, lower(email)) WHERE (status = ANY (ARRAY['pending'::text, 'opened'::text]));
CREATE INDEX athlete_invitations_supabase_user_idx ON public.athlete_invitations USING btree (supabase_user_id) WHERE (supabase_user_id IS NOT NULL);
CREATE INDEX athlete_invitations_tenant_idx ON public.athlete_invitations USING btree (tenant_id);
CREATE UNIQUE INDEX athlete_sport_configs_athlete_config_unique ON public.athlete_sport_configs USING btree (athlete_id, academy_sport_config_id);
CREATE INDEX athlete_sport_configs_config_idx ON public.athlete_sport_configs USING btree (academy_sport_config_id);
CREATE INDEX athlete_sport_configs_tenant_idx ON public.athlete_sport_configs USING btree (tenant_id);
CREATE INDEX athletes_academy_status_idx ON public.athletes USING btree (academy_id, status);
CREATE INDEX athletes_deleted_at_idx ON public.athletes USING btree (deleted_at);
CREATE INDEX athletes_import_batch_idx ON public.athletes USING btree (import_batch_id);
CREATE INDEX athletes_primary_sport_config_idx ON public.athletes USING btree (primary_sport_config_id);
CREATE INDEX athletes_status_idx ON public.athletes USING btree (status);
CREATE INDEX athletes_tenant_academy_idx ON public.athletes USING btree (tenant_id, academy_id);
CREATE INDEX athletes_user_id_idx ON public.athletes USING btree (user_id);
CREATE INDEX attendance_records_date_tenant_idx ON public.attendance_records USING btree (recorded_at, tenant_id);
CREATE UNIQUE INDEX attendance_records_session_athlete_uq ON public.attendance_records USING btree (session_id, athlete_id);
CREATE INDEX attendance_records_session_idx ON public.attendance_records USING btree (session_id);
CREATE INDEX attendance_records_tenant_idx ON public.attendance_records USING btree (tenant_id);
CREATE INDEX audit_logs_action_idx ON public.audit_logs USING btree (action);
CREATE INDEX audit_logs_module_idx ON public.audit_logs USING btree (module);
CREATE INDEX audit_logs_resource_idx ON public.audit_logs USING btree (resource_type, resource_id);
CREATE INDEX audit_logs_tenant_created_idx ON public.audit_logs USING btree (tenant_id, created_at);
CREATE INDEX audit_logs_tenant_module_idx ON public.audit_logs USING btree (tenant_id, module, created_at);
CREATE INDEX audit_logs_user_idx ON public.audit_logs USING btree (user_id);
CREATE INDEX billing_events_object_type_idx ON public.billing_events USING btree (stripe_object_id, type);
CREATE INDEX billing_events_type_created_idx ON public.billing_events USING btree (type, created_at);
CREATE INDEX billing_invoices_academy_created_idx ON public.billing_invoices USING btree (academy_id, created_at);
CREATE INDEX billing_invoices_tenant_created_idx ON public.billing_invoices USING btree (tenant_id, created_at);
CREATE INDEX billing_items_academy_active_idx ON public.billing_items USING btree (academy_id, is_active);
CREATE INDEX billing_items_academy_id_idx ON public.billing_items USING btree (academy_id);
CREATE INDEX billing_items_tenant_idx ON public.billing_items USING btree (tenant_id);
CREATE UNIQUE INDEX categories_config_code_unique ON public.categories USING btree (sport_locale_config_id, code);
CREATE INDEX categories_config_sort_idx ON public.categories USING btree (sport_locale_config_id, sort_order);
CREATE INDEX charges_academy_athlete_period_idx ON public.charges USING btree (academy_id, athlete_id, period);
CREATE INDEX charges_academy_period_idx ON public.charges USING btree (academy_id, period);
CREATE INDEX charges_academy_status_idx ON public.charges USING btree (academy_id, status);
CREATE INDEX charges_class_id_idx ON public.charges USING btree (class_id);
CREATE INDEX charges_payment_intent_idx ON public.charges USING btree (stripe_payment_intent_id);
CREATE INDEX charges_tenant_idx ON public.charges USING btree (tenant_id);
CREATE INDEX churn_reasons_academy_athlete_idx ON public.churn_reasons USING btree (academy_id, athlete_id);
CREATE INDEX churn_reasons_academy_idx ON public.churn_reasons USING btree (academy_id);
CREATE INDEX churn_reasons_athlete_idx ON public.churn_reasons USING btree (athlete_id);
CREATE INDEX churn_reasons_tenant_idx ON public.churn_reasons USING btree (tenant_id);
CREATE INDEX class_coach_assignments_class_idx ON public.class_coach_assignments USING btree (class_id);
CREATE INDEX class_coach_assignments_coach_idx ON public.class_coach_assignments USING btree (coach_id);
CREATE UNIQUE INDEX class_coach_assignments_unique ON public.class_coach_assignments USING btree (tenant_id, class_id, coach_id);
CREATE INDEX class_enrollments_academy_idx ON public.class_enrollments USING btree (academy_id);
CREATE INDEX class_enrollments_athlete_idx ON public.class_enrollments USING btree (athlete_id);
CREATE INDEX class_enrollments_class_idx ON public.class_enrollments USING btree (class_id);
CREATE INDEX class_enrollments_tenant_idx ON public.class_enrollments USING btree (tenant_id);
CREATE UNIQUE INDEX class_enrollments_unique ON public.class_enrollments USING btree (tenant_id, class_id, athlete_id);
CREATE INDEX class_groups_class_idx ON public.class_groups USING btree (class_id);
CREATE INDEX class_groups_group_idx ON public.class_groups USING btree (group_id);
CREATE UNIQUE INDEX class_groups_unique ON public.class_groups USING btree (tenant_id, class_id, group_id);
CREATE INDEX class_sessions_class_date_idx ON public.class_sessions USING btree (class_id, session_date);
CREATE INDEX class_sessions_sport_config_idx ON public.class_sessions USING btree (sport_config_id);
CREATE INDEX class_sessions_tenant_idx ON public.class_sessions USING btree (tenant_id);
CREATE INDEX class_waiting_list_athlete_idx ON public.class_waiting_list USING btree (athlete_id);
CREATE INDEX class_waiting_list_class_idx ON public.class_waiting_list USING btree (class_id);
CREATE INDEX class_waiting_list_tenant_academy_idx ON public.class_waiting_list USING btree (tenant_id, academy_id);
CREATE INDEX class_waiting_list_tenant_idx ON public.class_waiting_list USING btree (tenant_id);
CREATE UNIQUE INDEX class_weekdays_class_weekday_idx ON public.class_weekdays USING btree (class_id, weekday);
CREATE INDEX class_weekdays_tenant_idx ON public.class_weekdays USING btree (tenant_id);
CREATE INDEX classes_deleted_at_idx ON public.classes USING btree (deleted_at);
CREATE INDEX classes_group_id_idx ON public.classes USING btree (group_id);
CREATE INDEX classes_sport_config_idx ON public.classes USING btree (sport_config_id);
CREATE INDEX classes_start_time_end_time_idx ON public.classes USING btree (start_time, end_time);
CREATE INDEX classes_tenant_academy_idx ON public.classes USING btree (tenant_id, academy_id);
CREATE INDEX coach_compensation_academy_coach_idx ON public.coach_compensation USING btree (academy_id, coach_id);
CREATE UNIQUE INDEX coach_compensation_academy_coach_uq ON public.coach_compensation USING btree (academy_id, coach_id);
CREATE INDEX coach_compensation_academy_idx ON public.coach_compensation USING btree (academy_id);
CREATE INDEX coach_compensation_coach_idx ON public.coach_compensation USING btree (coach_id);
CREATE INDEX coach_compensation_tenant_idx ON public.coach_compensation USING btree (tenant_id);
CREATE INDEX coach_notes_athlete_idx ON public.coach_notes USING btree (athlete_id);
CREATE INDEX coach_notes_tags_idx ON public.coach_notes USING gin (tags);
CREATE INDEX coach_notes_tenant_idx ON public.coach_notes USING btree (tenant_id);
CREATE INDEX coach_sport_configs_coach_idx ON public.coach_sport_configs USING btree (coach_id);
CREATE INDEX coach_sport_configs_config_idx ON public.coach_sport_configs USING btree (academy_sport_config_id);
CREATE INDEX coach_sport_configs_tenant_idx ON public.coach_sport_configs USING btree (tenant_id);
CREATE UNIQUE INDEX coach_sport_configs_unique ON public.coach_sport_configs USING btree (tenant_id, coach_id, academy_sport_config_id);
CREATE INDEX coaches_public_idx ON public.coaches USING btree (is_public);
CREATE INDEX coaches_slug_idx ON public.coaches USING btree (slug);
CREATE INDEX coaches_tenant_academy_idx ON public.coaches USING btree (tenant_id, academy_id);
CREATE UNIQUE INDEX commercial_interviews_academy_fingerprint_unique ON public.commercial_interviews USING btree (academy_fingerprint);
CREATE INDEX commercial_interviews_lead_idx ON public.commercial_interviews USING btree (lead_id);
CREATE INDEX commercial_interviews_status_completed_idx ON public.commercial_interviews USING btree (status, completed_at);
CREATE INDEX competition_results_apparatus_idx ON public.competition_results USING btree (apparatus);
CREATE INDEX competition_results_athlete_idx ON public.competition_results USING btree (athlete_id);
CREATE INDEX competition_results_event_idx ON public.competition_results USING btree (event_id);
CREATE INDEX competition_results_rank_idx ON public.competition_results USING btree (rank);
CREATE INDEX competition_results_sport_config_idx ON public.competition_results USING btree (sport_config_id);
CREATE INDEX competition_results_tenant_idx ON public.competition_results USING btree (tenant_id);
CREATE UNIQUE INDEX competition_types_config_code_unique ON public.competition_types USING btree (sport_locale_config_id, code);
CREATE INDEX contact_messages_academy_idx ON public.contact_messages USING btree (academy_id);
CREATE INDEX contact_messages_created_at_idx ON public.contact_messages USING btree (created_at);
CREATE INDEX contact_messages_read_idx ON public.contact_messages USING btree (read);
CREATE INDEX conversation_messages_conversation_created_idx ON public.conversation_messages USING btree (conversation_id, created_at);
CREATE INDEX conversation_messages_conversation_idx ON public.conversation_messages USING btree (conversation_id);
CREATE INDEX conversation_messages_created_at_idx ON public.conversation_messages USING btree (created_at);
CREATE INDEX conversation_messages_sender_idx ON public.conversation_messages USING btree (sender_id);
CREATE UNIQUE INDEX conversation_participants_conversation_user_unique ON public.conversation_participants USING btree (conversation_id, user_id);
CREATE INDEX conversation_participants_hidden_idx ON public.conversation_participants USING btree (hidden_at);
CREATE INDEX conversation_participants_user_idx ON public.conversation_participants USING btree (user_id);
CREATE INDEX conversations_academy_idx ON public.conversations USING btree (academy_id);
CREATE INDEX conversations_last_message_at_idx ON public.conversations USING btree (last_message_at);
CREATE INDEX conversations_tenant_idx ON public.conversations USING btree (tenant_id);
CREATE INDEX countries_active_idx ON public.countries USING btree (is_active);
CREATE UNIQUE INDEX countries_code_unique ON public.countries USING btree (code);
CREATE INDEX directory_audit_actor_idx ON public.directory_audit USING btree (actor_id);
CREATE INDEX directory_audit_entry_idx ON public.directory_audit USING btree (entry_id);
CREATE INDEX directory_claims_decider_idx ON public.directory_claims USING btree (decided_by);
CREATE UNIQUE INDEX directory_claims_pending_idx ON public.directory_claims USING btree (entry_id, user_id) WHERE (status = ANY (ARRAY['pending'::text, 'disputed'::text]));
CREATE INDEX directory_claims_user_idx ON public.directory_claims USING btree (user_id);
CREATE INDEX directory_deliveries_subscription_idx ON public.directory_deliveries USING btree (subscription_id);
CREATE INDEX directory_entries_country_idx ON public.directory_entries USING btree (((data ->> 'countryCode'::text)));
CREATE INDEX directory_entries_date_idx ON public.directory_entries USING btree (((data ->> 'startDate'::text)));
CREATE INDEX directory_entries_merged_idx ON public.directory_entries USING btree (merged_into);
CREATE INDEX directory_entries_public_idx ON public.directory_entries USING btree (kind, publication);
CREATE INDEX directory_favorites_entry_idx ON public.directory_favorites USING btree (entry_id);
CREATE INDEX directory_grants_approver_idx ON public.directory_grants USING btree (approved_by);
CREATE INDEX directory_grants_user_idx ON public.directory_grants USING btree (user_id);
CREATE INDEX directory_import_rows_entry_idx ON public.directory_import_rows USING btree (entry_id);
CREATE INDEX directory_import_rows_source_idx ON public.directory_import_rows USING btree (source_id, external_id);
CREATE INDEX directory_revisions_entry_idx ON public.directory_revisions USING btree (entry_id);
CREATE INDEX directory_revisions_user_idx ON public.directory_revisions USING btree (user_id);
CREATE UNIQUE INDEX directory_subscriptions_active_idx ON public.directory_subscriptions USING btree (lower(email), purpose, md5((filters)::text)) WHERE (withdrawn_at IS NULL);
CREATE INDEX directory_subscriptions_user_idx ON public.directory_subscriptions USING btree (user_id);
CREATE INDEX discount_campaigns_active_dates_idx ON public.discount_campaigns USING btree (is_active, start_date, end_date);
CREATE INDEX discount_campaigns_discount_idx ON public.discount_campaigns USING btree (discount_id);
CREATE INDEX discount_campaigns_tenant_academy_idx ON public.discount_campaigns USING btree (tenant_id, academy_id);
CREATE INDEX discount_usage_history_athlete_idx ON public.discount_usage_history USING btree (athlete_id);
CREATE INDEX discount_usage_history_charge_idx ON public.discount_usage_history USING btree (charge_id);
CREATE INDEX discount_usage_history_discount_idx ON public.discount_usage_history USING btree (discount_id);
CREATE INDEX discount_usage_history_tenant_academy_idx ON public.discount_usage_history USING btree (tenant_id, academy_id);
CREATE INDEX discount_usage_history_used_at_idx ON public.discount_usage_history USING btree (used_at);
CREATE INDEX discounts_active_dates_idx ON public.discounts USING btree (is_active, start_date, end_date);
CREATE INDEX discounts_code_idx ON public.discounts USING btree (code);
CREATE INDEX discounts_code_unique ON public.discounts USING btree (academy_id, code);
CREATE INDEX discounts_tenant_academy_idx ON public.discounts USING btree (tenant_id, academy_id);
CREATE INDEX email_logs_academy_idx ON public.email_logs USING btree (academy_id);
CREATE INDEX email_logs_created_at_idx ON public.email_logs USING btree (created_at);
CREATE UNIQUE INDEX email_logs_idempotency_unique ON public.email_logs USING btree (idempotency_key);
CREATE INDEX email_logs_status_idx ON public.email_logs USING btree (status);
CREATE INDEX email_logs_template_idx ON public.email_logs USING btree (template);
CREATE INDEX email_logs_tenant_idx ON public.email_logs USING btree (tenant_id);
CREATE INDEX email_logs_user_idx ON public.email_logs USING btree (user_id);
CREATE INDEX empleo_academy_idx ON public.empleo_listings USING btree (academy_id);
CREATE INDEX empleo_category_idx ON public.empleo_listings USING btree (category);
CREATE INDEX empleo_created_at_idx ON public.empleo_listings USING btree (created_at);
CREATE INDEX empleo_status_idx ON public.empleo_listings USING btree (status);
CREATE INDEX event_categories_event_idx ON public.event_categories USING btree (event_id);
CREATE INDEX event_categories_tenant_idx ON public.event_categories USING btree (tenant_id);
CREATE INDEX event_invitations_athlete_idx ON public.event_invitations USING btree (athlete_id);
CREATE INDEX event_invitations_email_idx ON public.event_invitations USING btree (email);
CREATE INDEX event_invitations_guardian_idx ON public.event_invitations USING btree (guardian_id);
CREATE INDEX event_invitations_status_idx ON public.event_invitations USING btree (status);
CREATE INDEX event_invitations_tenant_event_idx ON public.event_invitations USING btree (tenant_id, event_id);
CREATE INDEX event_logs_academy_idx ON public.event_logs USING btree (academy_id);
CREATE INDEX event_logs_created_at_idx ON public.event_logs USING btree (created_at);
CREATE INDEX event_logs_event_type_idx ON public.event_logs USING btree (event_type);
CREATE INDEX event_payments_registration_idx ON public.event_payments USING btree (registration_id);
CREATE INDEX event_payments_tenant_idx ON public.event_payments USING btree (tenant_id);
CREATE INDEX event_registrations_event_idx ON public.event_registrations USING btree (event_id);
CREATE INDEX event_registrations_profile_idx ON public.event_registrations USING btree (profile_id);
CREATE INDEX event_registrations_tenant_idx ON public.event_registrations USING btree (tenant_id);
CREATE INDEX event_waitlist_event_idx ON public.event_waitlist USING btree (event_id);
CREATE INDEX event_waitlist_tenant_idx ON public.event_waitlist USING btree (tenant_id);
CREATE INDEX events_city_idx ON public.events USING btree (city);
CREATE INDEX events_competition_type_idx ON public.events USING btree (competition_type_code);
CREATE INDEX events_country_code_idx ON public.events USING btree (country_code);
CREATE INDEX events_country_idx ON public.events USING btree (country);
CREATE INDEX events_discipline_idx ON public.events USING btree (discipline);
CREATE INDEX events_event_type_idx ON public.events USING btree (event_type);
CREATE INDEX events_is_public_idx ON public.events USING btree (is_public);
CREATE INDEX events_level_idx ON public.events USING btree (level);
CREATE INDEX events_province_idx ON public.events USING btree (province);
CREATE INDEX events_registration_end_date_idx ON public.events USING btree (registration_end_date);
CREATE INDEX events_registration_start_date_idx ON public.events USING btree (registration_start_date);
CREATE INDEX events_sport_config_idx ON public.events USING btree (sport_config_id);
CREATE INDEX events_start_date_idx ON public.events USING btree (start_date);
CREATE INDEX events_status_idx ON public.events USING btree (status);
CREATE INDEX events_tenant_academy_idx ON public.events USING btree (tenant_id, academy_id);
CREATE INDEX family_contacts_athlete_idx ON public.family_contacts USING btree (athlete_id);
CREATE INDEX family_contacts_tenant_idx ON public.family_contacts USING btree (tenant_id);
CREATE UNIQUE INDEX family_stripe_customers_academy_profile_unique ON public.family_stripe_customers USING btree (academy_id, profile_id);
CREATE INDEX family_stripe_customers_customer_idx ON public.family_stripe_customers USING btree (stripe_customer_id);
CREATE INDEX family_stripe_customers_tenant_idx ON public.family_stripe_customers USING btree (tenant_id);
CREATE INDEX federative_licenses_license_number_idx ON public.federative_licenses USING btree (license_number);
CREATE INDEX federative_licenses_person_idx ON public.federative_licenses USING btree (person_id);
CREATE INDEX federative_licenses_sport_config_idx ON public.federative_licenses USING btree (sport_config_id);
CREATE INDEX federative_licenses_status_idx ON public.federative_licenses USING btree (status);
CREATE INDEX federative_licenses_tenant_idx ON public.federative_licenses USING btree (tenant_id);
CREATE INDEX federative_licenses_valid_until_idx ON public.federative_licenses USING btree (valid_until);
CREATE INDEX group_athletes_athlete_idx ON public.group_athletes USING btree (athlete_id);
CREATE INDEX group_athletes_group_idx ON public.group_athletes USING btree (group_id);
CREATE INDEX group_athletes_tenant_idx ON public.group_athletes USING btree (tenant_id);
CREATE UNIQUE INDEX group_athletes_unique ON public.group_athletes USING btree (group_id, athlete_id);
CREATE INDEX groups_academy_idx ON public.groups USING btree (academy_id);
CREATE INDEX groups_coach_idx ON public.groups USING btree (coach_id);
CREATE INDEX groups_deleted_at_idx ON public.groups USING btree (deleted_at);
CREATE INDEX groups_sport_config_idx ON public.groups USING btree (sport_config_id);
CREATE INDEX groups_tenant_idx ON public.groups USING btree (tenant_id);
CREATE INDEX growth_events_academy_occurred_idx ON public.growth_events USING btree (academy_id, occurred_at);
CREATE UNIQUE INDEX growth_events_event_id_unique ON public.growth_events USING btree (event_id);
CREATE INDEX growth_events_event_occurred_idx ON public.growth_events USING btree (event_name, occurred_at);
CREATE UNIQUE INDEX growth_events_idempotency_unique ON public.growth_events USING btree (idempotency_key);
CREATE INDEX growth_events_visitor_occurred_idx ON public.growth_events USING btree (visitor_id, occurred_at);
CREATE INDEX guardian_athletes_athlete_idx ON public.guardian_athletes USING btree (athlete_id);
CREATE INDEX guardian_athletes_guardian_idx ON public.guardian_athletes USING btree (guardian_id);
CREATE UNIQUE INDEX guardian_athletes_unique ON public.guardian_athletes USING btree (tenant_id, guardian_id, athlete_id);
CREATE INDEX guardians_email_idx ON public.guardians USING btree (email);
CREATE INDEX guardians_tenant_idx ON public.guardians USING btree (tenant_id);
CREATE INDEX idx_academies_fraud_hold_actor_id_fkey ON public.academies USING btree (fraud_hold_actor_id);
CREATE INDEX idx_academies_fraud_hold_cleared_actor_id_fkey ON public.academies USING btree (fraud_hold_cleared_actor_id);
CREATE INDEX idx_academies_owner_id_fkey ON public.academies USING btree (owner_id);
CREATE INDEX idx_academy_diagnostics_created_by_profile_id_fkey ON public.academy_diagnostics USING btree (created_by_profile_id);
CREATE INDEX idx_academy_expenses_class_id_fkey ON public.academy_expenses USING btree (class_id);
CREATE INDEX idx_academy_link_requests_requested_by_profile_id_fkey ON public.academy_link_requests USING btree (requested_by_profile_id);
CREATE INDEX idx_academy_sport_configs_sport_locale_config_id_fkey ON public.academy_sport_configs USING btree (sport_locale_config_id);
CREATE INDEX idx_academy_trials_started_by_fkey ON public.academy_trials USING btree (started_by);
CREATE INDEX idx_advertisements_created_by_fkey ON public.advertisements USING btree (created_by);
CREATE INDEX idx_assessment_scores_skill_id_fkey ON public.assessment_scores USING btree (skill_id);
CREATE INDEX idx_athlete_assessments_assessed_by_fkey ON public.athlete_assessments USING btree (assessed_by);
CREATE INDEX idx_athlete_import_batches_initiated_by_fkey ON public.athlete_import_batches USING btree (initiated_by);
CREATE INDEX idx_athlete_invitations_athlete_id_fkey ON public.athlete_invitations USING btree (athlete_id);
CREATE INDEX idx_athlete_invitations_invited_by_fkey ON public.athlete_invitations USING btree (invited_by);
CREATE INDEX idx_athletes_group_id_fkey ON public.athletes USING btree (group_id);
CREATE INDEX idx_athletes_template_id_fkey ON public.athletes USING btree (template_id);
CREATE INDEX idx_attendance_records_athlete_id_fkey ON public.attendance_records USING btree (athlete_id);
CREATE INDEX idx_billing_events_academy_id_fkey ON public.billing_events USING btree (academy_id);
CREATE INDEX idx_charges_athlete_id_fkey ON public.charges USING btree (athlete_id);
CREATE INDEX idx_charges_billing_item_id_fkey ON public.charges USING btree (billing_item_id);
CREATE INDEX idx_churn_reasons_created_by_profile_id_fkey ON public.churn_reasons USING btree (created_by_profile_id);
CREATE INDEX idx_class_exceptions_class_id ON public.class_exceptions USING btree (class_id);
CREATE INDEX idx_class_exceptions_date ON public.class_exceptions USING btree (exception_date);
CREATE INDEX idx_class_exceptions_tenant_id ON public.class_exceptions USING btree (tenant_id);
CREATE INDEX idx_class_exceptions_type ON public.class_exceptions USING btree (exception_type);
CREATE INDEX idx_class_sessions_coach_id_fkey ON public.class_sessions USING btree (coach_id);
CREATE INDEX idx_class_waiting_list_academy_id_fkey ON public.class_waiting_list USING btree (academy_id);
CREATE INDEX idx_classes_academy_id_fkey ON public.classes USING btree (academy_id);
CREATE INDEX idx_coach_notes_academy_id_fkey ON public.coach_notes USING btree (academy_id);
CREATE INDEX idx_coach_notes_author_id_fkey ON public.coach_notes USING btree (author_id);
CREATE INDEX idx_coaches_academy_id_fkey ON public.coaches USING btree (academy_id);
CREATE INDEX idx_coaches_profile_id_fkey ON public.coaches USING btree (profile_id);
CREATE INDEX idx_commercial_interviews_created_by_profile_id_fkey ON public.commercial_interviews USING btree (created_by_profile_id);
CREATE INDEX idx_commercial_interviews_updated_by_profile_id_fkey ON public.commercial_interviews USING btree (updated_by_profile_id);
CREATE INDEX idx_discount_campaigns_academy_id_fkey ON public.discount_campaigns USING btree (academy_id);
CREATE INDEX idx_discount_campaigns_created_by_fkey ON public.discount_campaigns USING btree (created_by);
CREATE INDEX idx_discount_usage_history_academy_id_fkey ON public.discount_usage_history USING btree (academy_id);
CREATE INDEX idx_discounts_created_by_fkey ON public.discounts USING btree (created_by);
CREATE INDEX idx_event_invitations_event_id_fkey ON public.event_invitations USING btree (event_id);
CREATE INDEX idx_event_invitations_invited_by_fkey ON public.event_invitations USING btree (invited_by);
CREATE INDEX idx_event_waitlist_profile_id_fkey ON public.event_waitlist USING btree (profile_id);
CREATE INDEX idx_events_academy_id_fkey ON public.events USING btree (academy_id);
CREATE INDEX idx_family_stripe_customers_profile_id_fkey ON public.family_stripe_customers USING btree (profile_id);
CREATE INDEX idx_groups_billing_item_id_fkey ON public.groups USING btree (billing_item_id);
CREATE INDEX idx_growth_events_user_id_fkey ON public.growth_events USING btree (user_id);
CREATE INDEX idx_invitations_default_academy_id_fkey ON public.invitations USING btree (default_academy_id);
CREATE INDEX idx_invitations_invited_by_fkey ON public.invitations USING btree (invited_by);
CREATE INDEX idx_lead_trial_outcomes_academy_id_fkey ON public.lead_trial_outcomes USING btree (academy_id);
CREATE INDEX idx_lead_trial_outcomes_lead_trial_id_fkey ON public.lead_trial_outcomes USING btree (lead_trial_id);
CREATE INDEX idx_lead_trial_outcomes_recorded_by_fkey ON public.lead_trial_outcomes USING btree (recorded_by);
CREATE INDEX idx_lead_trials_created_by_fkey ON public.lead_trials USING btree (created_by);
CREATE INDEX idx_lead_trials_lead_id_fkey ON public.lead_trials USING btree (lead_id);
CREATE INDEX idx_leads_academy_id_fkey ON public.leads USING btree (academy_id);
CREATE INDEX idx_marketplace_ratings_reviewer_id_fkey ON public.marketplace_ratings USING btree (reviewer_id);
CREATE INDEX idx_onboarding_states_owner_profile_id_fkey ON public.onboarding_states USING btree (owner_profile_id);
CREATE INDEX idx_owner_consent_audit_previous_audit_id_fkey ON public.owner_consent_audit USING btree (previous_audit_id);
CREATE INDEX idx_payment_attempts_academy_id_fkey ON public.payment_attempts USING btree (academy_id);
CREATE INDEX idx_receipts_created_by_fkey ON public.receipts USING btree (created_by);
CREATE INDEX idx_refunds_academy_id_fkey ON public.refunds USING btree (academy_id);
CREATE INDEX idx_refunds_created_by_fkey ON public.refunds USING btree (created_by);
CREATE INDEX idx_scholarships_academy_id_fkey ON public.scholarships USING btree (academy_id);
CREATE INDEX idx_scholarships_created_by_fkey ON public.scholarships USING btree (created_by);
CREATE INDEX idx_sport_locale_configs_discipline_id_fkey ON public.sport_locale_configs USING btree (discipline_id);
CREATE INDEX idx_ticket_attachments_uploaded_by_fkey ON public.ticket_attachments USING btree (uploaded_by);
CREATE UNIQUE INDEX invitations_email_tenant_unique ON public.invitations USING btree (tenant_id, email);
CREATE INDEX invitations_role_idx ON public.invitations USING btree (role_id);
CREATE INDEX invitations_status_idx ON public.invitations USING btree (status);
CREATE INDEX invitations_tenant_idx ON public.invitations USING btree (tenant_id);
CREATE UNIQUE INDEX invitations_token_unique ON public.invitations USING btree (token);
CREATE INDEX lead_interactions_lead_idx ON public.lead_interactions USING btree (lead_id, created_at);
CREATE UNIQUE INDEX lead_interactions_submission_idx ON public.lead_interactions USING btree (submission_id);
CREATE UNIQUE INDEX lead_trial_outcomes_idempotency_idx ON public.lead_trial_outcomes USING btree (tenant_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);
CREATE INDEX lead_trial_outcomes_trial_idx ON public.lead_trial_outcomes USING btree (tenant_id, lead_trial_id, created_at);
CREATE INDEX lead_trials_academy_status_idx ON public.lead_trials USING btree (academy_id, status);
CREATE UNIQUE INDEX lead_trials_idempotency_idx ON public.lead_trials USING btree (tenant_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);
CREATE INDEX lead_trials_tenant_lead_idx ON public.lead_trials USING btree (tenant_id, lead_id);
CREATE INDEX leads_ownership_idx ON public.leads USING btree (tenant_id, academy_id);
CREATE INDEX leak_action_history_academy_created_idx ON public.leak_action_history USING btree (academy_id, created_at);
CREATE INDEX leak_action_history_athlete_idx ON public.leak_action_history USING btree (athlete_id);
CREATE INDEX leak_action_history_class_idx ON public.leak_action_history USING btree (class_id);
CREATE INDEX leak_action_history_tenant_idx ON public.leak_action_history USING btree (tenant_id);
CREATE UNIQUE INDEX levels_config_code_unique ON public.levels USING btree (sport_locale_config_id, code);
CREATE INDEX levels_config_program_idx ON public.levels USING btree (sport_locale_config_id, program_code);
CREATE INDEX marketplace_category_idx ON public.marketplace_listings USING btree (category);
CREATE INDEX marketplace_created_at_idx ON public.marketplace_listings USING btree (created_at);
CREATE INDEX marketplace_status_idx ON public.marketplace_listings USING btree (status);
CREATE INDEX marketplace_type_idx ON public.marketplace_listings USING btree (type);
CREATE INDEX marketplace_user_idx ON public.marketplace_listings USING btree (user_id);
CREATE INDEX memberships_academy_id_idx ON public.memberships USING btree (academy_id);
CREATE UNIQUE INDEX memberships_user_academy_uq ON public.memberships USING btree (user_id, academy_id);
CREATE INDEX message_groups_academy_idx ON public.message_groups USING btree (academy_id);
CREATE INDEX message_groups_tenant_idx ON public.message_groups USING btree (tenant_id);
CREATE INDEX message_history_created_at_idx ON public.message_history USING btree (created_at);
CREATE INDEX message_history_profile_idx ON public.message_history USING btree (profile_id);
CREATE INDEX message_history_sport_config_idx ON public.message_history USING btree (sport_config_id);
CREATE INDEX message_history_status_idx ON public.message_history USING btree (status);
CREATE INDEX message_history_tenant_idx ON public.message_history USING btree (tenant_id);
CREATE UNIQUE INDEX message_read_receipts_message_user_unique ON public.message_read_receipts USING btree (message_id, user_id);
CREATE INDEX message_read_receipts_user_idx ON public.message_read_receipts USING btree (user_id);
CREATE INDEX message_templates_academy_idx ON public.message_templates USING btree (academy_id);
CREATE INDEX message_templates_sport_config_idx ON public.message_templates USING btree (sport_config_id);
CREATE INDEX message_templates_tenant_idx ON public.message_templates USING btree (tenant_id);
CREATE INDEX notification_preferences_profile_idx ON public.notification_preferences USING btree (profile_id);
CREATE INDEX notifications_created_at_idx ON public.notifications USING btree (created_at);
CREATE INDEX notifications_tenant_user_idx ON public.notifications USING btree (tenant_id, user_id);
CREATE INDEX notifications_type_idx ON public.notifications USING btree (type);
CREATE INDEX notifications_user_read_created_idx ON public.notifications USING btree (user_id, read, created_at);
CREATE INDEX notifications_user_read_idx ON public.notifications USING btree (user_id, read);
CREATE UNIQUE INDEX onboarding_checklist_academy_key_unique ON public.onboarding_checklist_items USING btree (academy_id, key);
CREATE INDEX onboarding_checklist_status_idx ON public.onboarding_checklist_items USING btree (status);
CREATE INDEX onboarding_checklist_tenant_idx ON public.onboarding_checklist_items USING btree (tenant_id);
CREATE UNIQUE INDEX onboarding_states_academy_unique ON public.onboarding_states USING btree (academy_id);
CREATE INDEX onboarding_states_tenant_idx ON public.onboarding_states USING btree (tenant_id);
CREATE INDEX owner_consent_audit_event_recorded_idx ON public.owner_consent_audit USING btree (event, recorded_at);
CREATE INDEX owner_consent_audit_owner_recorded_idx ON public.owner_consent_audit USING btree (owner_id, recorded_at DESC);
CREATE INDEX owner_consent_policy_version_idx ON public.owner_consent USING btree (policy_version);
CREATE INDEX payment_attempts_charge_idx ON public.payment_attempts USING btree (charge_id);
CREATE INDEX payment_attempts_payment_intent_idx ON public.payment_attempts USING btree (stripe_payment_intent_id);
CREATE INDEX payment_attempts_tenant_idx ON public.payment_attempts USING btree (tenant_id);
CREATE INDEX profiles_active_academy_idx ON public.profiles USING btree (active_academy_id);
CREATE INDEX profiles_tenant_role_idx ON public.profiles USING btree (tenant_id, role);
CREATE UNIQUE INDEX programs_config_code_unique ON public.programs USING btree (sport_locale_config_id, code);
CREATE INDEX programs_config_sort_idx ON public.programs USING btree (sport_locale_config_id, sort_order);
CREATE INDEX push_subscriptions_endpoint_idx ON public.push_subscriptions USING btree (endpoint);
CREATE UNIQUE INDEX push_subscriptions_user_endpoint_unique ON public.push_subscriptions USING btree (user_id, endpoint);
CREATE INDEX push_subscriptions_user_id_idx ON public.push_subscriptions USING btree (user_id);
CREATE INDEX push_tokens_user_idx ON public.push_tokens USING btree (user_id);
CREATE UNIQUE INDEX push_tokens_user_token_unique ON public.push_tokens USING btree (user_id, token);
CREATE INDEX rating_listing_idx ON public.marketplace_ratings USING btree (listing_id);
CREATE INDEX rating_seller_idx ON public.marketplace_ratings USING btree (seller_id);
CREATE INDEX receipts_athlete_idx ON public.receipts USING btree (athlete_id);
CREATE INDEX receipts_charge_idx ON public.receipts USING btree (charge_id);
CREATE INDEX receipts_number_unique ON public.receipts USING btree (academy_id, receipt_number);
CREATE INDEX receipts_receipt_number_idx ON public.receipts USING btree (receipt_number);
CREATE INDEX receipts_tenant_academy_idx ON public.receipts USING btree (tenant_id, academy_id);
CREATE INDEX refunds_charge_idx ON public.refunds USING btree (charge_id);
CREATE INDEX refunds_refund_id_idx ON public.refunds USING btree (stripe_refund_id);
CREATE INDEX refunds_tenant_idx ON public.refunds USING btree (tenant_id);
CREATE INDEX role_members_academy_idx ON public.role_members USING btree (academy_id);
CREATE INDEX role_members_role_idx ON public.role_members USING btree (role_id);
CREATE UNIQUE INDEX role_members_uq ON public.role_members USING btree (role_id, user_id);
CREATE INDEX role_members_user_idx ON public.role_members USING btree (user_id);
CREATE INDEX rubric_criteria_rubric_idx ON public.rubric_criteria USING btree (rubric_id);
CREATE INDEX scheduled_notifications_academy_idx ON public.scheduled_notifications USING btree (academy_id);
CREATE INDEX scheduled_notifications_status_idx ON public.scheduled_notifications USING btree (status);
CREATE INDEX scheduled_notifications_tenant_idx ON public.scheduled_notifications USING btree (tenant_id);
CREATE INDEX scheduled_reports_academy_idx ON public.scheduled_reports USING btree (academy_id);
CREATE INDEX scholarships_active_idx ON public.scholarships USING btree (is_active, start_date, end_date);
CREATE INDEX scholarships_athlete_idx ON public.scholarships USING btree (athlete_id);
CREATE INDEX scholarships_dates_idx ON public.scholarships USING btree (start_date, end_date);
CREATE INDEX scholarships_tenant_academy_idx ON public.scholarships USING btree (tenant_id, academy_id);
CREATE INDEX skill_catalog_code_idx ON public.skill_catalog USING btree (skill_code);
CREATE INDEX skill_catalog_tenant_idx ON public.skill_catalog USING btree (tenant_id);
CREATE UNIQUE INDEX sport_branches_discipline_code_unique ON public.sport_branches USING btree (discipline_id, code);
CREATE INDEX sport_branches_discipline_idx ON public.sport_branches USING btree (discipline_id);
CREATE INDEX sport_disciplines_active_idx ON public.sport_disciplines USING btree (is_active);
CREATE UNIQUE INDEX sport_disciplines_code_unique ON public.sport_disciplines USING btree (code);
CREATE INDEX sport_locale_configs_branch_idx ON public.sport_locale_configs USING btree (branch_id);
CREATE UNIQUE INDEX sport_locale_configs_code_unique ON public.sport_locale_configs USING btree (code);
CREATE UNIQUE INDEX sport_locale_configs_country_discipline_branch_unique ON public.sport_locale_configs USING btree (country_id, discipline_id, branch_id);
CREATE INDEX sport_locale_configs_country_idx ON public.sport_locale_configs USING btree (country_id);
CREATE UNIQUE INDEX stripe_accounts_academy_unique ON public.stripe_accounts USING btree (academy_id);
CREATE INDEX stripe_accounts_account_id_idx ON public.stripe_accounts USING btree (stripe_account_id);
CREATE INDEX stripe_accounts_tenant_idx ON public.stripe_accounts USING btree (tenant_id);
CREATE INDEX subscriptions_plan_id_idx ON public.subscriptions USING btree (plan_id);
CREATE INDEX subscriptions_user_id_idx ON public.subscriptions USING btree (user_id);
CREATE UNIQUE INDEX subscriptions_user_id_unique ON public.subscriptions USING btree (user_id);
CREATE INDEX template_age_categories_sort_idx ON public.template_age_categories USING btree (template_id, sort_order);
CREATE INDEX template_age_categories_template_idx ON public.template_age_categories USING btree (template_id);
CREATE INDEX template_apparatus_sort_idx ON public.template_apparatus USING btree (template_id, sort_order);
CREATE INDEX template_apparatus_template_idx ON public.template_apparatus USING btree (template_id);
CREATE INDEX template_competition_flow_stage_idx ON public.template_competition_flow USING btree (template_id, stage_order);
CREATE INDEX template_competition_flow_template_idx ON public.template_competition_flow USING btree (template_id);
CREATE INDEX template_competition_levels_sort_idx ON public.template_competition_levels USING btree (template_id, sort_order);
CREATE INDEX template_competition_levels_template_idx ON public.template_competition_levels USING btree (template_id);
CREATE INDEX template_license_config_template_idx ON public.template_license_config USING btree (template_id);
CREATE INDEX template_scoring_config_template_idx ON public.template_scoring_config USING btree (template_id);
CREATE INDEX templates_active_idx ON public.templates USING btree (is_active);
CREATE INDEX templates_country_idx ON public.templates USING btree (country);
CREATE INDEX templates_discipline_idx ON public.templates USING btree (discipline);
CREATE UNIQUE INDEX terminology_dictionary_config_unique ON public.terminology_dictionary USING btree (sport_locale_config_id);
CREATE INDEX ticket_attachments_response_id_idx ON public.ticket_attachments USING btree (response_id);
CREATE INDEX ticket_attachments_ticket_id_idx ON public.ticket_attachments USING btree (ticket_id);
CREATE INDEX ticket_responses_ticket_id_idx ON public.ticket_responses USING btree (ticket_id);
CREATE INDEX ticket_responses_user_id_idx ON public.ticket_responses USING btree (user_id);
CREATE INDEX tickets_academy_id_idx ON public.tickets USING btree (academy_id);
CREATE INDEX tickets_assigned_to_idx ON public.tickets USING btree (assigned_to);
CREATE INDEX tickets_created_by_idx ON public.tickets USING btree (created_by);
CREATE INDEX tickets_status_idx ON public.tickets USING btree (status);
CREATE UNIQUE INDEX unique_class_exception ON public.class_exceptions USING btree (class_id, exception_date);
CREATE UNIQUE INDEX user_preferences_user_id_unique ON public.user_preferences USING btree (user_id);
CREATE INDEX athletes_organization_active_idx ON zaltyko.athletes USING btree (organization_id, is_active);
CREATE INDEX attendance_records_athlete_idx ON zaltyko.attendance_records USING btree (organization_id, athlete_id, recorded_at);
CREATE INDEX audit_log_created_idx ON zaltyko.audit_log USING btree (organization_id, created_at);
CREATE UNIQUE INDEX audit_log_idempotency_uq ON zaltyko.audit_log USING btree (organization_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);
CREATE INDEX audit_log_target_idx ON zaltyko.audit_log USING btree (organization_id, target_type, target_id);
CREATE UNIQUE INDEX benchmark_profiles_key_version_uq ON zaltyko.benchmark_profiles USING btree (COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), key, version);
CREATE INDEX charges_due_status_idx ON zaltyko.charges USING btree (organization_id, status, due_at);
CREATE INDEX charges_service_period_idx ON zaltyko.charges USING btree (organization_id, currency, service_period_start, service_period_end);
CREATE INDEX class_templates_location_status_idx ON zaltyko.class_templates USING btree (organization_id, location_id, status);
CREATE UNIQUE INDEX class_templates_organization_location_id_uq ON zaltyko.class_templates USING btree (organization_id, location_id, id);
CREATE INDEX data_quality_issues_open_idx ON zaltyko.data_quality_issues USING btree (organization_id, status, detected_at DESC);
CREATE INDEX enrollment_pauses_enrollment_idx ON zaltyko.enrollment_pauses USING btree (organization_id, enrollment_id);
CREATE UNIQUE INDEX enrollment_pauses_one_open_uq ON zaltyko.enrollment_pauses USING btree (organization_id, enrollment_id) WHERE (ends_on IS NULL);
CREATE UNIQUE INDEX enrollment_price_assignments_one_open_uq ON zaltyko.enrollment_price_assignments USING btree (organization_id, enrollment_id) WHERE (ends_on IS NULL);
CREATE INDEX enrollment_price_assignments_period_idx ON zaltyko.enrollment_price_assignments USING btree (organization_id, enrollment_id, starts_on, ends_on);
CREATE INDEX enrollment_status_history_effective_idx ON zaltyko.enrollment_status_history USING btree (organization_id, enrollment_id, effective_on, changed_at);
CREATE INDEX enrollment_status_history_enrollment_idx ON zaltyko.enrollment_status_history USING btree (organization_id, enrollment_id, changed_at);
CREATE INDEX enrollments_athlete_status_idx ON zaltyko.enrollments USING btree (organization_id, athlete_id, status);
CREATE INDEX enrollments_class_status_idx ON zaltyko.enrollments USING btree (organization_id, class_template_id, status);
CREATE UNIQUE INDEX enrollments_open_uq ON zaltyko.enrollments USING btree (organization_id, athlete_id, class_template_id) WHERE (status = ANY (ARRAY['pending'::zaltyko.enrollment_status, 'trial'::zaltyko.enrollment_status, 'active'::zaltyko.enrollment_status, 'paused'::zaltyko.enrollment_status]));
CREATE UNIQUE INDEX enrollments_organization_location_id_uq ON zaltyko.enrollments USING btree (organization_id, location_id, id);
CREATE INDEX facilities_location_idx ON zaltyko.facilities USING btree (organization_id, location_id);
CREATE INDEX families_organization_active_idx ON zaltyko.families USING btree (organization_id, is_active);
CREATE INDEX family_collection_preferences_mode_idx ON zaltyko.family_collection_preferences USING btree (organization_id, requested_mode, entitlement_revision);
CREATE INDEX family_members_athlete_idx ON zaltyko.family_members USING btree (organization_id, athlete_id, ends_on);
CREATE UNIQUE INDEX family_members_one_open_uq ON zaltyko.family_members USING btree (organization_id, family_id, athlete_id) WHERE (ends_on IS NULL);
CREATE INDEX family_payers_guardian_idx ON zaltyko.family_payers USING btree (organization_id, guardian_id, ends_on);
CREATE UNIQUE INDEX family_payers_one_primary_uq ON zaltyko.family_payers USING btree (organization_id, family_id) WHERE (is_primary AND (ends_on IS NULL));
CREATE UNIQUE INDEX family_payers_organization_family_id_uq ON zaltyko.family_payers USING btree (organization_id, family_id, id);
CREATE UNIQUE INDEX family_payers_organization_id_id_uq ON zaltyko.family_payers USING btree (organization_id, id);
CREATE UNIQUE INDEX family_payment_authorizations_active_method_uq ON zaltyko.family_payment_authorizations USING btree (organization_id, payment_provider_account_id, family_payer_id) WHERE (status = 'active'::zaltyko.payment_authorization_status);
CREATE INDEX family_payment_authorizations_payer_status_idx ON zaltyko.family_payment_authorizations USING btree (organization_id, family_id, family_payer_id, status, valid_until);
CREATE INDEX group_membership_history_effective_idx ON zaltyko.group_membership_history USING btree (organization_id, membership_id, effective_on, changed_at);
CREATE INDEX group_membership_history_membership_idx ON zaltyko.group_membership_history USING btree (organization_id, membership_id, changed_at);
CREATE INDEX group_memberships_athlete_idx ON zaltyko.group_memberships USING btree (organization_id, athlete_id, status);
CREATE INDEX group_memberships_group_idx ON zaltyko.group_memberships USING btree (organization_id, group_id, status);
CREATE UNIQUE INDEX group_memberships_open_uq ON zaltyko.group_memberships USING btree (organization_id, group_id, athlete_id) WHERE (status = ANY (ARRAY['pending'::zaltyko.group_membership_status, 'active'::zaltyko.group_membership_status, 'paused'::zaltyko.group_membership_status]));
CREATE UNIQUE INDEX group_memberships_organization_id_id_uq ON zaltyko.group_memberships USING btree (organization_id, id);
CREATE INDEX groups_location_status_idx ON zaltyko.groups USING btree (organization_id, location_id, status);
CREATE UNIQUE INDEX guardian_contacts_primary_kind_uq ON zaltyko.guardian_contacts USING btree (organization_id, guardian_id, kind) WHERE is_primary;
CREATE INDEX guardians_auth_user_idx ON zaltyko.guardians USING btree (auth_user_id);
CREATE INDEX health_score_snapshots_dashboard_idx ON zaltyko.health_score_snapshots USING btree (organization_id, period_end DESC, computed_at DESC);
CREATE INDEX insights_inbox_idx ON zaltyko.insights USING btree (organization_id, status, priority_score DESC, last_seen_at DESC);
CREATE INDEX insights_location_inbox_idx ON zaltyko.insights USING btree (organization_id, location_id, status, priority_score DESC);
CREATE INDEX invoice_line_enrollments_enrollment_idx ON zaltyko.invoice_line_enrollments USING btree (organization_id, location_id, enrollment_id);
CREATE UNIQUE INDEX invoice_lines_coverage_parent_fk_uq ON zaltyko.invoice_lines USING btree (organization_id, location_id, athlete_id, price_plan_id, id);
CREATE INDEX invoice_lines_invoice_idx ON zaltyko.invoice_lines USING btree (organization_id, invoice_id);
CREATE UNIQUE INDEX invoice_lines_monthly_athlete_uq ON zaltyko.invoice_lines USING btree (organization_id, invoice_id, athlete_id, service_period_start, service_period_end) WHERE ((line_type = 'monthly_fee'::text) AND (athlete_id IS NOT NULL));
CREATE INDEX invoices_due_status_idx ON zaltyko.invoices USING btree (organization_id, status, due_at);
CREATE INDEX locations_organization_idx ON zaltyko.locations USING btree (organization_id);
CREATE INDEX member_location_scopes_location_idx ON zaltyko.member_location_scopes USING btree (organization_id, location_id);
CREATE INDEX metric_invalidations_pending_idx ON zaltyko.metric_invalidations USING btree (organization_id, status, affected_from, affected_to);
CREATE UNIQUE INDEX metric_run_values_natural_uq ON zaltyko.metric_run_values USING btree (metric_run_id, COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid), metric_key, dimensions_sha256, COALESCE(currency, ''::text));
CREATE UNIQUE INDEX metric_run_values_organization_id_id_uq ON zaltyko.metric_run_values USING btree (organization_id, id);
CREATE INDEX metric_runs_period_idx ON zaltyko.metric_runs USING btree (organization_id, period_end DESC, started_at DESC);
CREATE INDEX metric_values_dashboard_idx ON zaltyko.metric_values USING btree (organization_id, period_end DESC, metric_key);
CREATE UNIQUE INDEX metric_values_natural_uq ON zaltyko.metric_values USING btree (organization_id, COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid), metric_key, period_start, period_end, dimensions_sha256, formula_version, COALESCE(currency, ''::text));
CREATE INDEX organization_entitlement_changes_history_idx ON zaltyko.organization_entitlement_changes USING btree (organization_id, revision DESC);
CREATE INDEX organization_members_user_idx ON zaltyko.organization_members USING btree (user_id);
CREATE INDEX organization_payment_provider_accounts_collection_ready_idx ON zaltyko.organization_payment_provider_accounts USING btree (organization_id, environment, status, card_payments_capability_status);
CREATE UNIQUE INDEX organization_saas_checkout_one_pending_per_org_uq ON zaltyko.organization_saas_checkout_operations USING btree (organization_id) WHERE (status = ANY (ARRAY['requested'::text, 'creating_customer'::text, 'creating_session'::text, 'open'::text, 'recovery_required'::text]));
CREATE INDEX organization_saas_checkout_recovery_idx ON zaltyko.organization_saas_checkout_operations USING btree (status, updated_at) WHERE (status = ANY (ARRAY['creating_customer'::text, 'creating_session'::text, 'recovery_required'::text]));
CREATE UNIQUE INDEX organization_saas_subscriptions_organization_uq ON zaltyko.organization_saas_subscriptions USING btree (organization_id);
CREATE INDEX organization_saas_subscriptions_status_idx ON zaltyko.organization_saas_subscriptions USING btree (organization_id, provider_status, current_period_ends_at);
CREATE INDEX organization_saas_trials_cooldown_idx ON zaltyko.organization_saas_trials USING btree (organization_id, started_at DESC);
CREATE UNIQUE INDEX organization_saas_trials_one_active_uq ON zaltyko.organization_saas_trials USING btree (organization_id) WHERE (status = 'active'::zaltyko.organization_saas_trial_status);
CREATE UNIQUE INDEX organization_saas_webhook_events_org_id_id_uq ON zaltyko.organization_saas_webhook_events USING btree (organization_id, id);
CREATE INDEX organization_saas_webhook_events_org_idx ON zaltyko.organization_saas_webhook_events USING btree (organization_id, received_at DESC) WHERE (organization_id IS NOT NULL);
CREATE INDEX organization_saas_webhook_events_queue_idx ON zaltyko.organization_saas_webhook_events USING btree (status, received_at) WHERE (status = ANY (ARRAY['received'::text, 'failed'::text]));
CREATE UNIQUE INDEX organization_sports_active_profile_uq ON zaltyko.organization_sports USING btree (organization_id, sport_profile_id) WHERE (status = 'active'::zaltyko.organization_sport_status);
CREATE UNIQUE INDEX organization_sports_primary_active_uq ON zaltyko.organization_sports USING btree (organization_id) WHERE ((role = 'primary'::zaltyko.organization_sport_role) AND (status = 'active'::zaltyko.organization_sport_status));
CREATE INDEX organization_sports_profile_idx ON zaltyko.organization_sports USING btree (country_code, sport_profile_id);
CREATE INDEX outbox_events_dispatch_idx ON zaltyko.outbox_events USING btree (status, available_at);
CREATE UNIQUE INDEX outbox_events_organization_id_id_uq ON zaltyko.outbox_events USING btree (organization_id, id);
CREATE INDEX outbox_events_unsettled_freshness_idx ON zaltyko.outbox_events USING btree (organization_id, location_id, occurred_at) WHERE (status = ANY (ARRAY['pending'::zaltyko.outbox_status, 'processing'::zaltyko.outbox_status, 'failed'::zaltyko.outbox_status]));
CREATE INDEX owner_signup_consent_audits_user_recorded_idx ON zaltyko.owner_signup_consent_audits USING btree (user_id, recorded_at);
CREATE INDEX owner_signup_consents_policy_version_idx ON zaltyko.owner_signup_consents USING btree (policy_version);
CREATE INDEX payment_allocations_charge_idx ON zaltyko.payment_allocations USING btree (organization_id, charge_id, allocated_at);
CREATE INDEX payment_allocations_payment_idx ON zaltyko.payment_allocations USING btree (organization_id, payment_id, allocated_at);
CREATE INDEX payment_attempts_invoice_idx ON zaltyko.payment_attempts USING btree (organization_id, invoice_id, attempted_at);
CREATE INDEX payment_provider_events_processing_idx ON zaltyko.payment_provider_events USING btree (status, received_at);
CREATE UNIQUE INDEX payments_provider_uq ON zaltyko.payments USING btree (processor, environment, provider_payment_id) WHERE (source = 'provider'::zaltyko.payment_source);
CREATE INDEX payments_received_idx ON zaltyko.payments USING btree (organization_id, currency, received_at);
CREATE INDEX people_organization_idx ON zaltyko.people USING btree (organization_id);
CREATE INDEX price_plan_class_template_coverage_lookup_idx ON zaltyko.price_plan_class_template_coverage USING btree (organization_id, location_id, price_plan_id, class_template_id, starts_on, ends_on);
CREATE INDEX programs_organization_activity_idx ON zaltyko.programs USING btree (organization_id, activity_key) WHERE (activity_key IS NOT NULL);
CREATE INDEX programs_organization_sport_idx ON zaltyko.programs USING btree (organization_id, organization_sport_id) WHERE (organization_sport_id IS NOT NULL);
CREATE INDEX programs_organization_status_idx ON zaltyko.programs USING btree (organization_id, status);
CREATE INDEX refunds_payment_idx ON zaltyko.refunds USING btree (organization_id, payment_id, refunded_at);
CREATE INDEX retention_cohort_projection_runs_latest_idx ON zaltyko.retention_cohort_projection_runs USING btree (organization_id, location_id, status, source_watermark DESC, completed_at DESC);
CREATE INDEX retention_cohort_projections_read_idx ON zaltyko.retention_cohort_projections USING btree (organization_id, location_id, program_id, group_id, cohort_month, observation_month, projection_run_id);
CREATE INDEX retention_cohort_projections_run_idx ON zaltyko.retention_cohort_projections USING btree (organization_id, projection_run_id);
CREATE UNIQUE INDEX retention_cohort_projections_scope_period_uq ON zaltyko.retention_cohort_projections USING btree (organization_id, projection_run_id, COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(program_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(group_id, '00000000-0000-0000-0000-000000000000'::uuid), cohort_month, observation_month);
CREATE INDEX saas_webhook_reconciliation_event_idx ON zaltyko.organization_saas_webhook_reconciliation_decisions USING btree (organization_id, webhook_event_id, created_at DESC);
CREATE INDEX saas_webhook_reconciliation_queue_idx ON zaltyko.organization_saas_webhook_events USING btree (reconciliation_next_attempt_at, received_at) WHERE ((reconciliation_decision_id IS NOT NULL) AND (status = ANY (ARRAY['received'::text, 'failed'::text])));
CREATE INDEX sessions_location_start_idx ON zaltyko.sessions USING btree (organization_id, location_id, starts_at);
CREATE UNIQUE INDEX sessions_organization_location_id_uq ON zaltyko.sessions USING btree (organization_id, location_id, id);
CREATE INDEX spaces_facility_idx ON zaltyko.spaces USING btree (organization_id, facility_id);
CREATE INDEX spaces_location_idx ON zaltyko.spaces USING btree (organization_id, location_id);
CREATE INDEX trial_followups_trial_completed_idx ON zaltyko.trial_followups USING btree (organization_id, trial_id, completed_at);
CREATE INDEX trial_status_history_trial_idx ON zaltyko.trial_status_history USING btree (organization_id, trial_id, effective_at, changed_at);
CREATE INDEX trials_location_status_idx ON zaltyko.trials USING btree (organization_id, location_id, status, booked_at);
CREATE INDEX waitlist_entries_actionable_idx ON zaltyko.waitlist_entries USING btree (organization_id, location_id, status, contactable, priority DESC, joined_at);
CREATE UNIQUE INDEX waitlist_entries_open_program_uq ON zaltyko.waitlist_entries USING btree (organization_id, location_id, athlete_id, program_id) WHERE ((program_id IS NOT NULL) AND (status = ANY (ARRAY['waiting'::zaltyko.waitlist_status, 'offered'::zaltyko.waitlist_status])));
CREATE UNIQUE INDEX waitlist_entries_open_template_uq ON zaltyko.waitlist_entries USING btree (organization_id, athlete_id, class_template_id) WHERE ((class_template_id IS NOT NULL) AND (status = ANY (ARRAY['waiting'::zaltyko.waitlist_status, 'offered'::zaltyko.waitlist_status])));
CREATE INDEX waitlist_offers_expiry_idx ON zaltyko.waitlist_offers USING btree (organization_id, status, expires_at);
CREATE UNIQUE INDEX waitlist_offers_one_pending_uq ON zaltyko.waitlist_offers USING btree (organization_id, waitlist_entry_id) WHERE (status = 'pending'::zaltyko.waitlist_offer_status);

-- Trigger definitions are replayed after their functions.
CREATE TRIGGER directory_academy_deleted BEFORE DELETE ON public.academies FOR EACH ROW EXECUTE FUNCTION public.directory_withdraw_deleted_authority();

CREATE TRIGGER sync_academy_status_legacy BEFORE UPDATE ON public.academies FOR EACH ROW EXECUTE FUNCTION public.sync_academy_status_from_legacy();

CREATE TRIGGER athlete_invitations_set_updated_at BEFORE UPDATE ON public.athlete_invitations FOR EACH ROW EXECUTE FUNCTION public.athlete_invitations_set_updated_at();

CREATE TRIGGER directory_event_deleted BEFORE DELETE ON public.events FOR EACH ROW EXECUTE FUNCTION public.directory_withdraw_deleted_authority();

CREATE TRIGGER owner_consent_set_updated_at BEFORE UPDATE ON public.owner_consent FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER owner_consent_audit_no_delete BEFORE DELETE ON public.owner_consent_audit FOR EACH ROW EXECUTE FUNCTION public.owner_consent_audit_append_only();

CREATE TRIGGER owner_consent_audit_no_update BEFORE UPDATE ON public.owner_consent_audit FOR EACH ROW EXECUTE FUNCTION public.owner_consent_audit_append_only();

CREATE TRIGGER audit_log_immutable BEFORE DELETE OR UPDATE ON zaltyko.audit_log FOR EACH ROW EXECUTE FUNCTION zaltyko_domain_private.reject_audit_mutation();

CREATE TRIGGER insight_status_history_immutable BEFORE DELETE OR UPDATE ON zaltyko.insight_status_history FOR EACH ROW EXECUTE FUNCTION zaltyko_domain_private.reject_insight_history_mutation();

CREATE TRIGGER invoice_line_enrollments_immutable_row BEFORE DELETE OR UPDATE ON zaltyko.invoice_line_enrollments FOR EACH ROW EXECUTE FUNCTION zaltyko_domain_private.prevent_invoice_line_enrollment_mutation();

CREATE TRIGGER invoice_line_enrollments_immutable_truncate BEFORE TRUNCATE ON zaltyko.invoice_line_enrollments FOR EACH STATEMENT EXECUTE FUNCTION zaltyko_domain_private.prevent_invoice_line_enrollment_mutation();

CREATE TRIGGER organization_entitlement_changes_append_only BEFORE DELETE OR UPDATE ON zaltyko.organization_entitlement_changes FOR EACH ROW EXECUTE FUNCTION zaltyko.reject_entitlement_history_mutation();

CREATE TRIGGER organization_entitlements_revision_guard BEFORE UPDATE ON zaltyko.organization_entitlements FOR EACH ROW EXECUTE FUNCTION zaltyko.guard_entitlement_revision();

CREATE TRIGGER organization_entitlements_revision_history AFTER INSERT OR UPDATE ON zaltyko.organization_entitlements FOR EACH ROW EXECUTE FUNCTION zaltyko.record_entitlement_revision();

CREATE TRIGGER organization_saas_trials_guard BEFORE INSERT OR UPDATE ON zaltyko.organization_saas_trials FOR EACH ROW EXECUTE FUNCTION zaltyko.guard_organization_saas_trial();

CREATE TRIGGER organization_saas_webhook_events_identity_guard BEFORE UPDATE ON zaltyko.organization_saas_webhook_events FOR EACH ROW EXECUTE FUNCTION zaltyko.guard_organization_saas_webhook_identity();

CREATE TRIGGER organization_saas_webhook_requeue_guard BEFORE UPDATE ON zaltyko.organization_saas_webhook_events FOR EACH ROW EXECUTE FUNCTION zaltyko.guard_saas_webhook_requeue();

CREATE CONSTRAINT TRIGGER saas_reconciliation_decision_link_required AFTER INSERT ON zaltyko.organization_saas_webhook_reconciliation_decisions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION zaltyko.guard_saas_reconciliation_decision_link();

CREATE TRIGGER saas_webhook_reconciliation_decisions_immutable BEFORE DELETE OR UPDATE ON zaltyko.organization_saas_webhook_reconciliation_decisions FOR EACH ROW EXECUTE FUNCTION zaltyko.reject_saas_reconciliation_mutation();

CREATE TRIGGER saas_webhook_reconciliation_result_insert_guard BEFORE INSERT ON zaltyko.organization_saas_webhook_reconciliation_results FOR EACH ROW EXECUTE FUNCTION zaltyko.guard_saas_reconciliation_result_insert();

CREATE TRIGGER saas_webhook_reconciliation_results_immutable BEFORE DELETE OR UPDATE ON zaltyko.organization_saas_webhook_reconciliation_results FOR EACH ROW EXECUTE FUNCTION zaltyko.reject_saas_reconciliation_mutation();

CREATE TRIGGER organizations_seed_free_entitlement AFTER INSERT ON zaltyko.organizations FOR EACH ROW EXECUTE FUNCTION zaltyko.seed_free_entitlement();

CREATE TRIGGER owner_signup_consent_audit_append_only BEFORE DELETE OR UPDATE ON zaltyko.owner_signup_consent_audits FOR EACH ROW EXECUTE FUNCTION zaltyko.reject_owner_signup_consent_audit_mutation();

CREATE TRIGGER owner_signup_consent_audit_no_truncate BEFORE TRUNCATE ON zaltyko.owner_signup_consent_audits FOR EACH STATEMENT EXECUTE FUNCTION zaltyko.reject_owner_signup_consent_audit_mutation();

ALTER TABLE public.academies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_diagnostics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_geo_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_link_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_sport_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_trials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advertisements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_read_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apparatus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_rubrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athlete_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athlete_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athlete_extra_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athlete_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athlete_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athlete_sport_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.churn_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_coach_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_waiting_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_weekdays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_compensation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_sport_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competition_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competition_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.directory_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.directory_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.directory_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.directory_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.directory_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.directory_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.directory_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.directory_import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.directory_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.directory_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.directory_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discount_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discount_usage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empleo_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empleo_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_stripe_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.featured_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.federative_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_athletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_athletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_trial_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_trials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leak_action_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_read_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_consent_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rubric_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scholarships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sport_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sport_disciplines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sport_locale_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_age_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_apparatus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_competition_flow ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_competition_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_license_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_scoring_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terminology_dictionary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zaltyko_schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.athletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.athletes FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.attendance_records FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.audit_log FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.benchmark_metric_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.benchmark_metric_targets FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.benchmark_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.benchmark_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.charges FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.class_template_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.class_template_groups FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.class_template_weekdays ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.class_template_weekdays FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.class_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.class_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.data_quality_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.data_quality_issues FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.enrollment_pauses ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.enrollment_pauses FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.enrollment_price_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.enrollment_price_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.enrollment_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.enrollment_status_history FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.enrollments FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.facilities FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.families ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.families FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.family_collection_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.family_collection_preferences FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.family_guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.family_guardians FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.family_members FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.family_payers ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.family_payers FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.family_payment_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.family_payment_authorizations FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.financial_reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.financial_reconciliation_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.group_membership_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.group_membership_history FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.group_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.group_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.groups FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.guardian_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.guardian_contacts FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.guardians FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.health_score_dimension_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.health_score_dimension_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.health_score_dimension_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.health_score_dimension_weights FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.health_score_metric_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.health_score_metric_contributions FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.health_score_metric_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.health_score_metric_weights FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.health_score_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.health_score_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.health_score_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.health_score_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.insight_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.insight_actions FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.insight_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.insight_notifications FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.insight_rule_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.insight_rule_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.insight_rule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.insight_rule_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.insight_run_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.insight_run_observations FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.insight_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.insight_status_history FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.insights FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.invoice_line_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.invoice_line_enrollments FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.invoice_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.locations FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.member_location_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.member_location_scopes FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.metric_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.metric_definitions FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.metric_event_consumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.metric_event_consumptions FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.metric_invalidations ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.metric_invalidations FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.metric_run_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.metric_run_values FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.metric_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.metric_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.metric_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.metric_values FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.organization_bootstrap_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.organization_bootstrap_commands FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.organization_entitlement_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.organization_entitlement_changes FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.organization_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.organization_entitlements FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.organization_members FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.organization_payment_provider_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.organization_payment_provider_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.organization_saas_checkout_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.organization_saas_checkout_operations FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.organization_saas_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.organization_saas_customers FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.organization_saas_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.organization_saas_subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.organization_saas_trials ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.organization_saas_trials FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.organization_saas_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.organization_saas_webhook_events FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.organization_saas_webhook_payload_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.organization_saas_webhook_payload_conflicts FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_results FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.organization_sports ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.organization_sports FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.outbox_events FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.owner_dashboard_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.owner_dashboard_layouts FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.owner_signup_consent_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.owner_signup_consent_audits FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.owner_signup_consent_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.owner_signup_consent_policy FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.owner_signup_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.owner_signup_consents FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.payment_allocations FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.payment_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.payment_provider_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.payment_provider_events FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.payments FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.people FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.price_plan_class_template_coverage ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.price_plan_class_template_coverage FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.price_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.price_plans FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.programs FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.refunds FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.retention_cohort_projection_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.retention_cohort_projection_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.retention_cohort_projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.retention_cohort_projections FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.session_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.session_staff FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.spaces FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.sport_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.sport_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.staff_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.trial_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.trial_followups FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.trial_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.trial_status_history FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.trials ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.trials FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.waitlist_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.waitlist_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.waitlist_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaltyko.waitlist_offers FORCE ROW LEVEL SECURITY;

CREATE POLICY academies_modify ON public.academies AS PERMISSIVE FOR ALL TO authenticated USING (zaltyko_private.is_academy_manager(id) AND zaltyko_private.row_in_current_tenant(tenant_id)) WITH CHECK (zaltyko_private.is_academy_manager(id) AND zaltyko_private.row_in_current_tenant(tenant_id));

CREATE POLICY academies_public_directory ON public.academies AS PERMISSIVE FOR SELECT TO anon, authenticated USING (is_public = true AND (status <> ALL (ARRAY['churned'::text, 'fraud_hold'::text])));

CREATE POLICY academies_select ON public.academies AS PERMISSIVE FOR SELECT TO authenticated USING (zaltyko_private.is_academy_member(id));

CREATE POLICY academy_diagnostics_tenant_access ON public.academy_diagnostics AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant()) WITH CHECK (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY academy_expenses_tenant_access ON public.academy_expenses AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant()) WITH CHECK (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY academy_geo_groups_modify ON public.academy_geo_groups AS PERMISSIVE FOR ALL TO PUBLIC USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY academy_geo_groups_select ON public.academy_geo_groups AS PERMISSIVE FOR SELECT TO PUBLIC USING (public.is_super_admin());

CREATE POLICY academy_link_requests_target_response ON public.academy_link_requests AS PERMISSIVE FOR UPDATE TO authenticated USING (target_profile_id = zaltyko_private.current_profile_id()) WITH CHECK (target_profile_id = zaltyko_private.current_profile_id());

CREATE POLICY academy_link_requests_tenant_or_target_access ON public.academy_link_requests AS PERMISSIVE FOR ALL TO authenticated USING (zaltyko_private.is_super_admin() OR tenant_id = zaltyko_private.current_tenant_id() OR target_profile_id = zaltyko_private.current_profile_id()) WITH CHECK (zaltyko_private.is_super_admin() OR tenant_id = zaltyko_private.current_tenant_id() OR target_profile_id = zaltyko_private.current_profile_id());

CREATE POLICY academy_messages_modify ON public.academy_messages AS PERMISSIVE FOR ALL TO PUBLIC USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY academy_messages_select ON public.academy_messages AS PERMISSIVE FOR SELECT TO PUBLIC USING (public.is_super_admin());

CREATE POLICY academy_roles_modify ON public.academy_roles AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(academy_id)) WITH CHECK (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(academy_id));

CREATE POLICY academy_roles_select ON public.academy_roles AS PERMISSIVE FOR SELECT TO PUBLIC USING (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(academy_id));

CREATE POLICY academy_sport_configs_tenant_access ON public.academy_sport_configs AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(academy_id)) WITH CHECK (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(academy_id));

CREATE POLICY academy_trials_tenant_access ON public.academy_trials AS PERMISSIVE FOR ALL TO PUBLIC USING (public.is_super_admin() OR tenant_id = zaltyko_private.get_current_tenant()) WITH CHECK (public.is_super_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY advertisements_admin_only ON public.advertisements AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin()) WITH CHECK (zaltyko_private.is_admin());

CREATE POLICY advertisements_select ON public.advertisements AS PERMISSIVE FOR SELECT TO PUBLIC USING (is_active = true OR zaltyko_private.is_admin());

CREATE POLICY announcement_read_status_user_or_tenant ON public.announcement_read_status AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR user_id = auth.uid() OR (EXISTS ( SELECT 1
   FROM public.announcements a
  WHERE a.id = announcement_read_status.announcement_id AND zaltyko_private.academy_in_current_tenant(a.academy_id)))) WITH CHECK (zaltyko_private.is_admin() OR user_id = auth.uid());

CREATE POLICY announcements_tenant_access ON public.announcements AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(academy_id)) WITH CHECK (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(academy_id));

CREATE POLICY app_config_authenticated_read ON public.app_config AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY apparatus_authenticated_read ON public.apparatus AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY assessment_rubrics_modify ON public.assessment_rubrics AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(tenant_id)) WITH CHECK (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(tenant_id));

CREATE POLICY assessment_rubrics_select ON public.assessment_rubrics AS PERMISSIVE FOR SELECT TO PUBLIC USING (zaltyko_private.is_admin() OR tenant_id IS NULL OR zaltyko_private.academy_in_current_tenant(tenant_id));

CREATE POLICY assessment_scores_modify ON public.assessment_scores AS PERMISSIVE FOR ALL TO authenticated USING (zaltyko_private.row_in_current_tenant(tenant_id) AND (EXISTS ( SELECT 1
   FROM public.athlete_assessments aa
  WHERE aa.id = assessment_scores.assessment_id AND (zaltyko_private.is_academy_manager(aa.academy_id) OR zaltyko_private.can_access_athlete(aa.athlete_id) AND (EXISTS ( SELECT 1
           FROM public.coaches co
          WHERE co.user_id = auth.uid())))))) WITH CHECK (zaltyko_private.row_in_current_tenant(tenant_id) AND (EXISTS ( SELECT 1
   FROM public.athlete_assessments aa
  WHERE aa.id = assessment_scores.assessment_id AND (zaltyko_private.is_academy_manager(aa.academy_id) OR zaltyko_private.can_access_athlete(aa.athlete_id) AND (EXISTS ( SELECT 1
           FROM public.coaches co
          WHERE co.user_id = auth.uid()))))));

CREATE POLICY assessment_scores_select ON public.assessment_scores AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.athlete_assessments aa
  WHERE aa.id = assessment_scores.assessment_id AND zaltyko_private.can_access_athlete(aa.athlete_id))));

CREATE POLICY assessment_types_modify ON public.assessment_types AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin()) WITH CHECK (zaltyko_private.is_admin());

CREATE POLICY assessment_types_select ON public.assessment_types AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY assessment_videos_modify ON public.assessment_videos AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR (assessment_id IN ( SELECT athlete_assessments.id
   FROM public.athlete_assessments
  WHERE zaltyko_private.academy_in_current_tenant(athlete_assessments.academy_id)))) WITH CHECK (zaltyko_private.is_admin() OR (assessment_id IN ( SELECT athlete_assessments.id
   FROM public.athlete_assessments
  WHERE zaltyko_private.academy_in_current_tenant(athlete_assessments.academy_id))));

CREATE POLICY assessment_videos_select ON public.assessment_videos AS PERMISSIVE FOR SELECT TO PUBLIC USING (zaltyko_private.is_admin() OR (assessment_id IN ( SELECT athlete_assessments.id
   FROM public.athlete_assessments
  WHERE zaltyko_private.academy_in_current_tenant(athlete_assessments.academy_id))));

CREATE POLICY athlete_assessments_modify ON public.athlete_assessments AS PERMISSIVE FOR ALL TO authenticated USING (zaltyko_private.row_in_current_tenant(tenant_id) AND (zaltyko_private.is_academy_manager(academy_id) OR zaltyko_private.can_access_athlete(athlete_id) AND (EXISTS ( SELECT 1
   FROM public.coaches co
  WHERE co.user_id = auth.uid())))) WITH CHECK (zaltyko_private.row_in_current_tenant(tenant_id) AND (zaltyko_private.is_academy_manager(academy_id) OR zaltyko_private.can_access_athlete(athlete_id) AND (EXISTS ( SELECT 1
   FROM public.coaches co
  WHERE co.user_id = auth.uid()))));

CREATE POLICY athlete_assessments_select ON public.athlete_assessments AS PERMISSIVE FOR SELECT TO authenticated USING (zaltyko_private.can_access_athlete(athlete_id));

CREATE POLICY athlete_documents_tenant_access ON public.athlete_documents AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant()) WITH CHECK (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY admin_can_manage_all_extra_classes ON public.athlete_extra_classes AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR public.is_super_admin()) WITH CHECK (zaltyko_private.is_admin() OR public.is_super_admin());

CREATE POLICY athlete_extra_classes_modify ON public.athlete_extra_classes AS PERMISSIVE FOR ALL TO authenticated USING (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant()) WITH CHECK (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY athlete_extra_classes_select ON public.athlete_extra_classes AS PERMISSIVE FOR SELECT TO authenticated USING (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY athletes_can_delete_extra_classes ON public.athlete_extra_classes AS PERMISSIVE FOR DELETE TO PUBLIC USING (tenant_id = zaltyko_private.get_current_tenant() AND (athlete_id IN ( SELECT athletes.id
   FROM public.athletes
  WHERE athletes.user_id = auth.uid())));

CREATE POLICY athletes_can_insert_extra_classes ON public.athlete_extra_classes AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (tenant_id = zaltyko_private.get_current_tenant() AND (athlete_id IN ( SELECT athletes.id
   FROM public.athletes
  WHERE athletes.user_id = auth.uid())));

CREATE POLICY athletes_can_select_extra_classes ON public.athlete_extra_classes AS PERMISSIVE FOR SELECT TO PUBLIC USING (tenant_id = zaltyko_private.get_current_tenant() AND (athlete_id IN ( SELECT athletes.id
   FROM public.athletes
  WHERE athletes.user_id = auth.uid())));

CREATE POLICY athletes_can_update_extra_classes ON public.athlete_extra_classes AS PERMISSIVE FOR UPDATE TO PUBLIC USING (tenant_id = zaltyko_private.get_current_tenant() AND (athlete_id IN ( SELECT athletes.id
   FROM public.athletes
  WHERE athletes.user_id = auth.uid()))) WITH CHECK (tenant_id = zaltyko_private.get_current_tenant() AND (athlete_id IN ( SELECT athletes.id
   FROM public.athletes
  WHERE athletes.user_id = auth.uid())));

CREATE POLICY athlete_import_batches_modify ON public.athlete_import_batches AS PERMISSIVE FOR ALL TO authenticated USING (zaltyko_private.row_in_current_tenant(tenant_id) AND academy_id IS NOT NULL AND zaltyko_private.is_academy_manager(academy_id)) WITH CHECK (zaltyko_private.row_in_current_tenant(tenant_id) AND academy_id IS NOT NULL AND zaltyko_private.is_academy_manager(academy_id));

CREATE POLICY athlete_import_batches_select ON public.athlete_import_batches AS PERMISSIVE FOR SELECT TO authenticated USING (zaltyko_private.row_in_current_tenant(tenant_id) AND academy_id IS NOT NULL AND zaltyko_private.is_academy_manager(academy_id));

CREATE POLICY athlete_invitations_owner_modify ON public.athlete_invitations AS PERMISSIVE FOR ALL TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM public.memberships m
  WHERE m.user_id = auth.uid() AND m.academy_id = athlete_invitations.academy_id AND m.role = 'owner'::public.membership_role)) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE p.user_id = auth.uid() AND p.role = 'super_admin'::public.profile_role)));

CREATE POLICY athlete_invitations_owner_read ON public.athlete_invitations AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM public.memberships m
  WHERE m.user_id = auth.uid() AND m.academy_id = athlete_invitations.academy_id AND m.role = 'owner'::public.membership_role)) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE p.user_id = auth.uid() AND p.role = 'super_admin'::public.profile_role)));

CREATE POLICY athlete_sport_configs_tenant_access ON public.athlete_sport_configs AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR (EXISTS ( SELECT 1
   FROM public.academy_sport_configs c
  WHERE c.id = athlete_sport_configs.academy_sport_config_id AND zaltyko_private.academy_in_current_tenant(c.academy_id)))) WITH CHECK (zaltyko_private.is_admin() OR (EXISTS ( SELECT 1
   FROM public.academy_sport_configs c
  WHERE c.id = athlete_sport_configs.academy_sport_config_id AND zaltyko_private.academy_in_current_tenant(c.academy_id))));

CREATE POLICY athletes_delete ON public.athletes AS PERMISSIVE FOR DELETE TO authenticated USING (zaltyko_private.is_academy_manager(academy_id) AND zaltyko_private.row_in_current_tenant(tenant_id));

CREATE POLICY athletes_insert ON public.athletes AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (zaltyko_private.is_academy_manager(academy_id) AND zaltyko_private.row_in_current_tenant(tenant_id));

CREATE POLICY athletes_select ON public.athletes AS PERMISSIVE FOR SELECT TO authenticated USING (zaltyko_private.can_access_athlete(id));

CREATE POLICY athletes_update ON public.athletes AS PERMISSIVE FOR UPDATE TO authenticated USING (zaltyko_private.row_in_current_tenant(tenant_id) AND (zaltyko_private.is_academy_manager(academy_id) OR zaltyko_private.can_access_athlete(id) AND (EXISTS ( SELECT 1
   FROM public.coaches co
  WHERE co.user_id = auth.uid())))) WITH CHECK (zaltyko_private.row_in_current_tenant(tenant_id) AND (zaltyko_private.is_academy_manager(academy_id) OR zaltyko_private.can_access_athlete(id) AND (EXISTS ( SELECT 1
   FROM public.coaches co
  WHERE co.user_id = auth.uid()))));

CREATE POLICY attendance_records_modify ON public.attendance_records AS PERMISSIVE FOR ALL TO authenticated USING (zaltyko_private.row_in_current_tenant(tenant_id) AND (EXISTS ( SELECT 1
   FROM public.class_sessions cs
     JOIN public.classes c ON c.id = cs.class_id
  WHERE cs.id = attendance_records.session_id AND (zaltyko_private.is_assigned_coach(c.id) OR zaltyko_private.is_academy_manager(c.academy_id))))) WITH CHECK (zaltyko_private.row_in_current_tenant(tenant_id) AND (EXISTS ( SELECT 1
   FROM public.class_sessions cs
     JOIN public.classes c ON c.id = cs.class_id
  WHERE cs.id = attendance_records.session_id AND (zaltyko_private.is_assigned_coach(c.id) OR zaltyko_private.is_academy_manager(c.academy_id)))));

CREATE POLICY attendance_records_select ON public.attendance_records AS PERMISSIVE FOR SELECT TO authenticated USING (zaltyko_private.can_access_athlete(athlete_id));

CREATE POLICY audit_logs_modify ON public.audit_logs AS PERMISSIVE FOR ALL TO PUBLIC USING (public.is_super_admin() OR tenant_id IS NOT NULL AND tenant_id = zaltyko_private.get_current_tenant()) WITH CHECK (public.is_super_admin() OR tenant_id IS NOT NULL AND tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY audit_logs_select ON public.audit_logs AS PERMISSIVE FOR SELECT TO PUBLIC USING (public.is_super_admin() OR tenant_id IS NOT NULL AND tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY billing_events_modify ON public.billing_events AS PERMISSIVE FOR ALL TO PUBLIC USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY billing_events_select ON public.billing_events AS PERMISSIVE FOR SELECT TO PUBLIC USING (public.is_super_admin());

CREATE POLICY billing_invoices_modify ON public.billing_invoices AS PERMISSIVE FOR ALL TO authenticated USING (zaltyko_private.is_academy_manager(academy_id) AND zaltyko_private.row_in_current_tenant(tenant_id)) WITH CHECK (zaltyko_private.is_academy_manager(academy_id) AND zaltyko_private.row_in_current_tenant(tenant_id));

CREATE POLICY billing_invoices_select ON public.billing_invoices AS PERMISSIVE FOR SELECT TO authenticated USING (zaltyko_private.is_academy_manager(academy_id));

CREATE POLICY billing_items_modify ON public.billing_items AS PERMISSIVE FOR ALL TO authenticated USING (zaltyko_private.is_academy_manager(academy_id) AND zaltyko_private.row_in_current_tenant(tenant_id)) WITH CHECK (zaltyko_private.is_academy_manager(academy_id) AND zaltyko_private.row_in_current_tenant(tenant_id));

CREATE POLICY billing_items_select ON public.billing_items AS PERMISSIVE FOR SELECT TO authenticated USING (zaltyko_private.is_academy_manager(academy_id));

CREATE POLICY categories_authenticated_read ON public.categories AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY charges_modify ON public.charges AS PERMISSIVE FOR ALL TO authenticated USING (zaltyko_private.is_academy_manager(academy_id) AND zaltyko_private.row_in_current_tenant(tenant_id)) WITH CHECK (zaltyko_private.is_academy_manager(academy_id) AND zaltyko_private.row_in_current_tenant(tenant_id));

CREATE POLICY charges_select ON public.charges AS PERMISSIVE FOR SELECT TO authenticated USING (zaltyko_private.can_access_billing_athlete(athlete_id, academy_id, tenant_id));

CREATE POLICY churn_reasons_tenant_access ON public.churn_reasons AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant()) WITH CHECK (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY class_coach_assignments_modify ON public.class_coach_assignments AS PERMISSIVE FOR ALL TO authenticated USING (zaltyko_private.row_in_current_tenant(tenant_id) AND (EXISTS ( SELECT 1
   FROM public.classes c
  WHERE c.id = class_coach_assignments.class_id AND zaltyko_private.is_academy_manager(c.academy_id)))) WITH CHECK (zaltyko_private.row_in_current_tenant(tenant_id) AND (EXISTS ( SELECT 1
   FROM public.classes c
  WHERE c.id = class_coach_assignments.class_id AND zaltyko_private.is_academy_manager(c.academy_id))));

CREATE POLICY class_coach_assignments_select ON public.class_coach_assignments AS PERMISSIVE FOR SELECT TO authenticated USING (zaltyko_private.is_assigned_coach(class_id) OR (EXISTS ( SELECT 1
   FROM public.classes c
  WHERE c.id = class_coach_assignments.class_id AND zaltyko_private.is_academy_manager(c.academy_id))));

CREATE POLICY class_enrollments_modify ON public.class_enrollments AS PERMISSIVE FOR ALL TO authenticated USING (zaltyko_private.row_in_current_tenant(tenant_id) AND (zaltyko_private.is_assigned_coach(class_id) OR zaltyko_private.is_academy_manager(academy_id))) WITH CHECK (zaltyko_private.row_in_current_tenant(tenant_id) AND (zaltyko_private.is_assigned_coach(class_id) OR zaltyko_private.is_academy_manager(academy_id)));

CREATE POLICY class_enrollments_select ON public.class_enrollments AS PERMISSIVE FOR SELECT TO authenticated USING (zaltyko_private.can_access_class(class_id) AND zaltyko_private.can_access_athlete(athlete_id));

CREATE POLICY class_exceptions_modify ON public.class_exceptions AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(tenant_id)) WITH CHECK (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(tenant_id));

CREATE POLICY class_exceptions_select ON public.class_exceptions AS PERMISSIVE FOR SELECT TO PUBLIC USING (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(tenant_id));

CREATE POLICY class_groups_modify ON public.class_groups AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant()) WITH CHECK (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY class_groups_select ON public.class_groups AS PERMISSIVE FOR SELECT TO PUBLIC USING (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY class_sessions_modify ON public.class_sessions AS PERMISSIVE FOR ALL TO authenticated USING (zaltyko_private.row_in_current_tenant(tenant_id) AND (zaltyko_private.is_assigned_coach(class_id) OR (EXISTS ( SELECT 1
   FROM public.classes c
  WHERE c.id = class_sessions.class_id AND zaltyko_private.is_academy_manager(c.academy_id))))) WITH CHECK (zaltyko_private.row_in_current_tenant(tenant_id) AND (zaltyko_private.is_assigned_coach(class_id) OR (EXISTS ( SELECT 1
   FROM public.classes c
  WHERE c.id = class_sessions.class_id AND zaltyko_private.is_academy_manager(c.academy_id)))));

CREATE POLICY class_sessions_select ON public.class_sessions AS PERMISSIVE FOR SELECT TO authenticated USING (zaltyko_private.can_access_class(class_id));

CREATE POLICY class_waiting_list_tenant_access ON public.class_waiting_list AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant()) WITH CHECK (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY class_weekdays_modify ON public.class_weekdays AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant()) WITH CHECK (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY class_weekdays_select ON public.class_weekdays AS PERMISSIVE FOR SELECT TO PUBLIC USING (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY classes_modify ON public.classes AS PERMISSIVE FOR ALL TO authenticated USING (zaltyko_private.is_academy_manager(academy_id) AND zaltyko_private.row_in_current_tenant(tenant_id)) WITH CHECK (zaltyko_private.is_academy_manager(academy_id) AND zaltyko_private.row_in_current_tenant(tenant_id));

CREATE POLICY classes_select ON public.classes AS PERMISSIVE FOR SELECT TO authenticated USING (zaltyko_private.can_access_class(id));

CREATE POLICY coach_compensation_tenant_access ON public.coach_compensation AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant()) WITH CHECK (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY coach_notes_modify ON public.coach_notes AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant()) WITH CHECK (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY coach_notes_select ON public.coach_notes AS PERMISSIVE FOR SELECT TO PUBLIC USING (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY coach_sport_configs_tenant_access ON public.coach_sport_configs AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR (EXISTS ( SELECT 1
   FROM public.academy_sport_configs c
  WHERE c.id = coach_sport_configs.academy_sport_config_id AND zaltyko_private.academy_in_current_tenant(c.academy_id)))) WITH CHECK (zaltyko_private.is_admin() OR (EXISTS ( SELECT 1
   FROM public.academy_sport_configs c
  WHERE c.id = coach_sport_configs.academy_sport_config_id AND zaltyko_private.academy_in_current_tenant(c.academy_id))));

CREATE POLICY coaches_modify ON public.coaches AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant()) WITH CHECK (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY coaches_select ON public.coaches AS PERMISSIVE FOR SELECT TO PUBLIC USING (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY commercial_interviews_super_admin_all ON public.commercial_interviews AS PERMISSIVE FOR ALL TO PUBLIC USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY competition_results_modify ON public.competition_results AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(tenant_id)) WITH CHECK (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(tenant_id));

CREATE POLICY competition_results_select ON public.competition_results AS PERMISSIVE FOR SELECT TO PUBLIC USING (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(tenant_id));

CREATE POLICY competition_types_authenticated_read ON public.competition_types AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY contact_messages_delete ON public.contact_messages AS PERMISSIVE FOR DELETE TO PUBLIC USING (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(academy_id));

CREATE POLICY contact_messages_insert ON public.contact_messages AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (true);

CREATE POLICY contact_messages_modify ON public.contact_messages AS PERMISSIVE FOR UPDATE TO PUBLIC USING (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(academy_id)) WITH CHECK (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(academy_id));

CREATE POLICY contact_messages_select ON public.contact_messages AS PERMISSIVE FOR SELECT TO PUBLIC USING (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(academy_id));

CREATE POLICY conversation_messages_participant_access ON public.conversation_messages AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR sender_id = auth.uid() OR (EXISTS ( SELECT 1
   FROM public.conversation_participants cp
  WHERE cp.conversation_id = conversation_messages.conversation_id AND cp.user_id = auth.uid() AND cp.hidden_at IS NULL))) WITH CHECK (zaltyko_private.is_admin() OR sender_id = auth.uid());

CREATE POLICY conversation_participants_user_access ON public.conversation_participants AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR user_id = auth.uid()) WITH CHECK (zaltyko_private.is_admin() OR user_id = auth.uid());

CREATE POLICY conversations_modify ON public.conversations AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(academy_id)) WITH CHECK (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(academy_id));

CREATE POLICY conversations_select ON public.conversations AS PERMISSIVE FOR SELECT TO PUBLIC USING (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(academy_id));

CREATE POLICY countries_authenticated_read ON public.countries AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY directory_audit_client_denied ON public.directory_audit AS PERMISSIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY directory_batches_client_denied ON public.directory_batches AS PERMISSIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY directory_claims_client_denied ON public.directory_claims AS PERMISSIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY directory_deliveries_client_denied ON public.directory_deliveries AS PERMISSIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY directory_entries_public ON public.directory_entries AS PERMISSIVE FOR SELECT TO anon, authenticated USING (publication = 'published'::text AND merged_into IS NULL AND academy_id IS NULL AND event_id IS NULL);

CREATE POLICY directory_favorites_client_denied ON public.directory_favorites AS PERMISSIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY directory_grants_client_denied ON public.directory_grants AS PERMISSIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY directory_import_rows_client_denied ON public.directory_import_rows AS PERMISSIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY directory_revisions_client_denied ON public.directory_revisions AS PERMISSIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY directory_sources_client_denied ON public.directory_sources AS PERMISSIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY directory_subscriptions_client_denied ON public.directory_subscriptions AS PERMISSIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY discount_campaigns_modify ON public.discount_campaigns AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(academy_id)) WITH CHECK (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(academy_id));

CREATE POLICY discount_campaigns_select ON public.discount_campaigns AS PERMISSIVE FOR SELECT TO PUBLIC USING (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(academy_id));

CREATE POLICY discount_usage_history_modify ON public.discount_usage_history AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(academy_id)) WITH CHECK (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(academy_id));

CREATE POLICY discount_usage_history_select ON public.discount_usage_history AS PERMISSIVE FOR SELECT TO PUBLIC USING (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(academy_id));

CREATE POLICY "Admins can manage discounts" ON public.discounts AS PERMISSIVE FOR ALL TO authenticated USING ((tenant_id IN ( SELECT profiles.tenant_id
   FROM public.profiles
  WHERE profiles.id = auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE profiles.id = auth.uid() AND (profiles.role = ANY (ARRAY['admin'::public.profile_role, 'owner'::public.profile_role]))))) WITH CHECK ((tenant_id IN ( SELECT profiles.tenant_id
   FROM public.profiles
  WHERE profiles.id = auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE profiles.id = auth.uid() AND (profiles.role = ANY (ARRAY['admin'::public.profile_role, 'owner'::public.profile_role])))));

CREATE POLICY "Users can view discounts from their tenant" ON public.discounts AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id IN ( SELECT profiles.tenant_id
   FROM public.profiles
  WHERE profiles.id = auth.uid())));

CREATE POLICY admin_can_manage_discounts ON public.discounts AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR public.is_super_admin()) WITH CHECK (zaltyko_private.is_admin() OR public.is_super_admin());

CREATE POLICY discounts_manage ON public.discounts AS PERMISSIVE FOR ALL TO authenticated USING (zaltyko_private.is_admin() AND (tenant_id IN ( SELECT profiles.tenant_id
   FROM public.profiles
  WHERE profiles.user_id = auth.uid()))) WITH CHECK (zaltyko_private.is_admin() AND (tenant_id IN ( SELECT profiles.tenant_id
   FROM public.profiles
  WHERE profiles.user_id = auth.uid())));

CREATE POLICY discounts_select ON public.discounts AS PERMISSIVE FOR SELECT TO authenticated USING (zaltyko_private.is_admin() OR (tenant_id IN ( SELECT profiles.tenant_id
   FROM public.profiles
  WHERE profiles.user_id = auth.uid())));

CREATE POLICY tenants_can_create_discounts ON public.discounts AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY tenants_can_delete_discounts ON public.discounts AS PERMISSIVE FOR DELETE TO PUBLIC USING (tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY tenants_can_update_discounts ON public.discounts AS PERMISSIVE FOR UPDATE TO PUBLIC USING (tenant_id = zaltyko_private.get_current_tenant()) WITH CHECK (tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY tenants_can_view_discounts ON public.discounts AS PERMISSIVE FOR SELECT TO PUBLIC USING (tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY "Service role can create email logs" ON public.email_logs AS PERMISSIVE FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "Users can view email logs from their tenant" ON public.email_logs AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id IN ( SELECT profiles.tenant_id
   FROM public.profiles
  WHERE profiles.id = auth.uid())));

CREATE POLICY admin_can_manage_email_logs ON public.email_logs AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR public.is_super_admin()) WITH CHECK (zaltyko_private.is_admin() OR public.is_super_admin());

CREATE POLICY admin_can_view_email_logs ON public.email_logs AS PERMISSIVE FOR SELECT TO PUBLIC USING (zaltyko_private.is_admin() OR public.is_super_admin());

CREATE POLICY email_logs_insert ON public.email_logs AS PERMISSIVE FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY email_logs_superadmin_read ON public.email_logs AS PERMISSIVE FOR SELECT TO authenticated USING (public.is_super_admin());

CREATE POLICY empleo_applications_insert ON public.empleo_applications AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (user_id = auth.uid() OR zaltyko_private.is_admin());

CREATE POLICY empleo_applications_select ON public.empleo_applications AS PERMISSIVE FOR SELECT TO PUBLIC USING (user_id = auth.uid() OR zaltyko_private.is_admin() OR (EXISTS ( SELECT 1
   FROM public.empleo_listings el
  WHERE el.id = empleo_applications.listing_id AND zaltyko_private.academy_in_current_tenant(el.academy_id))));

CREATE POLICY empleo_applications_update ON public.empleo_applications AS PERMISSIVE FOR UPDATE TO PUBLIC USING (user_id = auth.uid() OR zaltyko_private.is_admin());

CREATE POLICY empleo_listings_insert ON public.empleo_listings AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (zaltyko_private.academy_in_current_tenant(academy_id) OR zaltyko_private.is_admin());

CREATE POLICY empleo_listings_select ON public.empleo_listings AS PERMISSIVE FOR SELECT TO PUBLIC USING (status = 'active'::public.job_listing_status OR zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(academy_id));

CREATE POLICY empleo_listings_update ON public.empleo_listings AS PERMISSIVE FOR UPDATE TO PUBLIC USING (zaltyko_private.academy_in_current_tenant(academy_id) OR zaltyko_private.is_admin());

CREATE POLICY event_categories_tenant_access ON public.event_categories AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant()) WITH CHECK (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY "Users can manage event invitations" ON public.event_invitations AS PERMISSIVE FOR ALL TO authenticated USING ((tenant_id IN ( SELECT profiles.tenant_id
   FROM public.profiles
  WHERE profiles.id = auth.uid()))) WITH CHECK ((tenant_id IN ( SELECT profiles.tenant_id
   FROM public.profiles
  WHERE profiles.id = auth.uid())));

CREATE POLICY "Users can view event invitations from their tenant" ON public.event_invitations AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id IN ( SELECT profiles.tenant_id
   FROM public.profiles
  WHERE profiles.id = auth.uid())));

CREATE POLICY event_invitations_manage ON public.event_invitations AS PERMISSIVE FOR ALL TO authenticated USING ((tenant_id IN ( SELECT profiles.tenant_id
   FROM public.profiles
  WHERE profiles.user_id = auth.uid()))) WITH CHECK ((tenant_id IN ( SELECT profiles.tenant_id
   FROM public.profiles
  WHERE profiles.user_id = auth.uid())));

CREATE POLICY event_invitations_select ON public.event_invitations AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id IN ( SELECT profiles.tenant_id
   FROM public.profiles
  WHERE profiles.user_id = auth.uid())));

CREATE POLICY event_logs_modify ON public.event_logs AS PERMISSIVE FOR ALL TO PUBLIC USING (public.is_super_admin() OR academy_id IS NOT NULL AND zaltyko_private.academy_in_current_tenant(academy_id)) WITH CHECK (public.is_super_admin() OR academy_id IS NOT NULL AND zaltyko_private.academy_in_current_tenant(academy_id));

CREATE POLICY event_logs_select ON public.event_logs AS PERMISSIVE FOR SELECT TO PUBLIC USING (public.is_super_admin() OR academy_id IS NOT NULL AND zaltyko_private.academy_in_current_tenant(academy_id));

CREATE POLICY event_payments_tenant_access ON public.event_payments AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant()) WITH CHECK (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY event_registrations_tenant_access ON public.event_registrations AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant()) WITH CHECK (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY event_waitlist_tenant_access ON public.event_waitlist AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant()) WITH CHECK (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY events_modify ON public.events AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant() AND (academy_id IN ( SELECT academies.id
   FROM public.academies
  WHERE academies.tenant_id = zaltyko_private.get_current_tenant()))) WITH CHECK (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant() AND (academy_id IN ( SELECT academies.id
   FROM public.academies
  WHERE academies.tenant_id = zaltyko_private.get_current_tenant())));

CREATE POLICY events_public_select ON public.events AS PERMISSIVE FOR SELECT TO PUBLIC USING (is_public = true);

CREATE POLICY events_select ON public.events AS PERMISSIVE FOR SELECT TO PUBLIC USING (is_public = true OR zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY family_contacts_modify ON public.family_contacts AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant()) WITH CHECK (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY family_contacts_select ON public.family_contacts AS PERMISSIVE FOR SELECT TO PUBLIC USING (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY family_stripe_customers_tenant_access ON public.family_stripe_customers AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant()) WITH CHECK (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY featured_listings_admin_only ON public.featured_listings AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin()) WITH CHECK (zaltyko_private.is_admin());

CREATE POLICY featured_listings_select ON public.featured_listings AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY federative_licenses_modify ON public.federative_licenses AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(tenant_id)) WITH CHECK (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(tenant_id));

CREATE POLICY federative_licenses_select ON public.federative_licenses AS PERMISSIVE FOR SELECT TO PUBLIC USING (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(tenant_id));

CREATE POLICY group_athletes_modify ON public.group_athletes AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant()) WITH CHECK (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY group_athletes_select ON public.group_athletes AS PERMISSIVE FOR SELECT TO PUBLIC USING (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY groups_modify ON public.groups AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant()) WITH CHECK (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY groups_select ON public.groups AS PERMISSIVE FOR SELECT TO PUBLIC USING (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY growth_events_super_admin_select ON public.growth_events AS PERMISSIVE FOR SELECT TO PUBLIC USING (public.is_super_admin());

CREATE POLICY guardian_athletes_modify ON public.guardian_athletes AS PERMISSIVE FOR ALL TO authenticated USING (zaltyko_private.row_in_current_tenant(tenant_id) AND (EXISTS ( SELECT 1
   FROM public.athletes a
  WHERE a.id = guardian_athletes.athlete_id AND zaltyko_private.is_academy_manager(a.academy_id)))) WITH CHECK (zaltyko_private.row_in_current_tenant(tenant_id) AND (EXISTS ( SELECT 1
   FROM public.athletes a
  WHERE a.id = guardian_athletes.athlete_id AND zaltyko_private.is_academy_manager(a.academy_id))));

CREATE POLICY guardian_athletes_select ON public.guardian_athletes AS PERMISSIVE FOR SELECT TO authenticated USING (zaltyko_private.can_access_guardian(guardian_id) OR (EXISTS ( SELECT 1
   FROM public.athletes a
  WHERE a.id = guardian_athletes.athlete_id AND zaltyko_private.is_academy_manager(a.academy_id))));

CREATE POLICY guardians_modify ON public.guardians AS PERMISSIVE FOR ALL TO authenticated USING (zaltyko_private.can_access_guardian(id) AND zaltyko_private.row_in_current_tenant(tenant_id)) WITH CHECK (zaltyko_private.can_access_guardian(id) AND zaltyko_private.row_in_current_tenant(tenant_id));

CREATE POLICY guardians_select ON public.guardians AS PERMISSIVE FOR SELECT TO authenticated USING (zaltyko_private.is_super_admin() OR zaltyko_private.can_access_guardian(id));

CREATE POLICY invitations_modify ON public.invitations AS PERMISSIVE FOR ALL TO PUBLIC USING (public.is_super_admin() OR tenant_id = zaltyko_private.get_current_tenant()) WITH CHECK (public.is_super_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY invitations_select ON public.invitations AS PERMISSIVE FOR SELECT TO PUBLIC USING (public.is_super_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY lead_interactions_client_denied ON public.lead_interactions AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY lead_trial_outcomes_modify ON public.lead_trial_outcomes AS PERMISSIVE FOR ALL TO authenticated USING (zaltyko_private.row_in_current_tenant(tenant_id) AND zaltyko_private.is_academy_manager(academy_id)) WITH CHECK (zaltyko_private.row_in_current_tenant(tenant_id) AND zaltyko_private.is_academy_manager(academy_id));

CREATE POLICY lead_trial_outcomes_select ON public.lead_trial_outcomes AS PERMISSIVE FOR SELECT TO authenticated USING (zaltyko_private.row_in_current_tenant(tenant_id) AND zaltyko_private.is_academy_manager(academy_id));

CREATE POLICY lead_trials_modify ON public.lead_trials AS PERMISSIVE FOR ALL TO authenticated USING (zaltyko_private.row_in_current_tenant(tenant_id) AND zaltyko_private.is_academy_manager(academy_id)) WITH CHECK (zaltyko_private.row_in_current_tenant(tenant_id) AND zaltyko_private.is_academy_manager(academy_id));

CREATE POLICY lead_trials_select ON public.lead_trials AS PERMISSIVE FOR SELECT TO authenticated USING (zaltyko_private.row_in_current_tenant(tenant_id) AND zaltyko_private.is_academy_manager(academy_id));

CREATE POLICY leads_super_admin_all ON public.leads AS PERMISSIVE FOR ALL TO PUBLIC USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY leak_action_history_modify ON public.leak_action_history AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(academy_id)) WITH CHECK (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(academy_id));

CREATE POLICY leak_action_history_select ON public.leak_action_history AS PERMISSIVE FOR SELECT TO PUBLIC USING (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(academy_id));

CREATE POLICY leak_action_history_tenant_access ON public.leak_action_history AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant()) WITH CHECK (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY levels_authenticated_read ON public.levels AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY marketplace_listings_delete ON public.marketplace_listings AS PERMISSIVE FOR DELETE TO PUBLIC USING (user_id = auth.uid() OR zaltyko_private.is_admin());

CREATE POLICY marketplace_listings_insert ON public.marketplace_listings AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (user_id = auth.uid() OR zaltyko_private.is_admin());

CREATE POLICY marketplace_listings_select ON public.marketplace_listings AS PERMISSIVE FOR SELECT TO PUBLIC USING (status = 'active'::public.marketplace_listing_status OR zaltyko_private.is_admin());

CREATE POLICY marketplace_listings_update ON public.marketplace_listings AS PERMISSIVE FOR UPDATE TO PUBLIC USING (user_id = auth.uid() OR zaltyko_private.is_admin()) WITH CHECK (user_id = auth.uid() OR zaltyko_private.is_admin());

CREATE POLICY marketplace_ratings_insert ON public.marketplace_ratings AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (reviewer_id = auth.uid() OR zaltyko_private.is_admin());

CREATE POLICY marketplace_ratings_select ON public.marketplace_ratings AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY marketplace_ratings_update ON public.marketplace_ratings AS PERMISSIVE FOR UPDATE TO PUBLIC USING (reviewer_id = auth.uid() OR zaltyko_private.is_admin());

CREATE POLICY memberships_modify ON public.memberships AS PERMISSIVE FOR ALL TO authenticated USING (zaltyko_private.is_academy_manager(academy_id)) WITH CHECK (zaltyko_private.is_academy_manager(academy_id));

CREATE POLICY memberships_select ON public.memberships AS PERMISSIVE FOR SELECT TO authenticated USING (zaltyko_private.is_super_admin() OR user_id = auth.uid() OR zaltyko_private.is_academy_manager(academy_id));

CREATE POLICY message_groups_delete ON public.message_groups AS PERMISSIVE FOR DELETE TO PUBLIC USING (academy_id IS NOT NULL AND zaltyko_private.row_in_current_tenant(tenant_id) AND zaltyko_private.is_academy_manager(academy_id));

CREATE POLICY message_groups_insert ON public.message_groups AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (academy_id IS NOT NULL AND zaltyko_private.row_in_current_tenant(tenant_id) AND zaltyko_private.is_academy_manager(academy_id));

CREATE POLICY message_groups_select ON public.message_groups AS PERMISSIVE FOR SELECT TO authenticated USING (
CASE
    WHEN auth.uid() IS NULL THEN false
    ELSE zaltyko_private.row_in_current_tenant(tenant_id) AND zaltyko_private.is_academy_member(academy_id)
END);

CREATE POLICY message_groups_update ON public.message_groups AS PERMISSIVE FOR UPDATE TO PUBLIC USING (academy_id IS NOT NULL AND zaltyko_private.row_in_current_tenant(tenant_id) AND zaltyko_private.is_academy_manager(academy_id)) WITH CHECK (academy_id IS NOT NULL AND zaltyko_private.row_in_current_tenant(tenant_id) AND zaltyko_private.is_academy_manager(academy_id));

CREATE POLICY message_history_modify ON public.message_history AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(tenant_id)) WITH CHECK (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(tenant_id));

CREATE POLICY message_history_select ON public.message_history AS PERMISSIVE FOR SELECT TO PUBLIC USING (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(tenant_id));

CREATE POLICY message_read_receipts_user_access ON public.message_read_receipts AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR user_id = auth.uid()) WITH CHECK (zaltyko_private.is_admin() OR user_id = auth.uid());

CREATE POLICY message_templates_delete ON public.message_templates AS PERMISSIVE FOR DELETE TO PUBLIC USING (academy_id IS NOT NULL AND zaltyko_private.row_in_current_tenant(tenant_id) AND zaltyko_private.is_academy_manager(academy_id));

CREATE POLICY message_templates_insert ON public.message_templates AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (academy_id IS NOT NULL AND zaltyko_private.row_in_current_tenant(tenant_id) AND zaltyko_private.is_academy_manager(academy_id));

CREATE POLICY message_templates_select ON public.message_templates AS PERMISSIVE FOR SELECT TO authenticated USING (
CASE
    WHEN auth.uid() IS NULL THEN false
    ELSE zaltyko_private.is_super_admin() OR academy_id IS NULL AND is_system = true AND (tenant_id IS NULL OR zaltyko_private.row_in_current_tenant(tenant_id)) OR zaltyko_private.row_in_current_tenant(tenant_id) AND zaltyko_private.is_academy_member(academy_id)
END);

CREATE POLICY message_templates_update ON public.message_templates AS PERMISSIVE FOR UPDATE TO PUBLIC USING (academy_id IS NOT NULL AND zaltyko_private.row_in_current_tenant(tenant_id) AND zaltyko_private.is_academy_manager(academy_id)) WITH CHECK (academy_id IS NOT NULL AND zaltyko_private.row_in_current_tenant(tenant_id) AND zaltyko_private.is_academy_manager(academy_id));

CREATE POLICY notification_preferences_modify ON public.notification_preferences AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR (profile_id IN ( SELECT profiles.id
   FROM public.profiles
  WHERE profiles.user_id = auth.uid()))) WITH CHECK (zaltyko_private.is_admin() OR (profile_id IN ( SELECT profiles.id
   FROM public.profiles
  WHERE profiles.user_id = auth.uid())));

CREATE POLICY notification_preferences_select ON public.notification_preferences AS PERMISSIVE FOR SELECT TO PUBLIC USING (zaltyko_private.is_admin() OR (profile_id IN ( SELECT profiles.id
   FROM public.profiles
  WHERE profiles.user_id = auth.uid())));

CREATE POLICY "Service role can create notifications" ON public.notifications AS PERMISSIVE FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "Users can delete their own notifications" ON public.notifications AS PERMISSIVE FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications" ON public.notifications AS PERMISSIVE FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view their own notifications" ON public.notifications AS PERMISSIVE FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY notifications_delete ON public.notifications AS PERMISSIVE FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY notifications_insert ON public.notifications AS PERMISSIVE FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY notifications_select ON public.notifications AS PERMISSIVE FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY notifications_update ON public.notifications AS PERMISSIVE FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY onboarding_checklist_items_modify ON public.onboarding_checklist_items AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant()) WITH CHECK (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY onboarding_checklist_items_select ON public.onboarding_checklist_items AS PERMISSIVE FOR SELECT TO PUBLIC USING (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY onboarding_states_modify ON public.onboarding_states AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant()) WITH CHECK (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY onboarding_states_select ON public.onboarding_states AS PERMISSIVE FOR SELECT TO PUBLIC USING (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY owner_consent_self_read ON public.owner_consent AS PERMISSIVE FOR SELECT TO PUBLIC USING (auth.uid() = owner_id);

CREATE POLICY owner_consent_audit_owner_read ON public.owner_consent_audit AS PERMISSIVE FOR SELECT TO PUBLIC USING (auth.uid() = owner_id);

CREATE POLICY payment_attempts_tenant_access ON public.payment_attempts AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant()) WITH CHECK (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY plans_read ON public.plans AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY profiles_select ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING (zaltyko_private.is_super_admin() OR user_id = auth.uid() OR (EXISTS ( SELECT 1
   FROM public.memberships target_membership
     JOIN public.memberships current_membership ON current_membership.academy_id = target_membership.academy_id
  WHERE target_membership.user_id = profiles.user_id AND current_membership.user_id = auth.uid() AND current_membership.role = 'owner'::public.membership_role)));

CREATE POLICY profiles_update_self ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY programs_authenticated_read ON public.programs AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY push_subscriptions_user_access ON public.push_subscriptions AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR user_id = auth.uid()) WITH CHECK (zaltyko_private.is_admin() OR user_id = auth.uid());

CREATE POLICY push_tokens_user_access ON public.push_tokens AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR user_id = auth.uid()) WITH CHECK (zaltyko_private.is_admin() OR user_id = auth.uid());

CREATE POLICY receipts_insert ON public.receipts AS PERMISSIVE FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY receipts_select ON public.receipts AS PERMISSIVE FOR SELECT TO authenticated USING (athlete_id IS NOT NULL AND zaltyko_private.can_access_billing_athlete(athlete_id, academy_id, tenant_id));

CREATE POLICY refunds_tenant_access ON public.refunds AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant()) WITH CHECK (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY role_members_modify ON public.role_members AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(academy_id)) WITH CHECK (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(academy_id));

CREATE POLICY role_members_select ON public.role_members AS PERMISSIVE FOR SELECT TO PUBLIC USING (zaltyko_private.is_admin() OR user_id = auth.uid() OR zaltyko_private.academy_in_current_tenant(academy_id));

CREATE POLICY rubric_criteria_modify ON public.rubric_criteria AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR (rubric_id IN ( SELECT assessment_rubrics.id
   FROM public.assessment_rubrics
  WHERE zaltyko_private.academy_in_current_tenant(assessment_rubrics.tenant_id)))) WITH CHECK (zaltyko_private.is_admin() OR (rubric_id IN ( SELECT assessment_rubrics.id
   FROM public.assessment_rubrics
  WHERE zaltyko_private.academy_in_current_tenant(assessment_rubrics.tenant_id))));

CREATE POLICY rubric_criteria_select ON public.rubric_criteria AS PERMISSIVE FOR SELECT TO PUBLIC USING (zaltyko_private.is_admin() OR (rubric_id IN ( SELECT assessment_rubrics.id
   FROM public.assessment_rubrics
  WHERE assessment_rubrics.tenant_id IS NULL OR zaltyko_private.academy_in_current_tenant(assessment_rubrics.tenant_id))));

CREATE POLICY scheduled_notifications_delete ON public.scheduled_notifications AS PERMISSIVE FOR DELETE TO PUBLIC USING (academy_id IS NOT NULL AND zaltyko_private.row_in_current_tenant(tenant_id) AND zaltyko_private.is_academy_manager(academy_id));

CREATE POLICY scheduled_notifications_insert ON public.scheduled_notifications AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (academy_id IS NOT NULL AND zaltyko_private.row_in_current_tenant(tenant_id) AND zaltyko_private.is_academy_manager(academy_id));

CREATE POLICY scheduled_notifications_select ON public.scheduled_notifications AS PERMISSIVE FOR SELECT TO authenticated USING (
CASE
    WHEN auth.uid() IS NULL THEN false
    ELSE zaltyko_private.row_in_current_tenant(tenant_id) AND zaltyko_private.is_academy_member(academy_id)
END);

CREATE POLICY scheduled_notifications_update ON public.scheduled_notifications AS PERMISSIVE FOR UPDATE TO PUBLIC USING (academy_id IS NOT NULL AND zaltyko_private.row_in_current_tenant(tenant_id) AND zaltyko_private.is_academy_manager(academy_id)) WITH CHECK (academy_id IS NOT NULL AND zaltyko_private.row_in_current_tenant(tenant_id) AND zaltyko_private.is_academy_manager(academy_id));

CREATE POLICY scheduled_reports_modify ON public.scheduled_reports AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(academy_id)) WITH CHECK (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(academy_id));

CREATE POLICY scheduled_reports_select ON public.scheduled_reports AS PERMISSIVE FOR SELECT TO PUBLIC USING (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(academy_id));

CREATE POLICY "Admins can manage scholarships" ON public.scholarships AS PERMISSIVE FOR ALL TO authenticated USING ((tenant_id IN ( SELECT profiles.tenant_id
   FROM public.profiles
  WHERE profiles.id = auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE profiles.id = auth.uid() AND (profiles.role = ANY (ARRAY['admin'::public.profile_role, 'owner'::public.profile_role]))))) WITH CHECK ((tenant_id IN ( SELECT profiles.tenant_id
   FROM public.profiles
  WHERE profiles.id = auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE profiles.id = auth.uid() AND (profiles.role = ANY (ARRAY['admin'::public.profile_role, 'owner'::public.profile_role])))));

CREATE POLICY "Users can view scholarships from their tenant" ON public.scholarships AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id IN ( SELECT profiles.tenant_id
   FROM public.profiles
  WHERE profiles.id = auth.uid())));

CREATE POLICY scholarships_manage ON public.scholarships AS PERMISSIVE FOR ALL TO authenticated USING ((tenant_id IN ( SELECT profiles.tenant_id
   FROM public.profiles
  WHERE profiles.user_id = auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE profiles.user_id = auth.uid() AND (profiles.role = ANY (ARRAY['admin'::public.profile_role, 'owner'::public.profile_role, 'super_admin'::public.profile_role]))))) WITH CHECK ((tenant_id IN ( SELECT profiles.tenant_id
   FROM public.profiles
  WHERE profiles.user_id = auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE profiles.user_id = auth.uid() AND (profiles.role = ANY (ARRAY['admin'::public.profile_role, 'owner'::public.profile_role, 'super_admin'::public.profile_role])))));

CREATE POLICY scholarships_select ON public.scholarships AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id IN ( SELECT profiles.tenant_id
   FROM public.profiles
  WHERE profiles.user_id = auth.uid())));

CREATE POLICY skill_catalog_modify ON public.skill_catalog AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant()) WITH CHECK (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY skill_catalog_select ON public.skill_catalog AS PERMISSIVE FOR SELECT TO PUBLIC USING (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY sport_branches_authenticated_read ON public.sport_branches AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY sport_disciplines_authenticated_read ON public.sport_disciplines AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY sport_locale_configs_authenticated_read ON public.sport_locale_configs AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY stripe_accounts_tenant_access ON public.stripe_accounts AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant()) WITH CHECK (zaltyko_private.is_admin() OR tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY subscriptions_modify ON public.subscriptions AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR (user_id IN ( SELECT profiles.user_id
   FROM public.profiles
  WHERE profiles.tenant_id = zaltyko_private.get_current_tenant()))) WITH CHECK (zaltyko_private.is_admin() OR (user_id IN ( SELECT profiles.user_id
   FROM public.profiles
  WHERE profiles.tenant_id = zaltyko_private.get_current_tenant())));

CREATE POLICY subscriptions_select ON public.subscriptions AS PERMISSIVE FOR SELECT TO PUBLIC USING (zaltyko_private.is_admin() OR (user_id IN ( SELECT profiles.user_id
   FROM public.profiles
  WHERE profiles.tenant_id = zaltyko_private.get_current_tenant())));

CREATE POLICY template_age_categories_modify ON public.template_age_categories AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin()) WITH CHECK (zaltyko_private.is_admin());

CREATE POLICY template_age_categories_select ON public.template_age_categories AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY template_apparatus_modify ON public.template_apparatus AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin()) WITH CHECK (zaltyko_private.is_admin());

CREATE POLICY template_apparatus_select ON public.template_apparatus AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY template_competition_flow_modify ON public.template_competition_flow AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin()) WITH CHECK (zaltyko_private.is_admin());

CREATE POLICY template_competition_flow_select ON public.template_competition_flow AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY template_competition_levels_modify ON public.template_competition_levels AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin()) WITH CHECK (zaltyko_private.is_admin());

CREATE POLICY template_competition_levels_select ON public.template_competition_levels AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY template_license_config_modify ON public.template_license_config AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin()) WITH CHECK (zaltyko_private.is_admin());

CREATE POLICY template_license_config_select ON public.template_license_config AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY template_scoring_config_modify ON public.template_scoring_config AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin()) WITH CHECK (zaltyko_private.is_admin());

CREATE POLICY template_scoring_config_select ON public.template_scoring_config AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY templates_modify ON public.templates AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin()) WITH CHECK (zaltyko_private.is_admin());

CREATE POLICY templates_select ON public.templates AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY terminology_dictionary_authenticated_read ON public.terminology_dictionary AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY ticket_attachments_tenant_access ON public.ticket_attachments AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR uploaded_by = auth.uid() OR (EXISTS ( SELECT 1
   FROM public.tickets t
  WHERE t.id = ticket_attachments.ticket_id AND (t.created_by = auth.uid() OR t.assigned_to = auth.uid() OR zaltyko_private.academy_in_current_tenant(t.academy_id))))) WITH CHECK (zaltyko_private.is_admin() OR uploaded_by = auth.uid());

CREATE POLICY ticket_responses_tenant_access ON public.ticket_responses AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR user_id = auth.uid() OR (EXISTS ( SELECT 1
   FROM public.tickets t
  WHERE t.id = ticket_responses.ticket_id AND (t.created_by = auth.uid() OR t.assigned_to = auth.uid() OR zaltyko_private.academy_in_current_tenant(t.academy_id))))) WITH CHECK (zaltyko_private.is_admin() OR user_id = auth.uid());

CREATE POLICY tickets_tenant_access ON public.tickets AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR created_by = auth.uid() OR assigned_to = auth.uid() OR zaltyko_private.academy_in_current_tenant(academy_id)) WITH CHECK (zaltyko_private.is_admin() OR zaltyko_private.academy_in_current_tenant(academy_id));

CREATE POLICY user_preferences_modify ON public.user_preferences AS PERMISSIVE FOR ALL TO PUBLIC USING (zaltyko_private.is_admin() OR user_id = auth.uid() OR tenant_id IS NOT NULL AND tenant_id = zaltyko_private.get_current_tenant()) WITH CHECK (zaltyko_private.is_admin() OR user_id = auth.uid() OR tenant_id IS NOT NULL AND tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY user_preferences_select ON public.user_preferences AS PERMISSIVE FOR SELECT TO PUBLIC USING (zaltyko_private.is_admin() OR user_id = auth.uid() OR tenant_id IS NOT NULL AND tenant_id = zaltyko_private.get_current_tenant());

CREATE POLICY zaltyko_schema_migrations_client_denied ON public.zaltyko_schema_migrations AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY athletes_select_member ON zaltyko.athletes AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_organization_access(athletes.organization_id) AS has_organization_access));

CREATE POLICY attendance_records_select_member ON zaltyko.attendance_records AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_organization_access(attendance_records.organization_id) AS has_organization_access));

CREATE POLICY benchmark_profiles_member ON zaltyko.benchmark_profiles AS PERMISSIVE FOR SELECT TO authenticated USING (organization_id IS NULL OR ( SELECT zaltyko_domain_private.has_organization_access(benchmark_profiles.organization_id) AS has_organization_access));

CREATE POLICY charges_select_member ON zaltyko.charges AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_organization_access(charges.organization_id) AS has_organization_access));

CREATE POLICY class_template_groups_select_member ON zaltyko.class_template_groups AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_organization_access(class_template_groups.organization_id) AS has_organization_access));

CREATE POLICY class_template_weekdays_select_member ON zaltyko.class_template_weekdays AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_organization_access(class_template_weekdays.organization_id) AS has_organization_access));

CREATE POLICY class_templates_select_scoped ON zaltyko.class_templates AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_location_access(class_templates.organization_id, class_templates.location_id) AS has_location_access));

CREATE POLICY data_quality_issues_select_member ON zaltyko.data_quality_issues AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_organization_access(data_quality_issues.organization_id) AS has_organization_access));

CREATE POLICY enrollment_pauses_select_member ON zaltyko.enrollment_pauses AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_organization_access(enrollment_pauses.organization_id) AS has_organization_access));

CREATE POLICY enrollment_price_assignments_select_scoped ON zaltyko.enrollment_price_assignments AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_location_access(enrollment_price_assignments.organization_id, enrollment_price_assignments.location_id) AS has_location_access));

CREATE POLICY enrollment_status_history_select_member ON zaltyko.enrollment_status_history AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_organization_access(enrollment_status_history.organization_id) AS has_organization_access));

CREATE POLICY enrollments_select_member ON zaltyko.enrollments AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_organization_access(enrollments.organization_id) AS has_organization_access));

CREATE POLICY facilities_select_scoped ON zaltyko.facilities AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_location_access(facilities.organization_id, facilities.location_id) AS has_location_access));

CREATE POLICY families_select_member ON zaltyko.families AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_organization_access(families.organization_id) AS has_organization_access));

CREATE POLICY family_guardians_select_member ON zaltyko.family_guardians AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_organization_access(family_guardians.organization_id) AS has_organization_access));

CREATE POLICY family_members_select_member ON zaltyko.family_members AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_organization_access(family_members.organization_id) AS has_organization_access));

CREATE POLICY family_payers_select_member ON zaltyko.family_payers AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_organization_access(family_payers.organization_id) AS has_organization_access));

CREATE POLICY financial_reconciliation_runs_select_member ON zaltyko.financial_reconciliation_runs AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_organization_access(financial_reconciliation_runs.organization_id) AS has_organization_access));

CREATE POLICY group_membership_history_select_member ON zaltyko.group_membership_history AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM zaltyko.group_memberships membership
     JOIN zaltyko.groups group_row ON group_row.organization_id = membership.organization_id AND group_row.id = membership.group_id
  WHERE membership.organization_id = group_membership_history.organization_id AND membership.id = group_membership_history.membership_id AND ( SELECT zaltyko_domain_private.has_location_access(group_row.organization_id, group_row.location_id) AS has_location_access))));

CREATE POLICY group_memberships_select_member ON zaltyko.group_memberships AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM zaltyko.groups group_row
  WHERE group_row.organization_id = group_memberships.organization_id AND group_row.id = group_memberships.group_id AND ( SELECT zaltyko_domain_private.has_location_access(group_row.organization_id, group_row.location_id) AS has_location_access))));

CREATE POLICY groups_select_scoped ON zaltyko.groups AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_location_access(groups.organization_id, groups.location_id) AS has_location_access));

CREATE POLICY guardian_contacts_select_member ON zaltyko.guardian_contacts AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_organization_access(guardian_contacts.organization_id) AS has_organization_access));

CREATE POLICY guardians_select_member ON zaltyko.guardians AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_organization_access(guardians.organization_id) AS has_organization_access));

CREATE POLICY health_score_dimension_snapshots_member ON zaltyko.health_score_dimension_snapshots AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_organization_access(health_score_dimension_snapshots.organization_id) AS has_organization_access));

CREATE POLICY health_score_snapshots_member ON zaltyko.health_score_snapshots AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_organization_access(health_score_snapshots.organization_id) AS has_organization_access));

CREATE POLICY insight_actions_member ON zaltyko.insight_actions AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_organization_access(insight_actions.organization_id) AS has_organization_access));

CREATE POLICY insight_rule_runs_member ON zaltyko.insight_rule_runs AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_organization_access(insight_rule_runs.organization_id) AS has_organization_access));

CREATE POLICY insight_rule_versions_member ON zaltyko.insight_rule_versions AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY insights_member ON zaltyko.insights AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_organization_access(insights.organization_id) AS has_organization_access));

CREATE POLICY invoice_line_enrollments_deny_clients ON zaltyko.invoice_line_enrollments AS PERMISSIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY invoice_lines_select_member ON zaltyko.invoice_lines AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_organization_access(invoice_lines.organization_id) AS has_organization_access));

CREATE POLICY invoices_select_member ON zaltyko.invoices AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_organization_access(invoices.organization_id) AS has_organization_access));

CREATE POLICY locations_select_scoped ON zaltyko.locations AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_location_access(locations.organization_id, locations.id) AS has_location_access));

CREATE POLICY member_location_scopes_select_self ON zaltyko.member_location_scopes AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM zaltyko.organization_members member
  WHERE member.id = member_location_scopes.member_id AND member.organization_id = member_location_scopes.organization_id AND member.user_id = (( SELECT auth.uid() AS uid)) AND member.status = 'active'::zaltyko.member_status)));

CREATE POLICY metric_runs_select_member ON zaltyko.metric_runs AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_organization_access(metric_runs.organization_id) AS has_organization_access));

CREATE POLICY metric_values_select_member ON zaltyko.metric_values AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_organization_access(metric_values.organization_id) AS has_organization_access));

CREATE POLICY organization_members_select_self ON zaltyko.organization_members AS PERMISSIVE FOR SELECT TO authenticated USING (user_id = (( SELECT auth.uid() AS uid)) AND status = 'active'::zaltyko.member_status);

CREATE POLICY organization_sports_select_member ON zaltyko.organization_sports AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_organization_access(organization_sports.organization_id) AS has_organization_access));

CREATE POLICY organizations_select_member ON zaltyko.organizations AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_organization_access(organizations.id) AS has_organization_access));

CREATE POLICY owner_dashboard_layouts_insert_self ON zaltyko.owner_dashboard_layouts AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (user_id = (( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM zaltyko.organization_members member
  WHERE member.organization_id = owner_dashboard_layouts.organization_id AND member.user_id = (( SELECT auth.uid() AS uid)) AND member.status = 'active'::zaltyko.member_status AND (member.role = ANY (ARRAY['owner'::zaltyko.member_role, 'manager'::zaltyko.member_role, 'admin'::zaltyko.member_role])))));

CREATE POLICY owner_dashboard_layouts_select_self ON zaltyko.owner_dashboard_layouts AS PERMISSIVE FOR SELECT TO authenticated USING (user_id = (( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM zaltyko.organization_members member
  WHERE member.organization_id = owner_dashboard_layouts.organization_id AND member.user_id = (( SELECT auth.uid() AS uid)) AND member.status = 'active'::zaltyko.member_status AND (member.role = ANY (ARRAY['owner'::zaltyko.member_role, 'manager'::zaltyko.member_role, 'admin'::zaltyko.member_role])))));

CREATE POLICY owner_dashboard_layouts_update_self ON zaltyko.owner_dashboard_layouts AS PERMISSIVE FOR UPDATE TO authenticated USING (user_id = (( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM zaltyko.organization_members member
  WHERE member.organization_id = owner_dashboard_layouts.organization_id AND member.user_id = (( SELECT auth.uid() AS uid)) AND member.status = 'active'::zaltyko.member_status AND (member.role = ANY (ARRAY['owner'::zaltyko.member_role, 'manager'::zaltyko.member_role, 'admin'::zaltyko.member_role]))))) WITH CHECK (user_id = (( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM zaltyko.organization_members member
  WHERE member.organization_id = owner_dashboard_layouts.organization_id AND member.user_id = (( SELECT auth.uid() AS uid)) AND member.status = 'active'::zaltyko.member_status AND (member.role = ANY (ARRAY['owner'::zaltyko.member_role, 'manager'::zaltyko.member_role, 'admin'::zaltyko.member_role])))));

CREATE POLICY owner_signup_consent_audits_self_read ON zaltyko.owner_signup_consent_audits AS PERMISSIVE FOR SELECT TO authenticated USING (user_id = (( SELECT auth.uid() AS uid)));

CREATE POLICY owner_signup_consents_self_read ON zaltyko.owner_signup_consents AS PERMISSIVE FOR SELECT TO authenticated USING (user_id = (( SELECT auth.uid() AS uid)));

CREATE POLICY payment_allocations_select_member ON zaltyko.payment_allocations AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_organization_access(payment_allocations.organization_id) AS has_organization_access));

CREATE POLICY payment_attempts_select_member ON zaltyko.payment_attempts AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_organization_access(payment_attempts.organization_id) AS has_organization_access));

CREATE POLICY payments_select_member ON zaltyko.payments AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_organization_access(payments.organization_id) AS has_organization_access));

CREATE POLICY people_select_member ON zaltyko.people AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_organization_access(people.organization_id) AS has_organization_access));

CREATE POLICY price_plan_class_template_coverage_deny_clients ON zaltyko.price_plan_class_template_coverage AS PERMISSIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY price_plans_select_member ON zaltyko.price_plans AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_organization_access(price_plans.organization_id) AS has_organization_access));

CREATE POLICY programs_select_member ON zaltyko.programs AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_organization_access(programs.organization_id) AS has_organization_access));

CREATE POLICY refunds_select_member ON zaltyko.refunds AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_organization_access(refunds.organization_id) AS has_organization_access));

CREATE POLICY retention_cohort_projection_runs_select_owner ON zaltyko.retention_cohort_projection_runs AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM zaltyko.organization_members member
  WHERE member.organization_id = retention_cohort_projection_runs.organization_id AND member.user_id = (( SELECT auth.uid() AS uid)) AND member.status = 'active'::zaltyko.member_status AND (member.role = ANY (ARRAY['owner'::zaltyko.member_role, 'admin'::zaltyko.member_role, 'manager'::zaltyko.member_role])) AND (retention_cohort_projection_runs.location_id IS NULL AND member.location_scope_mode = 'all'::zaltyko.location_scope_mode OR retention_cohort_projection_runs.location_id IS NOT NULL AND (member.location_scope_mode = 'all'::zaltyko.location_scope_mode OR (EXISTS ( SELECT 1
           FROM zaltyko.member_location_scopes scope
          WHERE scope.organization_id = member.organization_id AND scope.member_id = member.id AND scope.location_id = retention_cohort_projection_runs.location_id)))))));

CREATE POLICY retention_cohort_projections_select_owner ON zaltyko.retention_cohort_projections AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM zaltyko.organization_members member
  WHERE member.organization_id = retention_cohort_projections.organization_id AND member.user_id = (( SELECT auth.uid() AS uid)) AND member.status = 'active'::zaltyko.member_status AND (member.role = ANY (ARRAY['owner'::zaltyko.member_role, 'admin'::zaltyko.member_role, 'manager'::zaltyko.member_role])) AND (retention_cohort_projections.location_id IS NULL AND member.location_scope_mode = 'all'::zaltyko.location_scope_mode OR retention_cohort_projections.location_id IS NOT NULL AND (member.location_scope_mode = 'all'::zaltyko.location_scope_mode OR (EXISTS ( SELECT 1
           FROM zaltyko.member_location_scopes scope
          WHERE scope.organization_id = member.organization_id AND scope.member_id = member.id AND scope.location_id = retention_cohort_projections.location_id)))))));

CREATE POLICY session_staff_select_member ON zaltyko.session_staff AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_organization_access(session_staff.organization_id) AS has_organization_access));

CREATE POLICY sessions_select_scoped ON zaltyko.sessions AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_location_access(sessions.organization_id, sessions.location_id) AS has_location_access));

CREATE POLICY spaces_select_scoped ON zaltyko.spaces AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_location_access(spaces.organization_id, spaces.location_id) AS has_location_access));

CREATE POLICY sport_profiles_select_catalog ON zaltyko.sport_profiles AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY staff_profiles_select_member ON zaltyko.staff_profiles AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_organization_access(staff_profiles.organization_id) AS has_organization_access));

CREATE POLICY trial_followups_select_scoped ON zaltyko.trial_followups AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_location_access(trial_followups.organization_id, trial_followups.location_id) AS has_location_access));

CREATE POLICY trial_status_history_select_scoped ON zaltyko.trial_status_history AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_location_access(trial_status_history.organization_id, trial_status_history.location_id) AS has_location_access));

CREATE POLICY trials_select_scoped ON zaltyko.trials AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_location_access(trials.organization_id, trials.location_id) AS has_location_access));

CREATE POLICY waitlist_entries_select_scoped ON zaltyko.waitlist_entries AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_location_access(waitlist_entries.organization_id, waitlist_entries.location_id) AS has_location_access));

CREATE POLICY waitlist_offers_select_scoped ON zaltyko.waitlist_offers AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT zaltyko_domain_private.has_location_access(waitlist_offers.organization_id, waitlist_offers.location_id) AS has_location_access));

-- Restore exact app-schema ACLs. Tables and routines have been reset to their
-- owner-only baseline; implicit source PUBLIC execution on two trigger-only
-- routines is restored explicitly. Type grants are additive and preserve
-- PostgreSQL's platform defaults for generated composite row types.
DO $baseline_schema_acl_reset$
DECLARE
  v_schema text;
  v_owner oid;
  v_role text;
BEGIN
  FOREACH v_schema IN ARRAY ARRAY['public','zaltyko','zaltyko_domain_private','zaltyko_private'] LOOP
    SELECT nspowner INTO v_owner FROM pg_namespace WHERE nspname = v_schema;
    IF v_owner IS NULL THEN
      RAISE EXCEPTION 'Snapshot expected schema % to exist before ACL replay', v_schema;
    END IF;
    EXECUTE format('REVOKE ALL PRIVILEGES ON SCHEMA %I FROM PUBLIC', v_schema);
    FOR v_role IN
      SELECT rolname FROM pg_roles WHERE oid <> v_owner ORDER BY rolname
    LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES ON SCHEMA %I FROM %I', v_schema, v_role);
    END LOOP;
  END LOOP;
END
$baseline_schema_acl_reset$;
GRANT USAGE ON SCHEMA public TO PUBLIC;
GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA zaltyko TO authenticated;
GRANT USAGE ON SCHEMA zaltyko TO service_role;
GRANT USAGE ON SCHEMA zaltyko_domain_private TO authenticated;
GRANT USAGE ON SCHEMA zaltyko_domain_private TO service_role;
GRANT USAGE ON SCHEMA zaltyko_private TO anon;
GRANT USAGE ON SCHEMA zaltyko_private TO authenticated;
GRANT USAGE ON SCHEMA zaltyko_private TO service_role;
DO $baseline_object_acl_reset$
DECLARE
  v_schema text;
  v_role text;
  v_column record;
BEGIN
  FOREACH v_schema IN ARRAY ARRAY['public','zaltyko','zaltyko_domain_private','zaltyko_private'] LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA %I FROM PUBLIC', v_schema);
    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA %I FROM PUBLIC', v_schema);
    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA %I FROM PUBLIC', v_schema);
    FOR v_role IN
      SELECT rolname FROM pg_roles WHERE rolname <> 'postgres' ORDER BY rolname
    LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA %I FROM %I', v_schema, v_role);
      EXECUTE format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA %I FROM %I', v_schema, v_role);
      EXECUTE format('REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA %I FROM %I', v_schema, v_role);
    END LOOP;
  END LOOP;

  FOR v_column IN
    SELECT n.nspname AS schema_name, c.relname AS table_name, a.attname AS column_name,
           acl.grantee, acl.privilege_type
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(a.attacl) AS acl
    WHERE n.nspname IN ('public','zaltyko','zaltyko_domain_private','zaltyko_private')
      AND c.relkind IN ('r','p','v','m','f')
      AND a.attnum > 0 AND NOT a.attisdropped
      AND acl.grantee <> c.relowner
  LOOP
    IF v_column.grantee = 0 THEN
      EXECUTE format(
        'REVOKE %s (%I) ON TABLE %I.%I FROM PUBLIC',
        v_column.privilege_type, v_column.column_name, v_column.schema_name, v_column.table_name
      );
    ELSE
      SELECT rolname INTO v_role FROM pg_roles WHERE oid = v_column.grantee;
      IF v_role IS NULL THEN
        RAISE EXCEPTION 'Could not resolve column ACL grantee for %.%.%',
          v_column.schema_name, v_column.table_name, v_column.column_name;
      END IF;
      EXECUTE format(
        'REVOKE %s (%I) ON TABLE %I.%I FROM %I',
        v_column.privilege_type, v_column.column_name, v_column.schema_name, v_column.table_name, v_role
      );
    END IF;
  END LOOP;
END
$baseline_object_acl_reset$;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.academies TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.academies TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.academies TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.academy_diagnostics TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.academy_diagnostics TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.academy_diagnostics TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.academy_expenses TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.academy_expenses TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.academy_expenses TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.academy_geo_groups TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.academy_geo_groups TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.academy_geo_groups TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.academy_link_requests TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.academy_link_requests TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.academy_link_requests TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.academy_messages TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.academy_messages TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.academy_messages TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.academy_roles TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.academy_roles TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.academy_roles TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.academy_sport_configs TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.academy_sport_configs TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.academy_sport_configs TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.academy_trials TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.academy_trials TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.academy_trials TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.advertisements TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.advertisements TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.advertisements TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.announcement_read_status TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.announcement_read_status TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.announcement_read_status TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.announcements TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.announcements TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.announcements TO service_role;
GRANT SELECT ON TABLE public.app_config TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.app_config TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.apparatus TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.apparatus TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.assessment_rubrics TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.assessment_rubrics TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.assessment_rubrics TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.assessment_scores TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.assessment_scores TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.assessment_scores TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.assessment_types TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.assessment_types TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.assessment_types TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.assessment_videos TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.assessment_videos TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.assessment_videos TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.athlete_assessments TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.athlete_assessments TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.athlete_assessments TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.athlete_documents TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.athlete_documents TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.athlete_documents TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.athlete_extra_classes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.athlete_extra_classes TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.athlete_extra_classes TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.athlete_import_batches TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.athlete_import_batches TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.athlete_import_batches TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.athlete_invitations TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.athlete_invitations TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.athlete_invitations TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.athlete_sport_configs TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.athlete_sport_configs TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.athlete_sport_configs TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.athletes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.athletes TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.athletes TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.attendance_records TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.attendance_records TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.attendance_records TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.audit_logs TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.audit_logs TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.audit_logs TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.billing_events TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.billing_events TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.billing_events TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.billing_invoices TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.billing_invoices TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.billing_invoices TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.billing_items TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.billing_items TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.billing_items TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.categories TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.categories TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.charges TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.charges TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.charges TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.churn_reasons TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.churn_reasons TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.churn_reasons TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.class_coach_assignments TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.class_coach_assignments TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.class_coach_assignments TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.class_enrollments TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.class_enrollments TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.class_enrollments TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.class_exceptions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.class_exceptions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.class_exceptions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.class_groups TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.class_groups TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.class_groups TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.class_sessions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.class_sessions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.class_sessions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.class_waiting_list TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.class_waiting_list TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.class_waiting_list TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.class_weekdays TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.class_weekdays TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.class_weekdays TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.classes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.classes TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.classes TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.coach_compensation TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.coach_compensation TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.coach_compensation TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.coach_notes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.coach_notes TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.coach_notes TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.coach_sport_configs TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.coach_sport_configs TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.coach_sport_configs TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.coaches TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.coaches TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.coaches TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.commercial_interviews TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.commercial_interviews TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.commercial_interviews TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.competition_results TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.competition_results TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.competition_results TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.competition_types TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.competition_types TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.contact_messages TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.contact_messages TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.contact_messages TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.conversation_messages TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.conversation_messages TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.conversation_messages TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.conversation_participants TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.conversation_participants TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.conversation_participants TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.conversations TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.conversations TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.conversations TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.countries TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.countries TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.directory_audit TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.directory_batches TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.directory_claims TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.directory_deliveries TO service_role;
GRANT SELECT ON TABLE public.directory_entries TO anon;
GRANT SELECT ON TABLE public.directory_entries TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.directory_entries TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.directory_favorites TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.directory_grants TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.directory_import_rows TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.directory_revisions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.directory_sources TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.directory_subscriptions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.discount_campaigns TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.discount_campaigns TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.discount_campaigns TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.discount_usage_history TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.discount_usage_history TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.discount_usage_history TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.discounts TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.discounts TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.discounts TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_logs TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_logs TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_logs TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.empleo_applications TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.empleo_applications TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.empleo_applications TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.empleo_listings TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.empleo_listings TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.empleo_listings TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.event_categories TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.event_categories TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.event_categories TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.event_invitations TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.event_invitations TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.event_invitations TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.event_logs TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.event_logs TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.event_logs TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.event_payments TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.event_payments TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.event_payments TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.event_registrations TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.event_registrations TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.event_registrations TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.event_waitlist TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.event_waitlist TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.event_waitlist TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.events TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.events TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.events TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.family_contacts TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.family_contacts TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.family_contacts TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.family_stripe_customers TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.family_stripe_customers TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.family_stripe_customers TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.featured_listings TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.featured_listings TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.featured_listings TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.federative_licenses TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.federative_licenses TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.federative_licenses TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_athletes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_athletes TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_athletes TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.groups TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.groups TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.groups TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.growth_events TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.growth_events TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.growth_events TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.guardian_athletes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.guardian_athletes TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.guardian_athletes TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.guardians TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.guardians TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.guardians TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.invitations TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.invitations TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.invitations TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.lead_interactions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.lead_trial_outcomes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.lead_trial_outcomes TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.lead_trial_outcomes TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.lead_trials TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.lead_trials TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.lead_trials TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.leads TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.leads TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.leads TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.leak_action_history TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.leak_action_history TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.leak_action_history TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.levels TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.levels TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.marketplace_listings TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.marketplace_listings TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.marketplace_listings TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.marketplace_ratings TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.marketplace_ratings TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.marketplace_ratings TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.memberships TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.memberships TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.memberships TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.message_groups TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.message_groups TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.message_groups TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.message_history TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.message_history TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.message_history TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.message_read_receipts TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.message_read_receipts TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.message_read_receipts TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.message_templates TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.message_templates TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.message_templates TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.notification_preferences TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.notification_preferences TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.notification_preferences TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.notifications TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.notifications TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.notifications TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.onboarding_checklist_items TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.onboarding_checklist_items TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.onboarding_checklist_items TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.onboarding_states TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.onboarding_states TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.onboarding_states TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.owner_consent TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.owner_consent TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.owner_consent TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.owner_consent_audit TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.owner_consent_audit TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.owner_consent_audit TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.payment_attempts TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.payment_attempts TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.payment_attempts TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.plans TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.plans TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.plans TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profiles TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.profiles TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profiles TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.programs TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.programs TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.push_subscriptions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.push_subscriptions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.push_subscriptions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.push_tokens TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.push_tokens TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.receipts TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.receipts TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.receipts TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.refunds TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.refunds TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.refunds TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.role_members TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.role_members TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.role_members TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.rubric_criteria TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.rubric_criteria TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.rubric_criteria TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.scheduled_notifications TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.scheduled_notifications TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.scheduled_notifications TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.scheduled_reports TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.scheduled_reports TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.scheduled_reports TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.scholarships TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.scholarships TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.scholarships TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.skill_catalog TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.skill_catalog TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.skill_catalog TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.sport_branches TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sport_branches TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.sport_disciplines TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sport_disciplines TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.sport_locale_configs TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sport_locale_configs TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.stripe_accounts TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.stripe_accounts TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.stripe_accounts TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.subscriptions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.subscriptions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.subscriptions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.template_age_categories TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.template_age_categories TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.template_age_categories TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.template_apparatus TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.template_apparatus TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.template_apparatus TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.template_competition_flow TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.template_competition_flow TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.template_competition_flow TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.template_competition_levels TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.template_competition_levels TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.template_competition_levels TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.template_license_config TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.template_license_config TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.template_license_config TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.template_scoring_config TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.template_scoring_config TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.template_scoring_config TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.templates TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.templates TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.templates TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.terminology_dictionary TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.terminology_dictionary TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ticket_attachments TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ticket_attachments TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ticket_attachments TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ticket_responses TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ticket_responses TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ticket_responses TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tickets TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tickets TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tickets TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_preferences TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_preferences TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_preferences TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.zaltyko_schema_migrations TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.athletes TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.attendance_records TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.audit_log TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.benchmark_metric_targets TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.benchmark_profiles TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.charges TO service_role;
GRANT SELECT ON TABLE zaltyko.class_template_groups TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.class_template_groups TO service_role;
GRANT SELECT ON TABLE zaltyko.class_template_weekdays TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.class_template_weekdays TO service_role;
GRANT SELECT ON TABLE zaltyko.class_templates TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.class_templates TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.data_quality_issues TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.enrollment_pauses TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.enrollment_price_assignments TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.enrollment_status_history TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.enrollments TO service_role;
GRANT SELECT ON TABLE zaltyko.facilities TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.facilities TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.families TO service_role;
GRANT INSERT, SELECT, UPDATE ON TABLE zaltyko.family_collection_preferences TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.family_guardians TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.family_members TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.family_payers TO service_role;
GRANT INSERT, SELECT, UPDATE ON TABLE zaltyko.family_payment_authorizations TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.financial_reconciliation_runs TO service_role;
GRANT SELECT ON TABLE zaltyko.group_membership_history TO authenticated;
GRANT INSERT, SELECT ON TABLE zaltyko.group_membership_history TO service_role;
GRANT SELECT ON TABLE zaltyko.group_memberships TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE zaltyko.group_memberships TO service_role;
GRANT SELECT ON TABLE zaltyko.groups TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.groups TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.guardian_contacts TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.guardians TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.health_score_dimension_snapshots TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.health_score_dimension_weights TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.health_score_metric_contributions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.health_score_metric_weights TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.health_score_snapshots TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.health_score_versions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.insight_actions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.insight_notifications TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.insight_rule_runs TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.insight_rule_versions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.insight_run_observations TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.insight_status_history TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.insights TO service_role;
GRANT INSERT, SELECT ON TABLE zaltyko.invoice_line_enrollments TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.invoice_lines TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.invoices TO service_role;
GRANT SELECT ON TABLE zaltyko.locations TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.locations TO service_role;
GRANT SELECT ON TABLE zaltyko.member_location_scopes TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.member_location_scopes TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.metric_definitions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.metric_event_consumptions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.metric_invalidations TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.metric_run_values TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.metric_runs TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.metric_values TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.organization_bootstrap_commands TO service_role;
GRANT INSERT, SELECT ON TABLE zaltyko.organization_entitlement_changes TO service_role;
GRANT INSERT, SELECT, UPDATE ON TABLE zaltyko.organization_entitlements TO service_role;
GRANT SELECT ON TABLE zaltyko.organization_members TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.organization_members TO service_role;
GRANT INSERT, SELECT, UPDATE ON TABLE zaltyko.organization_payment_provider_accounts TO service_role;
GRANT INSERT, SELECT, UPDATE ON TABLE zaltyko.organization_saas_checkout_operations TO service_role;
GRANT INSERT, SELECT, UPDATE ON TABLE zaltyko.organization_saas_customers TO service_role;
GRANT INSERT, SELECT, UPDATE ON TABLE zaltyko.organization_saas_subscriptions TO service_role;
GRANT INSERT, SELECT, UPDATE ON TABLE zaltyko.organization_saas_trials TO service_role;
GRANT INSERT, SELECT, UPDATE ON TABLE zaltyko.organization_saas_webhook_events TO service_role;
GRANT INSERT, SELECT, UPDATE ON TABLE zaltyko.organization_saas_webhook_payload_conflicts TO service_role;
GRANT INSERT, SELECT ON TABLE zaltyko.organization_saas_webhook_reconciliation_decisions TO service_role;
GRANT INSERT, SELECT ON TABLE zaltyko.organization_saas_webhook_reconciliation_results TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.organization_sports TO service_role;
GRANT SELECT ON TABLE zaltyko.organizations TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.organizations TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.outbox_events TO service_role;
GRANT INSERT, SELECT, UPDATE ON TABLE zaltyko.owner_dashboard_layouts TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.owner_dashboard_layouts TO service_role;
GRANT SELECT ON TABLE zaltyko.owner_signup_consent_audits TO authenticated;
GRANT INSERT, SELECT ON TABLE zaltyko.owner_signup_consent_audits TO service_role;
GRANT SELECT ON TABLE zaltyko.owner_signup_consent_policy TO service_role;
GRANT SELECT ON TABLE zaltyko.owner_signup_consents TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE zaltyko.owner_signup_consents TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.payment_allocations TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.payment_attempts TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.payment_provider_events TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.payments TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.people TO service_role;
GRANT INSERT, SELECT, UPDATE ON TABLE zaltyko.price_plan_class_template_coverage TO service_role;
GRANT SELECT ON TABLE zaltyko.price_plans TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.price_plans TO service_role;
GRANT SELECT ON TABLE zaltyko.programs TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.programs TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.refunds TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.retention_cohort_projection_runs TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.retention_cohort_projections TO service_role;
GRANT SELECT ON TABLE zaltyko.session_staff TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.session_staff TO service_role;
GRANT SELECT ON TABLE zaltyko.sessions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.sessions TO service_role;
GRANT SELECT ON TABLE zaltyko.spaces TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.spaces TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.sport_profiles TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.staff_profiles TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.trial_followups TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.trial_status_history TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.trials TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.waitlist_entries TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.waitlist_offers TO service_role;


GRANT EXECUTE ON FUNCTION public.athlete_invitations_set_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.athlete_invitations_set_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.athlete_invitations_set_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.athlete_invitations_set_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.current_policy_version() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_policy_version() TO anon;
GRANT EXECUTE ON FUNCTION public.current_policy_version() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_policy_version() TO service_role;
GRANT EXECUTE ON FUNCTION public.directory_withdraw_deleted_authority() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_academy_blocked_from_sending(target uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_academy_blocked_from_sending(target uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_academy_blocked_from_sending(target uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_academy_blocked_from_sending(target uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO service_role;
GRANT EXECUTE ON FUNCTION public.owner_consent_audit_append_only() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.owner_consent_audit_append_only() TO anon;
GRANT EXECUTE ON FUNCTION public.owner_consent_audit_append_only() TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_consent_audit_append_only() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_academy_status_from_legacy() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_academy_status_from_legacy() TO anon;
GRANT EXECUTE ON FUNCTION public.sync_academy_status_from_legacy() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_academy_status_from_legacy() TO service_role;
GRANT EXECUTE ON FUNCTION zaltyko.guard_saas_reconciliation_result_insert() TO PUBLIC;
GRANT EXECUTE ON FUNCTION zaltyko.guard_saas_webhook_requeue() TO PUBLIC;
GRANT EXECUTE ON FUNCTION zaltyko_domain_private.has_location_access(target_organization_id uuid, target_location_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION zaltyko_domain_private.has_location_access(target_organization_id uuid, target_location_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION zaltyko_domain_private.has_organization_access(target_organization_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION zaltyko_domain_private.has_organization_access(target_organization_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION zaltyko_private.academy_in_current_tenant(target uuid) TO anon;
GRANT EXECUTE ON FUNCTION zaltyko_private.academy_in_current_tenant(target uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION zaltyko_private.academy_in_current_tenant(target uuid) TO service_role;
GRANT EXECUTE ON FUNCTION zaltyko_private.can_access_athlete(target_athlete_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION zaltyko_private.can_access_billing_athlete(target_athlete_id uuid, target_academy_id uuid, target_tenant_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION zaltyko_private.can_access_billing_athlete(target_athlete_id uuid, target_academy_id uuid, target_tenant_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION zaltyko_private.can_access_class(target_class_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION zaltyko_private.can_access_guardian(target_guardian_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION zaltyko_private.current_profile_id() TO authenticated;
GRANT EXECUTE ON FUNCTION zaltyko_private.current_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION zaltyko_private.get_current_tenant() TO anon;
GRANT EXECUTE ON FUNCTION zaltyko_private.get_current_tenant() TO authenticated;
GRANT EXECUTE ON FUNCTION zaltyko_private.get_current_tenant() TO service_role;
GRANT EXECUTE ON FUNCTION zaltyko_private.is_academy_manager(target_academy_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION zaltyko_private.is_academy_member(target_academy_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION zaltyko_private.is_admin() TO anon;
GRANT EXECUTE ON FUNCTION zaltyko_private.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION zaltyko_private.is_admin() TO service_role;
GRANT EXECUTE ON FUNCTION zaltyko_private.is_assigned_coach(target_class_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION zaltyko_private.is_super_admin() TO anon;
GRANT EXECUTE ON FUNCTION zaltyko_private.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION zaltyko_private.is_super_admin() TO service_role;
GRANT EXECUTE ON FUNCTION zaltyko_private.row_in_current_tenant(target_tenant_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION zaltyko.guard_saas_reconciliation_result_insert() TO PUBLIC;
GRANT EXECUTE ON FUNCTION zaltyko.guard_saas_webhook_requeue() TO PUBLIC;

GRANT USAGE ON TYPE public.academy_type TO PUBLIC;
GRANT USAGE ON TYPE public.ad_position TO PUBLIC;
GRANT USAGE ON TYPE public.ad_type TO PUBLIC;
GRANT USAGE ON TYPE public.application_status TO PUBLIC;
GRANT USAGE ON TYPE public.assessment_type TO PUBLIC;
GRANT USAGE ON TYPE public.billing_item_periodicity TO PUBLIC;
GRANT USAGE ON TYPE public.charge_status TO PUBLIC;
GRANT USAGE ON TYPE public.discount_category TO PUBLIC;
GRANT USAGE ON TYPE public.document_type TO PUBLIC;
GRANT USAGE ON TYPE public.event_discipline TO PUBLIC;
GRANT USAGE ON TYPE public.event_level TO PUBLIC;
GRANT USAGE ON TYPE public.event_payment_status TO PUBLIC;
GRANT USAGE ON TYPE public.event_registration_status TO PUBLIC;
GRANT USAGE ON TYPE public.event_status TO PUBLIC;
GRANT USAGE ON TYPE public.event_type TO PUBLIC;
GRANT USAGE ON TYPE public.event_waitlist_status TO PUBLIC;
GRANT USAGE ON TYPE public.job_category TO PUBLIC;
GRANT USAGE ON TYPE public.job_listing_status TO PUBLIC;
GRANT USAGE ON TYPE public.job_type TO PUBLIC;
GRANT USAGE ON TYPE public.license_status TO PUBLIC;
GRANT USAGE ON TYPE public.marketplace_category TO PUBLIC;
GRANT USAGE ON TYPE public.marketplace_listing_status TO PUBLIC;
GRANT USAGE ON TYPE public.marketplace_listing_type TO PUBLIC;
GRANT USAGE ON TYPE public.marketplace_price_type TO PUBLIC;
GRANT USAGE ON TYPE public.membership_role TO PUBLIC;
GRANT USAGE ON TYPE public.onboarding_checklist_status TO PUBLIC;
GRANT USAGE ON TYPE public.payment_method TO PUBLIC;
GRANT USAGE ON TYPE public.permission TO PUBLIC;
GRANT USAGE ON TYPE public.person_type TO PUBLIC;
GRANT USAGE ON TYPE public.profile_role TO PUBLIC;
GRANT USAGE ON TYPE public.subscription_status TO PUBLIC;
GRANT USAGE ON TYPE public.ticket_category TO PUBLIC;
GRANT USAGE ON TYPE public.ticket_priority TO PUBLIC;
GRANT USAGE ON TYPE public.ticket_status TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.attendance_status TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.benchmark_profile_status TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.billing_cadence TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.charge_status TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.contact_consent_status TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.data_quality_issue_status TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.enrollment_source TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.enrollment_status TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.entitlement_source TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.family_collection_mode TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.family_relationship TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.group_membership_status TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.guardian_contact_kind TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.health_dimension TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.health_score_status TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.insight_action_status TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.insight_delivery_channel TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.insight_delivery_status TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.insight_outcome TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.insight_rule_status TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.insight_run_status TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.insight_severity TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.insight_status TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.invoice_status TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.lifecycle_status TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.location_scope_mode TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.manual_payment_method TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.member_role TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.member_status TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.metric_direction TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.metric_grain TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.metric_quality TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.metric_run_status TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.metric_unit TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.normalization_direction TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.organization_payment_account_status TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.organization_saas_trial_status TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.organization_sport_role TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.organization_sport_status TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.organization_status TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.outbox_status TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.payment_attempt_status TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.payment_authorization_status TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.payment_source TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.payment_status TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.program_kind TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.provider_environment TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.provider_event_status TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.reconciliation_status TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.refund_status TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.saas_billing_interval TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.saas_plan_code TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.score_version_status TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.session_status TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.sport_profile_status TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.stripe_environment TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.trial_followup_channel TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.trial_followup_outcome TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.trial_status TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.waitlist_offer_status TO PUBLIC;
GRANT USAGE ON TYPE zaltyko.waitlist_status TO PUBLIC;

GRANT UPDATE (active_academy_id) ON TABLE public.profiles TO authenticated;
GRANT UPDATE (bio) ON TABLE public.profiles TO authenticated;
GRANT UPDATE (name) ON TABLE public.profiles TO authenticated;
GRANT UPDATE (phone) ON TABLE public.profiles TO authenticated;
GRANT UPDATE (photo_url) ON TABLE public.profiles TO authenticated;

DO $baseline_verify$
DECLARE
  v_count integer;
  v_unvalidated_fk integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('public','zaltyko','zaltyko_domain_private','zaltyko_private')
    AND c.relkind IN ('r','p');
  IF v_count <> 231 THEN RAISE EXCEPTION 'Baseline verification failed: expected 231 tables, got %', v_count; END IF;

  SELECT count(*) INTO v_count
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('public','zaltyko','zaltyko_domain_private','zaltyko_private')
    AND c.relkind = 'i';
  IF v_count <> 968 THEN RAISE EXCEPTION 'Baseline verification failed: expected 968 indexes, got %', v_count; END IF;

  SELECT count(*) INTO v_count
  FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
  WHERE n.nspname IN ('public','zaltyko','zaltyko_domain_private','zaltyko_private')
    AND c.contype IN ('c','f','p','u','x');
  IF v_count <> 1292 THEN RAISE EXCEPTION 'Baseline verification failed: expected 1292 constraints, got %', v_count; END IF;

  SELECT count(*) INTO v_unvalidated_fk
  FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
  WHERE n.nspname IN ('public','zaltyko','zaltyko_domain_private','zaltyko_private')
    AND c.contype = 'f' AND NOT c.convalidated;
  IF v_unvalidated_fk <> 1 OR NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'zaltyko' AND c.conname = 'organization_saas_subscriptions_customer_fk'
      AND c.contype = 'f' AND NOT c.convalidated
  ) THEN RAISE EXCEPTION 'Baseline verification failed: the single source NOT VALID foreign key differs'; END IF;

  SELECT count(*) INTO v_count
  FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('public','zaltyko','zaltyko_domain_private','zaltyko_private');
  IF v_count <> 326 THEN RAISE EXCEPTION 'Baseline verification failed: expected 326 policies, got %', v_count; END IF;

  SELECT count(*) INTO v_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('public','zaltyko','zaltyko_domain_private','zaltyko_private');
  IF v_count <> 38 THEN RAISE EXCEPTION 'Baseline verification failed: expected 38 routines, got %', v_count; END IF;

  SELECT count(*) INTO v_count
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('public','zaltyko','zaltyko_domain_private','zaltyko_private')
    AND NOT t.tgisinternal;
  IF v_count <> 24 THEN RAISE EXCEPTION 'Baseline verification failed: expected 24 triggers, got %', v_count; END IF;
  IF (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('public','zaltyko','zaltyko_domain_private','zaltyko_private')
        AND NOT t.tgisinternal AND t.tgconstraint <> 0) <> 1
  THEN RAISE EXCEPTION 'Baseline verification failed: expected one constraint trigger'; END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('public','zaltyko','zaltyko_domain_private','zaltyko_private')
        AND NOT t.tgisinternal AND t.tgenabled <> 'O')
  THEN RAISE EXCEPTION 'Baseline verification failed: source contains a non-default trigger state'; END IF;

  SELECT count(*) INTO v_count
  FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
  WHERE n.nspname IN ('public','zaltyko','zaltyko_domain_private','zaltyko_private')
    AND t.typtype = 'e';
  IF v_count <> 95 THEN RAISE EXCEPTION 'Baseline verification failed: expected 95 enum types, got %', v_count; END IF;

  SELECT count(*) INTO v_count
  FROM pg_constraint c JOIN pg_namespace owner_ns ON owner_ns.oid=c.connamespace
  JOIN pg_class tbl ON tbl.oid=c.conrelid
  JOIN pg_namespace ref_ns ON ref_ns.oid=tbl.relnamespace
  JOIN pg_class ref_tbl ON ref_tbl.oid=c.confrelid
  JOIN pg_namespace target_ns ON target_ns.oid=ref_tbl.relnamespace
  WHERE c.contype='f' AND ref_ns.nspname IN ('public','zaltyko','zaltyko_domain_private','zaltyko_private')
    AND target_ns.nspname='auth';
  IF v_count <> 18 THEN RAISE EXCEPTION 'Baseline verification failed: expected 18 auth foreign keys, got %', v_count; END IF;

  IF (SELECT relrowsecurity FROM pg_class WHERE oid='public.academies'::regclass) IS DISTINCT FROM true
     OR (SELECT relforcerowsecurity FROM pg_class WHERE oid='public.academies'::regclass) IS DISTINCT FROM false
  THEN RAISE EXCEPTION 'Baseline verification failed: public.academies RLS state differs'; END IF;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity) <> 138
  THEN RAISE EXCEPTION 'Baseline verification failed: public RLS table count differs'; END IF;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='zaltyko' AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity) <> 92
  THEN RAISE EXCEPTION 'Baseline verification failed: forced RLS table count differs'; END IF;
  IF (SELECT relrowsecurity OR relforcerowsecurity FROM pg_class WHERE oid='zaltyko_domain_private.e2e_schema_migrations'::regclass) IS DISTINCT FROM false
  THEN RAISE EXCEPTION 'Baseline verification failed: private migration table RLS state differs'; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon' AND NOT rolsuper AND NOT rolbypassrls)
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated' AND NOT rolsuper AND NOT rolbypassrls)
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls)
  THEN RAISE EXCEPTION 'Baseline verification failed: Supabase standard role attributes differ'; END IF;
  IF NOT has_table_privilege('authenticated','public.academies','INSERT')
     OR NOT has_table_privilege('authenticated','public.academies','SELECT')
     OR NOT has_schema_privilege('authenticated','zaltyko','USAGE')
  THEN RAISE EXCEPTION 'Baseline verification failed: expected authenticated app privileges are missing'; END IF;

  SELECT count(*) INTO v_count FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
  WHERE (e.extname,e.extversion,n.nspname) IN (
    ('btree_gist','1.7','extensions'),
    ('pg_stat_statements','1.11','extensions'),
    ('pgcrypto','1.3','extensions'),
    ('plpgsql','1.0','pg_catalog'),
    ('supabase_vault','0.3.1','vault'),
    ('uuid-ossp','1.1','extensions')
  );
  IF v_count <> 6 THEN RAISE EXCEPTION 'Baseline verification failed: expected six pinned platform extensions, got %', v_count; END IF;

  SELECT count(*) INTO v_count FROM (
    SELECT c.oid, acl.grantee
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) AS acl
    WHERE n.nspname IN ('public','zaltyko','zaltyko_domain_private','zaltyko_private')
      AND c.relkind IN ('r','p','v','m','f') AND acl.grantee <> c.relowner
    GROUP BY c.oid,acl.grantee
  ) q;
  IF v_count <> 489 THEN RAISE EXCEPTION 'Baseline verification failed: expected 489 table grant pairs, got %', v_count; END IF;

  SELECT count(*) INTO v_count FROM (
    SELECT p.oid, acl.grantee
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    CROSS JOIN LATERAL aclexplode(p.proacl) AS acl
    WHERE n.nspname IN ('public','zaltyko','zaltyko_domain_private','zaltyko_private')
      AND acl.grantee <> p.proowner
    GROUP BY p.oid,acl.grantee
  ) q;
  IF v_count <> 57 THEN RAISE EXCEPTION 'Baseline verification failed: expected 57 routine grant pairs including two implicit PUBLIC grants, got %', v_count; END IF;

  SELECT count(*) INTO v_count FROM (
    SELECT n.oid, acl.grantee FROM pg_namespace n
    CROSS JOIN LATERAL aclexplode(n.nspacl) AS acl
    WHERE n.nspname IN ('public','zaltyko','zaltyko_domain_private','zaltyko_private')
      AND acl.grantee <> n.nspowner GROUP BY n.oid,acl.grantee
  ) q;
  IF v_count <> 12 THEN RAISE EXCEPTION 'Baseline verification failed: expected 12 schema grant pairs, got %', v_count; END IF;

  SELECT count(*) INTO v_count FROM (
    SELECT c.oid,a.attnum,acl.grantee,acl.privilege_type
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN LATERAL aclexplode(a.attacl) AS acl
    WHERE n.nspname IN ('public','zaltyko','zaltyko_domain_private','zaltyko_private')
      AND c.relkind IN ('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped
      AND acl.grantee <> c.relowner GROUP BY c.oid,a.attnum,acl.grantee,acl.privilege_type
  ) q;
  IF v_count <> 5 THEN RAISE EXCEPTION 'Baseline verification failed: expected five column grant entries, got %', v_count; END IF;

  SELECT count(*) INTO v_count FROM (
    SELECT d.defaclrole,d.defaclnamespace,d.defaclobjtype,acl.grantee
    FROM pg_default_acl d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) AS acl
    WHERE d.defaclnamespace IN (SELECT oid FROM pg_namespace WHERE nspname IN ('public','zaltyko','zaltyko_domain_private','zaltyko_private'))
      AND acl.grantee <> d.defaclrole
    GROUP BY d.defaclrole,d.defaclnamespace,d.defaclobjtype,acl.grantee
  ) q;
  IF v_count <> 23 THEN RAISE EXCEPTION 'Baseline verification failed: expected 23 schema-scoped default grant pairs, got %', v_count; END IF;
END
$baseline_verify$;
