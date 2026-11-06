-- PROPOSED INSTALLATION CANDIDATE; applyReady=false; approvedForProduction=false.
-- CLI provenance filename: 20261025202902_canonical_domain_installation_candidate.sql.
-- Source snapshot SHA-256: fd1bf2597b0dfd40dc6db824fa24773461f2776fa2ed7c994649be534c6a4b36.
-- Source project is sandbox aeeootdmuiqkfeernskw; this is new DDL, not recovered migration history.
-- Expected production project ref is an external attestation, not proof of connection identity.
-- Production execution requires an independently authorized runner to verify the database URL/project.
-- CI mode is restricted to the named disposable database; no mode marker authorizes production by itself.
BEGIN;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';
DO $canonical_installation_preconditions$
DECLARE v_role text; v_mode text;
BEGIN
  v_mode := current_setting('app.canonical_installation_mode', true);
  IF v_mode IS DISTINCT FROM 'ci' AND v_mode IS DISTINCT FROM 'production-reviewed-20261025202902' THEN
    RAISE EXCEPTION 'canonical installation mode is not approved';
  END IF;
  IF v_mode = 'ci' AND current_database() IS DISTINCT FROM 'zaltyko_canonical_rehearsal_ci' THEN
    RAISE EXCEPTION 'wrong database for canonical installation CI';
  END IF;
  IF v_mode = 'production-reviewed-20261025202902' AND current_setting('app.canonical_installation_target_project_ref', true) IS DISTINCT FROM 'jegxfahsvugilbthbked' THEN
    RAISE EXCEPTION 'missing production target project attestation';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = ANY (ARRAY['zaltyko','zaltyko_domain_private'])) THEN
    RAISE EXCEPTION 'canonical installation target schema already exists; refusing candidate';
  END IF;
  IF current_setting('server_version_num')::integer / 10000 <> 17 THEN
    RAISE EXCEPTION 'PostgreSQL 17 is required for canonical installation candidate';
  END IF;
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'postgres', 'service_role'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      RAISE EXCEPTION 'required existing role % is absent; roles are never created here', v_role;
    END IF;
  END LOOP;
  IF session_user <> 'postgres' AND NOT pg_has_role(session_user, 'postgres', 'MEMBER') THEN
    RAISE EXCEPTION 'session user cannot assume the source owner role postgres';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'btree_gist') THEN
    RAISE EXCEPTION 'btree_gist is already installed; refusing non-idempotent candidate';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_available_extension_versions WHERE name = 'btree_gist' AND version = '1.7') THEN
    RAISE EXCEPTION 'btree_gist 1.7 is unavailable';
  END IF;
END
$canonical_installation_preconditions$;
SET LOCAL ROLE postgres;
CREATE EXTENSION btree_gist WITH SCHEMA extensions VERSION '1.7';
-- CREATE SCHEMA has no IF NOT EXISTS; races or existing state fail closed.
CREATE SCHEMA "zaltyko";
CREATE SCHEMA "zaltyko_domain_private";
-- Newly authored ACL normalization, restricted to the two absent new canonical schemas.
-- Does not copy or execute the snapshot's global/public/legacy DO blocks.
DO $canonical_rehearsal_default_acl_reset$
DECLARE v_creator text; v_schema text; v_role text; v_kind text;
BEGIN
  FOREACH v_creator IN ARRAY ARRAY['postgres'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_creator) THEN
      FOREACH v_schema IN ARRAY ARRAY['zaltyko', 'zaltyko_domain_private'] LOOP
        FOREACH v_kind IN ARRAY ARRAY['TABLES','SEQUENCES','FUNCTIONS','TYPES'] LOOP
          EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I REVOKE ALL ON %s FROM PUBLIC', v_creator, v_schema, v_kind);
          FOR v_role IN SELECT rolname FROM pg_roles WHERE rolname <> v_creator ORDER BY rolname LOOP
            EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I REVOKE ALL ON %s FROM %I', v_creator, v_schema, v_kind, v_role);
          END LOOP;
        END LOOP;
      END LOOP;
    END IF;
  END LOOP;
END
$canonical_rehearsal_default_acl_reset$;
-- AST-selected canonical DDL only; no E2E ledger, public, legacy, Auth, roles, or data.
-- snapshot source line 145: CreateEnumStmt
CREATE TYPE zaltyko.attendance_status AS ENUM ('present', 'absent', 'excused', 'late');
-- snapshot source line 147: CreateEnumStmt
CREATE TYPE zaltyko.benchmark_profile_status AS ENUM ('draft', 'active', 'retired');
-- snapshot source line 149: CreateEnumStmt
CREATE TYPE zaltyko.billing_cadence AS ENUM ('one_time', 'weekly', 'monthly', 'quarterly', 'annual');
-- snapshot source line 151: CreateEnumStmt
CREATE TYPE zaltyko.charge_status AS ENUM ('due', 'partially_paid', 'paid', 'void');
-- snapshot source line 153: CreateEnumStmt
CREATE TYPE zaltyko.contact_consent_status AS ENUM ('unknown', 'granted', 'denied', 'revoked');
-- snapshot source line 155: CreateEnumStmt
CREATE TYPE zaltyko.data_quality_issue_status AS ENUM ('open', 'resolved');
-- snapshot source line 157: CreateEnumStmt
CREATE TYPE zaltyko.enrollment_source AS ENUM ('import', 'owner', 'parent', 'trial', 'waitlist', 'transfer', 'api');
-- snapshot source line 159: CreateEnumStmt
CREATE TYPE zaltyko.enrollment_status AS ENUM ('pending', 'trial', 'active', 'paused', 'cancelled', 'completed');
-- snapshot source line 161: CreateEnumStmt
CREATE TYPE zaltyko.entitlement_source AS ENUM ('bootstrap', 'stripe_subscription', 'contract', 'trial', 'trial_expired');
-- snapshot source line 163: CreateEnumStmt
CREATE TYPE zaltyko.family_collection_mode AS ENUM ('manual', 'automatic');
-- snapshot source line 165: CreateEnumStmt
CREATE TYPE zaltyko.family_relationship AS ENUM ('parent', 'legal_guardian', 'foster_guardian', 'other');
-- snapshot source line 167: CreateEnumStmt
CREATE TYPE zaltyko.group_membership_status AS ENUM ('pending', 'active', 'paused', 'ended');
-- snapshot source line 169: CreateEnumStmt
CREATE TYPE zaltyko.guardian_contact_kind AS ENUM ('email', 'phone');
-- snapshot source line 171: CreateEnumStmt
CREATE TYPE zaltyko.health_dimension AS ENUM ('enrollment', 'financial', 'operational', 'workforce');
-- snapshot source line 173: CreateEnumStmt
CREATE TYPE zaltyko.health_score_status AS ENUM ('critical', 'needs_attention', 'healthy', 'excellent', 'insufficient_data');
-- snapshot source line 175: CreateEnumStmt
CREATE TYPE zaltyko.insight_action_status AS ENUM ('recorded', 'completed', 'failed');
-- snapshot source line 177: CreateEnumStmt
CREATE TYPE zaltyko.insight_delivery_channel AS ENUM ('in_app', 'email');
-- snapshot source line 179: CreateEnumStmt
CREATE TYPE zaltyko.insight_delivery_status AS ENUM ('pending', 'sent', 'failed', 'suppressed');
-- snapshot source line 181: CreateEnumStmt
CREATE TYPE zaltyko.insight_outcome AS ENUM ('pending', 'positive', 'neutral', 'negative', 'not_measurable');
-- snapshot source line 183: CreateEnumStmt
CREATE TYPE zaltyko.insight_rule_status AS ENUM ('draft', 'active', 'retired');
-- snapshot source line 185: CreateEnumStmt
CREATE TYPE zaltyko.insight_run_status AS ENUM ('running', 'succeeded', 'failed');
-- snapshot source line 187: CreateEnumStmt
CREATE TYPE zaltyko.insight_severity AS ENUM ('info', 'warning', 'critical');
-- snapshot source line 189: CreateEnumStmt
CREATE TYPE zaltyko.insight_status AS ENUM ('open', 'viewed', 'actioned', 'snoozed', 'dismissed', 'resolved');
-- snapshot source line 191: CreateEnumStmt
CREATE TYPE zaltyko.invoice_status AS ENUM ('draft', 'issued', 'partially_paid', 'paid', 'void');
-- snapshot source line 193: CreateEnumStmt
CREATE TYPE zaltyko.lifecycle_status AS ENUM ('draft', 'active', 'archived');
-- snapshot source line 195: CreateEnumStmt
CREATE TYPE zaltyko.location_scope_mode AS ENUM ('all', 'selected');
-- snapshot source line 197: CreateEnumStmt
CREATE TYPE zaltyko.manual_payment_method AS ENUM ('cash', 'bank_transfer', 'card_terminal', 'other');
-- snapshot source line 199: CreateEnumStmt
CREATE TYPE zaltyko.member_role AS ENUM ('owner', 'manager', 'admin', 'coach');
-- snapshot source line 201: CreateEnumStmt
CREATE TYPE zaltyko.member_status AS ENUM ('invited', 'active', 'suspended', 'revoked');
-- snapshot source line 203: CreateEnumStmt
CREATE TYPE zaltyko.metric_direction AS ENUM ('higher_better', 'lower_better', 'neutral');
-- snapshot source line 205: CreateEnumStmt
CREATE TYPE zaltyko.metric_grain AS ENUM ('day', 'week', 'month', 'season', 'year');
-- snapshot source line 207: CreateEnumStmt
CREATE TYPE zaltyko.metric_quality AS ENUM ('complete', 'partial', 'insufficient', 'stale', 'invalid');
-- snapshot source line 209: CreateEnumStmt
CREATE TYPE zaltyko.metric_run_status AS ENUM ('running', 'succeeded', 'failed');
-- snapshot source line 211: CreateEnumStmt
CREATE TYPE zaltyko.metric_unit AS ENUM ('count', 'ratio', 'currency_minor');
-- snapshot source line 213: CreateEnumStmt
CREATE TYPE zaltyko.normalization_direction AS ENUM ('higher_better', 'lower_better');
-- snapshot source line 215: CreateEnumStmt
CREATE TYPE zaltyko.organization_payment_account_status AS ENUM ('pending', 'onboarding', 'restricted', 'active', 'disabled');
-- snapshot source line 217: CreateEnumStmt
CREATE TYPE zaltyko.organization_saas_trial_status AS ENUM ('active', 'expired', 'converted', 'cancelled');
-- snapshot source line 219: CreateEnumStmt
CREATE TYPE zaltyko.organization_sport_role AS ENUM ('primary', 'additional');
-- snapshot source line 221: CreateEnumStmt
CREATE TYPE zaltyko.organization_sport_status AS ENUM ('active', 'inactive');
-- snapshot source line 223: CreateEnumStmt
CREATE TYPE zaltyko.organization_status AS ENUM ('trial', 'active', 'suspended', 'closed');
-- snapshot source line 225: CreateEnumStmt
CREATE TYPE zaltyko.outbox_status AS ENUM ('pending', 'processing', 'processed', 'failed');
-- snapshot source line 227: CreateEnumStmt
CREATE TYPE zaltyko.payment_attempt_status AS ENUM ('pending', 'succeeded', 'failed');
-- snapshot source line 229: CreateEnumStmt
CREATE TYPE zaltyko.payment_authorization_status AS ENUM ('pending', 'active', 'revoked', 'expired');
-- snapshot source line 231: CreateEnumStmt
CREATE TYPE zaltyko.payment_source AS ENUM ('manual', 'provider');
-- snapshot source line 233: CreateEnumStmt
CREATE TYPE zaltyko.payment_status AS ENUM ('pending', 'succeeded', 'partially_refunded', 'refunded', 'failed');
-- snapshot source line 235: CreateEnumStmt
CREATE TYPE zaltyko.program_kind AS ENUM ('gymnastics_sport', 'complementary_activity');
-- snapshot source line 237: CreateEnumStmt
CREATE TYPE zaltyko.provider_environment AS ENUM ('sandbox', 'live');
-- snapshot source line 239: CreateEnumStmt
CREATE TYPE zaltyko.provider_event_status AS ENUM ('received', 'processing', 'processed', 'failed');
-- snapshot source line 241: CreateEnumStmt
CREATE TYPE zaltyko.reconciliation_status AS ENUM ('balanced', 'unbalanced');
-- snapshot source line 243: CreateEnumStmt
CREATE TYPE zaltyko.refund_status AS ENUM ('pending', 'succeeded', 'failed');
-- snapshot source line 245: CreateEnumStmt
CREATE TYPE zaltyko.saas_billing_interval AS ENUM ('month', 'year');
-- snapshot source line 247: CreateEnumStmt
CREATE TYPE zaltyko.saas_plan_code AS ENUM ('free', 'starter', 'growth', 'network');
-- snapshot source line 249: CreateEnumStmt
CREATE TYPE zaltyko.score_version_status AS ENUM ('draft', 'active', 'retired');
-- snapshot source line 251: CreateEnumStmt
CREATE TYPE zaltyko.session_status AS ENUM ('scheduled', 'completed', 'cancelled');
-- snapshot source line 253: CreateEnumStmt
CREATE TYPE zaltyko.sport_profile_status AS ENUM ('identity_only', 'verified', 'draft', 'retired');
-- snapshot source line 255: CreateEnumStmt
CREATE TYPE zaltyko.stripe_environment AS ENUM ('test', 'live');
-- snapshot source line 257: CreateEnumStmt
CREATE TYPE zaltyko.trial_followup_channel AS ENUM ('email', 'phone', 'sms', 'in_person');
-- snapshot source line 259: CreateEnumStmt
CREATE TYPE zaltyko.trial_followup_outcome AS ENUM ('contacted', 'no_answer', 'converted', 'waitlisted', 'not_interested', 'follow_up_needed');
-- snapshot source line 261: CreateEnumStmt
CREATE TYPE zaltyko.trial_status AS ENUM ('booked', 'attended', 'completed', 'no_show', 'cancelled', 'converted');
-- snapshot source line 263: CreateEnumStmt
CREATE TYPE zaltyko.waitlist_offer_status AS ENUM ('pending', 'accepted', 'declined', 'expired', 'revoked');
-- snapshot source line 265: CreateEnumStmt
CREATE TYPE zaltyko.waitlist_status AS ENUM ('waiting', 'offered', 'converted', 'withdrawn', 'expired');
-- snapshot source line 2383: CreateStmt
CREATE TABLE zaltyko.athletes (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, person_id uuid NOT NULL, external_reference text, is_active boolean DEFAULT TRUE NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 2393: CreateStmt
CREATE TABLE zaltyko.attendance_records (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, location_id uuid NOT NULL, session_id uuid NOT NULL, enrollment_id uuid NOT NULL, athlete_id uuid NOT NULL, status zaltyko.attendance_status NOT NULL, recorded_by_member_id uuid, recorded_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 2405: CreateStmt
CREATE TABLE zaltyko.audit_log (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, location_id uuid, actor_user_id uuid, action text NOT NULL, target_type text NOT NULL, target_id uuid, request_id text, idempotency_key text, before jsonb, after jsonb, metadata jsonb DEFAULT CAST('{}' AS jsonb) NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 2421: CreateStmt
CREATE TABLE zaltyko.benchmark_metric_targets (id uuid DEFAULT gen_random_uuid() NOT NULL, benchmark_profile_id uuid NOT NULL, metric_key text NOT NULL, target_numeric numeric(24, 8) NOT NULL, currency text, grain zaltyko.metric_grain NOT NULL, normalization_direction zaltyko.normalization_direction NOT NULL, notes text DEFAULT CAST('' AS text) NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 2433: CreateStmt
CREATE TABLE zaltyko.benchmark_profiles (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid, key text NOT NULL, name text NOT NULL, market text NOT NULL, currency text, organization_type text NOT NULL, discipline_scope text NOT NULL, source_title text NOT NULL, source_year integer, source_page text, methodology_notes text NOT NULL, effective_from date NOT NULL, effective_to date, version integer NOT NULL, status zaltyko.benchmark_profile_status DEFAULT CAST('draft' AS zaltyko.benchmark_profile_status) NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 2454: CreateStmt
CREATE TABLE zaltyko.charges (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, location_id uuid, invoice_id uuid NOT NULL, invoice_line_id uuid NOT NULL, family_id uuid NOT NULL, family_payer_id uuid, enrollment_id uuid, status zaltyko.charge_status DEFAULT CAST('due' AS zaltyko.charge_status) NOT NULL, amount_cents bigint NOT NULL, currency text NOT NULL, due_at timestamp with time zone NOT NULL, service_period_start date NOT NULL, service_period_end date NOT NULL, idempotency_key text NOT NULL, version integer DEFAULT 1 NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, collection_mode zaltyko.family_collection_mode DEFAULT CAST('manual' AS zaltyko.family_collection_mode) NOT NULL);
-- snapshot source line 2476: CreateStmt
CREATE TABLE zaltyko.class_template_groups (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, class_template_id uuid NOT NULL, group_id uuid NOT NULL);
-- snapshot source line 2483: CreateStmt
CREATE TABLE zaltyko.class_template_weekdays (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, class_template_id uuid NOT NULL, iso_weekday integer NOT NULL, starts_at_local time NOT NULL, ends_at_local time NOT NULL);
-- snapshot source line 2492: CreateStmt
CREATE TABLE zaltyko.class_templates (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, location_id uuid NOT NULL, program_id uuid, default_space_id uuid, name text NOT NULL, capacity integer NOT NULL, status zaltyko.lifecycle_status DEFAULT CAST('draft' AS zaltyko.lifecycle_status) NOT NULL, effective_from date NOT NULL, effective_to date, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 2507: CreateStmt
CREATE TABLE zaltyko.data_quality_issues (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, metric_run_id uuid NOT NULL, location_id uuid, metric_key text, issue_code text NOT NULL, severity text NOT NULL, status zaltyko.data_quality_issue_status DEFAULT CAST('open' AS zaltyko.data_quality_issue_status) NOT NULL, evidence jsonb DEFAULT CAST('{}' AS jsonb) NOT NULL, detected_at timestamp with time zone DEFAULT now() NOT NULL, resolved_at timestamp with time zone);
-- snapshot source line 2521: CreateStmt
CREATE TABLE zaltyko.enrollment_pauses (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, enrollment_id uuid NOT NULL, starts_on date NOT NULL, ends_on date, reason_code text, created_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 2531: CreateStmt
CREATE TABLE zaltyko.enrollment_price_assignments (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, location_id uuid NOT NULL, enrollment_id uuid NOT NULL, price_plan_id uuid NOT NULL, unit_amount_cents bigint NOT NULL, currency text NOT NULL, starts_on date NOT NULL, ends_on date, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 2545: CreateStmt
CREATE TABLE zaltyko.enrollment_status_history (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, enrollment_id uuid NOT NULL, from_status zaltyko.enrollment_status, to_status zaltyko.enrollment_status NOT NULL, reason_code text, changed_by_member_id uuid, idempotency_key text NOT NULL, changed_at timestamp with time zone DEFAULT now() NOT NULL, effective_on date NOT NULL);
-- snapshot source line 2558: CreateStmt
CREATE TABLE zaltyko.enrollments (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, location_id uuid NOT NULL, athlete_id uuid NOT NULL, class_template_id uuid NOT NULL, price_plan_id uuid, status zaltyko.enrollment_status DEFAULT CAST('pending' AS zaltyko.enrollment_status) NOT NULL, starts_on date NOT NULL, ends_on date, source zaltyko.enrollment_source NOT NULL, source_entity_id uuid, version integer DEFAULT 1 NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 2575: CreateStmt
CREATE TABLE zaltyko.facilities (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, location_id uuid NOT NULL, name text NOT NULL, is_active boolean DEFAULT TRUE NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 2585: CreateStmt
CREATE TABLE zaltyko.families (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, external_reference text, is_active boolean DEFAULT TRUE NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 2594: CreateStmt
CREATE TABLE zaltyko.family_collection_preferences (organization_id uuid NOT NULL, family_id uuid NOT NULL, requested_mode zaltyko.family_collection_mode DEFAULT CAST('manual' AS zaltyko.family_collection_mode) NOT NULL, version integer DEFAULT 1 NOT NULL, entitlement_revision integer, updated_by_member_id uuid NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 2605: CreateStmt
CREATE TABLE zaltyko.family_guardians (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, family_id uuid NOT NULL, guardian_id uuid NOT NULL, relationship zaltyko.family_relationship NOT NULL, can_view_athletes boolean DEFAULT TRUE NOT NULL, can_manage_enrollments boolean DEFAULT FALSE NOT NULL, is_active boolean DEFAULT TRUE NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 2618: CreateStmt
CREATE TABLE zaltyko.family_members (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, family_id uuid NOT NULL, athlete_id uuid NOT NULL, relationship zaltyko.family_relationship NOT NULL, starts_on date NOT NULL, ends_on date, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 2630: CreateStmt
CREATE TABLE zaltyko.family_payers (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, family_id uuid NOT NULL, guardian_id uuid NOT NULL, is_primary boolean DEFAULT FALSE NOT NULL, starts_on date NOT NULL, ends_on date, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 2642: CreateStmt
CREATE TABLE zaltyko.family_payment_authorizations (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, family_id uuid NOT NULL, family_payer_id uuid NOT NULL, payment_provider_account_id uuid NOT NULL, status zaltyko.payment_authorization_status DEFAULT CAST('pending' AS zaltyko.payment_authorization_status) NOT NULL, provider_setup_reference text NOT NULL, payment_method_reference text NOT NULL, mandate_reference text, consent_version text, consent_evidence_reference text, consent_evidence_sha256 text, consented_at timestamp with time zone, consented_by_guardian_id uuid, valid_until timestamp with time zone, revoked_at timestamp with time zone, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 2663: CreateStmt
CREATE TABLE zaltyko.financial_reconciliation_runs (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, currency text NOT NULL, period_start date NOT NULL, period_end date NOT NULL, expected_cents bigint NOT NULL, allocated_cents bigint NOT NULL, refunded_cents bigint NOT NULL, net_collected_cents bigint NOT NULL, outstanding_cents bigint NOT NULL, status zaltyko.reconciliation_status NOT NULL, formula_version integer DEFAULT 1 NOT NULL, source_watermark timestamp with time zone NOT NULL, idempotency_key text NOT NULL, computed_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 2681: CreateStmt
CREATE TABLE zaltyko.group_membership_history (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, membership_id uuid NOT NULL, from_status zaltyko.group_membership_status, to_status zaltyko.group_membership_status NOT NULL, reason_code text, changed_by_member_id uuid NOT NULL, idempotency_key text NOT NULL, effective_on date NOT NULL, changed_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 2694: CreateStmt
CREATE TABLE zaltyko.group_memberships (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, group_id uuid NOT NULL, athlete_id uuid NOT NULL, status zaltyko.group_membership_status DEFAULT CAST('active' AS zaltyko.group_membership_status) NOT NULL, starts_on date NOT NULL, ends_on date, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 2706: CreateStmt
CREATE TABLE zaltyko.groups (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, location_id uuid NOT NULL, program_id uuid, name text NOT NULL, capacity integer, status zaltyko.lifecycle_status DEFAULT CAST('active' AS zaltyko.lifecycle_status) NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 2718: CreateStmt
CREATE TABLE zaltyko.guardian_contacts (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, guardian_id uuid NOT NULL, kind zaltyko.guardian_contact_kind NOT NULL, value text NOT NULL, normalized_value text NOT NULL, is_primary boolean DEFAULT FALSE NOT NULL, verified_at timestamp with time zone, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 2731: CreateStmt
CREATE TABLE zaltyko.guardians (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, person_id uuid NOT NULL, auth_user_id uuid, is_active boolean DEFAULT TRUE NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 2741: CreateStmt
CREATE TABLE zaltyko.health_score_dimension_snapshots (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, health_score_snapshot_id uuid NOT NULL, dimension zaltyko.health_dimension NOT NULL, score numeric(5, 2), status zaltyko.health_score_status NOT NULL, coverage numeric(5, 4) NOT NULL, available_metric_weight numeric(5, 4) NOT NULL, configured_metric_weight numeric(5, 4) NOT NULL, explanation jsonb DEFAULT CAST('{}' AS jsonb) NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 2755: CreateStmt
CREATE TABLE zaltyko.health_score_dimension_weights (id uuid DEFAULT gen_random_uuid() NOT NULL, health_score_version_id uuid NOT NULL, dimension zaltyko.health_dimension NOT NULL, weight numeric(5, 4) NOT NULL);
-- snapshot source line 2762: CreateStmt
CREATE TABLE zaltyko.health_score_metric_contributions (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, health_score_snapshot_id uuid NOT NULL, dimension zaltyko.health_dimension NOT NULL, metric_key text NOT NULL, metric_run_value_id uuid, benchmark_target_id uuid, actual_value numeric(24, 8), target_value numeric(24, 8), normalized_score numeric(5, 2), metric_weight numeric(5, 4) NOT NULL, metric_coverage numeric(5, 4) NOT NULL, effective_weight numeric(8, 6) NOT NULL, quality zaltyko.metric_quality NOT NULL, formula_version integer, explanation jsonb DEFAULT CAST('{}' AS jsonb) NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 2782: CreateStmt
CREATE TABLE zaltyko.health_score_metric_weights (id uuid DEFAULT gen_random_uuid() NOT NULL, health_score_version_id uuid NOT NULL, dimension zaltyko.health_dimension NOT NULL, metric_key text NOT NULL, weight numeric(5, 4) NOT NULL);
-- snapshot source line 2790: CreateStmt
CREATE TABLE zaltyko.health_score_snapshots (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, location_id uuid, metric_run_id uuid NOT NULL, health_score_version_id uuid NOT NULL, benchmark_profile_id uuid NOT NULL, period_start date NOT NULL, period_end date NOT NULL, score numeric(5, 2), status zaltyko.health_score_status NOT NULL, coverage numeric(5, 4) NOT NULL, computed_at timestamp with time zone NOT NULL, source_watermark timestamp with time zone NOT NULL, idempotency_key text NOT NULL, explanation jsonb DEFAULT CAST('{}' AS jsonb) NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 2809: CreateStmt
CREATE TABLE zaltyko.health_score_versions (id uuid DEFAULT gen_random_uuid() NOT NULL, key text NOT NULL, version integer NOT NULL, name text NOT NULL, status zaltyko.score_version_status DEFAULT CAST('draft' AS zaltyko.score_version_status) NOT NULL, min_valid_dimensions integer NOT NULL, min_global_coverage numeric(5, 4) NOT NULL, min_dimension_available_weight numeric(5, 4) NOT NULL, notes text DEFAULT CAST('' AS text) NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 2822: CreateStmt
CREATE TABLE zaltyko.insight_actions (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, location_id uuid, insight_id uuid NOT NULL, action_key text NOT NULL, status zaltyko.insight_action_status DEFAULT CAST('recorded' AS zaltyko.insight_action_status) NOT NULL, actor_user_id uuid NOT NULL, actor_member_id uuid NOT NULL, target_entity_type text NOT NULL, target_entity_id uuid, before_value jsonb DEFAULT CAST('{}' AS jsonb) NOT NULL, after_value jsonb, evaluation_ends_at timestamp with time zone NOT NULL, outcome zaltyko.insight_outcome DEFAULT CAST('pending' AS zaltyko.insight_outcome) NOT NULL, outcome_notes text, idempotency_key text NOT NULL, correlation_id uuid DEFAULT gen_random_uuid() NOT NULL, completed_at timestamp with time zone, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 2845: CreateStmt
CREATE TABLE zaltyko.insight_notifications (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, insight_id uuid NOT NULL, channel zaltyko.insight_delivery_channel NOT NULL, delivery_window_key text NOT NULL, status zaltyko.insight_delivery_status DEFAULT CAST('pending' AS zaltyko.insight_delivery_status) NOT NULL, available_at timestamp with time zone NOT NULL, sent_at timestamp with time zone, last_error text, created_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 2858: CreateStmt
CREATE TABLE zaltyko.insight_rule_runs (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, location_id uuid, rule_version_id uuid NOT NULL, status zaltyko.insight_run_status DEFAULT CAST('running' AS zaltyko.insight_run_status) NOT NULL, evaluated_at timestamp with time zone NOT NULL, source_watermark timestamp with time zone NOT NULL, idempotency_key text NOT NULL, candidate_count integer DEFAULT 0 NOT NULL, result jsonb DEFAULT CAST('{}' AS jsonb) NOT NULL, error_code text, error_detail text, completed_at timestamp with time zone, created_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 2875: CreateStmt
CREATE TABLE zaltyko.insight_rule_versions (id uuid DEFAULT gen_random_uuid() NOT NULL, key text NOT NULL, version integer NOT NULL, name text NOT NULL, status zaltyko.insight_rule_status DEFAULT CAST('draft' AS zaltyko.insight_rule_status) NOT NULL, severity zaltyko.insight_severity NOT NULL, cooldown_hours integer NOT NULL, config jsonb DEFAULT CAST('{}' AS jsonb) NOT NULL, default_cta_key text NOT NULL, notes text DEFAULT CAST('' AS text) NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 2889: CreateStmt
CREATE TABLE zaltyko.insight_run_observations (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, rule_run_id uuid NOT NULL, insight_id uuid NOT NULL, observed_at timestamp with time zone NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 2898: CreateStmt
CREATE TABLE zaltyko.insight_status_history (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, insight_id uuid NOT NULL, from_status zaltyko.insight_status, to_status zaltyko.insight_status NOT NULL, reason_code text NOT NULL, actor_user_id uuid, rule_run_id uuid, idempotency_key text, changed_at timestamp with time zone DEFAULT now() NOT NULL, metadata jsonb DEFAULT CAST('{}' AS jsonb) NOT NULL);
-- snapshot source line 2912: CreateStmt
CREATE TABLE zaltyko.insights (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, location_id uuid, rule_version_id uuid NOT NULL, series_key text NOT NULL, occurrence integer DEFAULT 1 NOT NULL, status zaltyko.insight_status DEFAULT CAST('open' AS zaltyko.insight_status) NOT NULL, severity zaltyko.insight_severity NOT NULL, priority_score numeric(5, 2) NOT NULL, impact_score numeric(5, 2) NOT NULL, urgency_score numeric(5, 2) NOT NULL, confidence_score numeric(5, 2) NOT NULL, actionability_score numeric(5, 2) NOT NULL, entity_type text NOT NULL, entity_id uuid, title text NOT NULL, detail text NOT NULL, evidence jsonb DEFAULT CAST('{}' AS jsonb) NOT NULL, assumptions jsonb DEFAULT CAST('[]' AS jsonb) NOT NULL, cta_key text NOT NULL, cta_payload jsonb DEFAULT CAST('{}' AS jsonb) NOT NULL, estimated_value_min_minor numeric(20, 0), estimated_value_max_minor numeric(20, 0), estimate_currency text, source_metric_run_id uuid, source_health_score_snapshot_id uuid, detected_at timestamp with time zone NOT NULL, last_seen_at timestamp with time zone NOT NULL, viewed_at timestamp with time zone, snoozed_until timestamp with time zone, resolved_at timestamp with time zone, resolution_reason text, version integer DEFAULT 1 NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 2950: CreateStmt
CREATE TABLE zaltyko.invoice_line_enrollments (organization_id uuid NOT NULL, location_id uuid NOT NULL, athlete_id uuid NOT NULL, invoice_line_id uuid NOT NULL, price_plan_id uuid NOT NULL, enrollment_id uuid NOT NULL, class_template_id uuid NOT NULL, price_assignment_id uuid NOT NULL, class_name_snapshot text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 2963: CreateStmt
CREATE TABLE zaltyko.invoice_lines (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, invoice_id uuid NOT NULL, enrollment_id uuid, price_plan_id uuid, line_type text NOT NULL, quantity integer NOT NULL, unit_amount_cents bigint NOT NULL, amount_cents bigint NOT NULL, currency text NOT NULL, service_period_start date NOT NULL, service_period_end date NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, location_id uuid, athlete_id uuid);
-- snapshot source line 2981: CreateStmt
CREATE TABLE zaltyko.invoices (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, location_id uuid, family_id uuid NOT NULL, family_payer_id uuid, reference text NOT NULL, status zaltyko.invoice_status DEFAULT CAST('draft' AS zaltyko.invoice_status) NOT NULL, currency text NOT NULL, total_amount_cents bigint NOT NULL, issued_at timestamp with time zone, due_at timestamp with time zone NOT NULL, voided_at timestamp with time zone, idempotency_key text NOT NULL, version integer DEFAULT 1 NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 3000: CreateStmt
CREATE TABLE zaltyko.locations (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, code text NOT NULL, name text NOT NULL, timezone text DEFAULT CAST('Europe/Madrid' AS text) NOT NULL, is_active boolean DEFAULT TRUE NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 3011: CreateStmt
CREATE TABLE zaltyko.member_location_scopes (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, member_id uuid NOT NULL, location_id uuid NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 3019: CreateStmt
CREATE TABLE zaltyko.metric_definitions (key text NOT NULL, name text NOT NULL, description text NOT NULL, unit zaltyko.metric_unit NOT NULL, direction zaltyko.metric_direction NOT NULL, grain zaltyko.metric_grain NOT NULL, formula_version integer NOT NULL, owner text NOT NULL, active boolean DEFAULT TRUE NOT NULL, formula text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 3034: CreateStmt
CREATE TABLE zaltyko.metric_event_consumptions (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, outbox_event_id uuid NOT NULL, handler_key text NOT NULL, handler_version integer NOT NULL, consumed_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 3043: CreateStmt
CREATE TABLE zaltyko.metric_invalidations (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, location_id uuid, outbox_event_id uuid NOT NULL, handler_key text NOT NULL, handler_version integer NOT NULL, reason_event_name text NOT NULL, affected_from date NOT NULL, affected_to date NOT NULL, status text DEFAULT CAST('pending' AS text) NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, processed_at timestamp with time zone);
-- snapshot source line 3058: CreateStmt
CREATE TABLE zaltyko.metric_run_values (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, metric_run_id uuid NOT NULL, location_id uuid, metric_key text NOT NULL, period_start date NOT NULL, period_end date NOT NULL, value_numeric numeric(24, 8), currency text, numerator numeric(24, 8), denominator numeric(24, 8), coverage numeric(5, 4) NOT NULL, quality zaltyko.metric_quality NOT NULL, dimensions jsonb DEFAULT CAST('{}' AS jsonb) NOT NULL, dimensions_sha256 text NOT NULL, formula_version integer NOT NULL, computed_at timestamp with time zone NOT NULL, source_watermark timestamp with time zone NOT NULL, diagnostics jsonb DEFAULT CAST('{}' AS jsonb) NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 3081: CreateStmt
CREATE TABLE zaltyko.metric_runs (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, authorization_location_id uuid NOT NULL, period_start date NOT NULL, period_end date NOT NULL, currency text NOT NULL, formula_set_version text NOT NULL, status zaltyko.metric_run_status DEFAULT CAST('running' AS zaltyko.metric_run_status) NOT NULL, parameters jsonb DEFAULT CAST('{}' AS jsonb) NOT NULL, source_watermark timestamp with time zone NOT NULL, idempotency_key text NOT NULL, started_at timestamp with time zone DEFAULT now() NOT NULL, completed_at timestamp with time zone, error_code text, error_detail text, created_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 3100: CreateStmt
CREATE TABLE zaltyko.metric_values (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, metric_run_id uuid NOT NULL, location_id uuid, metric_key text NOT NULL, period_start date NOT NULL, period_end date NOT NULL, value_numeric numeric(24, 8), currency text, numerator numeric(24, 8), denominator numeric(24, 8), coverage numeric(5, 4) NOT NULL, quality zaltyko.metric_quality NOT NULL, dimensions jsonb DEFAULT CAST('{}' AS jsonb) NOT NULL, dimensions_sha256 text NOT NULL, formula_version integer NOT NULL, computed_at timestamp with time zone NOT NULL, source_watermark timestamp with time zone NOT NULL, diagnostics jsonb DEFAULT CAST('{}' AS jsonb) NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 3124: CreateStmt
CREATE TABLE zaltyko.organization_bootstrap_commands (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, idempotency_key text NOT NULL, request_hash text NOT NULL, organization_id uuid NOT NULL, location_id uuid NOT NULL, member_id uuid NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 3135: CreateStmt
CREATE TABLE zaltyko.organization_entitlement_changes (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, revision integer NOT NULL, plan_code zaltyko.saas_plan_code NOT NULL, source zaltyko.entitlement_source NOT NULL, source_reference text NOT NULL, subscription_id uuid, effective_from timestamp with time zone NOT NULL, effective_until timestamp with time zone, changed_at timestamp with time zone DEFAULT now() NOT NULL, trial_id uuid);
-- snapshot source line 3149: CreateStmt
CREATE TABLE zaltyko.organization_entitlements (organization_id uuid NOT NULL, plan_code zaltyko.saas_plan_code NOT NULL, revision integer DEFAULT 1 NOT NULL, source zaltyko.entitlement_source NOT NULL, source_reference text NOT NULL, subscription_id uuid, effective_from timestamp with time zone NOT NULL, effective_until timestamp with time zone, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, trial_id uuid);
-- snapshot source line 3163: CreateStmt
CREATE TABLE zaltyko.organization_members (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, user_id uuid NOT NULL, role zaltyko.member_role NOT NULL, status zaltyko.member_status DEFAULT CAST('invited' AS zaltyko.member_status) NOT NULL, location_scope_mode zaltyko.location_scope_mode DEFAULT CAST('selected' AS zaltyko.location_scope_mode) NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 3174: CreateStmt
CREATE TABLE zaltyko.organization_payment_provider_accounts (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, processor text DEFAULT CAST('stripe' AS text) NOT NULL, environment zaltyko.stripe_environment NOT NULL, provider_account_reference text NOT NULL, accounts_api_generation integer DEFAULT 2 NOT NULL, charge_model text DEFAULT CAST('direct' AS text) NOT NULL, dashboard_access text DEFAULT CAST('full' AS text) NOT NULL, fees_collector text DEFAULT CAST('stripe' AS text) NOT NULL, losses_collector text DEFAULT CAST('stripe' AS text) NOT NULL, status zaltyko.organization_payment_account_status DEFAULT CAST('pending' AS zaltyko.organization_payment_account_status) NOT NULL, card_payments_capability_status text DEFAULT CAST('pending' AS text) NOT NULL, revision integer DEFAULT 1 NOT NULL, last_provider_event_reference text, last_synced_at timestamp with time zone, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 3194: CreateStmt
CREATE TABLE zaltyko.organization_saas_checkout_operations (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, requested_by_member_id uuid NOT NULL, environment zaltyko.stripe_environment NOT NULL, provider_account_reference text NOT NULL, customer_id uuid, idempotency_key text NOT NULL, request_hash text NOT NULL, plan_code zaltyko.saas_plan_code NOT NULL, billing_interval zaltyko.saas_billing_interval NOT NULL, status text DEFAULT CAST('requested' AS text) NOT NULL, stripe_idempotency_key text NOT NULL, checkout_session_reference text, session_expires_at timestamp with time zone, lease_token uuid, lease_until timestamp with time zone, fencing_version bigint DEFAULT 0 NOT NULL, attempts integer DEFAULT 0 NOT NULL, last_error_code text, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, completed_at timestamp with time zone);
-- snapshot source line 3219: CreateStmt
CREATE TABLE zaltyko.organization_saas_customers (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, provider text DEFAULT CAST('stripe' AS text) NOT NULL, environment zaltyko.stripe_environment NOT NULL, provider_account_reference text NOT NULL, customer_reference text, status text DEFAULT CAST('creating' AS text) NOT NULL, creation_idempotency_key text NOT NULL, creation_request_hash text NOT NULL, attempts integer DEFAULT 0 NOT NULL, last_error_code text, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 3235: CreateStmt
CREATE TABLE zaltyko.organization_saas_subscriptions (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, provider text DEFAULT CAST('stripe' AS text) NOT NULL, environment zaltyko.stripe_environment NOT NULL, provider_account_reference text NOT NULL, customer_reference text NOT NULL, subscription_reference text NOT NULL, price_reference text NOT NULL, plan_code zaltyko.saas_plan_code NOT NULL, provider_status text NOT NULL, billing_interval zaltyko.saas_billing_interval NOT NULL, current_period_started_at timestamp with time zone NOT NULL, current_period_ends_at timestamp with time zone NOT NULL, cancel_at_period_end boolean DEFAULT FALSE NOT NULL, canceled_at timestamp with time zone, last_provider_event_reference text, last_synced_at timestamp with time zone NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 3257: CreateStmt
CREATE TABLE zaltyko.organization_saas_trials (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, started_by_member_id uuid NOT NULL, status zaltyko.organization_saas_trial_status DEFAULT CAST('active' AS zaltyko.organization_saas_trial_status) NOT NULL, idempotency_key text NOT NULL, request_hash text NOT NULL, started_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL, ends_at timestamp with time zone NOT NULL, cooldown_ends_at timestamp with time zone NOT NULL, ended_at timestamp with time zone, converted_at timestamp with time zone, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 3273: CreateStmt
CREATE TABLE zaltyko.organization_saas_webhook_events (id uuid DEFAULT gen_random_uuid() NOT NULL, provider text DEFAULT CAST('stripe' AS text) NOT NULL, provider_account_reference text NOT NULL, environment zaltyko.stripe_environment NOT NULL, provider_event_id text NOT NULL, event_account_reference text, event_type text NOT NULL, event_created_at timestamp with time zone, provider_object_type text, provider_object_reference text, livemode boolean NOT NULL, signature_verified boolean NOT NULL, payload_sha256 text NOT NULL, organization_id uuid, status text DEFAULT CAST('received' AS text) NOT NULL, attempts integer DEFAULT 0 NOT NULL, lease_token uuid, lease_until timestamp with time zone, fencing_version bigint DEFAULT 0 NOT NULL, received_at timestamp with time zone DEFAULT now() NOT NULL, processed_at timestamp with time zone, last_error_code text, reconciliation_decision_id uuid, reconciliation_next_attempt_at timestamp with time zone);
-- snapshot source line 3300: CreateStmt
CREATE TABLE zaltyko.organization_saas_webhook_payload_conflicts (id uuid DEFAULT gen_random_uuid() NOT NULL, webhook_event_id uuid NOT NULL, observed_payload_sha256 text NOT NULL, first_seen_at timestamp with time zone DEFAULT now() NOT NULL, last_seen_at timestamp with time zone DEFAULT now() NOT NULL, occurrences integer DEFAULT 1 NOT NULL);
-- snapshot source line 3309: CreateStmt
CREATE TABLE zaltyko.organization_saas_webhook_reconciliation_decisions (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, webhook_event_id uuid NOT NULL, actor_user_id uuid NOT NULL, request_id text NOT NULL, idempotency_key text NOT NULL, confirmation_request_sha256 text NOT NULL, resolution_kind text NOT NULL, reason text NOT NULL, provider_account_reference text NOT NULL, environment zaltyko.stripe_environment NOT NULL, provider_event_id text NOT NULL, event_created_at timestamp with time zone NOT NULL, provider_object_reference text NOT NULL, payload_sha256 text NOT NULL, preview_token_sha256 text NOT NULL, preview_issued_at timestamp with time zone NOT NULL, preview_expires_at timestamp with time zone NOT NULL, expected_fencing_version bigint NOT NULL, expected_last_provider_event_reference text, expected_subscription_updated_at timestamp with time zone NOT NULL, expected_subscription_plan_code zaltyko.saas_plan_code NOT NULL, expected_subscription_price_reference text NOT NULL, expected_subscription_billing_interval zaltyko.saas_billing_interval NOT NULL, expected_subscription_provider_status text NOT NULL, expected_subscription_cancel_at_period_end boolean NOT NULL, expected_subscription_canceled_at timestamp with time zone, expected_subscription_period_started_at timestamp with time zone NOT NULL, expected_subscription_period_ends_at timestamp with time zone NOT NULL, expected_entitlement_revision integer NOT NULL, expected_entitlement_plan_code zaltyko.saas_plan_code NOT NULL, expected_entitlement_source zaltyko.entitlement_source NOT NULL, expected_entitlement_source_reference text NOT NULL, expected_entitlement_subscription_id uuid, expected_entitlement_trial_id uuid, expected_entitlement_effective_from timestamp with time zone NOT NULL, expected_entitlement_effective_until timestamp with time zone, evidence_observed_at timestamp with time zone NOT NULL, execution_expires_at timestamp with time zone NOT NULL, snapshot_sha256 text NOT NULL, observed_subscription_reference text NOT NULL, observed_customer_reference text NOT NULL, observed_plan_code zaltyko.saas_plan_code NOT NULL, observed_provider_status text NOT NULL, observed_cancel_at_period_end boolean NOT NULL, observed_canceled_at timestamp with time zone, observed_current_period_started_at timestamp with time zone NOT NULL, observed_current_period_ends_at timestamp with time zone NOT NULL, observed_price_reference text NOT NULL, observed_latest_invoice_reference text, invoice_reference text, invoice_status text, invoice_customer_reference text, invoice_subscription_reference text, invoice_currency text, invoice_paid_amount bigint, invoice_period_started_at timestamp with time zone, invoice_period_ends_at timestamp with time zone, invoice_price_reference text, invoice_plan_code zaltyko.saas_plan_code, created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL);
-- snapshot source line 3373: CreateStmt
CREATE TABLE zaltyko.organization_saas_webhook_reconciliation_results (id uuid DEFAULT gen_random_uuid() NOT NULL, decision_id uuid NOT NULL, outcome text NOT NULL, processor_fencing_version bigint NOT NULL, observed_snapshot_sha256 text, entitlement_revision_before integer NOT NULL, entitlement_revision_after integer NOT NULL, entitlement_source_reference_before text NOT NULL, entitlement_source_reference_after text NOT NULL, result_code text NOT NULL, recorded_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL);
-- snapshot source line 3387: CreateStmt
CREATE TABLE zaltyko.organization_sports (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, country_code text NOT NULL, sport_profile_id uuid NOT NULL, role zaltyko.organization_sport_role NOT NULL, status zaltyko.organization_sport_status DEFAULT CAST('active' AS zaltyko.organization_sport_status) NOT NULL, starts_on date DEFAULT CURRENT_DATE NOT NULL, ends_on date, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 3400: CreateStmt
CREATE TABLE zaltyko.organizations (id uuid DEFAULT gen_random_uuid() NOT NULL, name text NOT NULL, legal_name text, status zaltyko.organization_status DEFAULT CAST('trial' AS zaltyko.organization_status) NOT NULL, country_code text DEFAULT CAST('ES' AS text) NOT NULL, default_timezone text DEFAULT CAST('Europe/Madrid' AS text) NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, default_currency text DEFAULT CAST('EUR' AS text) NOT NULL);
-- snapshot source line 3412: CreateStmt
CREATE TABLE zaltyko.outbox_events (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, location_id uuid, event_name text NOT NULL, event_version integer DEFAULT 1 NOT NULL, aggregate_type text NOT NULL, aggregate_id uuid NOT NULL, idempotency_key text NOT NULL, payload jsonb NOT NULL, status zaltyko.outbox_status DEFAULT CAST('pending' AS zaltyko.outbox_status) NOT NULL, attempts integer DEFAULT 0 NOT NULL, occurred_at timestamp with time zone NOT NULL, available_at timestamp with time zone DEFAULT now() NOT NULL, processed_at timestamp with time zone, last_error text, created_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 3431: CreateStmt
CREATE TABLE zaltyko.owner_dashboard_layouts (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, user_id uuid NOT NULL, module_order text[] NOT NULL, version integer DEFAULT 1 NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 3440: CreateStmt
CREATE TABLE zaltyko.owner_signup_consent_audits (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, event text DEFAULT CAST('grant' AS text) NOT NULL, policy_version text NOT NULL, source text NOT NULL, consent_proof text NOT NULL, recorded_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 3450: CreateStmt
CREATE TABLE zaltyko.owner_signup_consent_policy (singleton boolean DEFAULT TRUE NOT NULL, policy_version text NOT NULL, rollout_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL);
-- snapshot source line 3456: CreateStmt
CREATE TABLE zaltyko.owner_signup_consents (user_id uuid NOT NULL, state text DEFAULT CAST('granted' AS text) NOT NULL, policy_version text NOT NULL, source text NOT NULL, consent_proof text NOT NULL, granted_at timestamp with time zone DEFAULT now() NOT NULL, revoked_at timestamp with time zone, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 3468: CreateStmt
CREATE TABLE zaltyko.payment_allocations (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, payment_id uuid NOT NULL, charge_id uuid NOT NULL, amount_cents bigint NOT NULL, currency text NOT NULL, allocated_at timestamp with time zone NOT NULL, idempotency_key text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 3480: CreateStmt
CREATE TABLE zaltyko.payment_attempts (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, location_id uuid, family_id uuid NOT NULL, family_payer_id uuid, invoice_id uuid, payment_id uuid, status zaltyko.payment_attempt_status NOT NULL, amount_cents bigint NOT NULL, currency text NOT NULL, processor text NOT NULL, environment zaltyko.provider_environment NOT NULL, provider_attempt_id text NOT NULL, failure_code text, attempted_at timestamp with time zone NOT NULL, provider_event_id uuid, idempotency_key text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 3501: CreateStmt
CREATE TABLE zaltyko.payment_provider_events (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, processor text NOT NULL, environment zaltyko.provider_environment NOT NULL, provider_event_id text NOT NULL, event_type text NOT NULL, payload_sha256 text NOT NULL, payload jsonb NOT NULL, signature_verified boolean NOT NULL, status zaltyko.provider_event_status DEFAULT CAST('received' AS zaltyko.provider_event_status) NOT NULL, effect_type text, effect_id uuid, received_at timestamp with time zone DEFAULT now() NOT NULL, processed_at timestamp with time zone, attempts integer DEFAULT 0 NOT NULL, last_error text, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 3522: CreateStmt
CREATE TABLE zaltyko.payments (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, location_id uuid, family_id uuid NOT NULL, family_payer_id uuid, source zaltyko.payment_source DEFAULT CAST('provider' AS zaltyko.payment_source) NOT NULL, status zaltyko.payment_status NOT NULL, amount_cents bigint NOT NULL, currency text NOT NULL, processor text, environment zaltyko.provider_environment, provider_payment_id text, manual_method zaltyko.manual_payment_method, manual_reference text, recorded_by_user_id uuid, received_at timestamp with time zone NOT NULL, idempotency_key text NOT NULL, version integer DEFAULT 1 NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 3545: CreateStmt
CREATE TABLE zaltyko.people (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, given_name text NOT NULL, family_name text NOT NULL, preferred_name text, date_of_birth date, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 3556: CreateStmt
CREATE TABLE zaltyko.price_plan_class_template_coverage (id uuid DEFAULT extensions.gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, location_id uuid NOT NULL, price_plan_id uuid NOT NULL, class_template_id uuid NOT NULL, starts_on date NOT NULL, ends_on date, created_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 3567: CreateStmt
CREATE TABLE zaltyko.price_plans (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, name text NOT NULL, cadence zaltyko.billing_cadence NOT NULL, amount_cents integer NOT NULL, currency text DEFAULT CAST('EUR' AS text) NOT NULL, is_active boolean DEFAULT TRUE NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 3579: CreateStmt
CREATE TABLE zaltyko.programs (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, name text NOT NULL, status zaltyko.lifecycle_status DEFAULT CAST('draft' AS zaltyko.lifecycle_status) NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, kind zaltyko.program_kind NOT NULL, organization_sport_id uuid, activity_key text);
-- snapshot source line 3591: CreateStmt
CREATE TABLE zaltyko.refunds (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, payment_id uuid NOT NULL, payment_allocation_id uuid NOT NULL, status zaltyko.refund_status NOT NULL, amount_cents bigint NOT NULL, currency text NOT NULL, processor text NOT NULL, environment zaltyko.provider_environment NOT NULL, provider_refund_id text NOT NULL, reason_code text NOT NULL, refunded_at timestamp with time zone NOT NULL, provider_event_id uuid, idempotency_key text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 3609: CreateStmt
CREATE TABLE zaltyko.retention_cohort_projection_runs (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, metric_run_id uuid NOT NULL, location_id uuid, formula_version integer NOT NULL, source_watermark timestamp with time zone NOT NULL, status text DEFAULT CAST('running' AS text) NOT NULL, idempotency_key text NOT NULL, row_count integer DEFAULT 0 NOT NULL, started_at timestamp with time zone DEFAULT now() NOT NULL, completed_at timestamp with time zone, error_code text);
-- snapshot source line 3624: CreateStmt
CREATE TABLE zaltyko.retention_cohort_projections (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, projection_run_id uuid NOT NULL, location_id uuid, program_id uuid, group_id uuid, cohort_month date NOT NULL, observation_month date NOT NULL, cohort_size integer NOT NULL, active_count integer NOT NULL, paused_count integer NOT NULL, retention_rate numeric(5, 4), quality zaltyko.metric_quality NOT NULL, numerator integer NOT NULL, denominator integer NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 3643: CreateStmt
CREATE TABLE zaltyko.session_staff (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, session_id uuid NOT NULL, staff_profile_id uuid NOT NULL, assignment_role text DEFAULT CAST('coach' AS text) NOT NULL);
-- snapshot source line 3651: CreateStmt
CREATE TABLE zaltyko.sessions (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, location_id uuid NOT NULL, class_template_id uuid NOT NULL, space_id uuid, status zaltyko.session_status DEFAULT CAST('scheduled' AS zaltyko.session_status) NOT NULL, starts_at timestamp with time zone NOT NULL, ends_at timestamp with time zone NOT NULL, capacity_override integer, cancellation_reason text, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 3666: CreateStmt
CREATE TABLE zaltyko.spaces (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, location_id uuid NOT NULL, facility_id uuid NOT NULL, name text NOT NULL, capacity integer, is_active boolean DEFAULT TRUE NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 3678: CreateStmt
CREATE TABLE zaltyko.sport_profiles (id uuid DEFAULT gen_random_uuid() NOT NULL, country_code text NOT NULL, discipline_key text NOT NULL, federation_code text DEFAULT CAST('unconfigured' AS text) NOT NULL, profile_version text NOT NULL, status zaltyko.sport_profile_status DEFAULT CAST('identity_only' AS zaltyko.sport_profile_status) NOT NULL, configuration_schema_version integer DEFAULT 1 NOT NULL, configuration jsonb DEFAULT CAST('{}' AS jsonb) NOT NULL, source_title text, source_url text, source_verified_at timestamp with time zone, created_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 3693: CreateStmt
CREATE TABLE zaltyko.staff_profiles (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, person_id uuid NOT NULL, member_id uuid, is_active boolean DEFAULT TRUE NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 3703: CreateStmt
CREATE TABLE zaltyko.trial_followups (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, location_id uuid NOT NULL, trial_id uuid NOT NULL, channel zaltyko.trial_followup_channel NOT NULL, outcome zaltyko.trial_followup_outcome NOT NULL, completed_by_member_id uuid, completed_at timestamp with time zone NOT NULL, idempotency_key text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 3716: CreateStmt
CREATE TABLE zaltyko.trial_status_history (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, location_id uuid NOT NULL, trial_id uuid NOT NULL, from_status zaltyko.trial_status, to_status zaltyko.trial_status NOT NULL, effective_at timestamp with time zone NOT NULL, changed_by_member_id uuid, idempotency_key text NOT NULL, changed_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 3729: CreateStmt
CREATE TABLE zaltyko.trials (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, location_id uuid NOT NULL, athlete_id uuid NOT NULL, session_id uuid NOT NULL, trial_enrollment_id uuid NOT NULL, converted_enrollment_id uuid, status zaltyko.trial_status DEFAULT CAST('booked' AS zaltyko.trial_status) NOT NULL, version integer DEFAULT 1 NOT NULL, booked_at timestamp with time zone DEFAULT now() NOT NULL, attended_at timestamp with time zone, completed_at timestamp with time zone, converted_at timestamp with time zone, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 3747: CreateStmt
CREATE TABLE zaltyko.waitlist_entries (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, location_id uuid NOT NULL, athlete_id uuid NOT NULL, class_template_id uuid, program_id uuid, source_trial_id uuid, contact_guardian_id uuid, contactable boolean DEFAULT FALSE NOT NULL, contact_consent_status zaltyko.contact_consent_status DEFAULT CAST('unknown' AS zaltyko.contact_consent_status) NOT NULL, contact_consent_recorded_at timestamp with time zone, priority integer DEFAULT 0 NOT NULL, preferences jsonb DEFAULT CAST('{}' AS jsonb) NOT NULL, status zaltyko.waitlist_status DEFAULT CAST('waiting' AS zaltyko.waitlist_status) NOT NULL, converted_enrollment_id uuid, joined_at timestamp with time zone DEFAULT now() NOT NULL, version integer DEFAULT 1 NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 3769: CreateStmt
CREATE TABLE zaltyko.waitlist_offers (id uuid DEFAULT gen_random_uuid() NOT NULL, organization_id uuid NOT NULL, location_id uuid NOT NULL, waitlist_entry_id uuid NOT NULL, class_template_id uuid NOT NULL, reserved_enrollment_id uuid NOT NULL, status zaltyko.waitlist_offer_status DEFAULT CAST('pending' AS zaltyko.waitlist_offer_status) NOT NULL, sent_at timestamp with time zone NOT NULL, expires_at timestamp with time zone NOT NULL, responded_at timestamp with time zone, idempotency_key text NOT NULL, version integer DEFAULT 1 NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
-- snapshot source line 4166: AlterTableStmt
ALTER TABLE zaltyko.athletes ADD CONSTRAINT athletes_pkey PRIMARY KEY (id);
-- snapshot source line 4167: AlterTableStmt
ALTER TABLE zaltyko.attendance_records ADD CONSTRAINT attendance_records_pkey PRIMARY KEY (id);
-- snapshot source line 4168: AlterTableStmt
ALTER TABLE zaltyko.audit_log ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);
-- snapshot source line 4169: AlterTableStmt
ALTER TABLE zaltyko.benchmark_metric_targets ADD CONSTRAINT benchmark_metric_targets_pkey PRIMARY KEY (id);
-- snapshot source line 4170: AlterTableStmt
ALTER TABLE zaltyko.benchmark_profiles ADD CONSTRAINT benchmark_profiles_pkey PRIMARY KEY (id);
-- snapshot source line 4171: AlterTableStmt
ALTER TABLE zaltyko.charges ADD CONSTRAINT charges_pkey PRIMARY KEY (id);
-- snapshot source line 4172: AlterTableStmt
ALTER TABLE zaltyko.class_template_groups ADD CONSTRAINT class_template_groups_pkey PRIMARY KEY (id);
-- snapshot source line 4173: AlterTableStmt
ALTER TABLE zaltyko.class_template_weekdays ADD CONSTRAINT class_template_weekdays_pkey PRIMARY KEY (id);
-- snapshot source line 4174: AlterTableStmt
ALTER TABLE zaltyko.class_templates ADD CONSTRAINT class_templates_pkey PRIMARY KEY (id);
-- snapshot source line 4175: AlterTableStmt
ALTER TABLE zaltyko.data_quality_issues ADD CONSTRAINT data_quality_issues_pkey PRIMARY KEY (id);
-- snapshot source line 4176: AlterTableStmt
ALTER TABLE zaltyko.enrollment_pauses ADD CONSTRAINT enrollment_pauses_pkey PRIMARY KEY (id);
-- snapshot source line 4177: AlterTableStmt
ALTER TABLE zaltyko.enrollment_price_assignments ADD CONSTRAINT enrollment_price_assignments_pkey PRIMARY KEY (id);
-- snapshot source line 4178: AlterTableStmt
ALTER TABLE zaltyko.enrollment_status_history ADD CONSTRAINT enrollment_status_history_pkey PRIMARY KEY (id);
-- snapshot source line 4179: AlterTableStmt
ALTER TABLE zaltyko.enrollments ADD CONSTRAINT enrollments_pkey PRIMARY KEY (id);
-- snapshot source line 4180: AlterTableStmt
ALTER TABLE zaltyko.facilities ADD CONSTRAINT facilities_pkey PRIMARY KEY (id);
-- snapshot source line 4181: AlterTableStmt
ALTER TABLE zaltyko.families ADD CONSTRAINT families_pkey PRIMARY KEY (id);
-- snapshot source line 4182: AlterTableStmt
ALTER TABLE zaltyko.family_collection_preferences ADD CONSTRAINT family_collection_preferences_pkey PRIMARY KEY (organization_id, family_id);
-- snapshot source line 4183: AlterTableStmt
ALTER TABLE zaltyko.family_guardians ADD CONSTRAINT family_guardians_pkey PRIMARY KEY (id);
-- snapshot source line 4184: AlterTableStmt
ALTER TABLE zaltyko.family_members ADD CONSTRAINT family_members_pkey PRIMARY KEY (id);
-- snapshot source line 4185: AlterTableStmt
ALTER TABLE zaltyko.family_payers ADD CONSTRAINT family_payers_pkey PRIMARY KEY (id);
-- snapshot source line 4186: AlterTableStmt
ALTER TABLE zaltyko.family_payment_authorizations ADD CONSTRAINT family_payment_authorizations_pkey PRIMARY KEY (id);
-- snapshot source line 4187: AlterTableStmt
ALTER TABLE zaltyko.financial_reconciliation_runs ADD CONSTRAINT financial_reconciliation_runs_pkey PRIMARY KEY (id);
-- snapshot source line 4188: AlterTableStmt
ALTER TABLE zaltyko.group_membership_history ADD CONSTRAINT group_membership_history_pkey PRIMARY KEY (id);
-- snapshot source line 4189: AlterTableStmt
ALTER TABLE zaltyko.group_memberships ADD CONSTRAINT group_memberships_pkey PRIMARY KEY (id);
-- snapshot source line 4190: AlterTableStmt
ALTER TABLE zaltyko.groups ADD CONSTRAINT groups_pkey PRIMARY KEY (id);
-- snapshot source line 4191: AlterTableStmt
ALTER TABLE zaltyko.guardian_contacts ADD CONSTRAINT guardian_contacts_pkey PRIMARY KEY (id);
-- snapshot source line 4192: AlterTableStmt
ALTER TABLE zaltyko.guardians ADD CONSTRAINT guardians_pkey PRIMARY KEY (id);
-- snapshot source line 4193: AlterTableStmt
ALTER TABLE zaltyko.health_score_dimension_snapshots ADD CONSTRAINT health_score_dimension_snapshots_pkey PRIMARY KEY (id);
-- snapshot source line 4194: AlterTableStmt
ALTER TABLE zaltyko.health_score_dimension_weights ADD CONSTRAINT health_score_dimension_weights_pkey PRIMARY KEY (id);
-- snapshot source line 4195: AlterTableStmt
ALTER TABLE zaltyko.health_score_metric_contributions ADD CONSTRAINT health_score_metric_contributions_pkey PRIMARY KEY (id);
-- snapshot source line 4196: AlterTableStmt
ALTER TABLE zaltyko.health_score_metric_weights ADD CONSTRAINT health_score_metric_weights_pkey PRIMARY KEY (id);
-- snapshot source line 4197: AlterTableStmt
ALTER TABLE zaltyko.health_score_snapshots ADD CONSTRAINT health_score_snapshots_pkey PRIMARY KEY (id);
-- snapshot source line 4198: AlterTableStmt
ALTER TABLE zaltyko.health_score_versions ADD CONSTRAINT health_score_versions_pkey PRIMARY KEY (id);
-- snapshot source line 4199: AlterTableStmt
ALTER TABLE zaltyko.insight_actions ADD CONSTRAINT insight_actions_pkey PRIMARY KEY (id);
-- snapshot source line 4200: AlterTableStmt
ALTER TABLE zaltyko.insight_notifications ADD CONSTRAINT insight_notifications_pkey PRIMARY KEY (id);
-- snapshot source line 4201: AlterTableStmt
ALTER TABLE zaltyko.insight_rule_runs ADD CONSTRAINT insight_rule_runs_pkey PRIMARY KEY (id);
-- snapshot source line 4202: AlterTableStmt
ALTER TABLE zaltyko.insight_rule_versions ADD CONSTRAINT insight_rule_versions_pkey PRIMARY KEY (id);
-- snapshot source line 4203: AlterTableStmt
ALTER TABLE zaltyko.insight_run_observations ADD CONSTRAINT insight_run_observations_pkey PRIMARY KEY (id);
-- snapshot source line 4204: AlterTableStmt
ALTER TABLE zaltyko.insight_status_history ADD CONSTRAINT insight_status_history_pkey PRIMARY KEY (id);
-- snapshot source line 4205: AlterTableStmt
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_pkey PRIMARY KEY (id);
-- snapshot source line 4206: AlterTableStmt
ALTER TABLE zaltyko.invoice_line_enrollments ADD CONSTRAINT invoice_line_enrollments_pkey PRIMARY KEY (organization_id, invoice_line_id, enrollment_id);
-- snapshot source line 4207: AlterTableStmt
ALTER TABLE zaltyko.invoice_lines ADD CONSTRAINT invoice_lines_pkey PRIMARY KEY (id);
-- snapshot source line 4208: AlterTableStmt
ALTER TABLE zaltyko.invoices ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);
-- snapshot source line 4209: AlterTableStmt
ALTER TABLE zaltyko.locations ADD CONSTRAINT locations_pkey PRIMARY KEY (id);
-- snapshot source line 4210: AlterTableStmt
ALTER TABLE zaltyko.member_location_scopes ADD CONSTRAINT member_location_scopes_pkey PRIMARY KEY (id);
-- snapshot source line 4211: AlterTableStmt
ALTER TABLE zaltyko.metric_definitions ADD CONSTRAINT metric_definitions_pkey PRIMARY KEY (key);
-- snapshot source line 4212: AlterTableStmt
ALTER TABLE zaltyko.metric_event_consumptions ADD CONSTRAINT metric_event_consumptions_pkey PRIMARY KEY (id);
-- snapshot source line 4213: AlterTableStmt
ALTER TABLE zaltyko.metric_invalidations ADD CONSTRAINT metric_invalidations_pkey PRIMARY KEY (id);
-- snapshot source line 4214: AlterTableStmt
ALTER TABLE zaltyko.metric_run_values ADD CONSTRAINT metric_run_values_pkey PRIMARY KEY (id);
-- snapshot source line 4215: AlterTableStmt
ALTER TABLE zaltyko.metric_runs ADD CONSTRAINT metric_runs_pkey PRIMARY KEY (id);
-- snapshot source line 4216: AlterTableStmt
ALTER TABLE zaltyko.metric_values ADD CONSTRAINT metric_values_pkey PRIMARY KEY (id);
-- snapshot source line 4217: AlterTableStmt
ALTER TABLE zaltyko.organization_bootstrap_commands ADD CONSTRAINT organization_bootstrap_commands_pkey PRIMARY KEY (id);
-- snapshot source line 4218: AlterTableStmt
ALTER TABLE zaltyko.organization_entitlement_changes ADD CONSTRAINT organization_entitlement_changes_pkey PRIMARY KEY (id);
-- snapshot source line 4219: AlterTableStmt
ALTER TABLE zaltyko.organization_entitlements ADD CONSTRAINT organization_entitlements_pkey PRIMARY KEY (organization_id);
-- snapshot source line 4220: AlterTableStmt
ALTER TABLE zaltyko.organization_members ADD CONSTRAINT organization_members_pkey PRIMARY KEY (id);
-- snapshot source line 4221: AlterTableStmt
ALTER TABLE zaltyko.organization_payment_provider_accounts ADD CONSTRAINT organization_payment_provider_accounts_pkey PRIMARY KEY (id);
-- snapshot source line 4222: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operations_pkey PRIMARY KEY (id);
-- snapshot source line 4223: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_customers ADD CONSTRAINT organization_saas_customers_pkey PRIMARY KEY (id);
-- snapshot source line 4224: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_subscriptions ADD CONSTRAINT organization_saas_subscriptions_pkey PRIMARY KEY (id);
-- snapshot source line 4225: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_trials ADD CONSTRAINT organization_saas_trials_pkey PRIMARY KEY (id);
-- snapshot source line 4226: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT organization_saas_webhook_events_pkey PRIMARY KEY (id);
-- snapshot source line 4227: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_payload_conflicts ADD CONSTRAINT organization_saas_webhook_payload_conflicts_pkey PRIMARY KEY (id);
-- snapshot source line 4228: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_reconciliation_decisions_pkey PRIMARY KEY (id);
-- snapshot source line 4229: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_results ADD CONSTRAINT organization_saas_webhook_reconciliation_results_pkey PRIMARY KEY (id);
-- snapshot source line 4230: AlterTableStmt
ALTER TABLE zaltyko.organization_sports ADD CONSTRAINT organization_sports_pkey PRIMARY KEY (id);
-- snapshot source line 4231: AlterTableStmt
ALTER TABLE zaltyko.organizations ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);
-- snapshot source line 4232: AlterTableStmt
ALTER TABLE zaltyko.outbox_events ADD CONSTRAINT outbox_events_pkey PRIMARY KEY (id);
-- snapshot source line 4233: AlterTableStmt
ALTER TABLE zaltyko.owner_dashboard_layouts ADD CONSTRAINT owner_dashboard_layouts_pkey PRIMARY KEY (id);
-- snapshot source line 4234: AlterTableStmt
ALTER TABLE zaltyko.owner_signup_consent_audits ADD CONSTRAINT owner_signup_consent_audits_pkey PRIMARY KEY (id);
-- snapshot source line 4235: AlterTableStmt
ALTER TABLE zaltyko.owner_signup_consent_policy ADD CONSTRAINT owner_signup_consent_policy_pkey PRIMARY KEY (singleton);
-- snapshot source line 4236: AlterTableStmt
ALTER TABLE zaltyko.owner_signup_consents ADD CONSTRAINT owner_signup_consents_pkey PRIMARY KEY (user_id);
-- snapshot source line 4237: AlterTableStmt
ALTER TABLE zaltyko.payment_allocations ADD CONSTRAINT payment_allocations_pkey PRIMARY KEY (id);
-- snapshot source line 4238: AlterTableStmt
ALTER TABLE zaltyko.payment_attempts ADD CONSTRAINT payment_attempts_pkey PRIMARY KEY (id);
-- snapshot source line 4239: AlterTableStmt
ALTER TABLE zaltyko.payment_provider_events ADD CONSTRAINT payment_provider_events_pkey PRIMARY KEY (id);
-- snapshot source line 4240: AlterTableStmt
ALTER TABLE zaltyko.payments ADD CONSTRAINT payments_pkey PRIMARY KEY (id);
-- snapshot source line 4241: AlterTableStmt
ALTER TABLE zaltyko.people ADD CONSTRAINT people_pkey PRIMARY KEY (id);
-- snapshot source line 4242: AlterTableStmt
ALTER TABLE zaltyko.price_plan_class_template_coverage ADD CONSTRAINT price_plan_class_template_coverage_pkey PRIMARY KEY (id);
-- snapshot source line 4243: AlterTableStmt
ALTER TABLE zaltyko.price_plans ADD CONSTRAINT price_plans_pkey PRIMARY KEY (id);
-- snapshot source line 4244: AlterTableStmt
ALTER TABLE zaltyko.programs ADD CONSTRAINT programs_pkey PRIMARY KEY (id);
-- snapshot source line 4245: AlterTableStmt
ALTER TABLE zaltyko.refunds ADD CONSTRAINT refunds_pkey PRIMARY KEY (id);
-- snapshot source line 4246: AlterTableStmt
ALTER TABLE zaltyko.retention_cohort_projection_runs ADD CONSTRAINT retention_cohort_projection_runs_pkey PRIMARY KEY (id);
-- snapshot source line 4247: AlterTableStmt
ALTER TABLE zaltyko.retention_cohort_projections ADD CONSTRAINT retention_cohort_projections_pkey PRIMARY KEY (id);
-- snapshot source line 4248: AlterTableStmt
ALTER TABLE zaltyko.session_staff ADD CONSTRAINT session_staff_pkey PRIMARY KEY (id);
-- snapshot source line 4249: AlterTableStmt
ALTER TABLE zaltyko.sessions ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);
-- snapshot source line 4250: AlterTableStmt
ALTER TABLE zaltyko.spaces ADD CONSTRAINT spaces_pkey PRIMARY KEY (id);
-- snapshot source line 4251: AlterTableStmt
ALTER TABLE zaltyko.sport_profiles ADD CONSTRAINT sport_profiles_pkey PRIMARY KEY (id);
-- snapshot source line 4252: AlterTableStmt
ALTER TABLE zaltyko.staff_profiles ADD CONSTRAINT staff_profiles_pkey PRIMARY KEY (id);
-- snapshot source line 4253: AlterTableStmt
ALTER TABLE zaltyko.trial_followups ADD CONSTRAINT trial_followups_pkey PRIMARY KEY (id);
-- snapshot source line 4254: AlterTableStmt
ALTER TABLE zaltyko.trial_status_history ADD CONSTRAINT trial_status_history_pkey PRIMARY KEY (id);
-- snapshot source line 4255: AlterTableStmt
ALTER TABLE zaltyko.trials ADD CONSTRAINT trials_pkey PRIMARY KEY (id);
-- snapshot source line 4256: AlterTableStmt
ALTER TABLE zaltyko.waitlist_entries ADD CONSTRAINT waitlist_entries_pkey PRIMARY KEY (id);
-- snapshot source line 4257: AlterTableStmt
ALTER TABLE zaltyko.waitlist_offers ADD CONSTRAINT waitlist_offers_pkey PRIMARY KEY (id);
-- snapshot source line 4277: AlterTableStmt
ALTER TABLE zaltyko.athletes ADD CONSTRAINT athletes_organization_id_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4278: AlterTableStmt
ALTER TABLE zaltyko.athletes ADD CONSTRAINT athletes_organization_person_uq UNIQUE (organization_id, person_id);
-- snapshot source line 4279: AlterTableStmt
ALTER TABLE zaltyko.attendance_records ADD CONSTRAINT attendance_records_session_enrollment_uq UNIQUE (organization_id, session_id, enrollment_id);
-- snapshot source line 4280: AlterTableStmt
ALTER TABLE zaltyko.benchmark_metric_targets ADD CONSTRAINT benchmark_metric_targets_uq UNIQUE (benchmark_profile_id, metric_key, currency);
-- snapshot source line 4281: AlterTableStmt
ALTER TABLE zaltyko.charges ADD CONSTRAINT charges_idempotency_uq UNIQUE (organization_id, idempotency_key);
-- snapshot source line 4282: AlterTableStmt
ALTER TABLE zaltyko.charges ADD CONSTRAINT charges_invoice_line_uq UNIQUE (organization_id, invoice_line_id);
-- snapshot source line 4283: AlterTableStmt
ALTER TABLE zaltyko.charges ADD CONSTRAINT charges_organization_id_currency_uq UNIQUE (organization_id, id, currency);
-- snapshot source line 4284: AlterTableStmt
ALTER TABLE zaltyko.charges ADD CONSTRAINT charges_organization_id_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4285: AlterTableStmt
ALTER TABLE zaltyko.class_template_groups ADD CONSTRAINT class_template_groups_uq UNIQUE (organization_id, class_template_id, group_id);
-- snapshot source line 4286: AlterTableStmt
ALTER TABLE zaltyko.class_template_weekdays ADD CONSTRAINT class_template_weekdays_uq UNIQUE (organization_id, class_template_id, iso_weekday, starts_at_local);
-- snapshot source line 4287: AlterTableStmt
ALTER TABLE zaltyko.class_templates ADD CONSTRAINT class_templates_organization_id_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4288: AlterTableStmt
ALTER TABLE zaltyko.enrollment_price_assignments ADD CONSTRAINT enrollment_price_assignments_coverage_fk_uq UNIQUE (organization_id, location_id, price_plan_id, enrollment_id, id);
-- snapshot source line 4289: AlterTableStmt
ALTER TABLE zaltyko.enrollment_price_assignments ADD CONSTRAINT enrollment_price_assignments_organization_id_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4290: AlterTableStmt
ALTER TABLE zaltyko.enrollment_status_history ADD CONSTRAINT enrollment_status_history_idempotency_uq UNIQUE (organization_id, idempotency_key);
-- snapshot source line 4291: AlterTableStmt
ALTER TABLE zaltyko.enrollments ADD CONSTRAINT enrollments_billing_coverage_fk_uq UNIQUE (organization_id, location_id, athlete_id, class_template_id, id);
-- snapshot source line 4292: AlterTableStmt
ALTER TABLE zaltyko.enrollments ADD CONSTRAINT enrollments_organization_id_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4293: AlterTableStmt
ALTER TABLE zaltyko.facilities ADD CONSTRAINT facilities_organization_id_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4294: AlterTableStmt
ALTER TABLE zaltyko.families ADD CONSTRAINT families_organization_id_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4295: AlterTableStmt
ALTER TABLE zaltyko.family_guardians ADD CONSTRAINT family_guardians_family_guardian_uq UNIQUE (organization_id, family_id, guardian_id);
-- snapshot source line 4296: AlterTableStmt
ALTER TABLE zaltyko.family_payers ADD CONSTRAINT family_payers_family_guardian_uq UNIQUE (organization_id, family_id, guardian_id, starts_on);
-- snapshot source line 4297: AlterTableStmt
ALTER TABLE zaltyko.family_payment_authorizations ADD CONSTRAINT family_payment_authorizations_organization_id_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4298: AlterTableStmt
ALTER TABLE zaltyko.family_payment_authorizations ADD CONSTRAINT family_payment_authorizations_setup_uq UNIQUE (organization_id, payment_provider_account_id, provider_setup_reference);
-- snapshot source line 4299: AlterTableStmt
ALTER TABLE zaltyko.financial_reconciliation_runs ADD CONSTRAINT financial_reconciliation_idempotency_uq UNIQUE (organization_id, idempotency_key);
-- snapshot source line 4300: AlterTableStmt
ALTER TABLE zaltyko.financial_reconciliation_runs ADD CONSTRAINT financial_reconciliation_natural_uq UNIQUE (organization_id, currency, period_start, period_end, formula_version);
-- snapshot source line 4301: AlterTableStmt
ALTER TABLE zaltyko.group_membership_history ADD CONSTRAINT group_membership_history_idempotency_uq UNIQUE (organization_id, idempotency_key);
-- snapshot source line 4302: AlterTableStmt
ALTER TABLE zaltyko.groups ADD CONSTRAINT groups_organization_id_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4303: AlterTableStmt
ALTER TABLE zaltyko.guardian_contacts ADD CONSTRAINT guardian_contacts_value_uq UNIQUE (organization_id, guardian_id, kind, normalized_value);
-- snapshot source line 4304: AlterTableStmt
ALTER TABLE zaltyko.guardians ADD CONSTRAINT guardians_organization_auth_user_uq UNIQUE (organization_id, auth_user_id);
-- snapshot source line 4305: AlterTableStmt
ALTER TABLE zaltyko.guardians ADD CONSTRAINT guardians_organization_id_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4306: AlterTableStmt
ALTER TABLE zaltyko.guardians ADD CONSTRAINT guardians_organization_person_uq UNIQUE (organization_id, person_id);
-- snapshot source line 4307: AlterTableStmt
ALTER TABLE zaltyko.health_score_dimension_snapshots ADD CONSTRAINT health_score_dimension_snapshots_uq UNIQUE (health_score_snapshot_id, dimension);
-- snapshot source line 4308: AlterTableStmt
ALTER TABLE zaltyko.health_score_dimension_weights ADD CONSTRAINT health_score_dimension_weights_uq UNIQUE (health_score_version_id, dimension);
-- snapshot source line 4309: AlterTableStmt
ALTER TABLE zaltyko.health_score_metric_contributions ADD CONSTRAINT health_score_metric_contributions_uq UNIQUE (health_score_snapshot_id, dimension, metric_key);
-- snapshot source line 4310: AlterTableStmt
ALTER TABLE zaltyko.health_score_metric_weights ADD CONSTRAINT health_score_metric_weights_uq UNIQUE (health_score_version_id, dimension, metric_key);
-- snapshot source line 4311: AlterTableStmt
ALTER TABLE zaltyko.health_score_snapshots ADD CONSTRAINT health_score_snapshots_idempotency_uq UNIQUE (organization_id, idempotency_key);
-- snapshot source line 4312: AlterTableStmt
ALTER TABLE zaltyko.health_score_snapshots ADD CONSTRAINT health_score_snapshots_org_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4313: AlterTableStmt
ALTER TABLE zaltyko.health_score_versions ADD CONSTRAINT health_score_versions_key_version_uq UNIQUE (key, version);
-- snapshot source line 4314: AlterTableStmt
ALTER TABLE zaltyko.insight_actions ADD CONSTRAINT insight_actions_idempotency_uq UNIQUE (organization_id, idempotency_key);
-- snapshot source line 4315: AlterTableStmt
ALTER TABLE zaltyko.insight_notifications ADD CONSTRAINT insight_notifications_dedupe_uq UNIQUE (organization_id, insight_id, channel, delivery_window_key);
-- snapshot source line 4316: AlterTableStmt
ALTER TABLE zaltyko.insight_rule_runs ADD CONSTRAINT insight_rule_runs_idempotency_uq UNIQUE (organization_id, idempotency_key);
-- snapshot source line 4317: AlterTableStmt
ALTER TABLE zaltyko.insight_rule_runs ADD CONSTRAINT insight_rule_runs_org_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4318: AlterTableStmt
ALTER TABLE zaltyko.insight_rule_versions ADD CONSTRAINT insight_rule_versions_key_version_uq UNIQUE (key, version);
-- snapshot source line 4319: AlterTableStmt
ALTER TABLE zaltyko.insight_run_observations ADD CONSTRAINT insight_run_observations_uq UNIQUE (rule_run_id, insight_id);
-- snapshot source line 4320: AlterTableStmt
ALTER TABLE zaltyko.insight_status_history ADD CONSTRAINT insight_status_history_idempotency_uq UNIQUE (organization_id, idempotency_key);
-- snapshot source line 4321: AlterTableStmt
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_org_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4322: AlterTableStmt
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_series_occurrence_uq UNIQUE (organization_id, series_key, occurrence);
-- snapshot source line 4323: AlterTableStmt
ALTER TABLE zaltyko.invoice_line_enrollments ADD CONSTRAINT invoice_line_enrollments_line_template_uq UNIQUE (organization_id, invoice_line_id, class_template_id);
-- snapshot source line 4324: AlterTableStmt
ALTER TABLE zaltyko.invoice_lines ADD CONSTRAINT invoice_lines_organization_id_currency_uq UNIQUE (organization_id, id, currency);
-- snapshot source line 4325: AlterTableStmt
ALTER TABLE zaltyko.invoice_lines ADD CONSTRAINT invoice_lines_organization_id_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4326: AlterTableStmt
ALTER TABLE zaltyko.invoices ADD CONSTRAINT invoices_billing_line_location_fk_uq UNIQUE (organization_id, location_id, id);
-- snapshot source line 4327: AlterTableStmt
ALTER TABLE zaltyko.invoices ADD CONSTRAINT invoices_idempotency_uq UNIQUE (organization_id, idempotency_key);
-- snapshot source line 4328: AlterTableStmt
ALTER TABLE zaltyko.invoices ADD CONSTRAINT invoices_organization_id_currency_uq UNIQUE (organization_id, id, currency);
-- snapshot source line 4329: AlterTableStmt
ALTER TABLE zaltyko.invoices ADD CONSTRAINT invoices_organization_id_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4330: AlterTableStmt
ALTER TABLE zaltyko.invoices ADD CONSTRAINT invoices_reference_uq UNIQUE (organization_id, reference);
-- snapshot source line 4331: AlterTableStmt
ALTER TABLE zaltyko.locations ADD CONSTRAINT locations_organization_code_uq UNIQUE (organization_id, code);
-- snapshot source line 4332: AlterTableStmt
ALTER TABLE zaltyko.locations ADD CONSTRAINT locations_organization_id_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4333: AlterTableStmt
ALTER TABLE zaltyko.member_location_scopes ADD CONSTRAINT member_location_scopes_member_location_uq UNIQUE (organization_id, member_id, location_id);
-- snapshot source line 4334: AlterTableStmt
ALTER TABLE zaltyko.metric_event_consumptions ADD CONSTRAINT metric_event_consumptions_uq UNIQUE (outbox_event_id, handler_key, handler_version);
-- snapshot source line 4335: AlterTableStmt
ALTER TABLE zaltyko.metric_invalidations ADD CONSTRAINT metric_invalidations_event_uq UNIQUE (outbox_event_id, handler_key, handler_version);
-- snapshot source line 4336: AlterTableStmt
ALTER TABLE zaltyko.metric_runs ADD CONSTRAINT metric_runs_idempotency_uq UNIQUE (organization_id, idempotency_key);
-- snapshot source line 4337: AlterTableStmt
ALTER TABLE zaltyko.metric_runs ADD CONSTRAINT metric_runs_organization_id_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4338: AlterTableStmt
ALTER TABLE zaltyko.organization_bootstrap_commands ADD CONSTRAINT organization_bootstrap_commands_user_key_uq UNIQUE (user_id, idempotency_key);
-- snapshot source line 4339: AlterTableStmt
ALTER TABLE zaltyko.organization_entitlement_changes ADD CONSTRAINT organization_entitlement_changes_revision_uq UNIQUE (organization_id, revision);
-- snapshot source line 4340: AlterTableStmt
ALTER TABLE zaltyko.organization_entitlement_changes ADD CONSTRAINT organization_entitlement_changes_snapshot_uq UNIQUE (organization_id, id);
-- snapshot source line 4341: AlterTableStmt
ALTER TABLE zaltyko.organization_members ADD CONSTRAINT organization_members_organization_id_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4342: AlterTableStmt
ALTER TABLE zaltyko.organization_members ADD CONSTRAINT organization_members_user_uq UNIQUE (organization_id, user_id);
-- snapshot source line 4343: AlterTableStmt
ALTER TABLE zaltyko.organization_payment_provider_accounts ADD CONSTRAINT organization_payment_provider_accounts_org_processor_env_uq UNIQUE (organization_id, processor, environment);
-- snapshot source line 4344: AlterTableStmt
ALTER TABLE zaltyko.organization_payment_provider_accounts ADD CONSTRAINT organization_payment_provider_accounts_organization_id_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4345: AlterTableStmt
ALTER TABLE zaltyko.organization_payment_provider_accounts ADD CONSTRAINT organization_payment_provider_accounts_provider_reference_uq UNIQUE (processor, environment, provider_account_reference);
-- snapshot source line 4346: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operations_idempotency_uq UNIQUE (organization_id, environment, idempotency_key);
-- snapshot source line 4347: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operations_org_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4348: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operations_provider_session_uq UNIQUE (environment, provider_account_reference, checkout_session_reference);
-- snapshot source line 4349: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operations_stripe_key_uq UNIQUE (stripe_idempotency_key);
-- snapshot source line 4350: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_customers ADD CONSTRAINT organization_saas_customers_idempotency_uq UNIQUE (organization_id, environment, creation_idempotency_key);
-- snapshot source line 4351: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_customers ADD CONSTRAINT organization_saas_customers_one_per_env_uq UNIQUE (organization_id, environment);
-- snapshot source line 4352: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_customers ADD CONSTRAINT organization_saas_customers_operation_fk_key_uq UNIQUE (organization_id, id, environment, provider_account_reference);
-- snapshot source line 4353: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_customers ADD CONSTRAINT organization_saas_customers_org_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4354: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_customers ADD CONSTRAINT organization_saas_customers_provider_id_uq UNIQUE (environment, provider_account_reference, customer_reference);
-- snapshot source line 4355: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_customers ADD CONSTRAINT organization_saas_customers_subscription_fk_key_uq UNIQUE (organization_id, environment, provider_account_reference, customer_reference);
-- snapshot source line 4356: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_subscriptions ADD CONSTRAINT organization_saas_subscriptions_organization_id_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4357: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_subscriptions ADD CONSTRAINT organization_saas_subscriptions_provider_reference_uq UNIQUE (environment, provider_account_reference, subscription_reference);
-- snapshot source line 4358: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_trials ADD CONSTRAINT organization_saas_trials_idempotency_uq UNIQUE (organization_id, idempotency_key);
-- snapshot source line 4359: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_trials ADD CONSTRAINT organization_saas_trials_org_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4360: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT organization_saas_webhook_event_uq UNIQUE (provider_account_reference, environment, provider_event_id);
-- snapshot source line 4361: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_payload_conflicts ADD CONSTRAINT organization_saas_webhook_payload_conflict_uq UNIQUE (webhook_event_id, observed_payload_sha256);
-- snapshot source line 4362: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT saas_webhook_reconciliation_idempotency_uq UNIQUE (webhook_event_id, idempotency_key);
-- snapshot source line 4363: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT saas_webhook_reconciliation_identity_uq UNIQUE (organization_id, webhook_event_id, id);
-- snapshot source line 4364: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_results ADD CONSTRAINT organization_saas_webhook_reconciliation_result_decision_id_key UNIQUE (decision_id);
-- snapshot source line 4365: AlterTableStmt
ALTER TABLE zaltyko.organization_sports ADD CONSTRAINT organization_sports_organization_id_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4366: AlterTableStmt
ALTER TABLE zaltyko.organizations ADD CONSTRAINT organizations_id_country_uq UNIQUE (id, country_code);
-- snapshot source line 4367: AlterTableStmt
ALTER TABLE zaltyko.outbox_events ADD CONSTRAINT outbox_events_idempotency_uq UNIQUE (organization_id, event_name, idempotency_key);
-- snapshot source line 4368: AlterTableStmt
ALTER TABLE zaltyko.owner_dashboard_layouts ADD CONSTRAINT owner_dashboard_layouts_organization_user_uq UNIQUE (organization_id, user_id);
-- snapshot source line 4369: AlterTableStmt
ALTER TABLE zaltyko.payment_allocations ADD CONSTRAINT payment_allocations_idempotency_uq UNIQUE (organization_id, idempotency_key);
-- snapshot source line 4370: AlterTableStmt
ALTER TABLE zaltyko.payment_allocations ADD CONSTRAINT payment_allocations_organization_id_currency_uq UNIQUE (organization_id, id, currency);
-- snapshot source line 4371: AlterTableStmt
ALTER TABLE zaltyko.payment_allocations ADD CONSTRAINT payment_allocations_organization_id_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4372: AlterTableStmt
ALTER TABLE zaltyko.payment_attempts ADD CONSTRAINT payment_attempts_idempotency_uq UNIQUE (organization_id, idempotency_key);
-- snapshot source line 4373: AlterTableStmt
ALTER TABLE zaltyko.payment_attempts ADD CONSTRAINT payment_attempts_organization_id_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4374: AlterTableStmt
ALTER TABLE zaltyko.payment_attempts ADD CONSTRAINT payment_attempts_provider_uq UNIQUE (processor, environment, provider_attempt_id);
-- snapshot source line 4375: AlterTableStmt
ALTER TABLE zaltyko.payment_provider_events ADD CONSTRAINT payment_provider_events_organization_id_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4376: AlterTableStmt
ALTER TABLE zaltyko.payment_provider_events ADD CONSTRAINT payment_provider_events_provider_uq UNIQUE (processor, environment, provider_event_id);
-- snapshot source line 4377: AlterTableStmt
ALTER TABLE zaltyko.payments ADD CONSTRAINT payments_idempotency_uq UNIQUE (organization_id, idempotency_key);
-- snapshot source line 4378: AlterTableStmt
ALTER TABLE zaltyko.payments ADD CONSTRAINT payments_organization_id_currency_uq UNIQUE (organization_id, id, currency);
-- snapshot source line 4379: AlterTableStmt
ALTER TABLE zaltyko.payments ADD CONSTRAINT payments_organization_id_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4380: AlterTableStmt
ALTER TABLE zaltyko.people ADD CONSTRAINT people_organization_id_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4381: AlterTableStmt
ALTER TABLE zaltyko.price_plan_class_template_coverage ADD CONSTRAINT price_plan_class_template_coverage_org_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4382: AlterTableStmt
ALTER TABLE zaltyko.price_plans ADD CONSTRAINT price_plans_organization_id_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4383: AlterTableStmt
ALTER TABLE zaltyko.programs ADD CONSTRAINT programs_organization_id_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4384: AlterTableStmt
ALTER TABLE zaltyko.refunds ADD CONSTRAINT refunds_idempotency_uq UNIQUE (organization_id, idempotency_key);
-- snapshot source line 4385: AlterTableStmt
ALTER TABLE zaltyko.refunds ADD CONSTRAINT refunds_organization_id_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4386: AlterTableStmt
ALTER TABLE zaltyko.refunds ADD CONSTRAINT refunds_provider_uq UNIQUE (processor, environment, provider_refund_id);
-- snapshot source line 4387: AlterTableStmt
ALTER TABLE zaltyko.retention_cohort_projection_runs ADD CONSTRAINT retention_cohort_projection_runs_idempotency_uq UNIQUE (organization_id, idempotency_key);
-- snapshot source line 4388: AlterTableStmt
ALTER TABLE zaltyko.retention_cohort_projection_runs ADD CONSTRAINT retention_cohort_projection_runs_organization_id_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4389: AlterTableStmt
ALTER TABLE zaltyko.session_staff ADD CONSTRAINT session_staff_uq UNIQUE (organization_id, session_id, staff_profile_id);
-- snapshot source line 4390: AlterTableStmt
ALTER TABLE zaltyko.sessions ADD CONSTRAINT sessions_organization_id_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4391: AlterTableStmt
ALTER TABLE zaltyko.sessions ADD CONSTRAINT sessions_template_start_uq UNIQUE (organization_id, class_template_id, starts_at);
-- snapshot source line 4392: AlterTableStmt
ALTER TABLE zaltyko.spaces ADD CONSTRAINT spaces_organization_id_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4393: AlterTableStmt
ALTER TABLE zaltyko.sport_profiles ADD CONSTRAINT sport_profiles_country_id_uq UNIQUE (country_code, id);
-- snapshot source line 4394: AlterTableStmt
ALTER TABLE zaltyko.sport_profiles ADD CONSTRAINT sport_profiles_version_uq UNIQUE (country_code, discipline_key, federation_code, profile_version);
-- snapshot source line 4395: AlterTableStmt
ALTER TABLE zaltyko.staff_profiles ADD CONSTRAINT staff_profiles_organization_id_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4396: AlterTableStmt
ALTER TABLE zaltyko.staff_profiles ADD CONSTRAINT staff_profiles_organization_person_uq UNIQUE (organization_id, person_id);
-- snapshot source line 4397: AlterTableStmt
ALTER TABLE zaltyko.trial_followups ADD CONSTRAINT trial_followups_idempotency_uq UNIQUE (organization_id, idempotency_key);
-- snapshot source line 4398: AlterTableStmt
ALTER TABLE zaltyko.trial_status_history ADD CONSTRAINT trial_status_history_idempotency_uq UNIQUE (organization_id, idempotency_key);
-- snapshot source line 4399: AlterTableStmt
ALTER TABLE zaltyko.trials ADD CONSTRAINT trials_athlete_session_uq UNIQUE (organization_id, athlete_id, session_id);
-- snapshot source line 4400: AlterTableStmt
ALTER TABLE zaltyko.trials ADD CONSTRAINT trials_enrollment_uq UNIQUE (organization_id, trial_enrollment_id);
-- snapshot source line 4401: AlterTableStmt
ALTER TABLE zaltyko.trials ADD CONSTRAINT trials_organization_id_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4402: AlterTableStmt
ALTER TABLE zaltyko.trials ADD CONSTRAINT trials_organization_location_id_uq UNIQUE (organization_id, location_id, id);
-- snapshot source line 4403: AlterTableStmt
ALTER TABLE zaltyko.waitlist_entries ADD CONSTRAINT waitlist_entries_organization_id_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4404: AlterTableStmt
ALTER TABLE zaltyko.waitlist_entries ADD CONSTRAINT waitlist_entries_organization_location_id_uq UNIQUE (organization_id, location_id, id);
-- snapshot source line 4405: AlterTableStmt
ALTER TABLE zaltyko.waitlist_offers ADD CONSTRAINT waitlist_offers_idempotency_uq UNIQUE (organization_id, idempotency_key);
-- snapshot source line 4406: AlterTableStmt
ALTER TABLE zaltyko.waitlist_offers ADD CONSTRAINT waitlist_offers_organization_id_id_uq UNIQUE (organization_id, id);
-- snapshot source line 4407: AlterTableStmt
ALTER TABLE zaltyko.price_plan_class_template_coverage ADD CONSTRAINT price_plan_class_template_coverage_no_overlap EXCLUDE USING gist (organization_id WITH OPERATOR(=), location_id WITH OPERATOR(=), price_plan_id WITH OPERATOR(=), class_template_id WITH OPERATOR(=), (daterange(starts_on, ends_on, CAST('[]' AS text))) WITH OPERATOR(&&));
-- snapshot source line 4452: AlterTableStmt
ALTER TABLE zaltyko.audit_log ADD CONSTRAINT audit_log_action_check CHECK (btrim(action) <> CAST('' AS text));
-- snapshot source line 4453: AlterTableStmt
ALTER TABLE zaltyko.audit_log ADD CONSTRAINT audit_log_target_type_check CHECK (btrim(target_type) <> CAST('' AS text));
-- snapshot source line 4454: AlterTableStmt
ALTER TABLE zaltyko.benchmark_metric_targets ADD CONSTRAINT benchmark_metric_targets_currency_check CHECK (currency IS NULL OR currency ~ CAST('^[A-Z]{3}$' AS text));
-- snapshot source line 4455: AlterTableStmt
ALTER TABLE zaltyko.benchmark_metric_targets ADD CONSTRAINT benchmark_metric_targets_target_numeric_check CHECK (target_numeric > CAST(0 AS numeric));
-- snapshot source line 4456: AlterTableStmt
ALTER TABLE zaltyko.benchmark_profiles ADD CONSTRAINT benchmark_profiles_currency_check CHECK (currency IS NULL OR currency ~ CAST('^[A-Z]{3}$' AS text));
-- snapshot source line 4457: AlterTableStmt
ALTER TABLE zaltyko.benchmark_profiles ADD CONSTRAINT benchmark_profiles_dates_valid CHECK (effective_to IS NULL OR effective_to >= effective_from);
-- snapshot source line 4458: AlterTableStmt
ALTER TABLE zaltyko.benchmark_profiles ADD CONSTRAINT benchmark_profiles_discipline_scope_check CHECK (btrim(discipline_scope) <> CAST('' AS text));
-- snapshot source line 4459: AlterTableStmt
ALTER TABLE zaltyko.benchmark_profiles ADD CONSTRAINT benchmark_profiles_key_check CHECK (btrim(key) <> CAST('' AS text));
-- snapshot source line 4460: AlterTableStmt
ALTER TABLE zaltyko.benchmark_profiles ADD CONSTRAINT benchmark_profiles_market_check CHECK (btrim(market) <> CAST('' AS text));
-- snapshot source line 4461: AlterTableStmt
ALTER TABLE zaltyko.benchmark_profiles ADD CONSTRAINT benchmark_profiles_name_check CHECK (btrim(name) <> CAST('' AS text));
-- snapshot source line 4462: AlterTableStmt
ALTER TABLE zaltyko.benchmark_profiles ADD CONSTRAINT benchmark_profiles_organization_type_check CHECK (btrim(organization_type) <> CAST('' AS text));
-- snapshot source line 4463: AlterTableStmt
ALTER TABLE zaltyko.benchmark_profiles ADD CONSTRAINT benchmark_profiles_source_title_check CHECK (btrim(source_title) <> CAST('' AS text));
-- snapshot source line 4464: AlterTableStmt
ALTER TABLE zaltyko.benchmark_profiles ADD CONSTRAINT benchmark_profiles_version_check CHECK (version > 0);
-- snapshot source line 4465: AlterTableStmt
ALTER TABLE zaltyko.charges ADD CONSTRAINT charges_amount_cents_check CHECK (amount_cents > 0);
-- snapshot source line 4466: AlterTableStmt
ALTER TABLE zaltyko.charges ADD CONSTRAINT charges_currency_check CHECK (currency ~ CAST('^[A-Z]{3}$' AS text));
-- snapshot source line 4467: AlterTableStmt
ALTER TABLE zaltyko.charges ADD CONSTRAINT charges_idempotency_key_check CHECK (btrim(idempotency_key) <> CAST('' AS text));
-- snapshot source line 4468: AlterTableStmt
ALTER TABLE zaltyko.charges ADD CONSTRAINT charges_period_valid CHECK (service_period_end >= service_period_start);
-- snapshot source line 4469: AlterTableStmt
ALTER TABLE zaltyko.charges ADD CONSTRAINT charges_version_check CHECK (version > 0);
-- snapshot source line 4470: AlterTableStmt
ALTER TABLE zaltyko.class_template_weekdays ADD CONSTRAINT class_template_weekdays_iso_weekday_check CHECK (iso_weekday >= 1 AND iso_weekday <= 7);
-- snapshot source line 4471: AlterTableStmt
ALTER TABLE zaltyko.class_template_weekdays ADD CONSTRAINT class_template_weekdays_time_valid CHECK (ends_at_local > starts_at_local);
-- snapshot source line 4472: AlterTableStmt
ALTER TABLE zaltyko.class_templates ADD CONSTRAINT class_templates_capacity_check CHECK (capacity > 0);
-- snapshot source line 4473: AlterTableStmt
ALTER TABLE zaltyko.class_templates ADD CONSTRAINT class_templates_dates_valid CHECK (effective_to IS NULL OR effective_to >= effective_from);
-- snapshot source line 4474: AlterTableStmt
ALTER TABLE zaltyko.class_templates ADD CONSTRAINT class_templates_name_check CHECK (btrim(name) <> CAST('' AS text));
-- snapshot source line 4475: AlterTableStmt
ALTER TABLE zaltyko.data_quality_issues ADD CONSTRAINT data_quality_issues_evidence_check CHECK (jsonb_typeof(evidence) = CAST('object' AS text));
-- snapshot source line 4476: AlterTableStmt
ALTER TABLE zaltyko.data_quality_issues ADD CONSTRAINT data_quality_issues_issue_code_check CHECK (btrim(issue_code) <> CAST('' AS text));
-- snapshot source line 4477: AlterTableStmt
ALTER TABLE zaltyko.data_quality_issues ADD CONSTRAINT data_quality_issues_severity_check CHECK (severity = ANY(ARRAY[CAST('info' AS text), CAST('warning' AS text), CAST('error' AS text)]));
-- snapshot source line 4478: AlterTableStmt
ALTER TABLE zaltyko.enrollment_pauses ADD CONSTRAINT enrollment_pauses_dates_valid CHECK (ends_on IS NULL OR ends_on >= starts_on);
-- snapshot source line 4479: AlterTableStmt
ALTER TABLE zaltyko.enrollment_price_assignments ADD CONSTRAINT enrollment_price_assignments_currency_check CHECK (currency ~ CAST('^[A-Z]{3}$' AS text));
-- snapshot source line 4480: AlterTableStmt
ALTER TABLE zaltyko.enrollment_price_assignments ADD CONSTRAINT enrollment_price_assignments_dates_valid CHECK (ends_on IS NULL OR ends_on >= starts_on);
-- snapshot source line 4481: AlterTableStmt
ALTER TABLE zaltyko.enrollment_price_assignments ADD CONSTRAINT enrollment_price_assignments_unit_amount_cents_check CHECK (unit_amount_cents >= 0);
-- snapshot source line 4482: AlterTableStmt
ALTER TABLE zaltyko.enrollments ADD CONSTRAINT enrollments_dates_valid CHECK (ends_on IS NULL OR ends_on >= starts_on);
-- snapshot source line 4483: AlterTableStmt
ALTER TABLE zaltyko.enrollments ADD CONSTRAINT enrollments_version_check CHECK (version > 0);
-- snapshot source line 4484: AlterTableStmt
ALTER TABLE zaltyko.facilities ADD CONSTRAINT facilities_name_check CHECK (btrim(name) <> CAST('' AS text));
-- snapshot source line 4485: AlterTableStmt
ALTER TABLE zaltyko.family_collection_preferences ADD CONSTRAINT family_collection_preferences_entitlement_revision_positive CHECK (entitlement_revision IS NULL OR entitlement_revision > 0);
-- snapshot source line 4486: AlterTableStmt
ALTER TABLE zaltyko.family_collection_preferences ADD CONSTRAINT family_collection_preferences_version_check CHECK (version > 0);
-- snapshot source line 4487: AlterTableStmt
ALTER TABLE zaltyko.family_members ADD CONSTRAINT family_members_dates_valid CHECK (ends_on IS NULL OR ends_on >= starts_on);
-- snapshot source line 4488: AlterTableStmt
ALTER TABLE zaltyko.family_payers ADD CONSTRAINT family_payers_dates_valid CHECK (ends_on IS NULL OR ends_on >= starts_on);
-- snapshot source line 4489: AlterTableStmt
ALTER TABLE zaltyko.family_payment_authorizations ADD CONSTRAINT family_payment_authorizations_active_consent_valid CHECK (status <> CAST('active' AS zaltyko.payment_authorization_status) OR (consent_version IS NOT NULL AND btrim(consent_version) <> CAST('' AS text) AND consent_evidence_reference IS NOT NULL AND consent_evidence_sha256 IS NOT NULL AND consented_at IS NOT NULL AND consented_by_guardian_id IS NOT NULL AND (valid_until IS NULL OR valid_until > consented_at) AND revoked_at IS NULL));
-- snapshot source line 4490: AlterTableStmt
ALTER TABLE zaltyko.family_payment_authorizations ADD CONSTRAINT family_payment_authorizations_consent_evidence_reference_check CHECK (consent_evidence_reference IS NULL OR btrim(consent_evidence_reference) <> CAST('' AS text));
-- snapshot source line 4491: AlterTableStmt
ALTER TABLE zaltyko.family_payment_authorizations ADD CONSTRAINT family_payment_authorizations_consent_evidence_sha256_check CHECK (consent_evidence_sha256 IS NULL OR consent_evidence_sha256 ~ CAST('^[a-f0-9]{64}$' AS text));
-- snapshot source line 4492: AlterTableStmt
ALTER TABLE zaltyko.family_payment_authorizations ADD CONSTRAINT family_payment_authorizations_mandate_reference_check CHECK (mandate_reference IS NULL OR btrim(mandate_reference) <> CAST('' AS text));
-- snapshot source line 4493: AlterTableStmt
ALTER TABLE zaltyko.family_payment_authorizations ADD CONSTRAINT family_payment_authorizations_payment_method_reference_check CHECK (btrim(payment_method_reference) <> CAST('' AS text));
-- snapshot source line 4494: AlterTableStmt
ALTER TABLE zaltyko.family_payment_authorizations ADD CONSTRAINT family_payment_authorizations_provider_setup_reference_check CHECK (btrim(provider_setup_reference) <> CAST('' AS text));
-- snapshot source line 4495: AlterTableStmt
ALTER TABLE zaltyko.family_payment_authorizations ADD CONSTRAINT family_payment_authorizations_revocation_valid CHECK ((status = CAST('revoked' AS zaltyko.payment_authorization_status) AND revoked_at IS NOT NULL) OR (status <> CAST('revoked' AS zaltyko.payment_authorization_status) AND revoked_at IS NULL));
-- snapshot source line 4496: AlterTableStmt
ALTER TABLE zaltyko.financial_reconciliation_runs ADD CONSTRAINT financial_reconciliation_amounts_valid CHECK (expected_cents >= 0 AND allocated_cents >= 0 AND refunded_cents >= 0 AND allocated_cents <= expected_cents AND refunded_cents <= allocated_cents AND net_collected_cents = (allocated_cents - refunded_cents) AND outstanding_cents = (expected_cents - allocated_cents));
-- snapshot source line 4497: AlterTableStmt
ALTER TABLE zaltyko.financial_reconciliation_runs ADD CONSTRAINT financial_reconciliation_period_valid CHECK (period_end >= period_start);
-- snapshot source line 4498: AlterTableStmt
ALTER TABLE zaltyko.financial_reconciliation_runs ADD CONSTRAINT financial_reconciliation_runs_currency_check CHECK (currency ~ CAST('^[A-Z]{3}$' AS text));
-- snapshot source line 4499: AlterTableStmt
ALTER TABLE zaltyko.financial_reconciliation_runs ADD CONSTRAINT financial_reconciliation_runs_formula_version_check CHECK (formula_version > 0);
-- snapshot source line 4500: AlterTableStmt
ALTER TABLE zaltyko.financial_reconciliation_runs ADD CONSTRAINT financial_reconciliation_runs_idempotency_key_check CHECK (btrim(idempotency_key) <> CAST('' AS text));
-- snapshot source line 4501: AlterTableStmt
ALTER TABLE zaltyko.group_membership_history ADD CONSTRAINT group_membership_history_idempotency_not_blank CHECK (btrim(idempotency_key) <> CAST('' AS text));
-- snapshot source line 4502: AlterTableStmt
ALTER TABLE zaltyko.group_membership_history ADD CONSTRAINT group_membership_history_reason_code_valid CHECK (reason_code IS NULL OR reason_code = ANY(ARRAY[CAST('academy_request' AS text), CAST('family_request' AS text), CAST('athlete_request' AS text), CAST('schedule_change' AS text), CAST('temporary_pause' AS text), CAST('other' AS text)]));
-- snapshot source line 4503: AlterTableStmt
ALTER TABLE zaltyko.group_memberships ADD CONSTRAINT group_memberships_dates_valid CHECK (ends_on IS NULL OR ends_on >= starts_on);
-- snapshot source line 4504: AlterTableStmt
ALTER TABLE zaltyko.groups ADD CONSTRAINT groups_capacity_check CHECK (capacity IS NULL OR capacity > 0);
-- snapshot source line 4505: AlterTableStmt
ALTER TABLE zaltyko.groups ADD CONSTRAINT groups_name_check CHECK (btrim(name) <> CAST('' AS text));
-- snapshot source line 4506: AlterTableStmt
ALTER TABLE zaltyko.guardian_contacts ADD CONSTRAINT guardian_contacts_normalized_value_check CHECK (btrim(normalized_value) <> CAST('' AS text));
-- snapshot source line 4507: AlterTableStmt
ALTER TABLE zaltyko.guardian_contacts ADD CONSTRAINT guardian_contacts_value_check CHECK (btrim(value) <> CAST('' AS text));
-- snapshot source line 4508: AlterTableStmt
ALTER TABLE zaltyko.health_score_dimension_snapshots ADD CONSTRAINT health_score_dimension_score_valid CHECK (score IS NULL OR (score >= CAST(0 AS numeric) AND score <= CAST(100 AS numeric)));
-- snapshot source line 4509: AlterTableStmt
ALTER TABLE zaltyko.health_score_dimension_snapshots ADD CONSTRAINT health_score_dimension_snapshots_available_metric_weight_check CHECK (available_metric_weight >= CAST(0 AS numeric) AND available_metric_weight <= CAST(1 AS numeric));
-- snapshot source line 4510: AlterTableStmt
ALTER TABLE zaltyko.health_score_dimension_snapshots ADD CONSTRAINT health_score_dimension_snapshots_configured_metric_weight_check CHECK (configured_metric_weight >= CAST(0 AS numeric) AND configured_metric_weight <= CAST(1 AS numeric));
-- snapshot source line 4511: AlterTableStmt
ALTER TABLE zaltyko.health_score_dimension_snapshots ADD CONSTRAINT health_score_dimension_snapshots_coverage_check CHECK (coverage >= CAST(0 AS numeric) AND coverage <= CAST(1 AS numeric));
-- snapshot source line 4512: AlterTableStmt
ALTER TABLE zaltyko.health_score_dimension_snapshots ADD CONSTRAINT health_score_dimension_snapshots_explanation_check CHECK (jsonb_typeof(explanation) = CAST('object' AS text));
-- snapshot source line 4513: AlterTableStmt
ALTER TABLE zaltyko.health_score_dimension_snapshots ADD CONSTRAINT health_score_dimension_status_value_valid CHECK ((status = CAST('insufficient_data' AS zaltyko.health_score_status) AND score IS NULL) OR (status <> CAST('insufficient_data' AS zaltyko.health_score_status) AND score IS NOT NULL));
-- snapshot source line 4514: AlterTableStmt
ALTER TABLE zaltyko.health_score_dimension_weights ADD CONSTRAINT health_score_dimension_weights_weight_check CHECK (weight > CAST(0 AS numeric) AND weight <= CAST(1 AS numeric));
-- snapshot source line 4515: AlterTableStmt
ALTER TABLE zaltyko.health_score_metric_contributions ADD CONSTRAINT health_score_metric_contributions_effective_weight_check CHECK (effective_weight >= CAST(0 AS numeric));
-- snapshot source line 4516: AlterTableStmt
ALTER TABLE zaltyko.health_score_metric_contributions ADD CONSTRAINT health_score_metric_contributions_explanation_check CHECK (jsonb_typeof(explanation) = CAST('object' AS text));
-- snapshot source line 4517: AlterTableStmt
ALTER TABLE zaltyko.health_score_metric_contributions ADD CONSTRAINT health_score_metric_contributions_metric_coverage_check CHECK (metric_coverage >= CAST(0 AS numeric) AND metric_coverage <= CAST(1 AS numeric));
-- snapshot source line 4518: AlterTableStmt
ALTER TABLE zaltyko.health_score_metric_contributions ADD CONSTRAINT health_score_metric_contributions_metric_weight_check CHECK (metric_weight > CAST(0 AS numeric) AND metric_weight <= CAST(1 AS numeric));
-- snapshot source line 4519: AlterTableStmt
ALTER TABLE zaltyko.health_score_metric_contributions ADD CONSTRAINT health_score_metric_contributions_score_valid CHECK (normalized_score IS NULL OR (normalized_score >= CAST(0 AS numeric) AND normalized_score <= CAST(100 AS numeric)));
-- snapshot source line 4520: AlterTableStmt
ALTER TABLE zaltyko.health_score_metric_weights ADD CONSTRAINT health_score_metric_weights_weight_check CHECK (weight > CAST(0 AS numeric) AND weight <= CAST(1 AS numeric));
-- snapshot source line 4521: AlterTableStmt
ALTER TABLE zaltyko.health_score_snapshots ADD CONSTRAINT health_score_snapshots_coverage_check CHECK (coverage >= CAST(0 AS numeric) AND coverage <= CAST(1 AS numeric));
-- snapshot source line 4522: AlterTableStmt
ALTER TABLE zaltyko.health_score_snapshots ADD CONSTRAINT health_score_snapshots_explanation_check CHECK (jsonb_typeof(explanation) = CAST('object' AS text));
-- snapshot source line 4523: AlterTableStmt
ALTER TABLE zaltyko.health_score_snapshots ADD CONSTRAINT health_score_snapshots_idempotency_key_check CHECK (btrim(idempotency_key) <> CAST('' AS text));
-- snapshot source line 4524: AlterTableStmt
ALTER TABLE zaltyko.health_score_snapshots ADD CONSTRAINT health_score_snapshots_period_valid CHECK (period_end >= period_start);
-- snapshot source line 4525: AlterTableStmt
ALTER TABLE zaltyko.health_score_snapshots ADD CONSTRAINT health_score_snapshots_score_valid CHECK (score IS NULL OR (score >= CAST(0 AS numeric) AND score <= CAST(100 AS numeric)));
-- snapshot source line 4526: AlterTableStmt
ALTER TABLE zaltyko.health_score_snapshots ADD CONSTRAINT health_score_snapshots_status_value_valid CHECK ((status = CAST('insufficient_data' AS zaltyko.health_score_status) AND score IS NULL) OR (status <> CAST('insufficient_data' AS zaltyko.health_score_status) AND score IS NOT NULL));
-- snapshot source line 4527: AlterTableStmt
ALTER TABLE zaltyko.health_score_versions ADD CONSTRAINT health_score_versions_key_check CHECK (btrim(key) <> CAST('' AS text));
-- snapshot source line 4528: AlterTableStmt
ALTER TABLE zaltyko.health_score_versions ADD CONSTRAINT health_score_versions_min_dimension_available_weight_check CHECK (min_dimension_available_weight >= CAST(0 AS numeric) AND min_dimension_available_weight <= CAST(1 AS numeric));
-- snapshot source line 4529: AlterTableStmt
ALTER TABLE zaltyko.health_score_versions ADD CONSTRAINT health_score_versions_min_global_coverage_check CHECK (min_global_coverage >= CAST(0 AS numeric) AND min_global_coverage <= CAST(1 AS numeric));
-- snapshot source line 4530: AlterTableStmt
ALTER TABLE zaltyko.health_score_versions ADD CONSTRAINT health_score_versions_min_valid_dimensions_check CHECK (min_valid_dimensions >= 1 AND min_valid_dimensions <= 4);
-- snapshot source line 4531: AlterTableStmt
ALTER TABLE zaltyko.health_score_versions ADD CONSTRAINT health_score_versions_name_check CHECK (btrim(name) <> CAST('' AS text));
-- snapshot source line 4532: AlterTableStmt
ALTER TABLE zaltyko.health_score_versions ADD CONSTRAINT health_score_versions_version_check CHECK (version > 0);
-- snapshot source line 4533: AlterTableStmt
ALTER TABLE zaltyko.insight_actions ADD CONSTRAINT insight_actions_action_key_check CHECK (btrim(action_key) <> CAST('' AS text));
-- snapshot source line 4534: AlterTableStmt
ALTER TABLE zaltyko.insight_actions ADD CONSTRAINT insight_actions_after_value_check CHECK (after_value IS NULL OR jsonb_typeof(after_value) = CAST('object' AS text));
-- snapshot source line 4535: AlterTableStmt
ALTER TABLE zaltyko.insight_actions ADD CONSTRAINT insight_actions_before_value_check CHECK (jsonb_typeof(before_value) = CAST('object' AS text));
-- snapshot source line 4536: AlterTableStmt
ALTER TABLE zaltyko.insight_actions ADD CONSTRAINT insight_actions_idempotency_key_check CHECK (btrim(idempotency_key) <> CAST('' AS text));
-- snapshot source line 4537: AlterTableStmt
ALTER TABLE zaltyko.insight_actions ADD CONSTRAINT insight_actions_target_entity_type_check CHECK (btrim(target_entity_type) <> CAST('' AS text));
-- snapshot source line 4538: AlterTableStmt
ALTER TABLE zaltyko.insight_notifications ADD CONSTRAINT insight_notifications_delivery_window_key_check CHECK (btrim(delivery_window_key) <> CAST('' AS text));
-- snapshot source line 4539: AlterTableStmt
ALTER TABLE zaltyko.insight_rule_runs ADD CONSTRAINT insight_rule_runs_candidate_count_check CHECK (candidate_count >= 0);
-- snapshot source line 4540: AlterTableStmt
ALTER TABLE zaltyko.insight_rule_runs ADD CONSTRAINT insight_rule_runs_idempotency_key_check CHECK (btrim(idempotency_key) <> CAST('' AS text));
-- snapshot source line 4541: AlterTableStmt
ALTER TABLE zaltyko.insight_rule_runs ADD CONSTRAINT insight_rule_runs_result_check CHECK (jsonb_typeof(result) = CAST('object' AS text));
-- snapshot source line 4542: AlterTableStmt
ALTER TABLE zaltyko.insight_rule_versions ADD CONSTRAINT insight_rule_versions_config_check CHECK (jsonb_typeof(config) = CAST('object' AS text));
-- snapshot source line 4543: AlterTableStmt
ALTER TABLE zaltyko.insight_rule_versions ADD CONSTRAINT insight_rule_versions_cooldown_hours_check CHECK (cooldown_hours >= 1 AND cooldown_hours <= 8760);
-- snapshot source line 4544: AlterTableStmt
ALTER TABLE zaltyko.insight_rule_versions ADD CONSTRAINT insight_rule_versions_default_cta_key_check CHECK (btrim(default_cta_key) <> CAST('' AS text));
-- snapshot source line 4545: AlterTableStmt
ALTER TABLE zaltyko.insight_rule_versions ADD CONSTRAINT insight_rule_versions_key_check CHECK (key ~ CAST('^[a-z][a-z0-9_]+$' AS text));
-- snapshot source line 4546: AlterTableStmt
ALTER TABLE zaltyko.insight_rule_versions ADD CONSTRAINT insight_rule_versions_name_check CHECK (btrim(name) <> CAST('' AS text));
-- snapshot source line 4547: AlterTableStmt
ALTER TABLE zaltyko.insight_rule_versions ADD CONSTRAINT insight_rule_versions_version_check CHECK (version > 0);
-- snapshot source line 4548: AlterTableStmt
ALTER TABLE zaltyko.insight_status_history ADD CONSTRAINT insight_status_history_metadata_check CHECK (jsonb_typeof(metadata) = CAST('object' AS text));
-- snapshot source line 4549: AlterTableStmt
ALTER TABLE zaltyko.insight_status_history ADD CONSTRAINT insight_status_history_reason_code_check CHECK (btrim(reason_code) <> CAST('' AS text));
-- snapshot source line 4550: AlterTableStmt
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_actionability_score_check CHECK (actionability_score >= CAST(0 AS numeric) AND actionability_score <= CAST(100 AS numeric));
-- snapshot source line 4551: AlterTableStmt
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_assumptions_check CHECK (jsonb_typeof(assumptions) = CAST('array' AS text));
-- snapshot source line 4552: AlterTableStmt
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_confidence_score_check CHECK (confidence_score >= CAST(0 AS numeric) AND confidence_score <= CAST(100 AS numeric));
-- snapshot source line 4553: AlterTableStmt
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_cta_key_check CHECK (btrim(cta_key) <> CAST('' AS text));
-- snapshot source line 4554: AlterTableStmt
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_cta_payload_check CHECK (jsonb_typeof(cta_payload) = CAST('object' AS text));
-- snapshot source line 4555: AlterTableStmt
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_detail_check CHECK (btrim(detail) <> CAST('' AS text));
-- snapshot source line 4556: AlterTableStmt
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_entity_type_check CHECK (btrim(entity_type) <> CAST('' AS text));
-- snapshot source line 4557: AlterTableStmt
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_estimate_currency_valid CHECK ((estimated_value_min_minor IS NULL AND estimated_value_max_minor IS NULL) OR estimate_currency ~ CAST('^[A-Z]{3}$' AS text));
-- snapshot source line 4558: AlterTableStmt
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_estimate_range_valid CHECK (estimated_value_min_minor IS NULL OR estimated_value_max_minor IS NULL OR estimated_value_max_minor >= estimated_value_min_minor);
-- snapshot source line 4559: AlterTableStmt
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_evidence_check CHECK (jsonb_typeof(evidence) = CAST('object' AS text));
-- snapshot source line 4560: AlterTableStmt
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_impact_score_check CHECK (impact_score >= CAST(0 AS numeric) AND impact_score <= CAST(100 AS numeric));
-- snapshot source line 4561: AlterTableStmt
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_occurrence_check CHECK (occurrence > 0);
-- snapshot source line 4562: AlterTableStmt
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_priority_score_check CHECK (priority_score >= CAST(0 AS numeric) AND priority_score <= CAST(100 AS numeric));
-- snapshot source line 4563: AlterTableStmt
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_series_key_check CHECK (btrim(series_key) <> CAST('' AS text));
-- snapshot source line 4564: AlterTableStmt
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_snooze_valid CHECK (status <> CAST('snoozed' AS zaltyko.insight_status) OR snoozed_until IS NOT NULL);
-- snapshot source line 4565: AlterTableStmt
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_title_check CHECK (btrim(title) <> CAST('' AS text));
-- snapshot source line 4566: AlterTableStmt
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_urgency_score_check CHECK (urgency_score >= CAST(0 AS numeric) AND urgency_score <= CAST(100 AS numeric));
-- snapshot source line 4567: AlterTableStmt
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_version_check CHECK (version > 0);
-- snapshot source line 4568: AlterTableStmt
ALTER TABLE zaltyko.invoice_line_enrollments ADD CONSTRAINT invoice_line_enrollments_class_name_not_blank CHECK (char_length(btrim(class_name_snapshot)) >= 2 AND char_length(btrim(class_name_snapshot)) <= 120);
-- snapshot source line 4569: AlterTableStmt
ALTER TABLE zaltyko.invoice_lines ADD CONSTRAINT invoice_lines_amount_cents_check CHECK (amount_cents >= 0);
-- snapshot source line 4570: AlterTableStmt
ALTER TABLE zaltyko.invoice_lines ADD CONSTRAINT invoice_lines_amount_valid CHECK (amount_cents = (CAST(quantity AS bigint) * unit_amount_cents));
-- snapshot source line 4571: AlterTableStmt
ALTER TABLE zaltyko.invoice_lines ADD CONSTRAINT invoice_lines_athlete_monthly_shape CHECK (athlete_id IS NULL OR (line_type = CAST('monthly_fee' AS text) AND location_id IS NOT NULL AND price_plan_id IS NOT NULL AND enrollment_id IS NULL AND quantity = 1 AND service_period_start = CAST(date_trunc(CAST('month' AS text), CAST(service_period_start AS timestamp with time zone)) AS date) AND service_period_end = CAST(date_trunc(CAST('month' AS text), CAST(service_period_start AS timestamp with time zone)) + CAST('1 mon -1 days' AS interval) AS date)));
-- snapshot source line 4572: AlterTableStmt
ALTER TABLE zaltyko.invoice_lines ADD CONSTRAINT invoice_lines_currency_check CHECK (currency ~ CAST('^[A-Z]{3}$' AS text));
-- snapshot source line 4573: AlterTableStmt
ALTER TABLE zaltyko.invoice_lines ADD CONSTRAINT invoice_lines_line_type_check CHECK (btrim(line_type) <> CAST('' AS text));
-- snapshot source line 4574: AlterTableStmt
ALTER TABLE zaltyko.invoice_lines ADD CONSTRAINT invoice_lines_period_valid CHECK (service_period_end >= service_period_start);
-- snapshot source line 4575: AlterTableStmt
ALTER TABLE zaltyko.invoice_lines ADD CONSTRAINT invoice_lines_quantity_check CHECK (quantity > 0);
-- snapshot source line 4576: AlterTableStmt
ALTER TABLE zaltyko.invoice_lines ADD CONSTRAINT invoice_lines_unit_amount_cents_check CHECK (unit_amount_cents >= 0);
-- snapshot source line 4577: AlterTableStmt
ALTER TABLE zaltyko.invoices ADD CONSTRAINT invoices_currency_check CHECK (currency ~ CAST('^[A-Z]{3}$' AS text));
-- snapshot source line 4578: AlterTableStmt
ALTER TABLE zaltyko.invoices ADD CONSTRAINT invoices_idempotency_key_check CHECK (btrim(idempotency_key) <> CAST('' AS text));
-- snapshot source line 4579: AlterTableStmt
ALTER TABLE zaltyko.invoices ADD CONSTRAINT invoices_reference_check CHECK (btrim(reference) <> CAST('' AS text));
-- snapshot source line 4580: AlterTableStmt
ALTER TABLE zaltyko.invoices ADD CONSTRAINT invoices_total_amount_cents_check CHECK (total_amount_cents >= 0);
-- snapshot source line 4581: AlterTableStmt
ALTER TABLE zaltyko.invoices ADD CONSTRAINT invoices_version_check CHECK (version > 0);
-- snapshot source line 4582: AlterTableStmt
ALTER TABLE zaltyko.locations ADD CONSTRAINT locations_code_check CHECK (code ~ CAST('^[a-z0-9][a-z0-9-]{1,31}$' AS text));
-- snapshot source line 4583: AlterTableStmt
ALTER TABLE zaltyko.locations ADD CONSTRAINT locations_name_check CHECK (btrim(name) <> CAST('' AS text));
-- snapshot source line 4584: AlterTableStmt
ALTER TABLE zaltyko.metric_definitions ADD CONSTRAINT metric_definitions_description_check CHECK (btrim(description) <> CAST('' AS text));
-- snapshot source line 4585: AlterTableStmt
ALTER TABLE zaltyko.metric_definitions ADD CONSTRAINT metric_definitions_formula_check CHECK (btrim(formula) <> CAST('' AS text));
-- snapshot source line 4586: AlterTableStmt
ALTER TABLE zaltyko.metric_definitions ADD CONSTRAINT metric_definitions_formula_version_check CHECK (formula_version > 0);
-- snapshot source line 4587: AlterTableStmt
ALTER TABLE zaltyko.metric_definitions ADD CONSTRAINT metric_definitions_key_check CHECK (key ~ CAST('^[a-z][a-z0-9_]+$' AS text));
-- snapshot source line 4588: AlterTableStmt
ALTER TABLE zaltyko.metric_definitions ADD CONSTRAINT metric_definitions_name_check CHECK (btrim(name) <> CAST('' AS text));
-- snapshot source line 4589: AlterTableStmt
ALTER TABLE zaltyko.metric_definitions ADD CONSTRAINT metric_definitions_owner_check CHECK (btrim(owner) <> CAST('' AS text));
-- snapshot source line 4590: AlterTableStmt
ALTER TABLE zaltyko.metric_event_consumptions ADD CONSTRAINT metric_event_consumptions_handler_key_check CHECK (btrim(handler_key) <> CAST('' AS text));
-- snapshot source line 4591: AlterTableStmt
ALTER TABLE zaltyko.metric_event_consumptions ADD CONSTRAINT metric_event_consumptions_handler_version_check CHECK (handler_version > 0);
-- snapshot source line 4592: AlterTableStmt
ALTER TABLE zaltyko.metric_invalidations ADD CONSTRAINT metric_invalidations_handler_key_check CHECK (btrim(handler_key) <> CAST('' AS text));
-- snapshot source line 4593: AlterTableStmt
ALTER TABLE zaltyko.metric_invalidations ADD CONSTRAINT metric_invalidations_handler_version_check CHECK (handler_version > 0);
-- snapshot source line 4594: AlterTableStmt
ALTER TABLE zaltyko.metric_invalidations ADD CONSTRAINT metric_invalidations_period_valid CHECK (affected_to >= affected_from);
-- snapshot source line 4595: AlterTableStmt
ALTER TABLE zaltyko.metric_invalidations ADD CONSTRAINT metric_invalidations_reason_event_name_check CHECK (btrim(reason_event_name) <> CAST('' AS text));
-- snapshot source line 4596: AlterTableStmt
ALTER TABLE zaltyko.metric_invalidations ADD CONSTRAINT metric_invalidations_status_check CHECK (status = ANY(ARRAY[CAST('pending' AS text), CAST('processed' AS text)]));
-- snapshot source line 4597: AlterTableStmt
ALTER TABLE zaltyko.metric_run_values ADD CONSTRAINT metric_run_values_coverage_valid CHECK (coverage >= CAST(0 AS numeric) AND coverage <= CAST(1 AS numeric));
-- snapshot source line 4598: AlterTableStmt
ALTER TABLE zaltyko.metric_run_values ADD CONSTRAINT metric_run_values_currency_check CHECK (currency IS NULL OR currency ~ CAST('^[A-Z]{3}$' AS text));
-- snapshot source line 4599: AlterTableStmt
ALTER TABLE zaltyko.metric_run_values ADD CONSTRAINT metric_run_values_diagnostics_check CHECK (jsonb_typeof(diagnostics) = CAST('object' AS text));
-- snapshot source line 4600: AlterTableStmt
ALTER TABLE zaltyko.metric_run_values ADD CONSTRAINT metric_run_values_dimensions_check CHECK (jsonb_typeof(dimensions) = CAST('object' AS text));
-- snapshot source line 4601: AlterTableStmt
ALTER TABLE zaltyko.metric_run_values ADD CONSTRAINT metric_run_values_dimensions_sha256_check CHECK (dimensions_sha256 ~ CAST('^[a-f0-9]{64}$' AS text));
-- snapshot source line 4602: AlterTableStmt
ALTER TABLE zaltyko.metric_run_values ADD CONSTRAINT metric_run_values_formula_version_check CHECK (formula_version > 0);
-- snapshot source line 4603: AlterTableStmt
ALTER TABLE zaltyko.metric_run_values ADD CONSTRAINT metric_run_values_period_valid CHECK (period_end >= period_start);
-- snapshot source line 4604: AlterTableStmt
ALTER TABLE zaltyko.metric_run_values ADD CONSTRAINT metric_run_values_value_quality_valid CHECK ((quality = ANY(ARRAY[CAST('insufficient' AS zaltyko.metric_quality), CAST('invalid' AS zaltyko.metric_quality)]) AND value_numeric IS NULL) OR (quality = ANY(ARRAY[CAST('complete' AS zaltyko.metric_quality), CAST('partial' AS zaltyko.metric_quality), CAST('stale' AS zaltyko.metric_quality)]) AND value_numeric IS NOT NULL));
-- snapshot source line 4605: AlterTableStmt
ALTER TABLE zaltyko.metric_runs ADD CONSTRAINT metric_runs_currency_check CHECK (currency ~ CAST('^[A-Z]{3}$' AS text));
-- snapshot source line 4606: AlterTableStmt
ALTER TABLE zaltyko.metric_runs ADD CONSTRAINT metric_runs_formula_set_version_check CHECK (btrim(formula_set_version) <> CAST('' AS text));
-- snapshot source line 4607: AlterTableStmt
ALTER TABLE zaltyko.metric_runs ADD CONSTRAINT metric_runs_idempotency_key_check CHECK (btrim(idempotency_key) <> CAST('' AS text));
-- snapshot source line 4608: AlterTableStmt
ALTER TABLE zaltyko.metric_runs ADD CONSTRAINT metric_runs_parameters_check CHECK (jsonb_typeof(parameters) = CAST('object' AS text));
-- snapshot source line 4609: AlterTableStmt
ALTER TABLE zaltyko.metric_runs ADD CONSTRAINT metric_runs_period_valid CHECK (period_end >= period_start);
-- snapshot source line 4610: AlterTableStmt
ALTER TABLE zaltyko.metric_values ADD CONSTRAINT metric_values_coverage_valid CHECK (coverage >= CAST(0 AS numeric) AND coverage <= CAST(1 AS numeric));
-- snapshot source line 4611: AlterTableStmt
ALTER TABLE zaltyko.metric_values ADD CONSTRAINT metric_values_currency_check CHECK (currency IS NULL OR currency ~ CAST('^[A-Z]{3}$' AS text));
-- snapshot source line 4612: AlterTableStmt
ALTER TABLE zaltyko.metric_values ADD CONSTRAINT metric_values_diagnostics_check CHECK (jsonb_typeof(diagnostics) = CAST('object' AS text));
-- snapshot source line 4613: AlterTableStmt
ALTER TABLE zaltyko.metric_values ADD CONSTRAINT metric_values_dimensions_check CHECK (jsonb_typeof(dimensions) = CAST('object' AS text));
-- snapshot source line 4614: AlterTableStmt
ALTER TABLE zaltyko.metric_values ADD CONSTRAINT metric_values_dimensions_sha256_check CHECK (dimensions_sha256 ~ CAST('^[a-f0-9]{64}$' AS text));
-- snapshot source line 4615: AlterTableStmt
ALTER TABLE zaltyko.metric_values ADD CONSTRAINT metric_values_formula_version_check CHECK (formula_version > 0);
-- snapshot source line 4616: AlterTableStmt
ALTER TABLE zaltyko.metric_values ADD CONSTRAINT metric_values_period_valid CHECK (period_end >= period_start);
-- snapshot source line 4617: AlterTableStmt
ALTER TABLE zaltyko.metric_values ADD CONSTRAINT metric_values_value_quality_valid CHECK ((quality = ANY(ARRAY[CAST('insufficient' AS zaltyko.metric_quality), CAST('invalid' AS zaltyko.metric_quality)]) AND value_numeric IS NULL) OR (quality = ANY(ARRAY[CAST('complete' AS zaltyko.metric_quality), CAST('partial' AS zaltyko.metric_quality), CAST('stale' AS zaltyko.metric_quality)]) AND value_numeric IS NOT NULL));
-- snapshot source line 4618: AlterTableStmt
ALTER TABLE zaltyko.organization_bootstrap_commands ADD CONSTRAINT organization_bootstrap_commands_idempotency_key_check CHECK (length(btrim(idempotency_key)) >= 8 AND length(btrim(idempotency_key)) <= 150);
-- snapshot source line 4619: AlterTableStmt
ALTER TABLE zaltyko.organization_bootstrap_commands ADD CONSTRAINT organization_bootstrap_commands_request_hash_check CHECK (request_hash ~ CAST('^[a-f0-9]{64}$' AS text));
-- snapshot source line 4620: AlterTableStmt
ALTER TABLE zaltyko.organization_entitlement_changes ADD CONSTRAINT organization_entitlement_changes_period_valid CHECK (effective_until IS NULL OR effective_until > effective_from);
-- snapshot source line 4621: AlterTableStmt
ALTER TABLE zaltyko.organization_entitlement_changes ADD CONSTRAINT organization_entitlement_changes_revision_check CHECK (revision > 0);
-- snapshot source line 4622: AlterTableStmt
ALTER TABLE zaltyko.organization_entitlement_changes ADD CONSTRAINT organization_entitlement_changes_source_reference_check CHECK (btrim(source_reference) <> CAST('' AS text));
-- snapshot source line 4623: AlterTableStmt
ALTER TABLE zaltyko.organization_entitlement_changes ADD CONSTRAINT organization_entitlement_changes_source_valid CHECK ((source = CAST('bootstrap' AS zaltyko.entitlement_source) AND plan_code = CAST('free' AS zaltyko.saas_plan_code) AND subscription_id IS NULL AND trial_id IS NULL) OR (source = CAST('stripe_subscription' AS zaltyko.entitlement_source) AND plan_code <> CAST('free' AS zaltyko.saas_plan_code) AND subscription_id IS NOT NULL AND trial_id IS NULL) OR (source = CAST('contract' AS zaltyko.entitlement_source) AND subscription_id IS NULL AND trial_id IS NULL) OR (source = CAST('trial' AS zaltyko.entitlement_source) AND plan_code = CAST('starter' AS zaltyko.saas_plan_code) AND subscription_id IS NULL AND trial_id IS NOT NULL) OR (source = CAST('trial_expired' AS zaltyko.entitlement_source) AND plan_code = CAST('free' AS zaltyko.saas_plan_code) AND subscription_id IS NULL AND trial_id IS NOT NULL));
-- snapshot source line 4624: AlterTableStmt
ALTER TABLE zaltyko.organization_entitlements ADD CONSTRAINT organization_entitlements_period_valid CHECK (effective_until IS NULL OR effective_until > effective_from);
-- snapshot source line 4625: AlterTableStmt
ALTER TABLE zaltyko.organization_entitlements ADD CONSTRAINT organization_entitlements_revision_check CHECK (revision > 0);
-- snapshot source line 4626: AlterTableStmt
ALTER TABLE zaltyko.organization_entitlements ADD CONSTRAINT organization_entitlements_source_reference_check CHECK (btrim(source_reference) <> CAST('' AS text));
-- snapshot source line 4627: AlterTableStmt
ALTER TABLE zaltyko.organization_entitlements ADD CONSTRAINT organization_entitlements_source_valid CHECK ((source = CAST('bootstrap' AS zaltyko.entitlement_source) AND plan_code = CAST('free' AS zaltyko.saas_plan_code) AND subscription_id IS NULL AND trial_id IS NULL) OR (source = CAST('stripe_subscription' AS zaltyko.entitlement_source) AND plan_code <> CAST('free' AS zaltyko.saas_plan_code) AND subscription_id IS NOT NULL AND trial_id IS NULL) OR (source = CAST('contract' AS zaltyko.entitlement_source) AND subscription_id IS NULL AND trial_id IS NULL) OR (source = CAST('trial' AS zaltyko.entitlement_source) AND plan_code = CAST('starter' AS zaltyko.saas_plan_code) AND subscription_id IS NULL AND trial_id IS NOT NULL) OR (source = CAST('trial_expired' AS zaltyko.entitlement_source) AND plan_code = CAST('free' AS zaltyko.saas_plan_code) AND subscription_id IS NULL AND trial_id IS NOT NULL));
-- snapshot source line 4628: AlterTableStmt
ALTER TABLE zaltyko.organization_payment_provider_accounts ADD CONSTRAINT organization_payment_provide_card_payments_capability_sta_check CHECK (btrim(card_payments_capability_status) <> CAST('' AS text));
-- snapshot source line 4629: AlterTableStmt
ALTER TABLE zaltyko.organization_payment_provider_accounts ADD CONSTRAINT organization_payment_provider__provider_account_reference_check CHECK (provider_account_reference ~ CAST('^acct_[A-Za-z0-9]+$' AS text));
-- snapshot source line 4630: AlterTableStmt
ALTER TABLE zaltyko.organization_payment_provider_accounts ADD CONSTRAINT organization_payment_provider_acc_accounts_api_generation_check CHECK (accounts_api_generation = 2);
-- snapshot source line 4631: AlterTableStmt
ALTER TABLE zaltyko.organization_payment_provider_accounts ADD CONSTRAINT organization_payment_provider_accounts_charge_model_check CHECK (charge_model = CAST('direct' AS text));
-- snapshot source line 4632: AlterTableStmt
ALTER TABLE zaltyko.organization_payment_provider_accounts ADD CONSTRAINT organization_payment_provider_accounts_dashboard_access_check CHECK (dashboard_access = CAST('full' AS text));
-- snapshot source line 4633: AlterTableStmt
ALTER TABLE zaltyko.organization_payment_provider_accounts ADD CONSTRAINT organization_payment_provider_accounts_fees_collector_check CHECK (fees_collector = CAST('stripe' AS text));
-- snapshot source line 4634: AlterTableStmt
ALTER TABLE zaltyko.organization_payment_provider_accounts ADD CONSTRAINT organization_payment_provider_accounts_losses_collector_check CHECK (losses_collector = CAST('stripe' AS text));
-- snapshot source line 4635: AlterTableStmt
ALTER TABLE zaltyko.organization_payment_provider_accounts ADD CONSTRAINT organization_payment_provider_accounts_processor_check CHECK (processor = CAST('stripe' AS text));
-- snapshot source line 4636: AlterTableStmt
ALTER TABLE zaltyko.organization_payment_provider_accounts ADD CONSTRAINT organization_payment_provider_accounts_revision_check CHECK (revision > 0);
-- snapshot source line 4637: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_ope_provider_account_reference_check CHECK (btrim(provider_account_reference) <> CAST('' AS text));
-- snapshot source line 4638: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operati_stripe_idempotency_key_check CHECK (btrim(stripe_idempotency_key) <> CAST('' AS text));
-- snapshot source line 4639: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operations_attempts_check CHECK (attempts >= 0);
-- snapshot source line 4640: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operations_completion_valid CHECK ((status = CAST('completed' AS text) AND completed_at IS NOT NULL AND completed_at >= created_at) OR (status <> CAST('completed' AS text) AND completed_at IS NULL));
-- snapshot source line 4641: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operations_fencing_version_check CHECK (fencing_version >= 0);
-- snapshot source line 4642: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operations_idempotency_key_check CHECK (length(btrim(idempotency_key)) >= 8 AND length(btrim(idempotency_key)) <= 150);
-- snapshot source line 4643: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operations_lease_valid CHECK ((status = ANY(ARRAY[CAST('creating_customer' AS text), CAST('creating_session' AS text)]) AND lease_token IS NOT NULL AND lease_until IS NOT NULL) OR (status <> ALL(ARRAY[CAST('creating_customer' AS text), CAST('creating_session' AS text)]) AND lease_token IS NULL AND lease_until IS NULL));
-- snapshot source line 4644: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operations_plan_code_check CHECK (plan_code = ANY(ARRAY[CAST('starter' AS zaltyko.saas_plan_code), CAST('growth' AS zaltyko.saas_plan_code)]));
-- snapshot source line 4645: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operations_request_hash_check CHECK (request_hash ~ CAST('^[a-f0-9]{64}$' AS text));
-- snapshot source line 4646: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operations_session_ref_not_blank CHECK (checkout_session_reference IS NULL OR btrim(checkout_session_reference) <> CAST('' AS text));
-- snapshot source line 4647: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operations_session_ref_pair CHECK ((checkout_session_reference IS NULL) = (session_expires_at IS NULL));
-- snapshot source line 4648: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operations_session_state_valid CHECK ((status = ANY(ARRAY[CAST('open' AS text), CAST('completed' AS text), CAST('expired' AS text)]) AND checkout_session_reference IS NOT NULL AND session_expires_at IS NOT NULL) OR (status = ANY(ARRAY[CAST('requested' AS text), CAST('creating_customer' AS text), CAST('creating_session' AS text), CAST('failed' AS text)]) AND checkout_session_reference IS NULL AND session_expires_at IS NULL) OR status = CAST('recovery_required' AS text));
-- snapshot source line 4649: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operations_status_check CHECK (status = ANY(ARRAY[CAST('requested' AS text), CAST('creating_customer' AS text), CAST('creating_session' AS text), CAST('open' AS text), CAST('completed' AS text), CAST('failed' AS text), CAST('expired' AS text), CAST('recovery_required' AS text)]));
-- snapshot source line 4650: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_customers ADD CONSTRAINT organization_saas_customers_attempts_check CHECK (attempts >= 0);
-- snapshot source line 4651: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_customers ADD CONSTRAINT organization_saas_customers_creation_idempotency_key_check CHECK (btrim(creation_idempotency_key) <> CAST('' AS text));
-- snapshot source line 4652: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_customers ADD CONSTRAINT organization_saas_customers_creation_request_hash_check CHECK (creation_request_hash ~ CAST('^[a-f0-9]{64}$' AS text));
-- snapshot source line 4653: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_customers ADD CONSTRAINT organization_saas_customers_provider_account_reference_check CHECK (btrim(provider_account_reference) <> CAST('' AS text));
-- snapshot source line 4654: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_customers ADD CONSTRAINT organization_saas_customers_provider_check CHECK (provider = CAST('stripe' AS text));
-- snapshot source line 4655: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_customers ADD CONSTRAINT organization_saas_customers_ref_not_blank CHECK (customer_reference IS NULL OR btrim(customer_reference) <> CAST('' AS text));
-- snapshot source line 4656: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_customers ADD CONSTRAINT organization_saas_customers_state_valid CHECK ((status = CAST('creating' AS text) AND customer_reference IS NULL) OR (status = CAST('ready' AS text) AND customer_reference IS NOT NULL) OR status = CAST('recovery_required' AS text));
-- snapshot source line 4657: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_customers ADD CONSTRAINT organization_saas_customers_status_check CHECK (status = ANY(ARRAY[CAST('creating' AS text), CAST('ready' AS text), CAST('recovery_required' AS text)]));
-- snapshot source line 4658: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_subscriptions ADD CONSTRAINT organization_saas_subscription_provider_account_reference_check CHECK (btrim(provider_account_reference) <> CAST('' AS text));
-- snapshot source line 4659: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_subscriptions ADD CONSTRAINT organization_saas_subscriptions_customer_reference_check CHECK (btrim(customer_reference) <> CAST('' AS text));
-- snapshot source line 4660: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_subscriptions ADD CONSTRAINT organization_saas_subscriptions_event_reference_valid CHECK (last_provider_event_reference IS NULL OR btrim(last_provider_event_reference) <> CAST('' AS text));
-- snapshot source line 4661: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_subscriptions ADD CONSTRAINT organization_saas_subscriptions_period_valid CHECK (current_period_ends_at > current_period_started_at);
-- snapshot source line 4662: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_subscriptions ADD CONSTRAINT organization_saas_subscriptions_plan_code_check CHECK (plan_code = ANY(ARRAY[CAST('starter' AS zaltyko.saas_plan_code), CAST('growth' AS zaltyko.saas_plan_code), CAST('network' AS zaltyko.saas_plan_code)]));
-- snapshot source line 4663: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_subscriptions ADD CONSTRAINT organization_saas_subscriptions_price_reference_check CHECK (btrim(price_reference) <> CAST('' AS text));
-- snapshot source line 4664: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_subscriptions ADD CONSTRAINT organization_saas_subscriptions_provider_check CHECK (provider = CAST('stripe' AS text));
-- snapshot source line 4665: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_subscriptions ADD CONSTRAINT organization_saas_subscriptions_provider_status_check CHECK (provider_status = ANY(ARRAY[CAST('incomplete' AS text), CAST('incomplete_expired' AS text), CAST('trialing' AS text), CAST('active' AS text), CAST('past_due' AS text), CAST('canceled' AS text), CAST('unpaid' AS text), CAST('paused' AS text)]));
-- snapshot source line 4666: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_subscriptions ADD CONSTRAINT organization_saas_subscriptions_subscription_reference_check CHECK (btrim(subscription_reference) <> CAST('' AS text));
-- snapshot source line 4667: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_trials ADD CONSTRAINT organization_saas_trials_converted_after_start CHECK (converted_at IS NULL OR converted_at >= started_at);
-- snapshot source line 4668: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_trials ADD CONSTRAINT organization_saas_trials_end_state_valid CHECK ((status = CAST('active' AS zaltyko.organization_saas_trial_status) AND ended_at IS NULL AND converted_at IS NULL) OR (status = CAST('converted' AS zaltyko.organization_saas_trial_status) AND ended_at IS NOT NULL AND converted_at IS NOT NULL) OR (status = ANY(ARRAY[CAST('expired' AS zaltyko.organization_saas_trial_status), CAST('cancelled' AS zaltyko.organization_saas_trial_status)]) AND ended_at IS NOT NULL AND converted_at IS NULL));
-- snapshot source line 4669: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_trials ADD CONSTRAINT organization_saas_trials_ended_after_start CHECK (ended_at IS NULL OR ended_at >= started_at);
-- snapshot source line 4670: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_trials ADD CONSTRAINT organization_saas_trials_idempotency_key_check CHECK (length(btrim(idempotency_key)) >= 8 AND length(btrim(idempotency_key)) <= 150);
-- snapshot source line 4671: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_trials ADD CONSTRAINT organization_saas_trials_periods_valid CHECK (ends_at > started_at AND cooldown_ends_at > started_at);
-- snapshot source line 4672: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_trials ADD CONSTRAINT organization_saas_trials_request_hash_check CHECK (request_hash ~ CAST('^[a-f0-9]{64}$' AS text));
-- snapshot source line 4673: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_trials ADD CONSTRAINT organization_saas_trials_starter_only CHECK (status = ANY(ARRAY[CAST('active' AS zaltyko.organization_saas_trial_status), CAST('expired' AS zaltyko.organization_saas_trial_status), CAST('converted' AS zaltyko.organization_saas_trial_status), CAST('cancelled' AS zaltyko.organization_saas_trial_status)]));
-- snapshot source line 4674: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT organization_saas_webhook_even_provider_account_reference_check CHECK (btrim(provider_account_reference) <> CAST('' AS text));
-- snapshot source line 4675: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT organization_saas_webhook_event_account_not_blank CHECK (event_account_reference IS NULL OR btrim(event_account_reference) <> CAST('' AS text));
-- snapshot source line 4676: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT organization_saas_webhook_event_lease_valid CHECK ((status = CAST('processing' AS text) AND lease_token IS NOT NULL AND lease_until IS NOT NULL AND fencing_version > 0) OR (status <> CAST('processing' AS text) AND lease_token IS NULL AND lease_until IS NULL));
-- snapshot source line 4677: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT organization_saas_webhook_event_mode_valid CHECK ((environment = CAST('live' AS zaltyko.stripe_environment) AND livemode) OR (environment = CAST('test' AS zaltyko.stripe_environment) AND NOT livemode));
-- snapshot source line 4678: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT organization_saas_webhook_event_object_not_blank CHECK (provider_object_reference IS NULL OR btrim(provider_object_reference) <> CAST('' AS text));
-- snapshot source line 4679: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT organization_saas_webhook_event_object_type_not_blank CHECK (provider_object_type IS NULL OR btrim(provider_object_type) <> CAST('' AS text));
-- snapshot source line 4680: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT organization_saas_webhook_event_processed_valid CHECK ((status = ANY(ARRAY[CAST('processed' AS text), CAST('ignored' AS text)]) AND processed_at IS NOT NULL) OR (status <> ALL(ARRAY[CAST('processed' AS text), CAST('ignored' AS text)]) AND processed_at IS NULL));
-- snapshot source line 4681: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT organization_saas_webhook_events_attempts_check CHECK (attempts >= 0);
-- snapshot source line 4682: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT organization_saas_webhook_events_event_type_check CHECK (btrim(event_type) <> CAST('' AS text));
-- snapshot source line 4683: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT organization_saas_webhook_events_fencing_version_check CHECK (fencing_version >= 0);
-- snapshot source line 4684: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT organization_saas_webhook_events_payload_sha256_check CHECK (payload_sha256 ~ CAST('^[a-f0-9]{64}$' AS text));
-- snapshot source line 4685: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT organization_saas_webhook_events_provider_check CHECK (provider = CAST('stripe' AS text));
-- snapshot source line 4686: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT organization_saas_webhook_events_provider_event_id_check CHECK (btrim(provider_event_id) <> CAST('' AS text));
-- snapshot source line 4687: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT organization_saas_webhook_events_signature_verified_check CHECK (signature_verified);
-- snapshot source line 4688: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT organization_saas_webhook_events_status_check CHECK (status = ANY(ARRAY[CAST('received' AS text), CAST('processing' AS text), CAST('processed' AS text), CAST('failed' AS text), CAST('quarantined' AS text), CAST('ignored' AS text)]));
-- snapshot source line 4689: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT saas_webhook_event_reconciliation_org_check CHECK (reconciliation_decision_id IS NULL OR organization_id IS NOT NULL);
-- snapshot source line 4690: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT saas_webhook_reconciliation_retry_requires_decision CHECK (reconciliation_next_attempt_at IS NULL OR (reconciliation_decision_id IS NOT NULL AND status = ANY(ARRAY[CAST('received' AS text), CAST('failed' AS text)])));
-- snapshot source line 4691: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_payload_conflicts ADD CONSTRAINT organization_saas_webhook_payload_conflict_times_valid CHECK (last_seen_at >= first_seen_at);
-- snapshot source line 4692: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_payload_conflicts ADD CONSTRAINT organization_saas_webhook_payload_conflicts_occurrences_check CHECK (occurrences > 0);
-- snapshot source line 4693: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_payload_conflicts ADD CONSTRAINT organization_saas_webhook_payload_observed_payload_sha256_check CHECK (observed_payload_sha256 ~ CAST('^[a-f0-9]{64}$' AS text));
-- snapshot source line 4694: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_re_expected_entitlement_revisio_check CHECK (expected_entitlement_revision > 0);
-- snapshot source line 4695: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_re_expected_entitlement_source__check CHECK (btrim(expected_entitlement_source_reference) <> CAST('' AS text));
-- snapshot source line 4696: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_re_expected_subscription_price__check CHECK (btrim(expected_subscription_price_reference) <> CAST('' AS text));
-- snapshot source line 4697: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_re_expected_subscription_provid_check CHECK (expected_subscription_provider_status = ANY(ARRAY[CAST('incomplete' AS text), CAST('incomplete_expired' AS text), CAST('trialing' AS text), CAST('active' AS text), CAST('past_due' AS text), CAST('canceled' AS text), CAST('unpaid' AS text), CAST('paused' AS text)]));
-- snapshot source line 4698: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_re_observed_subscription_refere_check CHECK (btrim(observed_subscription_reference) <> CAST('' AS text));
-- snapshot source line 4699: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_rec_confirmation_request_sha256_check CHECK (confirmation_request_sha256 ~ CAST('^[a-f0-9]{64}$' AS text));
-- snapshot source line 4700: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_rec_observed_customer_reference_check CHECK (btrim(observed_customer_reference) <> CAST('' AS text));
-- snapshot source line 4701: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_reco_provider_account_reference_check CHECK (btrim(provider_account_reference) <> CAST('' AS text));
-- snapshot source line 4702: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_recon_provider_object_reference_check CHECK (btrim(provider_object_reference) <> CAST('' AS text));
-- snapshot source line 4703: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_reconc_expected_fencing_version_check CHECK (expected_fencing_version >= 0);
-- snapshot source line 4704: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_reconc_observed_price_reference_check CHECK (btrim(observed_price_reference) <> CAST('' AS text));
-- snapshot source line 4705: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_reconc_observed_provider_status_check CHECK (observed_provider_status = ANY(ARRAY[CAST('incomplete' AS text), CAST('incomplete_expired' AS text), CAST('trialing' AS text), CAST('active' AS text), CAST('past_due' AS text), CAST('canceled' AS text), CAST('unpaid' AS text), CAST('paused' AS text)]));
-- snapshot source line 4706: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_reconcilia_preview_token_sha256_check CHECK (preview_token_sha256 ~ CAST('^[a-f0-9]{64}$' AS text));
-- snapshot source line 4707: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_reconciliati_observed_plan_code_check CHECK (observed_plan_code = ANY(ARRAY[CAST('starter' AS zaltyko.saas_plan_code), CAST('growth' AS zaltyko.saas_plan_code), CAST('network' AS zaltyko.saas_plan_code)]));
-- snapshot source line 4708: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_reconciliatio_provider_event_id_check CHECK (btrim(provider_event_id) <> CAST('' AS text));
-- snapshot source line 4709: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_reconciliation__idempotency_key_check CHECK (length(btrim(idempotency_key)) >= 8 AND length(btrim(idempotency_key)) <= 150);
-- snapshot source line 4710: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_reconciliation__resolution_kind_check CHECK (resolution_kind = ANY(ARRAY[CAST('status_snapshot' AS text), CAST('paid_invoice_grant' AS text)]));
-- snapshot source line 4711: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_reconciliation__snapshot_sha256_check CHECK (snapshot_sha256 ~ CAST('^[a-f0-9]{64}$' AS text));
-- snapshot source line 4712: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_reconciliation_d_payload_sha256_check CHECK (payload_sha256 ~ CAST('^[a-f0-9]{64}$' AS text));
-- snapshot source line 4713: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_reconciliation_decis_request_id_check CHECK (btrim(request_id) <> CAST('' AS text) AND length(request_id) <= 200);
-- snapshot source line 4714: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_reconciliation_decisions_reason_check CHECK (length(btrim(reason)) >= 20 AND length(btrim(reason)) <= 1000);
-- snapshot source line 4715: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT saas_webhook_reconciliation_execution_ttl CHECK (execution_expires_at > evidence_observed_at AND execution_expires_at <= (evidence_observed_at + CAST('00:02:00' AS interval)));
-- snapshot source line 4716: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT saas_webhook_reconciliation_expected_period CHECK (expected_subscription_period_ends_at > expected_subscription_period_started_at);
-- snapshot source line 4717: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT saas_webhook_reconciliation_invoice_shape CHECK (((resolution_kind = CAST('status_snapshot' AS text) AND invoice_reference IS NULL AND invoice_status IS NULL AND invoice_customer_reference IS NULL AND invoice_subscription_reference IS NULL AND invoice_currency IS NULL AND invoice_paid_amount IS NULL AND invoice_period_started_at IS NULL AND invoice_period_ends_at IS NULL AND invoice_price_reference IS NULL AND invoice_plan_code IS NULL) OR (resolution_kind = CAST('status_snapshot' AS text) AND invoice_reference IS NOT NULL AND invoice_status IS NOT NULL AND invoice_customer_reference = observed_customer_reference AND invoice_subscription_reference = observed_subscription_reference AND invoice_currency IS NULL AND invoice_paid_amount IS NULL AND invoice_period_started_at IS NULL AND invoice_period_ends_at IS NULL AND invoice_price_reference IS NULL AND invoice_plan_code IS NULL) OR (resolution_kind = CAST('paid_invoice_grant' AS text) AND invoice_reference IS NOT NULL AND invoice_status = CAST('paid' AS text) AND invoice_customer_reference = observed_customer_reference AND invoice_subscription_reference = observed_subscription_reference AND invoice_currency = CAST('eur' AS text) AND invoice_paid_amount >= 0 AND invoice_period_started_at IS NOT NULL AND invoice_period_ends_at > invoice_period_started_at AND invoice_price_reference IS NOT NULL AND invoice_plan_code = ANY(ARRAY[CAST('starter' AS zaltyko.saas_plan_code), CAST('growth' AS zaltyko.saas_plan_code)]))) IS TRUE);
-- snapshot source line 4718: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT saas_webhook_reconciliation_preview_ttl CHECK (preview_expires_at > preview_issued_at AND preview_expires_at <= (preview_issued_at + CAST('00:05:00' AS interval)) AND created_at < preview_expires_at);
-- snapshot source line 4719: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT saas_webhook_reconciliation_snapshot_period CHECK (observed_current_period_ends_at > observed_current_period_started_at);
-- snapshot source line 4720: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_results ADD CONSTRAINT organization_saas_webhook_re_entitlement_source_referenc_check1 CHECK (btrim(entitlement_source_reference_after) <> CAST('' AS text));
-- snapshot source line 4721: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_results ADD CONSTRAINT organization_saas_webhook_re_entitlement_source_reference_check CHECK (btrim(entitlement_source_reference_before) <> CAST('' AS text));
-- snapshot source line 4722: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_results ADD CONSTRAINT organization_saas_webhook_rec_entitlement_revision_before_check CHECK (entitlement_revision_before > 0);
-- snapshot source line 4723: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_results ADD CONSTRAINT organization_saas_webhook_reco_entitlement_revision_after_check CHECK (entitlement_revision_after > 0);
-- snapshot source line 4724: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_results ADD CONSTRAINT organization_saas_webhook_recon_processor_fencing_version_check CHECK (processor_fencing_version > 0);
-- snapshot source line 4725: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_results ADD CONSTRAINT organization_saas_webhook_reconc_observed_snapshot_sha256_check CHECK (observed_snapshot_sha256 IS NULL OR observed_snapshot_sha256 ~ CAST('^[a-f0-9]{64}$' AS text));
-- snapshot source line 4726: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_results ADD CONSTRAINT organization_saas_webhook_reconciliation_resu_result_code_check CHECK (btrim(result_code) <> CAST('' AS text));
-- snapshot source line 4727: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_results ADD CONSTRAINT organization_saas_webhook_reconciliation_results_outcome_check CHECK (outcome = ANY(ARRAY[CAST('applied' AS text), CAST('already_applied' AS text), CAST('ignored' AS text), CAST('stale' AS text)]));
-- snapshot source line 4728: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_results ADD CONSTRAINT saas_webhook_reconciliation_result_revision CHECK ((outcome = CAST('applied' AS text) AND entitlement_revision_after >= entitlement_revision_before) OR (outcome = CAST('already_applied' AS text) AND entitlement_revision_after = entitlement_revision_before AND entitlement_source_reference_after = entitlement_source_reference_before) OR (outcome = CAST('ignored' AS text) AND entitlement_revision_after = entitlement_revision_before AND entitlement_source_reference_after = entitlement_source_reference_before) OR (outcome = CAST('stale' AS text) AND entitlement_revision_after = entitlement_revision_before AND entitlement_source_reference_after = entitlement_source_reference_before));
-- snapshot source line 4729: AlterTableStmt
ALTER TABLE zaltyko.organization_sports ADD CONSTRAINT organization_sports_dates_valid CHECK (ends_on IS NULL OR ends_on >= starts_on);
-- snapshot source line 4730: AlterTableStmt
ALTER TABLE zaltyko.organizations ADD CONSTRAINT organizations_country_code_check CHECK (country_code ~ CAST('^[A-Z]{2}$' AS text));
-- snapshot source line 4731: AlterTableStmt
ALTER TABLE zaltyko.organizations ADD CONSTRAINT organizations_default_currency_check CHECK (default_currency ~ CAST('^[A-Z]{3}$' AS text));
-- snapshot source line 4732: AlterTableStmt
ALTER TABLE zaltyko.organizations ADD CONSTRAINT organizations_name_check CHECK (btrim(name) <> CAST('' AS text));
-- snapshot source line 4733: AlterTableStmt
ALTER TABLE zaltyko.outbox_events ADD CONSTRAINT outbox_events_aggregate_type_check CHECK (btrim(aggregate_type) <> CAST('' AS text));
-- snapshot source line 4734: AlterTableStmt
ALTER TABLE zaltyko.outbox_events ADD CONSTRAINT outbox_events_attempts_check CHECK (attempts >= 0);
-- snapshot source line 4735: AlterTableStmt
ALTER TABLE zaltyko.outbox_events ADD CONSTRAINT outbox_events_event_name_check CHECK (btrim(event_name) <> CAST('' AS text));
-- snapshot source line 4736: AlterTableStmt
ALTER TABLE zaltyko.outbox_events ADD CONSTRAINT outbox_events_event_version_check CHECK (event_version > 0);
-- snapshot source line 4737: AlterTableStmt
ALTER TABLE zaltyko.outbox_events ADD CONSTRAINT outbox_events_idempotency_key_check CHECK (btrim(idempotency_key) <> CAST('' AS text));
-- snapshot source line 4738: AlterTableStmt
ALTER TABLE zaltyko.owner_dashboard_layouts ADD CONSTRAINT owner_dashboard_layouts_order_cardinality CHECK (cardinality(module_order) = 4);
-- snapshot source line 4739: AlterTableStmt
ALTER TABLE zaltyko.owner_dashboard_layouts ADD CONSTRAINT owner_dashboard_layouts_version_positive CHECK (version > 0);
-- snapshot source line 4740: AlterTableStmt
ALTER TABLE zaltyko.owner_signup_consent_audits ADD CONSTRAINT owner_signup_consent_audits_consent_proof_check CHECK (consent_proof ~ CAST('^(signup|setup):[a-zA-Z0-9_-]{1,128}$' AS text));
-- snapshot source line 4741: AlterTableStmt
ALTER TABLE zaltyko.owner_signup_consent_audits ADD CONSTRAINT owner_signup_consent_audits_event_check CHECK (event = ANY(ARRAY[CAST('grant' AS text), CAST('re_grant' AS text)]));
-- snapshot source line 4742: AlterTableStmt
ALTER TABLE zaltyko.owner_signup_consent_audits ADD CONSTRAINT owner_signup_consent_audits_policy_version_check CHECK (policy_version ~ CAST('^v[0-9]+-[0-9]{4}-[0-9]{2}-[0-9]{2}$' AS text));
-- snapshot source line 4743: AlterTableStmt
ALTER TABLE zaltyko.owner_signup_consent_audits ADD CONSTRAINT owner_signup_consent_audits_source_check CHECK (source = ANY(ARRAY[CAST('signup' AS text), CAST('setup' AS text)]));
-- snapshot source line 4744: AlterTableStmt
ALTER TABLE zaltyko.owner_signup_consent_policy ADD CONSTRAINT owner_signup_consent_policy_policy_version_check CHECK (policy_version ~ CAST('^v[0-9]+-[0-9]{4}-[0-9]{2}-[0-9]{2}$' AS text));
-- snapshot source line 4745: AlterTableStmt
ALTER TABLE zaltyko.owner_signup_consent_policy ADD CONSTRAINT owner_signup_consent_policy_singleton_check CHECK (singleton = TRUE);
-- snapshot source line 4746: AlterTableStmt
ALTER TABLE zaltyko.owner_signup_consents ADD CONSTRAINT owner_signup_consents_consent_proof_check CHECK (consent_proof ~ CAST('^(signup|setup):[a-zA-Z0-9_-]{1,128}$' AS text));
-- snapshot source line 4747: AlterTableStmt
ALTER TABLE zaltyko.owner_signup_consents ADD CONSTRAINT owner_signup_consents_policy_version_check CHECK (policy_version ~ CAST('^v[0-9]+-[0-9]{4}-[0-9]{2}-[0-9]{2}$' AS text));
-- snapshot source line 4748: AlterTableStmt
ALTER TABLE zaltyko.owner_signup_consents ADD CONSTRAINT owner_signup_consents_source_check CHECK (source = ANY(ARRAY[CAST('signup' AS text), CAST('setup' AS text)]));
-- snapshot source line 4749: AlterTableStmt
ALTER TABLE zaltyko.owner_signup_consents ADD CONSTRAINT owner_signup_consents_state_check CHECK (state = ANY(ARRAY[CAST('granted' AS text), CAST('revoked' AS text)]));
-- snapshot source line 4750: AlterTableStmt
ALTER TABLE zaltyko.payment_allocations ADD CONSTRAINT payment_allocations_amount_cents_check CHECK (amount_cents > 0);
-- snapshot source line 4751: AlterTableStmt
ALTER TABLE zaltyko.payment_allocations ADD CONSTRAINT payment_allocations_currency_check CHECK (currency ~ CAST('^[A-Z]{3}$' AS text));
-- snapshot source line 4752: AlterTableStmt
ALTER TABLE zaltyko.payment_allocations ADD CONSTRAINT payment_allocations_idempotency_key_check CHECK (btrim(idempotency_key) <> CAST('' AS text));
-- snapshot source line 4753: AlterTableStmt
ALTER TABLE zaltyko.payment_attempts ADD CONSTRAINT payment_attempts_amount_cents_check CHECK (amount_cents > 0);
-- snapshot source line 4754: AlterTableStmt
ALTER TABLE zaltyko.payment_attempts ADD CONSTRAINT payment_attempts_currency_check CHECK (currency ~ CAST('^[A-Z]{3}$' AS text));
-- snapshot source line 4755: AlterTableStmt
ALTER TABLE zaltyko.payment_attempts ADD CONSTRAINT payment_attempts_idempotency_key_check CHECK (btrim(idempotency_key) <> CAST('' AS text));
-- snapshot source line 4756: AlterTableStmt
ALTER TABLE zaltyko.payment_attempts ADD CONSTRAINT payment_attempts_processor_check CHECK (btrim(processor) <> CAST('' AS text));
-- snapshot source line 4757: AlterTableStmt
ALTER TABLE zaltyko.payment_attempts ADD CONSTRAINT payment_attempts_provider_attempt_id_check CHECK (btrim(provider_attempt_id) <> CAST('' AS text));
-- snapshot source line 4758: AlterTableStmt
ALTER TABLE zaltyko.payment_provider_events ADD CONSTRAINT payment_provider_events_attempts_check CHECK (attempts >= 0);
-- snapshot source line 4759: AlterTableStmt
ALTER TABLE zaltyko.payment_provider_events ADD CONSTRAINT payment_provider_events_event_type_check CHECK (btrim(event_type) <> CAST('' AS text));
-- snapshot source line 4760: AlterTableStmt
ALTER TABLE zaltyko.payment_provider_events ADD CONSTRAINT payment_provider_events_payload_check CHECK (jsonb_typeof(payload) = CAST('object' AS text));
-- snapshot source line 4761: AlterTableStmt
ALTER TABLE zaltyko.payment_provider_events ADD CONSTRAINT payment_provider_events_payload_sha256_check CHECK (payload_sha256 ~ CAST('^[a-f0-9]{64}$' AS text));
-- snapshot source line 4762: AlterTableStmt
ALTER TABLE zaltyko.payment_provider_events ADD CONSTRAINT payment_provider_events_processor_check CHECK (btrim(processor) <> CAST('' AS text));
-- snapshot source line 4763: AlterTableStmt
ALTER TABLE zaltyko.payment_provider_events ADD CONSTRAINT payment_provider_events_provider_event_id_check CHECK (btrim(provider_event_id) <> CAST('' AS text));
-- snapshot source line 4764: AlterTableStmt
ALTER TABLE zaltyko.payment_provider_events ADD CONSTRAINT payment_provider_events_signature_verified_check CHECK (signature_verified);
-- snapshot source line 4765: AlterTableStmt
ALTER TABLE zaltyko.payments ADD CONSTRAINT payments_amount_cents_check CHECK (amount_cents > 0);
-- snapshot source line 4766: AlterTableStmt
ALTER TABLE zaltyko.payments ADD CONSTRAINT payments_currency_check CHECK (currency ~ CAST('^[A-Z]{3}$' AS text));
-- snapshot source line 4767: AlterTableStmt
ALTER TABLE zaltyko.payments ADD CONSTRAINT payments_idempotency_key_check CHECK (btrim(idempotency_key) <> CAST('' AS text));
-- snapshot source line 4768: AlterTableStmt
ALTER TABLE zaltyko.payments ADD CONSTRAINT payments_manual_reference_check CHECK (manual_reference IS NULL OR length(btrim(manual_reference)) <= 200);
-- snapshot source line 4769: AlterTableStmt
ALTER TABLE zaltyko.payments ADD CONSTRAINT payments_source_fields_valid CHECK ((source = CAST('provider' AS zaltyko.payment_source) AND processor IS NOT NULL AND btrim(processor) <> CAST('' AS text) AND environment IS NOT NULL AND provider_payment_id IS NOT NULL AND btrim(provider_payment_id) <> CAST('' AS text) AND manual_method IS NULL AND recorded_by_user_id IS NULL) OR (source = CAST('manual' AS zaltyko.payment_source) AND processor IS NULL AND environment IS NULL AND provider_payment_id IS NULL AND manual_method IS NOT NULL AND recorded_by_user_id IS NOT NULL));
-- snapshot source line 4770: AlterTableStmt
ALTER TABLE zaltyko.payments ADD CONSTRAINT payments_version_check CHECK (version > 0);
-- snapshot source line 4771: AlterTableStmt
ALTER TABLE zaltyko.people ADD CONSTRAINT people_family_name_check CHECK (btrim(family_name) <> CAST('' AS text));
-- snapshot source line 4772: AlterTableStmt
ALTER TABLE zaltyko.people ADD CONSTRAINT people_given_name_check CHECK (btrim(given_name) <> CAST('' AS text));
-- snapshot source line 4773: AlterTableStmt
ALTER TABLE zaltyko.price_plan_class_template_coverage ADD CONSTRAINT price_plan_class_template_coverage_dates_valid CHECK (ends_on IS NULL OR ends_on >= starts_on);
-- snapshot source line 4774: AlterTableStmt
ALTER TABLE zaltyko.price_plans ADD CONSTRAINT price_plans_amount_cents_check CHECK (amount_cents >= 0);
-- snapshot source line 4775: AlterTableStmt
ALTER TABLE zaltyko.price_plans ADD CONSTRAINT price_plans_currency_check CHECK (currency ~ CAST('^[A-Z]{3}$' AS text));
-- snapshot source line 4776: AlterTableStmt
ALTER TABLE zaltyko.price_plans ADD CONSTRAINT price_plans_name_check CHECK (btrim(name) <> CAST('' AS text));
-- snapshot source line 4777: AlterTableStmt
ALTER TABLE zaltyko.programs ADD CONSTRAINT programs_activity_key_format CHECK (activity_key IS NULL OR activity_key ~ CAST('^[a-z][a-z0-9_]{1,47}$' AS text));
-- snapshot source line 4778: AlterTableStmt
ALTER TABLE zaltyko.programs ADD CONSTRAINT programs_classification_valid CHECK ((kind = CAST('gymnastics_sport' AS zaltyko.program_kind) AND organization_sport_id IS NOT NULL AND activity_key IS NULL) OR (kind = CAST('complementary_activity' AS zaltyko.program_kind) AND organization_sport_id IS NULL AND activity_key IS NOT NULL AND btrim(activity_key) <> CAST('' AS text)));
-- snapshot source line 4779: AlterTableStmt
ALTER TABLE zaltyko.programs ADD CONSTRAINT programs_name_check CHECK (btrim(name) <> CAST('' AS text));
-- snapshot source line 4780: AlterTableStmt
ALTER TABLE zaltyko.refunds ADD CONSTRAINT refunds_amount_cents_check CHECK (amount_cents > 0);
-- snapshot source line 4781: AlterTableStmt
ALTER TABLE zaltyko.refunds ADD CONSTRAINT refunds_currency_check CHECK (currency ~ CAST('^[A-Z]{3}$' AS text));
-- snapshot source line 4782: AlterTableStmt
ALTER TABLE zaltyko.refunds ADD CONSTRAINT refunds_idempotency_key_check CHECK (btrim(idempotency_key) <> CAST('' AS text));
-- snapshot source line 4783: AlterTableStmt
ALTER TABLE zaltyko.refunds ADD CONSTRAINT refunds_processor_check CHECK (btrim(processor) <> CAST('' AS text));
-- snapshot source line 4784: AlterTableStmt
ALTER TABLE zaltyko.refunds ADD CONSTRAINT refunds_provider_refund_id_check CHECK (btrim(provider_refund_id) <> CAST('' AS text));
-- snapshot source line 4785: AlterTableStmt
ALTER TABLE zaltyko.refunds ADD CONSTRAINT refunds_reason_code_check CHECK (btrim(reason_code) <> CAST('' AS text));
-- snapshot source line 4786: AlterTableStmt
ALTER TABLE zaltyko.retention_cohort_projection_runs ADD CONSTRAINT retention_cohort_projection_runs_completion_valid CHECK ((status = CAST('succeeded' AS text)) = (completed_at IS NOT NULL));
-- snapshot source line 4787: AlterTableStmt
ALTER TABLE zaltyko.retention_cohort_projection_runs ADD CONSTRAINT retention_cohort_projection_runs_row_count_nonnegative CHECK (row_count >= 0);
-- snapshot source line 4788: AlterTableStmt
ALTER TABLE zaltyko.retention_cohort_projection_runs ADD CONSTRAINT retention_cohort_projection_runs_status_valid CHECK (status = ANY(ARRAY[CAST('running' AS text), CAST('succeeded' AS text), CAST('failed' AS text)]));
-- snapshot source line 4789: AlterTableStmt
ALTER TABLE zaltyko.retention_cohort_projection_runs ADD CONSTRAINT retention_cohort_projection_runs_version_positive CHECK (formula_version > 0);
-- snapshot source line 4790: AlterTableStmt
ALTER TABLE zaltyko.retention_cohort_projections ADD CONSTRAINT retention_cohort_projections_counts_valid CHECK (cohort_size > 0 AND active_count >= 0 AND active_count <= cohort_size AND paused_count >= 0 AND paused_count <= cohort_size AND numerator = active_count AND denominator = cohort_size);
-- snapshot source line 4791: AlterTableStmt
ALTER TABLE zaltyko.retention_cohort_projections ADD CONSTRAINT retention_cohort_projections_months_valid CHECK (CAST(date_trunc(CAST('month' AS text), CAST(cohort_month AS timestamp)) AS date) = cohort_month AND CAST(date_trunc(CAST('month' AS text), CAST(observation_month AS timestamp)) AS date) = observation_month AND observation_month >= cohort_month);
-- snapshot source line 4792: AlterTableStmt
ALTER TABLE zaltyko.retention_cohort_projections ADD CONSTRAINT retention_cohort_projections_rate_quality_valid CHECK ((paused_count > 0 AND retention_rate IS NULL AND quality = CAST('insufficient' AS zaltyko.metric_quality)) OR (paused_count = 0 AND retention_rate IS NOT NULL AND quality = CAST('complete' AS zaltyko.metric_quality)));
-- snapshot source line 4793: AlterTableStmt
ALTER TABLE zaltyko.sessions ADD CONSTRAINT sessions_capacity_override_check CHECK (capacity_override IS NULL OR capacity_override > 0);
-- snapshot source line 4794: AlterTableStmt
ALTER TABLE zaltyko.sessions ADD CONSTRAINT sessions_time_valid CHECK (ends_at > starts_at);
-- snapshot source line 4795: AlterTableStmt
ALTER TABLE zaltyko.spaces ADD CONSTRAINT spaces_capacity_check CHECK (capacity IS NULL OR capacity > 0);
-- snapshot source line 4796: AlterTableStmt
ALTER TABLE zaltyko.spaces ADD CONSTRAINT spaces_name_check CHECK (btrim(name) <> CAST('' AS text));
-- snapshot source line 4797: AlterTableStmt
ALTER TABLE zaltyko.sport_profiles ADD CONSTRAINT sport_profiles_configuration_schema_version_check CHECK (configuration_schema_version > 0);
-- snapshot source line 4798: AlterTableStmt
ALTER TABLE zaltyko.sport_profiles ADD CONSTRAINT sport_profiles_country_code_check CHECK (country_code ~ CAST('^[A-Z]{2}$' AS text));
-- snapshot source line 4799: AlterTableStmt
ALTER TABLE zaltyko.sport_profiles ADD CONSTRAINT sport_profiles_discipline_key_check CHECK (discipline_key ~ CAST('^[a-z][a-z0-9_]{1,47}$' AS text));
-- snapshot source line 4800: AlterTableStmt
ALTER TABLE zaltyko.sport_profiles ADD CONSTRAINT sport_profiles_federation_code_check CHECK (federation_code ~ CAST('^[a-z][a-z0-9_-]{1,47}$' AS text));
-- snapshot source line 4801: AlterTableStmt
ALTER TABLE zaltyko.sport_profiles ADD CONSTRAINT sport_profiles_identity_only_empty CHECK (status <> CAST('identity_only' AS zaltyko.sport_profile_status) OR configuration = CAST('{}' AS jsonb));
-- snapshot source line 4802: AlterTableStmt
ALTER TABLE zaltyko.sport_profiles ADD CONSTRAINT sport_profiles_profile_version_check CHECK (btrim(profile_version) <> CAST('' AS text));
-- snapshot source line 4803: AlterTableStmt
ALTER TABLE zaltyko.sport_profiles ADD CONSTRAINT sport_profiles_source_url_check CHECK (source_url IS NULL OR source_url ~ CAST('^https://' AS text));
-- snapshot source line 4804: AlterTableStmt
ALTER TABLE zaltyko.sport_profiles ADD CONSTRAINT sport_profiles_verified_source_required CHECK (status <> CAST('verified' AS zaltyko.sport_profile_status) OR (source_title IS NOT NULL AND source_url IS NOT NULL AND source_verified_at IS NOT NULL));
-- snapshot source line 4805: AlterTableStmt
ALTER TABLE zaltyko.trial_followups ADD CONSTRAINT trial_followups_idempotency_key_check CHECK (btrim(idempotency_key) <> CAST('' AS text));
-- snapshot source line 4806: AlterTableStmt
ALTER TABLE zaltyko.trial_status_history ADD CONSTRAINT trial_status_history_idempotency_key_check CHECK (btrim(idempotency_key) <> CAST('' AS text));
-- snapshot source line 4807: AlterTableStmt
ALTER TABLE zaltyko.trials ADD CONSTRAINT trials_version_check CHECK (version > 0);
-- snapshot source line 4808: AlterTableStmt
ALTER TABLE zaltyko.waitlist_entries ADD CONSTRAINT waitlist_entries_consent_timestamp_valid CHECK (contact_consent_status = CAST('unknown' AS zaltyko.contact_consent_status) OR contact_consent_recorded_at IS NOT NULL);
-- snapshot source line 4809: AlterTableStmt
ALTER TABLE zaltyko.waitlist_entries ADD CONSTRAINT waitlist_entries_contactable_valid CHECK (NOT contactable OR (contact_guardian_id IS NOT NULL AND contact_consent_status = CAST('granted' AS zaltyko.contact_consent_status)));
-- snapshot source line 4810: AlterTableStmt
ALTER TABLE zaltyko.waitlist_entries ADD CONSTRAINT waitlist_entries_preferences_check CHECK (jsonb_typeof(preferences) = CAST('object' AS text));
-- snapshot source line 4811: AlterTableStmt
ALTER TABLE zaltyko.waitlist_entries ADD CONSTRAINT waitlist_entries_priority_check CHECK (priority >= 0);
-- snapshot source line 4812: AlterTableStmt
ALTER TABLE zaltyko.waitlist_entries ADD CONSTRAINT waitlist_entries_target_required CHECK ((class_template_id IS NOT NULL AND program_id IS NULL) OR (class_template_id IS NULL AND program_id IS NOT NULL));
-- snapshot source line 4813: AlterTableStmt
ALTER TABLE zaltyko.waitlist_entries ADD CONSTRAINT waitlist_entries_version_check CHECK (version > 0);
-- snapshot source line 4814: AlterTableStmt
ALTER TABLE zaltyko.waitlist_offers ADD CONSTRAINT waitlist_offers_dates_valid CHECK (expires_at > sent_at);
-- snapshot source line 4815: AlterTableStmt
ALTER TABLE zaltyko.waitlist_offers ADD CONSTRAINT waitlist_offers_idempotency_key_check CHECK (btrim(idempotency_key) <> CAST('' AS text));
-- snapshot source line 4816: AlterTableStmt
ALTER TABLE zaltyko.waitlist_offers ADD CONSTRAINT waitlist_offers_version_check CHECK (version > 0);
-- snapshot source line 4818: IndexStmt
CREATE UNIQUE INDEX class_templates_organization_location_id_uq ON zaltyko.class_templates (organization_id, location_id, id);
-- snapshot source line 4819: IndexStmt
CREATE UNIQUE INDEX enrollments_organization_location_id_uq ON zaltyko.enrollments (organization_id, location_id, id);
-- snapshot source line 4820: IndexStmt
CREATE UNIQUE INDEX family_payers_organization_family_id_uq ON zaltyko.family_payers (organization_id, family_id, id);
-- snapshot source line 4821: IndexStmt
CREATE UNIQUE INDEX group_memberships_organization_id_id_uq ON zaltyko.group_memberships (organization_id, id);
-- snapshot source line 4822: IndexStmt
CREATE UNIQUE INDEX invoice_lines_coverage_parent_fk_uq ON zaltyko.invoice_lines (organization_id, location_id, athlete_id, price_plan_id, id);
-- snapshot source line 4823: IndexStmt
CREATE UNIQUE INDEX metric_run_values_organization_id_id_uq ON zaltyko.metric_run_values (organization_id, id);
-- snapshot source line 4824: IndexStmt
CREATE UNIQUE INDEX organization_saas_webhook_events_org_id_id_uq ON zaltyko.organization_saas_webhook_events (organization_id, id);
-- snapshot source line 4825: IndexStmt
CREATE UNIQUE INDEX outbox_events_organization_id_id_uq ON zaltyko.outbox_events (organization_id, id);
-- snapshot source line 4826: IndexStmt
CREATE UNIQUE INDEX sessions_organization_location_id_uq ON zaltyko.sessions (organization_id, location_id, id);
-- snapshot source line 5066: AlterTableStmt
ALTER TABLE zaltyko.athletes ADD CONSTRAINT athletes_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5067: AlterTableStmt
ALTER TABLE zaltyko.athletes ADD CONSTRAINT athletes_person_fk FOREIGN KEY (organization_id, person_id) REFERENCES zaltyko.people (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5068: AlterTableStmt
ALTER TABLE zaltyko.attendance_records ADD CONSTRAINT attendance_records_athlete_fk FOREIGN KEY (organization_id, athlete_id) REFERENCES zaltyko.athletes (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5069: AlterTableStmt
ALTER TABLE zaltyko.attendance_records ADD CONSTRAINT attendance_records_enrollment_fk FOREIGN KEY (organization_id, enrollment_id) REFERENCES zaltyko.enrollments (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5070: AlterTableStmt
ALTER TABLE zaltyko.attendance_records ADD CONSTRAINT attendance_records_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5071: AlterTableStmt
ALTER TABLE zaltyko.attendance_records ADD CONSTRAINT attendance_records_member_fk FOREIGN KEY (organization_id, recorded_by_member_id) REFERENCES zaltyko.organization_members (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5072: AlterTableStmt
ALTER TABLE zaltyko.attendance_records ADD CONSTRAINT attendance_records_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5073: AlterTableStmt
ALTER TABLE zaltyko.attendance_records ADD CONSTRAINT attendance_records_session_fk FOREIGN KEY (organization_id, session_id) REFERENCES zaltyko.sessions (organization_id, id) ON DELETE CASCADE;
-- snapshot source line 5074: AlterTableStmt
ALTER TABLE zaltyko.audit_log ADD CONSTRAINT audit_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users (id) ON DELETE SET NULL;
-- snapshot source line 5075: AlterTableStmt
ALTER TABLE zaltyko.audit_log ADD CONSTRAINT audit_log_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5076: AlterTableStmt
ALTER TABLE zaltyko.audit_log ADD CONSTRAINT audit_log_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE RESTRICT;
-- snapshot source line 5077: AlterTableStmt
ALTER TABLE zaltyko.benchmark_metric_targets ADD CONSTRAINT benchmark_metric_targets_benchmark_profile_id_fkey FOREIGN KEY (benchmark_profile_id) REFERENCES zaltyko.benchmark_profiles (id) ON DELETE CASCADE;
-- snapshot source line 5078: AlterTableStmt
ALTER TABLE zaltyko.benchmark_metric_targets ADD CONSTRAINT benchmark_metric_targets_metric_key_fkey FOREIGN KEY (metric_key) REFERENCES zaltyko.metric_definitions (key) ON DELETE RESTRICT;
-- snapshot source line 5079: AlterTableStmt
ALTER TABLE zaltyko.benchmark_profiles ADD CONSTRAINT benchmark_profiles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5080: AlterTableStmt
ALTER TABLE zaltyko.charges ADD CONSTRAINT charges_enrollment_fk FOREIGN KEY (organization_id, enrollment_id) REFERENCES zaltyko.enrollments (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5081: AlterTableStmt
ALTER TABLE zaltyko.charges ADD CONSTRAINT charges_family_fk FOREIGN KEY (organization_id, family_id) REFERENCES zaltyko.families (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5082: AlterTableStmt
ALTER TABLE zaltyko.charges ADD CONSTRAINT charges_family_payer_fk FOREIGN KEY (organization_id, family_id, family_payer_id) REFERENCES zaltyko.family_payers (organization_id, family_id, id) ON DELETE RESTRICT;
-- snapshot source line 5083: AlterTableStmt
ALTER TABLE zaltyko.charges ADD CONSTRAINT charges_invoice_fk FOREIGN KEY (organization_id, invoice_id, currency) REFERENCES zaltyko.invoices (organization_id, id, currency) ON DELETE RESTRICT;
-- snapshot source line 5084: AlterTableStmt
ALTER TABLE zaltyko.charges ADD CONSTRAINT charges_invoice_line_fk FOREIGN KEY (organization_id, invoice_line_id, currency) REFERENCES zaltyko.invoice_lines (organization_id, id, currency) ON DELETE RESTRICT;
-- snapshot source line 5085: AlterTableStmt
ALTER TABLE zaltyko.charges ADD CONSTRAINT charges_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5086: AlterTableStmt
ALTER TABLE zaltyko.charges ADD CONSTRAINT charges_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5087: AlterTableStmt
ALTER TABLE zaltyko.class_template_groups ADD CONSTRAINT class_template_groups_group_fk FOREIGN KEY (organization_id, group_id) REFERENCES zaltyko.groups (organization_id, id) ON DELETE CASCADE;
-- snapshot source line 5088: AlterTableStmt
ALTER TABLE zaltyko.class_template_groups ADD CONSTRAINT class_template_groups_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5089: AlterTableStmt
ALTER TABLE zaltyko.class_template_groups ADD CONSTRAINT class_template_groups_template_fk FOREIGN KEY (organization_id, class_template_id) REFERENCES zaltyko.class_templates (organization_id, id) ON DELETE CASCADE;
-- snapshot source line 5090: AlterTableStmt
ALTER TABLE zaltyko.class_template_weekdays ADD CONSTRAINT class_template_weekdays_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5091: AlterTableStmt
ALTER TABLE zaltyko.class_template_weekdays ADD CONSTRAINT class_template_weekdays_template_fk FOREIGN KEY (organization_id, class_template_id) REFERENCES zaltyko.class_templates (organization_id, id) ON DELETE CASCADE;
-- snapshot source line 5092: AlterTableStmt
ALTER TABLE zaltyko.class_templates ADD CONSTRAINT class_templates_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5093: AlterTableStmt
ALTER TABLE zaltyko.class_templates ADD CONSTRAINT class_templates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5094: AlterTableStmt
ALTER TABLE zaltyko.class_templates ADD CONSTRAINT class_templates_program_fk FOREIGN KEY (organization_id, program_id) REFERENCES zaltyko.programs (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5095: AlterTableStmt
ALTER TABLE zaltyko.class_templates ADD CONSTRAINT class_templates_space_fk FOREIGN KEY (organization_id, default_space_id) REFERENCES zaltyko.spaces (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5096: AlterTableStmt
ALTER TABLE zaltyko.data_quality_issues ADD CONSTRAINT data_quality_issues_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5097: AlterTableStmt
ALTER TABLE zaltyko.data_quality_issues ADD CONSTRAINT data_quality_issues_metric_key_fkey FOREIGN KEY (metric_key) REFERENCES zaltyko.metric_definitions (key) ON DELETE RESTRICT;
-- snapshot source line 5098: AlterTableStmt
ALTER TABLE zaltyko.data_quality_issues ADD CONSTRAINT data_quality_issues_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5099: AlterTableStmt
ALTER TABLE zaltyko.data_quality_issues ADD CONSTRAINT data_quality_issues_run_fk FOREIGN KEY (organization_id, metric_run_id) REFERENCES zaltyko.metric_runs (organization_id, id) ON DELETE CASCADE;
-- snapshot source line 5100: AlterTableStmt
ALTER TABLE zaltyko.enrollment_pauses ADD CONSTRAINT enrollment_pauses_enrollment_fk FOREIGN KEY (organization_id, enrollment_id) REFERENCES zaltyko.enrollments (organization_id, id) ON DELETE CASCADE;
-- snapshot source line 5101: AlterTableStmt
ALTER TABLE zaltyko.enrollment_pauses ADD CONSTRAINT enrollment_pauses_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5102: AlterTableStmt
ALTER TABLE zaltyko.enrollment_price_assignments ADD CONSTRAINT enrollment_price_assignments_enrollment_fk FOREIGN KEY (organization_id, location_id, enrollment_id) REFERENCES zaltyko.enrollments (organization_id, location_id, id) ON DELETE RESTRICT;
-- snapshot source line 5103: AlterTableStmt
ALTER TABLE zaltyko.enrollment_price_assignments ADD CONSTRAINT enrollment_price_assignments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5104: AlterTableStmt
ALTER TABLE zaltyko.enrollment_price_assignments ADD CONSTRAINT enrollment_price_assignments_plan_fk FOREIGN KEY (organization_id, price_plan_id) REFERENCES zaltyko.price_plans (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5105: AlterTableStmt
ALTER TABLE zaltyko.enrollment_status_history ADD CONSTRAINT enrollment_status_history_enrollment_fk FOREIGN KEY (organization_id, enrollment_id) REFERENCES zaltyko.enrollments (organization_id, id) ON DELETE CASCADE;
-- snapshot source line 5106: AlterTableStmt
ALTER TABLE zaltyko.enrollment_status_history ADD CONSTRAINT enrollment_status_history_member_fk FOREIGN KEY (organization_id, changed_by_member_id) REFERENCES zaltyko.organization_members (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5107: AlterTableStmt
ALTER TABLE zaltyko.enrollment_status_history ADD CONSTRAINT enrollment_status_history_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5108: AlterTableStmt
ALTER TABLE zaltyko.enrollments ADD CONSTRAINT enrollments_athlete_fk FOREIGN KEY (organization_id, athlete_id) REFERENCES zaltyko.athletes (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5109: AlterTableStmt
ALTER TABLE zaltyko.enrollments ADD CONSTRAINT enrollments_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5110: AlterTableStmt
ALTER TABLE zaltyko.enrollments ADD CONSTRAINT enrollments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5111: AlterTableStmt
ALTER TABLE zaltyko.enrollments ADD CONSTRAINT enrollments_price_plan_fk FOREIGN KEY (organization_id, price_plan_id) REFERENCES zaltyko.price_plans (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5112: AlterTableStmt
ALTER TABLE zaltyko.enrollments ADD CONSTRAINT enrollments_template_fk FOREIGN KEY (organization_id, class_template_id) REFERENCES zaltyko.class_templates (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5113: AlterTableStmt
ALTER TABLE zaltyko.facilities ADD CONSTRAINT facilities_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations (organization_id, id) ON DELETE CASCADE;
-- snapshot source line 5114: AlterTableStmt
ALTER TABLE zaltyko.facilities ADD CONSTRAINT facilities_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5115: AlterTableStmt
ALTER TABLE zaltyko.families ADD CONSTRAINT families_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5116: AlterTableStmt
ALTER TABLE zaltyko.family_collection_preferences ADD CONSTRAINT family_collection_preferences_family_fk FOREIGN KEY (organization_id, family_id) REFERENCES zaltyko.families (organization_id, id) ON DELETE CASCADE;
-- snapshot source line 5117: AlterTableStmt
ALTER TABLE zaltyko.family_collection_preferences ADD CONSTRAINT family_collection_preferences_member_fk FOREIGN KEY (organization_id, updated_by_member_id) REFERENCES zaltyko.organization_members (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5118: AlterTableStmt
ALTER TABLE zaltyko.family_collection_preferences ADD CONSTRAINT family_collection_preferences_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5119: AlterTableStmt
ALTER TABLE zaltyko.family_guardians ADD CONSTRAINT family_guardians_family_fk FOREIGN KEY (organization_id, family_id) REFERENCES zaltyko.families (organization_id, id) ON DELETE CASCADE;
-- snapshot source line 5120: AlterTableStmt
ALTER TABLE zaltyko.family_guardians ADD CONSTRAINT family_guardians_guardian_fk FOREIGN KEY (organization_id, guardian_id) REFERENCES zaltyko.guardians (organization_id, id) ON DELETE CASCADE;
-- snapshot source line 5121: AlterTableStmt
ALTER TABLE zaltyko.family_guardians ADD CONSTRAINT family_guardians_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5122: AlterTableStmt
ALTER TABLE zaltyko.family_members ADD CONSTRAINT family_members_athlete_fk FOREIGN KEY (organization_id, athlete_id) REFERENCES zaltyko.athletes (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5123: AlterTableStmt
ALTER TABLE zaltyko.family_members ADD CONSTRAINT family_members_family_fk FOREIGN KEY (organization_id, family_id) REFERENCES zaltyko.families (organization_id, id) ON DELETE CASCADE;
-- snapshot source line 5124: AlterTableStmt
ALTER TABLE zaltyko.family_members ADD CONSTRAINT family_members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5125: AlterTableStmt
ALTER TABLE zaltyko.family_payers ADD CONSTRAINT family_payers_family_guardian_link_fk FOREIGN KEY (organization_id, family_id, guardian_id) REFERENCES zaltyko.family_guardians (organization_id, family_id, guardian_id) ON DELETE RESTRICT;
-- snapshot source line 5126: AlterTableStmt
ALTER TABLE zaltyko.family_payers ADD CONSTRAINT family_payers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5127: AlterTableStmt
ALTER TABLE zaltyko.family_payment_authorizations ADD CONSTRAINT family_payment_authorizations_guardian_fk FOREIGN KEY (organization_id, family_id, consented_by_guardian_id) REFERENCES zaltyko.family_guardians (organization_id, family_id, guardian_id) ON DELETE RESTRICT;
-- snapshot source line 5128: AlterTableStmt
ALTER TABLE zaltyko.family_payment_authorizations ADD CONSTRAINT family_payment_authorizations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5129: AlterTableStmt
ALTER TABLE zaltyko.family_payment_authorizations ADD CONSTRAINT family_payment_authorizations_payer_fk FOREIGN KEY (organization_id, family_id, family_payer_id) REFERENCES zaltyko.family_payers (organization_id, family_id, id) ON DELETE RESTRICT;
-- snapshot source line 5130: AlterTableStmt
ALTER TABLE zaltyko.family_payment_authorizations ADD CONSTRAINT family_payment_authorizations_provider_account_fk FOREIGN KEY (organization_id, payment_provider_account_id) REFERENCES zaltyko.organization_payment_provider_accounts (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5131: AlterTableStmt
ALTER TABLE zaltyko.financial_reconciliation_runs ADD CONSTRAINT financial_reconciliation_runs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5132: AlterTableStmt
ALTER TABLE zaltyko.group_membership_history ADD CONSTRAINT group_membership_history_member_fk FOREIGN KEY (organization_id, changed_by_member_id) REFERENCES zaltyko.organization_members (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5133: AlterTableStmt
ALTER TABLE zaltyko.group_membership_history ADD CONSTRAINT group_membership_history_membership_fk FOREIGN KEY (organization_id, membership_id) REFERENCES zaltyko.group_memberships (organization_id, id) ON DELETE CASCADE;
-- snapshot source line 5134: AlterTableStmt
ALTER TABLE zaltyko.group_membership_history ADD CONSTRAINT group_membership_history_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5135: AlterTableStmt
ALTER TABLE zaltyko.group_memberships ADD CONSTRAINT group_memberships_athlete_fk FOREIGN KEY (organization_id, athlete_id) REFERENCES zaltyko.athletes (organization_id, id) ON DELETE CASCADE;
-- snapshot source line 5136: AlterTableStmt
ALTER TABLE zaltyko.group_memberships ADD CONSTRAINT group_memberships_group_fk FOREIGN KEY (organization_id, group_id) REFERENCES zaltyko.groups (organization_id, id) ON DELETE CASCADE;
-- snapshot source line 5137: AlterTableStmt
ALTER TABLE zaltyko.group_memberships ADD CONSTRAINT group_memberships_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5138: AlterTableStmt
ALTER TABLE zaltyko.groups ADD CONSTRAINT groups_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5139: AlterTableStmt
ALTER TABLE zaltyko.groups ADD CONSTRAINT groups_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5140: AlterTableStmt
ALTER TABLE zaltyko.groups ADD CONSTRAINT groups_program_fk FOREIGN KEY (organization_id, program_id) REFERENCES zaltyko.programs (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5141: AlterTableStmt
ALTER TABLE zaltyko.guardian_contacts ADD CONSTRAINT guardian_contacts_guardian_fk FOREIGN KEY (organization_id, guardian_id) REFERENCES zaltyko.guardians (organization_id, id) ON DELETE CASCADE;
-- snapshot source line 5142: AlterTableStmt
ALTER TABLE zaltyko.guardian_contacts ADD CONSTRAINT guardian_contacts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5143: AlterTableStmt
ALTER TABLE zaltyko.guardians ADD CONSTRAINT guardians_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users (id) ON DELETE SET NULL;
-- snapshot source line 5144: AlterTableStmt
ALTER TABLE zaltyko.guardians ADD CONSTRAINT guardians_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5145: AlterTableStmt
ALTER TABLE zaltyko.guardians ADD CONSTRAINT guardians_person_fk FOREIGN KEY (organization_id, person_id) REFERENCES zaltyko.people (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5146: AlterTableStmt
ALTER TABLE zaltyko.health_score_dimension_snapshots ADD CONSTRAINT health_score_dimension_snapshots_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5147: AlterTableStmt
ALTER TABLE zaltyko.health_score_dimension_snapshots ADD CONSTRAINT health_score_dimension_snapshots_parent_fk FOREIGN KEY (organization_id, health_score_snapshot_id) REFERENCES zaltyko.health_score_snapshots (organization_id, id) ON DELETE CASCADE;
-- snapshot source line 5148: AlterTableStmt
ALTER TABLE zaltyko.health_score_dimension_weights ADD CONSTRAINT health_score_dimension_weights_health_score_version_id_fkey FOREIGN KEY (health_score_version_id) REFERENCES zaltyko.health_score_versions (id) ON DELETE CASCADE;
-- snapshot source line 5149: AlterTableStmt
ALTER TABLE zaltyko.health_score_metric_contributions ADD CONSTRAINT health_score_metric_contributions_benchmark_target_id_fkey FOREIGN KEY (benchmark_target_id) REFERENCES zaltyko.benchmark_metric_targets (id) ON DELETE RESTRICT;
-- snapshot source line 5150: AlterTableStmt
ALTER TABLE zaltyko.health_score_metric_contributions ADD CONSTRAINT health_score_metric_contributions_metric_key_fkey FOREIGN KEY (metric_key) REFERENCES zaltyko.metric_definitions (key) ON DELETE RESTRICT;
-- snapshot source line 5151: AlterTableStmt
ALTER TABLE zaltyko.health_score_metric_contributions ADD CONSTRAINT health_score_metric_contributions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5152: AlterTableStmt
ALTER TABLE zaltyko.health_score_metric_contributions ADD CONSTRAINT health_score_metric_contributions_parent_fk FOREIGN KEY (organization_id, health_score_snapshot_id) REFERENCES zaltyko.health_score_snapshots (organization_id, id) ON DELETE CASCADE;
-- snapshot source line 5153: AlterTableStmt
ALTER TABLE zaltyko.health_score_metric_contributions ADD CONSTRAINT health_score_metric_contributions_value_fk FOREIGN KEY (organization_id, metric_run_value_id) REFERENCES zaltyko.metric_run_values (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5154: AlterTableStmt
ALTER TABLE zaltyko.health_score_metric_weights ADD CONSTRAINT health_score_metric_weights_health_score_version_id_fkey FOREIGN KEY (health_score_version_id) REFERENCES zaltyko.health_score_versions (id) ON DELETE CASCADE;
-- snapshot source line 5155: AlterTableStmt
ALTER TABLE zaltyko.health_score_metric_weights ADD CONSTRAINT health_score_metric_weights_metric_key_fkey FOREIGN KEY (metric_key) REFERENCES zaltyko.metric_definitions (key) ON DELETE RESTRICT;
-- snapshot source line 5156: AlterTableStmt
ALTER TABLE zaltyko.health_score_snapshots ADD CONSTRAINT health_score_snapshots_benchmark_profile_id_fkey FOREIGN KEY (benchmark_profile_id) REFERENCES zaltyko.benchmark_profiles (id) ON DELETE RESTRICT;
-- snapshot source line 5157: AlterTableStmt
ALTER TABLE zaltyko.health_score_snapshots ADD CONSTRAINT health_score_snapshots_health_score_version_id_fkey FOREIGN KEY (health_score_version_id) REFERENCES zaltyko.health_score_versions (id) ON DELETE RESTRICT;
-- snapshot source line 5158: AlterTableStmt
ALTER TABLE zaltyko.health_score_snapshots ADD CONSTRAINT health_score_snapshots_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5159: AlterTableStmt
ALTER TABLE zaltyko.health_score_snapshots ADD CONSTRAINT health_score_snapshots_metric_run_fk FOREIGN KEY (organization_id, metric_run_id) REFERENCES zaltyko.metric_runs (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5160: AlterTableStmt
ALTER TABLE zaltyko.health_score_snapshots ADD CONSTRAINT health_score_snapshots_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5161: AlterTableStmt
ALTER TABLE zaltyko.insight_actions ADD CONSTRAINT insight_actions_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users (id) ON DELETE RESTRICT;
-- snapshot source line 5162: AlterTableStmt
ALTER TABLE zaltyko.insight_actions ADD CONSTRAINT insight_actions_insight_fk FOREIGN KEY (organization_id, insight_id) REFERENCES zaltyko.insights (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5163: AlterTableStmt
ALTER TABLE zaltyko.insight_actions ADD CONSTRAINT insight_actions_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5164: AlterTableStmt
ALTER TABLE zaltyko.insight_actions ADD CONSTRAINT insight_actions_member_fk FOREIGN KEY (organization_id, actor_member_id) REFERENCES zaltyko.organization_members (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5165: AlterTableStmt
ALTER TABLE zaltyko.insight_actions ADD CONSTRAINT insight_actions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5166: AlterTableStmt
ALTER TABLE zaltyko.insight_notifications ADD CONSTRAINT insight_notifications_insight_fk FOREIGN KEY (organization_id, insight_id) REFERENCES zaltyko.insights (organization_id, id) ON DELETE CASCADE;
-- snapshot source line 5167: AlterTableStmt
ALTER TABLE zaltyko.insight_notifications ADD CONSTRAINT insight_notifications_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5168: AlterTableStmt
ALTER TABLE zaltyko.insight_rule_runs ADD CONSTRAINT insight_rule_runs_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5169: AlterTableStmt
ALTER TABLE zaltyko.insight_rule_runs ADD CONSTRAINT insight_rule_runs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5170: AlterTableStmt
ALTER TABLE zaltyko.insight_rule_runs ADD CONSTRAINT insight_rule_runs_rule_version_id_fkey FOREIGN KEY (rule_version_id) REFERENCES zaltyko.insight_rule_versions (id) ON DELETE RESTRICT;
-- snapshot source line 5171: AlterTableStmt
ALTER TABLE zaltyko.insight_run_observations ADD CONSTRAINT insight_run_observations_insight_fk FOREIGN KEY (organization_id, insight_id) REFERENCES zaltyko.insights (organization_id, id) ON DELETE CASCADE;
-- snapshot source line 5172: AlterTableStmt
ALTER TABLE zaltyko.insight_run_observations ADD CONSTRAINT insight_run_observations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5173: AlterTableStmt
ALTER TABLE zaltyko.insight_run_observations ADD CONSTRAINT insight_run_observations_run_fk FOREIGN KEY (organization_id, rule_run_id) REFERENCES zaltyko.insight_rule_runs (organization_id, id) ON DELETE CASCADE;
-- snapshot source line 5174: AlterTableStmt
ALTER TABLE zaltyko.insight_status_history ADD CONSTRAINT insight_status_history_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users (id) ON DELETE SET NULL;
-- snapshot source line 5175: AlterTableStmt
ALTER TABLE zaltyko.insight_status_history ADD CONSTRAINT insight_status_history_insight_fk FOREIGN KEY (organization_id, insight_id) REFERENCES zaltyko.insights (organization_id, id) ON DELETE CASCADE;
-- snapshot source line 5176: AlterTableStmt
ALTER TABLE zaltyko.insight_status_history ADD CONSTRAINT insight_status_history_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5177: AlterTableStmt
ALTER TABLE zaltyko.insight_status_history ADD CONSTRAINT insight_status_history_run_fk FOREIGN KEY (organization_id, rule_run_id) REFERENCES zaltyko.insight_rule_runs (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5178: AlterTableStmt
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_health_snapshot_fk FOREIGN KEY (organization_id, source_health_score_snapshot_id) REFERENCES zaltyko.health_score_snapshots (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5179: AlterTableStmt
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5180: AlterTableStmt
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_metric_run_fk FOREIGN KEY (organization_id, source_metric_run_id) REFERENCES zaltyko.metric_runs (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5181: AlterTableStmt
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5182: AlterTableStmt
ALTER TABLE zaltyko.insights ADD CONSTRAINT insights_rule_version_id_fkey FOREIGN KEY (rule_version_id) REFERENCES zaltyko.insight_rule_versions (id) ON DELETE RESTRICT;
-- snapshot source line 5183: AlterTableStmt
ALTER TABLE zaltyko.invoice_line_enrollments ADD CONSTRAINT invoice_line_enrollments_athlete_fk FOREIGN KEY (organization_id, athlete_id) REFERENCES zaltyko.athletes (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5184: AlterTableStmt
ALTER TABLE zaltyko.invoice_line_enrollments ADD CONSTRAINT invoice_line_enrollments_class_template_fk FOREIGN KEY (organization_id, location_id, class_template_id) REFERENCES zaltyko.class_templates (organization_id, location_id, id) ON DELETE RESTRICT;
-- snapshot source line 5185: AlterTableStmt
ALTER TABLE zaltyko.invoice_line_enrollments ADD CONSTRAINT invoice_line_enrollments_enrollment_fk FOREIGN KEY (organization_id, location_id, athlete_id, class_template_id, enrollment_id) REFERENCES zaltyko.enrollments (organization_id, location_id, athlete_id, class_template_id, id) ON DELETE RESTRICT;
-- snapshot source line 5186: AlterTableStmt
ALTER TABLE zaltyko.invoice_line_enrollments ADD CONSTRAINT invoice_line_enrollments_line_fk FOREIGN KEY (organization_id, location_id, athlete_id, price_plan_id, invoice_line_id) REFERENCES zaltyko.invoice_lines (organization_id, location_id, athlete_id, price_plan_id, id) ON DELETE RESTRICT;
-- snapshot source line 5187: AlterTableStmt
ALTER TABLE zaltyko.invoice_line_enrollments ADD CONSTRAINT invoice_line_enrollments_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5188: AlterTableStmt
ALTER TABLE zaltyko.invoice_line_enrollments ADD CONSTRAINT invoice_line_enrollments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5189: AlterTableStmt
ALTER TABLE zaltyko.invoice_line_enrollments ADD CONSTRAINT invoice_line_enrollments_price_assignment_fk FOREIGN KEY (organization_id, location_id, price_plan_id, enrollment_id, price_assignment_id) REFERENCES zaltyko.enrollment_price_assignments (organization_id, location_id, price_plan_id, enrollment_id, id) ON DELETE RESTRICT;
-- snapshot source line 5190: AlterTableStmt
ALTER TABLE zaltyko.invoice_lines ADD CONSTRAINT invoice_lines_athlete_fk FOREIGN KEY (organization_id, athlete_id) REFERENCES zaltyko.athletes (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5191: AlterTableStmt
ALTER TABLE zaltyko.invoice_lines ADD CONSTRAINT invoice_lines_enrollment_fk FOREIGN KEY (organization_id, enrollment_id) REFERENCES zaltyko.enrollments (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5192: AlterTableStmt
ALTER TABLE zaltyko.invoice_lines ADD CONSTRAINT invoice_lines_invoice_fk FOREIGN KEY (organization_id, invoice_id, currency) REFERENCES zaltyko.invoices (organization_id, id, currency) ON DELETE CASCADE;
-- snapshot source line 5193: AlterTableStmt
ALTER TABLE zaltyko.invoice_lines ADD CONSTRAINT invoice_lines_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5194: AlterTableStmt
ALTER TABLE zaltyko.invoice_lines ADD CONSTRAINT invoice_lines_location_invoice_fk FOREIGN KEY (organization_id, location_id, invoice_id) REFERENCES zaltyko.invoices (organization_id, location_id, id) ON DELETE CASCADE;
-- snapshot source line 5195: AlterTableStmt
ALTER TABLE zaltyko.invoice_lines ADD CONSTRAINT invoice_lines_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5196: AlterTableStmt
ALTER TABLE zaltyko.invoice_lines ADD CONSTRAINT invoice_lines_price_plan_fk FOREIGN KEY (organization_id, price_plan_id) REFERENCES zaltyko.price_plans (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5197: AlterTableStmt
ALTER TABLE zaltyko.invoices ADD CONSTRAINT invoices_family_fk FOREIGN KEY (organization_id, family_id) REFERENCES zaltyko.families (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5198: AlterTableStmt
ALTER TABLE zaltyko.invoices ADD CONSTRAINT invoices_family_payer_fk FOREIGN KEY (organization_id, family_id, family_payer_id) REFERENCES zaltyko.family_payers (organization_id, family_id, id) ON DELETE RESTRICT;
-- snapshot source line 5199: AlterTableStmt
ALTER TABLE zaltyko.invoices ADD CONSTRAINT invoices_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5200: AlterTableStmt
ALTER TABLE zaltyko.invoices ADD CONSTRAINT invoices_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5201: AlterTableStmt
ALTER TABLE zaltyko.locations ADD CONSTRAINT locations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5202: AlterTableStmt
ALTER TABLE zaltyko.member_location_scopes ADD CONSTRAINT member_location_scopes_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations (organization_id, id) ON DELETE CASCADE;
-- snapshot source line 5203: AlterTableStmt
ALTER TABLE zaltyko.member_location_scopes ADD CONSTRAINT member_location_scopes_member_fk FOREIGN KEY (organization_id, member_id) REFERENCES zaltyko.organization_members (organization_id, id) ON DELETE CASCADE;
-- snapshot source line 5204: AlterTableStmt
ALTER TABLE zaltyko.member_location_scopes ADD CONSTRAINT member_location_scopes_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5205: AlterTableStmt
ALTER TABLE zaltyko.metric_event_consumptions ADD CONSTRAINT metric_event_consumptions_event_fk FOREIGN KEY (organization_id, outbox_event_id) REFERENCES zaltyko.outbox_events (organization_id, id) ON DELETE CASCADE;
-- snapshot source line 5206: AlterTableStmt
ALTER TABLE zaltyko.metric_event_consumptions ADD CONSTRAINT metric_event_consumptions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5207: AlterTableStmt
ALTER TABLE zaltyko.metric_invalidations ADD CONSTRAINT metric_invalidations_event_fk FOREIGN KEY (organization_id, outbox_event_id) REFERENCES zaltyko.outbox_events (organization_id, id) ON DELETE CASCADE;
-- snapshot source line 5208: AlterTableStmt
ALTER TABLE zaltyko.metric_invalidations ADD CONSTRAINT metric_invalidations_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5209: AlterTableStmt
ALTER TABLE zaltyko.metric_invalidations ADD CONSTRAINT metric_invalidations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5210: AlterTableStmt
ALTER TABLE zaltyko.metric_run_values ADD CONSTRAINT metric_run_values_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5211: AlterTableStmt
ALTER TABLE zaltyko.metric_run_values ADD CONSTRAINT metric_run_values_metric_key_fkey FOREIGN KEY (metric_key) REFERENCES zaltyko.metric_definitions (key) ON DELETE RESTRICT;
-- snapshot source line 5212: AlterTableStmt
ALTER TABLE zaltyko.metric_run_values ADD CONSTRAINT metric_run_values_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5213: AlterTableStmt
ALTER TABLE zaltyko.metric_run_values ADD CONSTRAINT metric_run_values_run_fk FOREIGN KEY (organization_id, metric_run_id) REFERENCES zaltyko.metric_runs (organization_id, id) ON DELETE CASCADE;
-- snapshot source line 5214: AlterTableStmt
ALTER TABLE zaltyko.metric_runs ADD CONSTRAINT metric_runs_authorization_location_fk FOREIGN KEY (organization_id, authorization_location_id) REFERENCES zaltyko.locations (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5215: AlterTableStmt
ALTER TABLE zaltyko.metric_runs ADD CONSTRAINT metric_runs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5216: AlterTableStmt
ALTER TABLE zaltyko.metric_values ADD CONSTRAINT metric_values_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5217: AlterTableStmt
ALTER TABLE zaltyko.metric_values ADD CONSTRAINT metric_values_metric_key_fkey FOREIGN KEY (metric_key) REFERENCES zaltyko.metric_definitions (key) ON DELETE RESTRICT;
-- snapshot source line 5218: AlterTableStmt
ALTER TABLE zaltyko.metric_values ADD CONSTRAINT metric_values_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5219: AlterTableStmt
ALTER TABLE zaltyko.metric_values ADD CONSTRAINT metric_values_run_fk FOREIGN KEY (organization_id, metric_run_id) REFERENCES zaltyko.metric_runs (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5220: AlterTableStmt
ALTER TABLE zaltyko.organization_bootstrap_commands ADD CONSTRAINT organization_bootstrap_commands_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations (organization_id, id) ON DELETE CASCADE;
-- snapshot source line 5221: AlterTableStmt
ALTER TABLE zaltyko.organization_bootstrap_commands ADD CONSTRAINT organization_bootstrap_commands_member_fk FOREIGN KEY (organization_id, member_id) REFERENCES zaltyko.organization_members (organization_id, id) ON DELETE CASCADE;
-- snapshot source line 5222: AlterTableStmt
ALTER TABLE zaltyko.organization_bootstrap_commands ADD CONSTRAINT organization_bootstrap_commands_organization_fk FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5223: AlterTableStmt
ALTER TABLE zaltyko.organization_bootstrap_commands ADD CONSTRAINT organization_bootstrap_commands_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;
-- snapshot source line 5224: AlterTableStmt
ALTER TABLE zaltyko.organization_entitlement_changes ADD CONSTRAINT organization_entitlement_changes_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5225: AlterTableStmt
ALTER TABLE zaltyko.organization_entitlement_changes ADD CONSTRAINT organization_entitlement_changes_subscription_fk FOREIGN KEY (organization_id, subscription_id) REFERENCES zaltyko.organization_saas_subscriptions (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5226: AlterTableStmt
ALTER TABLE zaltyko.organization_entitlement_changes ADD CONSTRAINT organization_entitlement_changes_trial_fk FOREIGN KEY (organization_id, trial_id) REFERENCES zaltyko.organization_saas_trials (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5227: AlterTableStmt
ALTER TABLE zaltyko.organization_entitlements ADD CONSTRAINT organization_entitlements_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5228: AlterTableStmt
ALTER TABLE zaltyko.organization_entitlements ADD CONSTRAINT organization_entitlements_subscription_fk FOREIGN KEY (organization_id, subscription_id) REFERENCES zaltyko.organization_saas_subscriptions (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5229: AlterTableStmt
ALTER TABLE zaltyko.organization_entitlements ADD CONSTRAINT organization_entitlements_trial_fk FOREIGN KEY (organization_id, trial_id) REFERENCES zaltyko.organization_saas_trials (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5230: AlterTableStmt
ALTER TABLE zaltyko.organization_members ADD CONSTRAINT organization_members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5231: AlterTableStmt
ALTER TABLE zaltyko.organization_members ADD CONSTRAINT organization_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;
-- snapshot source line 5232: AlterTableStmt
ALTER TABLE zaltyko.organization_payment_provider_accounts ADD CONSTRAINT organization_payment_provider_accounts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE RESTRICT;
-- snapshot source line 5233: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operations_customer_fk FOREIGN KEY (organization_id, customer_id, environment, provider_account_reference) REFERENCES zaltyko.organization_saas_customers (organization_id, id, environment, provider_account_reference) ON DELETE RESTRICT;
-- snapshot source line 5234: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5235: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_checkout_operations ADD CONSTRAINT organization_saas_checkout_operations_owner_fk FOREIGN KEY (organization_id, requested_by_member_id) REFERENCES zaltyko.organization_members (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5236: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_customers ADD CONSTRAINT organization_saas_customers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5237: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_subscriptions ADD CONSTRAINT organization_saas_subscriptions_customer_fk FOREIGN KEY (organization_id, environment, provider_account_reference, customer_reference) REFERENCES zaltyko.organization_saas_customers (organization_id, environment, provider_account_reference, customer_reference) ON DELETE RESTRICT NOT VALID;
-- snapshot source line 5238: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_subscriptions ADD CONSTRAINT organization_saas_subscriptions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5239: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_trials ADD CONSTRAINT organization_saas_trials_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5240: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_trials ADD CONSTRAINT organization_saas_trials_starter_fk FOREIGN KEY (organization_id, started_by_member_id) REFERENCES zaltyko.organization_members (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5241: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT organization_saas_webhook_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE SET NULL;
-- snapshot source line 5242: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_events ADD CONSTRAINT saas_webhook_event_reconciliation_fk FOREIGN KEY (organization_id, id, reconciliation_decision_id) REFERENCES zaltyko.organization_saas_webhook_reconciliation_decisions (organization_id, webhook_event_id, id) ON DELETE RESTRICT;
-- snapshot source line 5243: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_payload_conflicts ADD CONSTRAINT organization_saas_webhook_payload_conflic_webhook_event_id_fkey FOREIGN KEY (webhook_event_id) REFERENCES zaltyko.organization_saas_webhook_events (id) ON DELETE RESTRICT;
-- snapshot source line 5244: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_reconciliation_d_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE RESTRICT;
-- snapshot source line 5245: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT organization_saas_webhook_reconciliation_dec_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users (id) ON DELETE RESTRICT;
-- snapshot source line 5246: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ADD CONSTRAINT saas_webhook_reconciliation_event_fk FOREIGN KEY (organization_id, webhook_event_id) REFERENCES zaltyko.organization_saas_webhook_events (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5247: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_results ADD CONSTRAINT organization_saas_webhook_reconciliation_resul_decision_id_fkey FOREIGN KEY (decision_id) REFERENCES zaltyko.organization_saas_webhook_reconciliation_decisions (id) ON DELETE RESTRICT;
-- snapshot source line 5248: AlterTableStmt
ALTER TABLE zaltyko.organization_sports ADD CONSTRAINT organization_sports_country_fk FOREIGN KEY (organization_id, country_code) REFERENCES zaltyko.organizations (id, country_code) ON DELETE CASCADE;
-- snapshot source line 5249: AlterTableStmt
ALTER TABLE zaltyko.organization_sports ADD CONSTRAINT organization_sports_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5250: AlterTableStmt
ALTER TABLE zaltyko.organization_sports ADD CONSTRAINT organization_sports_profile_fk FOREIGN KEY (country_code, sport_profile_id) REFERENCES zaltyko.sport_profiles (country_code, id) ON DELETE RESTRICT;
-- snapshot source line 5251: AlterTableStmt
ALTER TABLE zaltyko.outbox_events ADD CONSTRAINT outbox_events_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5252: AlterTableStmt
ALTER TABLE zaltyko.outbox_events ADD CONSTRAINT outbox_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5253: AlterTableStmt
ALTER TABLE zaltyko.owner_dashboard_layouts ADD CONSTRAINT owner_dashboard_layouts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5254: AlterTableStmt
ALTER TABLE zaltyko.owner_dashboard_layouts ADD CONSTRAINT owner_dashboard_layouts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;
-- snapshot source line 5255: AlterTableStmt
ALTER TABLE zaltyko.owner_signup_consents ADD CONSTRAINT owner_signup_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;
-- snapshot source line 5256: AlterTableStmt
ALTER TABLE zaltyko.payment_allocations ADD CONSTRAINT payment_allocations_charge_fk FOREIGN KEY (organization_id, charge_id, currency) REFERENCES zaltyko.charges (organization_id, id, currency) ON DELETE RESTRICT;
-- snapshot source line 5257: AlterTableStmt
ALTER TABLE zaltyko.payment_allocations ADD CONSTRAINT payment_allocations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5258: AlterTableStmt
ALTER TABLE zaltyko.payment_allocations ADD CONSTRAINT payment_allocations_payment_fk FOREIGN KEY (organization_id, payment_id, currency) REFERENCES zaltyko.payments (organization_id, id, currency) ON DELETE RESTRICT;
-- snapshot source line 5259: AlterTableStmt
ALTER TABLE zaltyko.payment_attempts ADD CONSTRAINT payment_attempts_family_fk FOREIGN KEY (organization_id, family_id) REFERENCES zaltyko.families (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5260: AlterTableStmt
ALTER TABLE zaltyko.payment_attempts ADD CONSTRAINT payment_attempts_family_payer_fk FOREIGN KEY (organization_id, family_id, family_payer_id) REFERENCES zaltyko.family_payers (organization_id, family_id, id) ON DELETE RESTRICT;
-- snapshot source line 5261: AlterTableStmt
ALTER TABLE zaltyko.payment_attempts ADD CONSTRAINT payment_attempts_invoice_fk FOREIGN KEY (organization_id, invoice_id, currency) REFERENCES zaltyko.invoices (organization_id, id, currency) ON DELETE RESTRICT;
-- snapshot source line 5262: AlterTableStmt
ALTER TABLE zaltyko.payment_attempts ADD CONSTRAINT payment_attempts_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5263: AlterTableStmt
ALTER TABLE zaltyko.payment_attempts ADD CONSTRAINT payment_attempts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5264: AlterTableStmt
ALTER TABLE zaltyko.payment_attempts ADD CONSTRAINT payment_attempts_payment_fk FOREIGN KEY (organization_id, payment_id, currency) REFERENCES zaltyko.payments (organization_id, id, currency) ON DELETE RESTRICT;
-- snapshot source line 5265: AlterTableStmt
ALTER TABLE zaltyko.payment_attempts ADD CONSTRAINT payment_attempts_provider_event_fk FOREIGN KEY (organization_id, provider_event_id) REFERENCES zaltyko.payment_provider_events (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5266: AlterTableStmt
ALTER TABLE zaltyko.payment_provider_events ADD CONSTRAINT payment_provider_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5267: AlterTableStmt
ALTER TABLE zaltyko.payments ADD CONSTRAINT payments_family_fk FOREIGN KEY (organization_id, family_id) REFERENCES zaltyko.families (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5268: AlterTableStmt
ALTER TABLE zaltyko.payments ADD CONSTRAINT payments_family_payer_fk FOREIGN KEY (organization_id, family_id, family_payer_id) REFERENCES zaltyko.family_payers (organization_id, family_id, id) ON DELETE RESTRICT;
-- snapshot source line 5269: AlterTableStmt
ALTER TABLE zaltyko.payments ADD CONSTRAINT payments_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5270: AlterTableStmt
ALTER TABLE zaltyko.payments ADD CONSTRAINT payments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5271: AlterTableStmt
ALTER TABLE zaltyko.payments ADD CONSTRAINT payments_recorded_by_user_id_fkey FOREIGN KEY (recorded_by_user_id) REFERENCES auth.users (id) ON DELETE RESTRICT;
-- snapshot source line 5272: AlterTableStmt
ALTER TABLE zaltyko.people ADD CONSTRAINT people_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5273: AlterTableStmt
ALTER TABLE zaltyko.price_plan_class_template_coverage ADD CONSTRAINT price_plan_class_template_coverage_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5274: AlterTableStmt
ALTER TABLE zaltyko.price_plan_class_template_coverage ADD CONSTRAINT price_plan_class_template_coverage_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5275: AlterTableStmt
ALTER TABLE zaltyko.price_plan_class_template_coverage ADD CONSTRAINT price_plan_class_template_coverage_plan_fk FOREIGN KEY (organization_id, price_plan_id) REFERENCES zaltyko.price_plans (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5276: AlterTableStmt
ALTER TABLE zaltyko.price_plan_class_template_coverage ADD CONSTRAINT price_plan_class_template_coverage_template_fk FOREIGN KEY (organization_id, location_id, class_template_id) REFERENCES zaltyko.class_templates (organization_id, location_id, id) ON DELETE RESTRICT;
-- snapshot source line 5277: AlterTableStmt
ALTER TABLE zaltyko.price_plans ADD CONSTRAINT price_plans_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5278: AlterTableStmt
ALTER TABLE zaltyko.programs ADD CONSTRAINT programs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5279: AlterTableStmt
ALTER TABLE zaltyko.programs ADD CONSTRAINT programs_organization_sport_fk FOREIGN KEY (organization_id, organization_sport_id) REFERENCES zaltyko.organization_sports (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5280: AlterTableStmt
ALTER TABLE zaltyko.refunds ADD CONSTRAINT refunds_allocation_fk FOREIGN KEY (organization_id, payment_allocation_id, currency) REFERENCES zaltyko.payment_allocations (organization_id, id, currency) ON DELETE RESTRICT;
-- snapshot source line 5281: AlterTableStmt
ALTER TABLE zaltyko.refunds ADD CONSTRAINT refunds_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5282: AlterTableStmt
ALTER TABLE zaltyko.refunds ADD CONSTRAINT refunds_payment_fk FOREIGN KEY (organization_id, payment_id, currency) REFERENCES zaltyko.payments (organization_id, id, currency) ON DELETE RESTRICT;
-- snapshot source line 5283: AlterTableStmt
ALTER TABLE zaltyko.refunds ADD CONSTRAINT refunds_provider_event_fk FOREIGN KEY (organization_id, provider_event_id) REFERENCES zaltyko.payment_provider_events (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5284: AlterTableStmt
ALTER TABLE zaltyko.retention_cohort_projection_runs ADD CONSTRAINT retention_cohort_projection_runs_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5285: AlterTableStmt
ALTER TABLE zaltyko.retention_cohort_projection_runs ADD CONSTRAINT retention_cohort_projection_runs_metric_run_fk FOREIGN KEY (organization_id, metric_run_id) REFERENCES zaltyko.metric_runs (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5286: AlterTableStmt
ALTER TABLE zaltyko.retention_cohort_projection_runs ADD CONSTRAINT retention_cohort_projection_runs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5287: AlterTableStmt
ALTER TABLE zaltyko.retention_cohort_projections ADD CONSTRAINT retention_cohort_projections_group_fk FOREIGN KEY (organization_id, group_id) REFERENCES zaltyko.groups (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5288: AlterTableStmt
ALTER TABLE zaltyko.retention_cohort_projections ADD CONSTRAINT retention_cohort_projections_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5289: AlterTableStmt
ALTER TABLE zaltyko.retention_cohort_projections ADD CONSTRAINT retention_cohort_projections_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5290: AlterTableStmt
ALTER TABLE zaltyko.retention_cohort_projections ADD CONSTRAINT retention_cohort_projections_program_fk FOREIGN KEY (organization_id, program_id) REFERENCES zaltyko.programs (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5291: AlterTableStmt
ALTER TABLE zaltyko.retention_cohort_projections ADD CONSTRAINT retention_cohort_projections_run_fk FOREIGN KEY (organization_id, projection_run_id) REFERENCES zaltyko.retention_cohort_projection_runs (organization_id, id) ON DELETE CASCADE;
-- snapshot source line 5292: AlterTableStmt
ALTER TABLE zaltyko.session_staff ADD CONSTRAINT session_staff_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5293: AlterTableStmt
ALTER TABLE zaltyko.session_staff ADD CONSTRAINT session_staff_profile_fk FOREIGN KEY (organization_id, staff_profile_id) REFERENCES zaltyko.staff_profiles (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5294: AlterTableStmt
ALTER TABLE zaltyko.session_staff ADD CONSTRAINT session_staff_session_fk FOREIGN KEY (organization_id, session_id) REFERENCES zaltyko.sessions (organization_id, id) ON DELETE CASCADE;
-- snapshot source line 5295: AlterTableStmt
ALTER TABLE zaltyko.sessions ADD CONSTRAINT sessions_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5296: AlterTableStmt
ALTER TABLE zaltyko.sessions ADD CONSTRAINT sessions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5297: AlterTableStmt
ALTER TABLE zaltyko.sessions ADD CONSTRAINT sessions_space_fk FOREIGN KEY (organization_id, space_id) REFERENCES zaltyko.spaces (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5298: AlterTableStmt
ALTER TABLE zaltyko.sessions ADD CONSTRAINT sessions_template_fk FOREIGN KEY (organization_id, class_template_id) REFERENCES zaltyko.class_templates (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5299: AlterTableStmt
ALTER TABLE zaltyko.spaces ADD CONSTRAINT spaces_facility_fk FOREIGN KEY (organization_id, facility_id) REFERENCES zaltyko.facilities (organization_id, id) ON DELETE CASCADE;
-- snapshot source line 5300: AlterTableStmt
ALTER TABLE zaltyko.spaces ADD CONSTRAINT spaces_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations (organization_id, id) ON DELETE CASCADE;
-- snapshot source line 5301: AlterTableStmt
ALTER TABLE zaltyko.spaces ADD CONSTRAINT spaces_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5302: AlterTableStmt
ALTER TABLE zaltyko.staff_profiles ADD CONSTRAINT staff_profiles_member_fk FOREIGN KEY (organization_id, member_id) REFERENCES zaltyko.organization_members (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5303: AlterTableStmt
ALTER TABLE zaltyko.staff_profiles ADD CONSTRAINT staff_profiles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5304: AlterTableStmt
ALTER TABLE zaltyko.staff_profiles ADD CONSTRAINT staff_profiles_person_fk FOREIGN KEY (organization_id, person_id) REFERENCES zaltyko.people (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5305: AlterTableStmt
ALTER TABLE zaltyko.trial_followups ADD CONSTRAINT trial_followups_member_fk FOREIGN KEY (organization_id, completed_by_member_id) REFERENCES zaltyko.organization_members (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5306: AlterTableStmt
ALTER TABLE zaltyko.trial_followups ADD CONSTRAINT trial_followups_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5307: AlterTableStmt
ALTER TABLE zaltyko.trial_followups ADD CONSTRAINT trial_followups_trial_fk FOREIGN KEY (organization_id, location_id, trial_id) REFERENCES zaltyko.trials (organization_id, location_id, id) ON DELETE CASCADE;
-- snapshot source line 5308: AlterTableStmt
ALTER TABLE zaltyko.trial_status_history ADD CONSTRAINT trial_status_history_member_fk FOREIGN KEY (organization_id, changed_by_member_id) REFERENCES zaltyko.organization_members (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5309: AlterTableStmt
ALTER TABLE zaltyko.trial_status_history ADD CONSTRAINT trial_status_history_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5310: AlterTableStmt
ALTER TABLE zaltyko.trial_status_history ADD CONSTRAINT trial_status_history_trial_fk FOREIGN KEY (organization_id, location_id, trial_id) REFERENCES zaltyko.trials (organization_id, location_id, id) ON DELETE CASCADE;
-- snapshot source line 5311: AlterTableStmt
ALTER TABLE zaltyko.trials ADD CONSTRAINT trials_athlete_fk FOREIGN KEY (organization_id, athlete_id) REFERENCES zaltyko.athletes (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5312: AlterTableStmt
ALTER TABLE zaltyko.trials ADD CONSTRAINT trials_converted_enrollment_fk FOREIGN KEY (organization_id, location_id, converted_enrollment_id) REFERENCES zaltyko.enrollments (organization_id, location_id, id) ON DELETE RESTRICT;
-- snapshot source line 5313: AlterTableStmt
ALTER TABLE zaltyko.trials ADD CONSTRAINT trials_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5314: AlterTableStmt
ALTER TABLE zaltyko.trials ADD CONSTRAINT trials_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5315: AlterTableStmt
ALTER TABLE zaltyko.trials ADD CONSTRAINT trials_session_fk FOREIGN KEY (organization_id, location_id, session_id) REFERENCES zaltyko.sessions (organization_id, location_id, id) ON DELETE RESTRICT;
-- snapshot source line 5316: AlterTableStmt
ALTER TABLE zaltyko.trials ADD CONSTRAINT trials_trial_enrollment_fk FOREIGN KEY (organization_id, location_id, trial_enrollment_id) REFERENCES zaltyko.enrollments (organization_id, location_id, id) ON DELETE RESTRICT;
-- snapshot source line 5317: AlterTableStmt
ALTER TABLE zaltyko.waitlist_entries ADD CONSTRAINT waitlist_entries_athlete_fk FOREIGN KEY (organization_id, athlete_id) REFERENCES zaltyko.athletes (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5318: AlterTableStmt
ALTER TABLE zaltyko.waitlist_entries ADD CONSTRAINT waitlist_entries_contact_guardian_fk FOREIGN KEY (organization_id, contact_guardian_id) REFERENCES zaltyko.guardians (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5319: AlterTableStmt
ALTER TABLE zaltyko.waitlist_entries ADD CONSTRAINT waitlist_entries_converted_enrollment_fk FOREIGN KEY (organization_id, location_id, converted_enrollment_id) REFERENCES zaltyko.enrollments (organization_id, location_id, id) ON DELETE RESTRICT;
-- snapshot source line 5320: AlterTableStmt
ALTER TABLE zaltyko.waitlist_entries ADD CONSTRAINT waitlist_entries_location_fk FOREIGN KEY (organization_id, location_id) REFERENCES zaltyko.locations (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5321: AlterTableStmt
ALTER TABLE zaltyko.waitlist_entries ADD CONSTRAINT waitlist_entries_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5322: AlterTableStmt
ALTER TABLE zaltyko.waitlist_entries ADD CONSTRAINT waitlist_entries_program_fk FOREIGN KEY (organization_id, program_id) REFERENCES zaltyko.programs (organization_id, id) ON DELETE RESTRICT;
-- snapshot source line 5323: AlterTableStmt
ALTER TABLE zaltyko.waitlist_entries ADD CONSTRAINT waitlist_entries_source_trial_fk FOREIGN KEY (organization_id, location_id, source_trial_id) REFERENCES zaltyko.trials (organization_id, location_id, id) ON DELETE RESTRICT;
-- snapshot source line 5324: AlterTableStmt
ALTER TABLE zaltyko.waitlist_entries ADD CONSTRAINT waitlist_entries_template_fk FOREIGN KEY (organization_id, location_id, class_template_id) REFERENCES zaltyko.class_templates (organization_id, location_id, id) ON DELETE RESTRICT;
-- snapshot source line 5325: AlterTableStmt
ALTER TABLE zaltyko.waitlist_offers ADD CONSTRAINT waitlist_offers_enrollment_fk FOREIGN KEY (organization_id, location_id, reserved_enrollment_id) REFERENCES zaltyko.enrollments (organization_id, location_id, id) ON DELETE RESTRICT;
-- snapshot source line 5326: AlterTableStmt
ALTER TABLE zaltyko.waitlist_offers ADD CONSTRAINT waitlist_offers_entry_fk FOREIGN KEY (organization_id, location_id, waitlist_entry_id) REFERENCES zaltyko.waitlist_entries (organization_id, location_id, id) ON DELETE CASCADE;
-- snapshot source line 5327: AlterTableStmt
ALTER TABLE zaltyko.waitlist_offers ADD CONSTRAINT waitlist_offers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES zaltyko.organizations (id) ON DELETE CASCADE;
-- snapshot source line 5328: AlterTableStmt
ALTER TABLE zaltyko.waitlist_offers ADD CONSTRAINT waitlist_offers_template_fk FOREIGN KEY (organization_id, location_id, class_template_id) REFERENCES zaltyko.class_templates (organization_id, location_id, id) ON DELETE RESTRICT;
-- snapshot source line 5579: CreateFunctionStmt
CREATE OR REPLACE FUNCTION zaltyko.guard_entitlement_revision() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'pg_catalog', 'zaltyko' AS $$
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
$$;
-- snapshot source line 5602: CreateFunctionStmt
CREATE OR REPLACE FUNCTION zaltyko.guard_organization_saas_trial() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'pg_catalog', 'zaltyko' AS $$
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
$$;
-- snapshot source line 5694: CreateFunctionStmt
CREATE OR REPLACE FUNCTION zaltyko.guard_organization_saas_webhook_identity() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'pg_catalog', 'zaltyko' AS $$
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
$$;
-- snapshot source line 5720: CreateFunctionStmt
CREATE OR REPLACE FUNCTION zaltyko.guard_saas_reconciliation_decision_link() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'pg_catalog', 'zaltyko' AS $$
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
$$;
-- snapshot source line 5753: CreateFunctionStmt
CREATE OR REPLACE FUNCTION zaltyko.guard_saas_reconciliation_result_insert() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'pg_catalog', 'zaltyko' AS $$
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
$$;
-- snapshot source line 5990: CreateFunctionStmt
CREATE OR REPLACE FUNCTION zaltyko.guard_saas_webhook_requeue() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'pg_catalog', 'zaltyko' AS $$
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
$$;
-- snapshot source line 6246: CreateFunctionStmt
CREATE OR REPLACE FUNCTION zaltyko.record_entitlement_revision() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'pg_catalog', 'zaltyko' AS $$
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
$$;
-- snapshot source line 6269: CreateFunctionStmt
CREATE OR REPLACE FUNCTION zaltyko.reject_entitlement_history_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'pg_catalog', 'zaltyko' AS $$
begin
  raise exception 'organization_entitlement_changes is append-only'
    using errcode = '55000';
end;
$$;
-- snapshot source line 6282: CreateFunctionStmt
CREATE OR REPLACE FUNCTION zaltyko.reject_owner_signup_consent_audit_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'pg_catalog' AS $$
begin
  raise exception 'owner signup consent audit is append-only';
end;
$$;
-- snapshot source line 6294: CreateFunctionStmt
CREATE OR REPLACE FUNCTION zaltyko.reject_saas_reconciliation_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  RAISE EXCEPTION 'SaaS webhook reconciliation records are append-only'
    USING ERRCODE = '55000';
END
$$;
-- snapshot source line 6307: CreateFunctionStmt
CREATE OR REPLACE FUNCTION zaltyko.seed_free_entitlement() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'pg_catalog', 'zaltyko' AS $$
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
$$;
-- snapshot source line 6326: CreateFunctionStmt
CREATE OR REPLACE FUNCTION zaltyko_domain_private.has_location_access(target_organization_id uuid, target_location_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
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
$$;
-- snapshot source line 6353: CreateFunctionStmt
CREATE OR REPLACE FUNCTION zaltyko_domain_private.has_organization_access(target_organization_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  select exists (
    select 1
    from zaltyko.organization_members member
    where member.organization_id = target_organization_id
      and member.user_id = auth.uid()
      and member.status = 'active'
  )
$$;
-- snapshot source line 6370: CreateFunctionStmt
CREATE OR REPLACE FUNCTION zaltyko_domain_private.prevent_invoice_line_enrollment_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'pg_catalog' AS $$
begin
  raise exception using
    errcode = '55000',
    message = 'invoice line enrollment history is immutable';
end
$$;
-- snapshot source line 6384: CreateFunctionStmt
CREATE OR REPLACE FUNCTION zaltyko_domain_private.reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
begin
  raise exception 'zaltyko.audit_log is append-only' using errcode = '55000';
end
$$;
-- snapshot source line 6397: CreateFunctionStmt
CREATE OR REPLACE FUNCTION zaltyko_domain_private.reject_insight_history_mutation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
begin
  raise exception 'zaltyko.insight_status_history is append-only' using errcode = '55000';
end
$$;
-- snapshot source line 7118: IndexStmt
CREATE INDEX athletes_organization_active_idx ON zaltyko.athletes (organization_id, is_active);
-- snapshot source line 7119: IndexStmt
CREATE INDEX attendance_records_athlete_idx ON zaltyko.attendance_records (organization_id, athlete_id, recorded_at);
-- snapshot source line 7120: IndexStmt
CREATE INDEX audit_log_created_idx ON zaltyko.audit_log (organization_id, created_at);
-- snapshot source line 7121: IndexStmt
CREATE UNIQUE INDEX audit_log_idempotency_uq ON zaltyko.audit_log (organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
-- snapshot source line 7122: IndexStmt
CREATE INDEX audit_log_target_idx ON zaltyko.audit_log (organization_id, target_type, target_id);
-- snapshot source line 7123: IndexStmt
CREATE UNIQUE INDEX benchmark_profiles_key_version_uq ON zaltyko.benchmark_profiles ((COALESCE(organization_id, CAST('00000000-0000-0000-0000-000000000000' AS uuid))), key, version);
-- snapshot source line 7124: IndexStmt
CREATE INDEX charges_due_status_idx ON zaltyko.charges (organization_id, status, due_at);
-- snapshot source line 7125: IndexStmt
CREATE INDEX charges_service_period_idx ON zaltyko.charges (organization_id, currency, service_period_start, service_period_end);
-- snapshot source line 7126: IndexStmt
CREATE INDEX class_templates_location_status_idx ON zaltyko.class_templates (organization_id, location_id, status);
-- snapshot source line 7127: IndexStmt
CREATE INDEX data_quality_issues_open_idx ON zaltyko.data_quality_issues (organization_id, status, detected_at DESC);
-- snapshot source line 7128: IndexStmt
CREATE INDEX enrollment_pauses_enrollment_idx ON zaltyko.enrollment_pauses (organization_id, enrollment_id);
-- snapshot source line 7129: IndexStmt
CREATE UNIQUE INDEX enrollment_pauses_one_open_uq ON zaltyko.enrollment_pauses (organization_id, enrollment_id) WHERE ends_on IS NULL;
-- snapshot source line 7130: IndexStmt
CREATE UNIQUE INDEX enrollment_price_assignments_one_open_uq ON zaltyko.enrollment_price_assignments (organization_id, enrollment_id) WHERE ends_on IS NULL;
-- snapshot source line 7131: IndexStmt
CREATE INDEX enrollment_price_assignments_period_idx ON zaltyko.enrollment_price_assignments (organization_id, enrollment_id, starts_on, ends_on);
-- snapshot source line 7132: IndexStmt
CREATE INDEX enrollment_status_history_effective_idx ON zaltyko.enrollment_status_history (organization_id, enrollment_id, effective_on, changed_at);
-- snapshot source line 7133: IndexStmt
CREATE INDEX enrollment_status_history_enrollment_idx ON zaltyko.enrollment_status_history (organization_id, enrollment_id, changed_at);
-- snapshot source line 7134: IndexStmt
CREATE INDEX enrollments_athlete_status_idx ON zaltyko.enrollments (organization_id, athlete_id, status);
-- snapshot source line 7135: IndexStmt
CREATE INDEX enrollments_class_status_idx ON zaltyko.enrollments (organization_id, class_template_id, status);
-- snapshot source line 7136: IndexStmt
CREATE UNIQUE INDEX enrollments_open_uq ON zaltyko.enrollments (organization_id, athlete_id, class_template_id) WHERE status = ANY(ARRAY[CAST('pending' AS zaltyko.enrollment_status), CAST('trial' AS zaltyko.enrollment_status), CAST('active' AS zaltyko.enrollment_status), CAST('paused' AS zaltyko.enrollment_status)]);
-- snapshot source line 7137: IndexStmt
CREATE INDEX facilities_location_idx ON zaltyko.facilities (organization_id, location_id);
-- snapshot source line 7138: IndexStmt
CREATE INDEX families_organization_active_idx ON zaltyko.families (organization_id, is_active);
-- snapshot source line 7139: IndexStmt
CREATE INDEX family_collection_preferences_mode_idx ON zaltyko.family_collection_preferences (organization_id, requested_mode, entitlement_revision);
-- snapshot source line 7140: IndexStmt
CREATE INDEX family_members_athlete_idx ON zaltyko.family_members (organization_id, athlete_id, ends_on);
-- snapshot source line 7141: IndexStmt
CREATE UNIQUE INDEX family_members_one_open_uq ON zaltyko.family_members (organization_id, family_id, athlete_id) WHERE ends_on IS NULL;
-- snapshot source line 7142: IndexStmt
CREATE INDEX family_payers_guardian_idx ON zaltyko.family_payers (organization_id, guardian_id, ends_on);
-- snapshot source line 7143: IndexStmt
CREATE UNIQUE INDEX family_payers_one_primary_uq ON zaltyko.family_payers (organization_id, family_id) WHERE is_primary AND ends_on IS NULL;
-- snapshot source line 7144: IndexStmt
CREATE UNIQUE INDEX family_payers_organization_id_id_uq ON zaltyko.family_payers (organization_id, id);
-- snapshot source line 7145: IndexStmt
CREATE UNIQUE INDEX family_payment_authorizations_active_method_uq ON zaltyko.family_payment_authorizations (organization_id, payment_provider_account_id, family_payer_id) WHERE status = CAST('active' AS zaltyko.payment_authorization_status);
-- snapshot source line 7146: IndexStmt
CREATE INDEX family_payment_authorizations_payer_status_idx ON zaltyko.family_payment_authorizations (organization_id, family_id, family_payer_id, status, valid_until);
-- snapshot source line 7147: IndexStmt
CREATE INDEX group_membership_history_effective_idx ON zaltyko.group_membership_history (organization_id, membership_id, effective_on, changed_at);
-- snapshot source line 7148: IndexStmt
CREATE INDEX group_membership_history_membership_idx ON zaltyko.group_membership_history (organization_id, membership_id, changed_at);
-- snapshot source line 7149: IndexStmt
CREATE INDEX group_memberships_athlete_idx ON zaltyko.group_memberships (organization_id, athlete_id, status);
-- snapshot source line 7150: IndexStmt
CREATE INDEX group_memberships_group_idx ON zaltyko.group_memberships (organization_id, group_id, status);
-- snapshot source line 7151: IndexStmt
CREATE UNIQUE INDEX group_memberships_open_uq ON zaltyko.group_memberships (organization_id, group_id, athlete_id) WHERE status = ANY(ARRAY[CAST('pending' AS zaltyko.group_membership_status), CAST('active' AS zaltyko.group_membership_status), CAST('paused' AS zaltyko.group_membership_status)]);
-- snapshot source line 7152: IndexStmt
CREATE INDEX groups_location_status_idx ON zaltyko.groups (organization_id, location_id, status);
-- snapshot source line 7153: IndexStmt
CREATE UNIQUE INDEX guardian_contacts_primary_kind_uq ON zaltyko.guardian_contacts (organization_id, guardian_id, kind) WHERE is_primary;
-- snapshot source line 7154: IndexStmt
CREATE INDEX guardians_auth_user_idx ON zaltyko.guardians (auth_user_id);
-- snapshot source line 7155: IndexStmt
CREATE INDEX health_score_snapshots_dashboard_idx ON zaltyko.health_score_snapshots (organization_id, period_end DESC, computed_at DESC);
-- snapshot source line 7156: IndexStmt
CREATE INDEX insights_inbox_idx ON zaltyko.insights (organization_id, status, priority_score DESC, last_seen_at DESC);
-- snapshot source line 7157: IndexStmt
CREATE INDEX insights_location_inbox_idx ON zaltyko.insights (organization_id, location_id, status, priority_score DESC);
-- snapshot source line 7158: IndexStmt
CREATE INDEX invoice_line_enrollments_enrollment_idx ON zaltyko.invoice_line_enrollments (organization_id, location_id, enrollment_id);
-- snapshot source line 7159: IndexStmt
CREATE INDEX invoice_lines_invoice_idx ON zaltyko.invoice_lines (organization_id, invoice_id);
-- snapshot source line 7160: IndexStmt
CREATE UNIQUE INDEX invoice_lines_monthly_athlete_uq ON zaltyko.invoice_lines (organization_id, invoice_id, athlete_id, service_period_start, service_period_end) WHERE line_type = CAST('monthly_fee' AS text) AND athlete_id IS NOT NULL;
-- snapshot source line 7161: IndexStmt
CREATE INDEX invoices_due_status_idx ON zaltyko.invoices (organization_id, status, due_at);
-- snapshot source line 7162: IndexStmt
CREATE INDEX locations_organization_idx ON zaltyko.locations (organization_id);
-- snapshot source line 7163: IndexStmt
CREATE INDEX member_location_scopes_location_idx ON zaltyko.member_location_scopes (organization_id, location_id);
-- snapshot source line 7164: IndexStmt
CREATE INDEX metric_invalidations_pending_idx ON zaltyko.metric_invalidations (organization_id, status, affected_from, affected_to);
-- snapshot source line 7165: IndexStmt
CREATE UNIQUE INDEX metric_run_values_natural_uq ON zaltyko.metric_run_values (metric_run_id, (COALESCE(location_id, CAST('00000000-0000-0000-0000-000000000000' AS uuid))), metric_key, dimensions_sha256, (COALESCE(currency, CAST('' AS text))));
-- snapshot source line 7166: IndexStmt
CREATE INDEX metric_runs_period_idx ON zaltyko.metric_runs (organization_id, period_end DESC, started_at DESC);
-- snapshot source line 7167: IndexStmt
CREATE INDEX metric_values_dashboard_idx ON zaltyko.metric_values (organization_id, period_end DESC, metric_key);
-- snapshot source line 7168: IndexStmt
CREATE UNIQUE INDEX metric_values_natural_uq ON zaltyko.metric_values (organization_id, (COALESCE(location_id, CAST('00000000-0000-0000-0000-000000000000' AS uuid))), metric_key, period_start, period_end, dimensions_sha256, formula_version, (COALESCE(currency, CAST('' AS text))));
-- snapshot source line 7169: IndexStmt
CREATE INDEX organization_entitlement_changes_history_idx ON zaltyko.organization_entitlement_changes (organization_id, revision DESC);
-- snapshot source line 7170: IndexStmt
CREATE INDEX organization_members_user_idx ON zaltyko.organization_members (user_id);
-- snapshot source line 7171: IndexStmt
CREATE INDEX organization_payment_provider_accounts_collection_ready_idx ON zaltyko.organization_payment_provider_accounts (organization_id, environment, status, card_payments_capability_status);
-- snapshot source line 7172: IndexStmt
CREATE UNIQUE INDEX organization_saas_checkout_one_pending_per_org_uq ON zaltyko.organization_saas_checkout_operations (organization_id) WHERE status = ANY(ARRAY[CAST('requested' AS text), CAST('creating_customer' AS text), CAST('creating_session' AS text), CAST('open' AS text), CAST('recovery_required' AS text)]);
-- snapshot source line 7173: IndexStmt
CREATE INDEX organization_saas_checkout_recovery_idx ON zaltyko.organization_saas_checkout_operations (status, updated_at) WHERE status = ANY(ARRAY[CAST('creating_customer' AS text), CAST('creating_session' AS text), CAST('recovery_required' AS text)]);
-- snapshot source line 7174: IndexStmt
CREATE UNIQUE INDEX organization_saas_subscriptions_organization_uq ON zaltyko.organization_saas_subscriptions (organization_id);
-- snapshot source line 7175: IndexStmt
CREATE INDEX organization_saas_subscriptions_status_idx ON zaltyko.organization_saas_subscriptions (organization_id, provider_status, current_period_ends_at);
-- snapshot source line 7176: IndexStmt
CREATE INDEX organization_saas_trials_cooldown_idx ON zaltyko.organization_saas_trials (organization_id, started_at DESC);
-- snapshot source line 7177: IndexStmt
CREATE UNIQUE INDEX organization_saas_trials_one_active_uq ON zaltyko.organization_saas_trials (organization_id) WHERE status = CAST('active' AS zaltyko.organization_saas_trial_status);
-- snapshot source line 7178: IndexStmt
CREATE INDEX organization_saas_webhook_events_org_idx ON zaltyko.organization_saas_webhook_events (organization_id, received_at DESC) WHERE organization_id IS NOT NULL;
-- snapshot source line 7179: IndexStmt
CREATE INDEX organization_saas_webhook_events_queue_idx ON zaltyko.organization_saas_webhook_events (status, received_at) WHERE status = ANY(ARRAY[CAST('received' AS text), CAST('failed' AS text)]);
-- snapshot source line 7180: IndexStmt
CREATE UNIQUE INDEX organization_sports_active_profile_uq ON zaltyko.organization_sports (organization_id, sport_profile_id) WHERE status = CAST('active' AS zaltyko.organization_sport_status);
-- snapshot source line 7181: IndexStmt
CREATE UNIQUE INDEX organization_sports_primary_active_uq ON zaltyko.organization_sports (organization_id) WHERE role = CAST('primary' AS zaltyko.organization_sport_role) AND status = CAST('active' AS zaltyko.organization_sport_status);
-- snapshot source line 7182: IndexStmt
CREATE INDEX organization_sports_profile_idx ON zaltyko.organization_sports (country_code, sport_profile_id);
-- snapshot source line 7183: IndexStmt
CREATE INDEX outbox_events_dispatch_idx ON zaltyko.outbox_events (status, available_at);
-- snapshot source line 7184: IndexStmt
CREATE INDEX outbox_events_unsettled_freshness_idx ON zaltyko.outbox_events (organization_id, location_id, occurred_at) WHERE status = ANY(ARRAY[CAST('pending' AS zaltyko.outbox_status), CAST('processing' AS zaltyko.outbox_status), CAST('failed' AS zaltyko.outbox_status)]);
-- snapshot source line 7185: IndexStmt
CREATE INDEX owner_signup_consent_audits_user_recorded_idx ON zaltyko.owner_signup_consent_audits (user_id, recorded_at);
-- snapshot source line 7186: IndexStmt
CREATE INDEX owner_signup_consents_policy_version_idx ON zaltyko.owner_signup_consents (policy_version);
-- snapshot source line 7187: IndexStmt
CREATE INDEX payment_allocations_charge_idx ON zaltyko.payment_allocations (organization_id, charge_id, allocated_at);
-- snapshot source line 7188: IndexStmt
CREATE INDEX payment_allocations_payment_idx ON zaltyko.payment_allocations (organization_id, payment_id, allocated_at);
-- snapshot source line 7189: IndexStmt
CREATE INDEX payment_attempts_invoice_idx ON zaltyko.payment_attempts (organization_id, invoice_id, attempted_at);
-- snapshot source line 7190: IndexStmt
CREATE INDEX payment_provider_events_processing_idx ON zaltyko.payment_provider_events (status, received_at);
-- snapshot source line 7191: IndexStmt
CREATE UNIQUE INDEX payments_provider_uq ON zaltyko.payments (processor, environment, provider_payment_id) WHERE source = CAST('provider' AS zaltyko.payment_source);
-- snapshot source line 7192: IndexStmt
CREATE INDEX payments_received_idx ON zaltyko.payments (organization_id, currency, received_at);
-- snapshot source line 7193: IndexStmt
CREATE INDEX people_organization_idx ON zaltyko.people (organization_id);
-- snapshot source line 7194: IndexStmt
CREATE INDEX price_plan_class_template_coverage_lookup_idx ON zaltyko.price_plan_class_template_coverage (organization_id, location_id, price_plan_id, class_template_id, starts_on, ends_on);
-- snapshot source line 7195: IndexStmt
CREATE INDEX programs_organization_activity_idx ON zaltyko.programs (organization_id, activity_key) WHERE activity_key IS NOT NULL;
-- snapshot source line 7196: IndexStmt
CREATE INDEX programs_organization_sport_idx ON zaltyko.programs (organization_id, organization_sport_id) WHERE organization_sport_id IS NOT NULL;
-- snapshot source line 7197: IndexStmt
CREATE INDEX programs_organization_status_idx ON zaltyko.programs (organization_id, status);
-- snapshot source line 7198: IndexStmt
CREATE INDEX refunds_payment_idx ON zaltyko.refunds (organization_id, payment_id, refunded_at);
-- snapshot source line 7199: IndexStmt
CREATE INDEX retention_cohort_projection_runs_latest_idx ON zaltyko.retention_cohort_projection_runs (organization_id, location_id, status, source_watermark DESC, completed_at DESC);
-- snapshot source line 7200: IndexStmt
CREATE INDEX retention_cohort_projections_read_idx ON zaltyko.retention_cohort_projections (organization_id, location_id, program_id, group_id, cohort_month, observation_month, projection_run_id);
-- snapshot source line 7201: IndexStmt
CREATE INDEX retention_cohort_projections_run_idx ON zaltyko.retention_cohort_projections (organization_id, projection_run_id);
-- snapshot source line 7202: IndexStmt
CREATE UNIQUE INDEX retention_cohort_projections_scope_period_uq ON zaltyko.retention_cohort_projections (organization_id, projection_run_id, (COALESCE(location_id, CAST('00000000-0000-0000-0000-000000000000' AS uuid))), (COALESCE(program_id, CAST('00000000-0000-0000-0000-000000000000' AS uuid))), (COALESCE(group_id, CAST('00000000-0000-0000-0000-000000000000' AS uuid))), cohort_month, observation_month);
-- snapshot source line 7203: IndexStmt
CREATE INDEX saas_webhook_reconciliation_event_idx ON zaltyko.organization_saas_webhook_reconciliation_decisions (organization_id, webhook_event_id, created_at DESC);
-- snapshot source line 7204: IndexStmt
CREATE INDEX saas_webhook_reconciliation_queue_idx ON zaltyko.organization_saas_webhook_events (reconciliation_next_attempt_at, received_at) WHERE reconciliation_decision_id IS NOT NULL AND status = ANY(ARRAY[CAST('received' AS text), CAST('failed' AS text)]);
-- snapshot source line 7205: IndexStmt
CREATE INDEX sessions_location_start_idx ON zaltyko.sessions (organization_id, location_id, starts_at);
-- snapshot source line 7206: IndexStmt
CREATE INDEX spaces_facility_idx ON zaltyko.spaces (organization_id, facility_id);
-- snapshot source line 7207: IndexStmt
CREATE INDEX spaces_location_idx ON zaltyko.spaces (organization_id, location_id);
-- snapshot source line 7208: IndexStmt
CREATE INDEX trial_followups_trial_completed_idx ON zaltyko.trial_followups (organization_id, trial_id, completed_at);
-- snapshot source line 7209: IndexStmt
CREATE INDEX trial_status_history_trial_idx ON zaltyko.trial_status_history (organization_id, trial_id, effective_at, changed_at);
-- snapshot source line 7210: IndexStmt
CREATE INDEX trials_location_status_idx ON zaltyko.trials (organization_id, location_id, status, booked_at);
-- snapshot source line 7211: IndexStmt
CREATE INDEX waitlist_entries_actionable_idx ON zaltyko.waitlist_entries (organization_id, location_id, status, contactable, priority DESC, joined_at);
-- snapshot source line 7212: IndexStmt
CREATE UNIQUE INDEX waitlist_entries_open_program_uq ON zaltyko.waitlist_entries (organization_id, location_id, athlete_id, program_id) WHERE program_id IS NOT NULL AND status = ANY(ARRAY[CAST('waiting' AS zaltyko.waitlist_status), CAST('offered' AS zaltyko.waitlist_status)]);
-- snapshot source line 7213: IndexStmt
CREATE UNIQUE INDEX waitlist_entries_open_template_uq ON zaltyko.waitlist_entries (organization_id, athlete_id, class_template_id) WHERE class_template_id IS NOT NULL AND status = ANY(ARRAY[CAST('waiting' AS zaltyko.waitlist_status), CAST('offered' AS zaltyko.waitlist_status)]);
-- snapshot source line 7214: IndexStmt
CREATE INDEX waitlist_offers_expiry_idx ON zaltyko.waitlist_offers (organization_id, status, expires_at);
-- snapshot source line 7215: IndexStmt
CREATE UNIQUE INDEX waitlist_offers_one_pending_uq ON zaltyko.waitlist_offers (organization_id, waitlist_entry_id) WHERE status = CAST('pending' AS zaltyko.waitlist_offer_status);
-- snapshot source line 7231: CreateTrigStmt
CREATE TRIGGER audit_log_immutable BEFORE DELETE OR UPDATE ON zaltyko.audit_log FOR EACH ROW EXECUTE PROCEDURE zaltyko_domain_private.reject_audit_mutation();
-- snapshot source line 7233: CreateTrigStmt
CREATE TRIGGER insight_status_history_immutable BEFORE DELETE OR UPDATE ON zaltyko.insight_status_history FOR EACH ROW EXECUTE PROCEDURE zaltyko_domain_private.reject_insight_history_mutation();
-- snapshot source line 7235: CreateTrigStmt
CREATE TRIGGER invoice_line_enrollments_immutable_row BEFORE DELETE OR UPDATE ON zaltyko.invoice_line_enrollments FOR EACH ROW EXECUTE PROCEDURE zaltyko_domain_private.prevent_invoice_line_enrollment_mutation();
-- snapshot source line 7237: CreateTrigStmt
CREATE TRIGGER invoice_line_enrollments_immutable_truncate BEFORE TRUNCATE ON zaltyko.invoice_line_enrollments FOR EACH STATEMENT EXECUTE PROCEDURE zaltyko_domain_private.prevent_invoice_line_enrollment_mutation();
-- snapshot source line 7239: CreateTrigStmt
CREATE TRIGGER organization_entitlement_changes_append_only BEFORE DELETE OR UPDATE ON zaltyko.organization_entitlement_changes FOR EACH ROW EXECUTE PROCEDURE zaltyko.reject_entitlement_history_mutation();
-- snapshot source line 7241: CreateTrigStmt
CREATE TRIGGER organization_entitlements_revision_guard BEFORE UPDATE ON zaltyko.organization_entitlements FOR EACH ROW EXECUTE PROCEDURE zaltyko.guard_entitlement_revision();
-- snapshot source line 7243: CreateTrigStmt
CREATE TRIGGER organization_entitlements_revision_history AFTER INSERT OR UPDATE ON zaltyko.organization_entitlements FOR EACH ROW EXECUTE PROCEDURE zaltyko.record_entitlement_revision();
-- snapshot source line 7245: CreateTrigStmt
CREATE TRIGGER organization_saas_trials_guard BEFORE INSERT OR UPDATE ON zaltyko.organization_saas_trials FOR EACH ROW EXECUTE PROCEDURE zaltyko.guard_organization_saas_trial();
-- snapshot source line 7247: CreateTrigStmt
CREATE TRIGGER organization_saas_webhook_events_identity_guard BEFORE UPDATE ON zaltyko.organization_saas_webhook_events FOR EACH ROW EXECUTE PROCEDURE zaltyko.guard_organization_saas_webhook_identity();
-- snapshot source line 7249: CreateTrigStmt
CREATE TRIGGER organization_saas_webhook_requeue_guard BEFORE UPDATE ON zaltyko.organization_saas_webhook_events FOR EACH ROW EXECUTE PROCEDURE zaltyko.guard_saas_webhook_requeue();
-- snapshot source line 7251: CreateTrigStmt
CREATE CONSTRAINT TRIGGER saas_reconciliation_decision_link_required AFTER INSERT ON zaltyko.organization_saas_webhook_reconciliation_decisions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE PROCEDURE zaltyko.guard_saas_reconciliation_decision_link();
-- snapshot source line 7253: CreateTrigStmt
CREATE TRIGGER saas_webhook_reconciliation_decisions_immutable BEFORE DELETE OR UPDATE ON zaltyko.organization_saas_webhook_reconciliation_decisions FOR EACH ROW EXECUTE PROCEDURE zaltyko.reject_saas_reconciliation_mutation();
-- snapshot source line 7255: CreateTrigStmt
CREATE TRIGGER saas_webhook_reconciliation_result_insert_guard BEFORE INSERT ON zaltyko.organization_saas_webhook_reconciliation_results FOR EACH ROW EXECUTE PROCEDURE zaltyko.guard_saas_reconciliation_result_insert();
-- snapshot source line 7257: CreateTrigStmt
CREATE TRIGGER saas_webhook_reconciliation_results_immutable BEFORE DELETE OR UPDATE ON zaltyko.organization_saas_webhook_reconciliation_results FOR EACH ROW EXECUTE PROCEDURE zaltyko.reject_saas_reconciliation_mutation();
-- snapshot source line 7259: CreateTrigStmt
CREATE TRIGGER organizations_seed_free_entitlement AFTER INSERT ON zaltyko.organizations FOR EACH ROW EXECUTE PROCEDURE zaltyko.seed_free_entitlement();
-- snapshot source line 7261: CreateTrigStmt
CREATE TRIGGER owner_signup_consent_audit_append_only BEFORE DELETE OR UPDATE ON zaltyko.owner_signup_consent_audits FOR EACH ROW EXECUTE PROCEDURE zaltyko.reject_owner_signup_consent_audit_mutation();
-- snapshot source line 7263: CreateTrigStmt
CREATE TRIGGER owner_signup_consent_audit_no_truncate BEFORE TRUNCATE ON zaltyko.owner_signup_consent_audits FOR EACH STATEMENT EXECUTE PROCEDURE zaltyko.reject_owner_signup_consent_audit_mutation();
-- snapshot source line 7404: AlterTableStmt
ALTER TABLE zaltyko.athletes ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7405: AlterTableStmt
ALTER TABLE zaltyko.athletes FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7406: AlterTableStmt
ALTER TABLE zaltyko.attendance_records ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7407: AlterTableStmt
ALTER TABLE zaltyko.attendance_records FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7408: AlterTableStmt
ALTER TABLE zaltyko.audit_log ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7409: AlterTableStmt
ALTER TABLE zaltyko.audit_log FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7410: AlterTableStmt
ALTER TABLE zaltyko.benchmark_metric_targets ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7411: AlterTableStmt
ALTER TABLE zaltyko.benchmark_metric_targets FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7412: AlterTableStmt
ALTER TABLE zaltyko.benchmark_profiles ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7413: AlterTableStmt
ALTER TABLE zaltyko.benchmark_profiles FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7414: AlterTableStmt
ALTER TABLE zaltyko.charges ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7415: AlterTableStmt
ALTER TABLE zaltyko.charges FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7416: AlterTableStmt
ALTER TABLE zaltyko.class_template_groups ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7417: AlterTableStmt
ALTER TABLE zaltyko.class_template_groups FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7418: AlterTableStmt
ALTER TABLE zaltyko.class_template_weekdays ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7419: AlterTableStmt
ALTER TABLE zaltyko.class_template_weekdays FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7420: AlterTableStmt
ALTER TABLE zaltyko.class_templates ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7421: AlterTableStmt
ALTER TABLE zaltyko.class_templates FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7422: AlterTableStmt
ALTER TABLE zaltyko.data_quality_issues ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7423: AlterTableStmt
ALTER TABLE zaltyko.data_quality_issues FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7424: AlterTableStmt
ALTER TABLE zaltyko.enrollment_pauses ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7425: AlterTableStmt
ALTER TABLE zaltyko.enrollment_pauses FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7426: AlterTableStmt
ALTER TABLE zaltyko.enrollment_price_assignments ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7427: AlterTableStmt
ALTER TABLE zaltyko.enrollment_price_assignments FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7428: AlterTableStmt
ALTER TABLE zaltyko.enrollment_status_history ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7429: AlterTableStmt
ALTER TABLE zaltyko.enrollment_status_history FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7430: AlterTableStmt
ALTER TABLE zaltyko.enrollments ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7431: AlterTableStmt
ALTER TABLE zaltyko.enrollments FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7432: AlterTableStmt
ALTER TABLE zaltyko.facilities ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7433: AlterTableStmt
ALTER TABLE zaltyko.facilities FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7434: AlterTableStmt
ALTER TABLE zaltyko.families ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7435: AlterTableStmt
ALTER TABLE zaltyko.families FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7436: AlterTableStmt
ALTER TABLE zaltyko.family_collection_preferences ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7437: AlterTableStmt
ALTER TABLE zaltyko.family_collection_preferences FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7438: AlterTableStmt
ALTER TABLE zaltyko.family_guardians ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7439: AlterTableStmt
ALTER TABLE zaltyko.family_guardians FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7440: AlterTableStmt
ALTER TABLE zaltyko.family_members ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7441: AlterTableStmt
ALTER TABLE zaltyko.family_members FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7442: AlterTableStmt
ALTER TABLE zaltyko.family_payers ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7443: AlterTableStmt
ALTER TABLE zaltyko.family_payers FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7444: AlterTableStmt
ALTER TABLE zaltyko.family_payment_authorizations ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7445: AlterTableStmt
ALTER TABLE zaltyko.family_payment_authorizations FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7446: AlterTableStmt
ALTER TABLE zaltyko.financial_reconciliation_runs ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7447: AlterTableStmt
ALTER TABLE zaltyko.financial_reconciliation_runs FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7448: AlterTableStmt
ALTER TABLE zaltyko.group_membership_history ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7449: AlterTableStmt
ALTER TABLE zaltyko.group_membership_history FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7450: AlterTableStmt
ALTER TABLE zaltyko.group_memberships ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7451: AlterTableStmt
ALTER TABLE zaltyko.group_memberships FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7452: AlterTableStmt
ALTER TABLE zaltyko.groups ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7453: AlterTableStmt
ALTER TABLE zaltyko.groups FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7454: AlterTableStmt
ALTER TABLE zaltyko.guardian_contacts ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7455: AlterTableStmt
ALTER TABLE zaltyko.guardian_contacts FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7456: AlterTableStmt
ALTER TABLE zaltyko.guardians ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7457: AlterTableStmt
ALTER TABLE zaltyko.guardians FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7458: AlterTableStmt
ALTER TABLE zaltyko.health_score_dimension_snapshots ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7459: AlterTableStmt
ALTER TABLE zaltyko.health_score_dimension_snapshots FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7460: AlterTableStmt
ALTER TABLE zaltyko.health_score_dimension_weights ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7461: AlterTableStmt
ALTER TABLE zaltyko.health_score_dimension_weights FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7462: AlterTableStmt
ALTER TABLE zaltyko.health_score_metric_contributions ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7463: AlterTableStmt
ALTER TABLE zaltyko.health_score_metric_contributions FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7464: AlterTableStmt
ALTER TABLE zaltyko.health_score_metric_weights ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7465: AlterTableStmt
ALTER TABLE zaltyko.health_score_metric_weights FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7466: AlterTableStmt
ALTER TABLE zaltyko.health_score_snapshots ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7467: AlterTableStmt
ALTER TABLE zaltyko.health_score_snapshots FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7468: AlterTableStmt
ALTER TABLE zaltyko.health_score_versions ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7469: AlterTableStmt
ALTER TABLE zaltyko.health_score_versions FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7470: AlterTableStmt
ALTER TABLE zaltyko.insight_actions ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7471: AlterTableStmt
ALTER TABLE zaltyko.insight_actions FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7472: AlterTableStmt
ALTER TABLE zaltyko.insight_notifications ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7473: AlterTableStmt
ALTER TABLE zaltyko.insight_notifications FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7474: AlterTableStmt
ALTER TABLE zaltyko.insight_rule_runs ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7475: AlterTableStmt
ALTER TABLE zaltyko.insight_rule_runs FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7476: AlterTableStmt
ALTER TABLE zaltyko.insight_rule_versions ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7477: AlterTableStmt
ALTER TABLE zaltyko.insight_rule_versions FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7478: AlterTableStmt
ALTER TABLE zaltyko.insight_run_observations ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7479: AlterTableStmt
ALTER TABLE zaltyko.insight_run_observations FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7480: AlterTableStmt
ALTER TABLE zaltyko.insight_status_history ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7481: AlterTableStmt
ALTER TABLE zaltyko.insight_status_history FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7482: AlterTableStmt
ALTER TABLE zaltyko.insights ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7483: AlterTableStmt
ALTER TABLE zaltyko.insights FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7484: AlterTableStmt
ALTER TABLE zaltyko.invoice_line_enrollments ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7485: AlterTableStmt
ALTER TABLE zaltyko.invoice_line_enrollments FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7486: AlterTableStmt
ALTER TABLE zaltyko.invoice_lines ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7487: AlterTableStmt
ALTER TABLE zaltyko.invoice_lines FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7488: AlterTableStmt
ALTER TABLE zaltyko.invoices ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7489: AlterTableStmt
ALTER TABLE zaltyko.invoices FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7490: AlterTableStmt
ALTER TABLE zaltyko.locations ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7491: AlterTableStmt
ALTER TABLE zaltyko.locations FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7492: AlterTableStmt
ALTER TABLE zaltyko.member_location_scopes ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7493: AlterTableStmt
ALTER TABLE zaltyko.member_location_scopes FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7494: AlterTableStmt
ALTER TABLE zaltyko.metric_definitions ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7495: AlterTableStmt
ALTER TABLE zaltyko.metric_definitions FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7496: AlterTableStmt
ALTER TABLE zaltyko.metric_event_consumptions ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7497: AlterTableStmt
ALTER TABLE zaltyko.metric_event_consumptions FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7498: AlterTableStmt
ALTER TABLE zaltyko.metric_invalidations ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7499: AlterTableStmt
ALTER TABLE zaltyko.metric_invalidations FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7500: AlterTableStmt
ALTER TABLE zaltyko.metric_run_values ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7501: AlterTableStmt
ALTER TABLE zaltyko.metric_run_values FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7502: AlterTableStmt
ALTER TABLE zaltyko.metric_runs ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7503: AlterTableStmt
ALTER TABLE zaltyko.metric_runs FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7504: AlterTableStmt
ALTER TABLE zaltyko.metric_values ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7505: AlterTableStmt
ALTER TABLE zaltyko.metric_values FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7506: AlterTableStmt
ALTER TABLE zaltyko.organization_bootstrap_commands ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7507: AlterTableStmt
ALTER TABLE zaltyko.organization_bootstrap_commands FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7508: AlterTableStmt
ALTER TABLE zaltyko.organization_entitlement_changes ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7509: AlterTableStmt
ALTER TABLE zaltyko.organization_entitlement_changes FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7510: AlterTableStmt
ALTER TABLE zaltyko.organization_entitlements ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7511: AlterTableStmt
ALTER TABLE zaltyko.organization_entitlements FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7512: AlterTableStmt
ALTER TABLE zaltyko.organization_members ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7513: AlterTableStmt
ALTER TABLE zaltyko.organization_members FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7514: AlterTableStmt
ALTER TABLE zaltyko.organization_payment_provider_accounts ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7515: AlterTableStmt
ALTER TABLE zaltyko.organization_payment_provider_accounts FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7516: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_checkout_operations ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7517: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_checkout_operations FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7518: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_customers ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7519: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_customers FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7520: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_subscriptions ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7521: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_subscriptions FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7522: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_trials ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7523: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_trials FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7524: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_events ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7525: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_events FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7526: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_payload_conflicts ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7527: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_payload_conflicts FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7528: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7529: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7530: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_results ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7531: AlterTableStmt
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_results FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7532: AlterTableStmt
ALTER TABLE zaltyko.organization_sports ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7533: AlterTableStmt
ALTER TABLE zaltyko.organization_sports FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7534: AlterTableStmt
ALTER TABLE zaltyko.organizations ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7535: AlterTableStmt
ALTER TABLE zaltyko.organizations FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7536: AlterTableStmt
ALTER TABLE zaltyko.outbox_events ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7537: AlterTableStmt
ALTER TABLE zaltyko.outbox_events FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7538: AlterTableStmt
ALTER TABLE zaltyko.owner_dashboard_layouts ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7539: AlterTableStmt
ALTER TABLE zaltyko.owner_dashboard_layouts FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7540: AlterTableStmt
ALTER TABLE zaltyko.owner_signup_consent_audits ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7541: AlterTableStmt
ALTER TABLE zaltyko.owner_signup_consent_audits FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7542: AlterTableStmt
ALTER TABLE zaltyko.owner_signup_consent_policy ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7543: AlterTableStmt
ALTER TABLE zaltyko.owner_signup_consent_policy FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7544: AlterTableStmt
ALTER TABLE zaltyko.owner_signup_consents ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7545: AlterTableStmt
ALTER TABLE zaltyko.owner_signup_consents FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7546: AlterTableStmt
ALTER TABLE zaltyko.payment_allocations ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7547: AlterTableStmt
ALTER TABLE zaltyko.payment_allocations FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7548: AlterTableStmt
ALTER TABLE zaltyko.payment_attempts ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7549: AlterTableStmt
ALTER TABLE zaltyko.payment_attempts FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7550: AlterTableStmt
ALTER TABLE zaltyko.payment_provider_events ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7551: AlterTableStmt
ALTER TABLE zaltyko.payment_provider_events FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7552: AlterTableStmt
ALTER TABLE zaltyko.payments ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7553: AlterTableStmt
ALTER TABLE zaltyko.payments FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7554: AlterTableStmt
ALTER TABLE zaltyko.people ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7555: AlterTableStmt
ALTER TABLE zaltyko.people FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7556: AlterTableStmt
ALTER TABLE zaltyko.price_plan_class_template_coverage ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7557: AlterTableStmt
ALTER TABLE zaltyko.price_plan_class_template_coverage FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7558: AlterTableStmt
ALTER TABLE zaltyko.price_plans ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7559: AlterTableStmt
ALTER TABLE zaltyko.price_plans FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7560: AlterTableStmt
ALTER TABLE zaltyko.programs ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7561: AlterTableStmt
ALTER TABLE zaltyko.programs FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7562: AlterTableStmt
ALTER TABLE zaltyko.refunds ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7563: AlterTableStmt
ALTER TABLE zaltyko.refunds FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7564: AlterTableStmt
ALTER TABLE zaltyko.retention_cohort_projection_runs ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7565: AlterTableStmt
ALTER TABLE zaltyko.retention_cohort_projection_runs FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7566: AlterTableStmt
ALTER TABLE zaltyko.retention_cohort_projections ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7567: AlterTableStmt
ALTER TABLE zaltyko.retention_cohort_projections FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7568: AlterTableStmt
ALTER TABLE zaltyko.session_staff ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7569: AlterTableStmt
ALTER TABLE zaltyko.session_staff FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7570: AlterTableStmt
ALTER TABLE zaltyko.sessions ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7571: AlterTableStmt
ALTER TABLE zaltyko.sessions FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7572: AlterTableStmt
ALTER TABLE zaltyko.spaces ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7573: AlterTableStmt
ALTER TABLE zaltyko.spaces FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7574: AlterTableStmt
ALTER TABLE zaltyko.sport_profiles ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7575: AlterTableStmt
ALTER TABLE zaltyko.sport_profiles FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7576: AlterTableStmt
ALTER TABLE zaltyko.staff_profiles ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7577: AlterTableStmt
ALTER TABLE zaltyko.staff_profiles FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7578: AlterTableStmt
ALTER TABLE zaltyko.trial_followups ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7579: AlterTableStmt
ALTER TABLE zaltyko.trial_followups FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7580: AlterTableStmt
ALTER TABLE zaltyko.trial_status_history ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7581: AlterTableStmt
ALTER TABLE zaltyko.trial_status_history FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7582: AlterTableStmt
ALTER TABLE zaltyko.trials ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7583: AlterTableStmt
ALTER TABLE zaltyko.trials FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7584: AlterTableStmt
ALTER TABLE zaltyko.waitlist_entries ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7585: AlterTableStmt
ALTER TABLE zaltyko.waitlist_entries FORCE ROW LEVEL SECURITY ;
-- snapshot source line 7586: AlterTableStmt
ALTER TABLE zaltyko.waitlist_offers ENABLE ROW LEVEL SECURITY ;
-- snapshot source line 7587: AlterTableStmt
ALTER TABLE zaltyko.waitlist_offers FORCE ROW LEVEL SECURITY ;
-- snapshot source line 8281: CreatePolicyStmt
CREATE POLICY athletes_select_member ON zaltyko.athletes AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_organization_access(athletes.organization_id) AS has_organization_access));
-- snapshot source line 8283: CreatePolicyStmt
CREATE POLICY attendance_records_select_member ON zaltyko.attendance_records AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_organization_access(attendance_records.organization_id) AS has_organization_access));
-- snapshot source line 8285: CreatePolicyStmt
CREATE POLICY benchmark_profiles_member ON zaltyko.benchmark_profiles AS PERMISSIVE FOR select TO authenticated USING (organization_id IS NULL OR (SELECT zaltyko_domain_private.has_organization_access(benchmark_profiles.organization_id) AS has_organization_access));
-- snapshot source line 8287: CreatePolicyStmt
CREATE POLICY charges_select_member ON zaltyko.charges AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_organization_access(charges.organization_id) AS has_organization_access));
-- snapshot source line 8289: CreatePolicyStmt
CREATE POLICY class_template_groups_select_member ON zaltyko.class_template_groups AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_organization_access(class_template_groups.organization_id) AS has_organization_access));
-- snapshot source line 8291: CreatePolicyStmt
CREATE POLICY class_template_weekdays_select_member ON zaltyko.class_template_weekdays AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_organization_access(class_template_weekdays.organization_id) AS has_organization_access));
-- snapshot source line 8293: CreatePolicyStmt
CREATE POLICY class_templates_select_scoped ON zaltyko.class_templates AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_location_access(class_templates.organization_id, class_templates.location_id) AS has_location_access));
-- snapshot source line 8295: CreatePolicyStmt
CREATE POLICY data_quality_issues_select_member ON zaltyko.data_quality_issues AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_organization_access(data_quality_issues.organization_id) AS has_organization_access));
-- snapshot source line 8297: CreatePolicyStmt
CREATE POLICY enrollment_pauses_select_member ON zaltyko.enrollment_pauses AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_organization_access(enrollment_pauses.organization_id) AS has_organization_access));
-- snapshot source line 8299: CreatePolicyStmt
CREATE POLICY enrollment_price_assignments_select_scoped ON zaltyko.enrollment_price_assignments AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_location_access(enrollment_price_assignments.organization_id, enrollment_price_assignments.location_id) AS has_location_access));
-- snapshot source line 8301: CreatePolicyStmt
CREATE POLICY enrollment_status_history_select_member ON zaltyko.enrollment_status_history AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_organization_access(enrollment_status_history.organization_id) AS has_organization_access));
-- snapshot source line 8303: CreatePolicyStmt
CREATE POLICY enrollments_select_member ON zaltyko.enrollments AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_organization_access(enrollments.organization_id) AS has_organization_access));
-- snapshot source line 8305: CreatePolicyStmt
CREATE POLICY facilities_select_scoped ON zaltyko.facilities AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_location_access(facilities.organization_id, facilities.location_id) AS has_location_access));
-- snapshot source line 8307: CreatePolicyStmt
CREATE POLICY families_select_member ON zaltyko.families AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_organization_access(families.organization_id) AS has_organization_access));
-- snapshot source line 8309: CreatePolicyStmt
CREATE POLICY family_guardians_select_member ON zaltyko.family_guardians AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_organization_access(family_guardians.organization_id) AS has_organization_access));
-- snapshot source line 8311: CreatePolicyStmt
CREATE POLICY family_members_select_member ON zaltyko.family_members AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_organization_access(family_members.organization_id) AS has_organization_access));
-- snapshot source line 8313: CreatePolicyStmt
CREATE POLICY family_payers_select_member ON zaltyko.family_payers AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_organization_access(family_payers.organization_id) AS has_organization_access));
-- snapshot source line 8315: CreatePolicyStmt
CREATE POLICY financial_reconciliation_runs_select_member ON zaltyko.financial_reconciliation_runs AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_organization_access(financial_reconciliation_runs.organization_id) AS has_organization_access));
-- snapshot source line 8317: CreatePolicyStmt
CREATE POLICY group_membership_history_select_member ON zaltyko.group_membership_history AS PERMISSIVE FOR select TO authenticated USING (EXISTS (SELECT 1 FROM zaltyko.group_memberships AS membership INNER JOIN zaltyko.groups AS group_row ON group_row.organization_id = membership.organization_id AND group_row.id = membership.group_id WHERE membership.organization_id = group_membership_history.organization_id AND membership.id = group_membership_history.membership_id AND (SELECT zaltyko_domain_private.has_location_access(group_row.organization_id, group_row.location_id) AS has_location_access)));
-- snapshot source line 8322: CreatePolicyStmt
CREATE POLICY group_memberships_select_member ON zaltyko.group_memberships AS PERMISSIVE FOR select TO authenticated USING (EXISTS (SELECT 1 FROM zaltyko.groups AS group_row WHERE group_row.organization_id = group_memberships.organization_id AND group_row.id = group_memberships.group_id AND (SELECT zaltyko_domain_private.has_location_access(group_row.organization_id, group_row.location_id) AS has_location_access)));
-- snapshot source line 8326: CreatePolicyStmt
CREATE POLICY groups_select_scoped ON zaltyko.groups AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_location_access(groups.organization_id, groups.location_id) AS has_location_access));
-- snapshot source line 8328: CreatePolicyStmt
CREATE POLICY guardian_contacts_select_member ON zaltyko.guardian_contacts AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_organization_access(guardian_contacts.organization_id) AS has_organization_access));
-- snapshot source line 8330: CreatePolicyStmt
CREATE POLICY guardians_select_member ON zaltyko.guardians AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_organization_access(guardians.organization_id) AS has_organization_access));
-- snapshot source line 8332: CreatePolicyStmt
CREATE POLICY health_score_dimension_snapshots_member ON zaltyko.health_score_dimension_snapshots AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_organization_access(health_score_dimension_snapshots.organization_id) AS has_organization_access));
-- snapshot source line 8334: CreatePolicyStmt
CREATE POLICY health_score_snapshots_member ON zaltyko.health_score_snapshots AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_organization_access(health_score_snapshots.organization_id) AS has_organization_access));
-- snapshot source line 8336: CreatePolicyStmt
CREATE POLICY insight_actions_member ON zaltyko.insight_actions AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_organization_access(insight_actions.organization_id) AS has_organization_access));
-- snapshot source line 8338: CreatePolicyStmt
CREATE POLICY insight_rule_runs_member ON zaltyko.insight_rule_runs AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_organization_access(insight_rule_runs.organization_id) AS has_organization_access));
-- snapshot source line 8340: CreatePolicyStmt
CREATE POLICY insight_rule_versions_member ON zaltyko.insight_rule_versions AS PERMISSIVE FOR select TO authenticated USING (TRUE);
-- snapshot source line 8342: CreatePolicyStmt
CREATE POLICY insights_member ON zaltyko.insights AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_organization_access(insights.organization_id) AS has_organization_access));
-- snapshot source line 8344: CreatePolicyStmt
CREATE POLICY invoice_line_enrollments_deny_clients ON zaltyko.invoice_line_enrollments AS PERMISSIVE FOR all TO anon, authenticated USING (FALSE) WITH CHECK (FALSE);
-- snapshot source line 8346: CreatePolicyStmt
CREATE POLICY invoice_lines_select_member ON zaltyko.invoice_lines AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_organization_access(invoice_lines.organization_id) AS has_organization_access));
-- snapshot source line 8348: CreatePolicyStmt
CREATE POLICY invoices_select_member ON zaltyko.invoices AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_organization_access(invoices.organization_id) AS has_organization_access));
-- snapshot source line 8350: CreatePolicyStmt
CREATE POLICY locations_select_scoped ON zaltyko.locations AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_location_access(locations.organization_id, locations.id) AS has_location_access));
-- snapshot source line 8352: CreatePolicyStmt
CREATE POLICY member_location_scopes_select_self ON zaltyko.member_location_scopes AS PERMISSIVE FOR select TO authenticated USING (EXISTS (SELECT 1 FROM zaltyko.organization_members AS member WHERE member.id = member_location_scopes.member_id AND member.organization_id = member_location_scopes.organization_id AND member.user_id = (SELECT auth.uid() AS uid) AND member.status = CAST('active' AS zaltyko.member_status)));
-- snapshot source line 8356: CreatePolicyStmt
CREATE POLICY metric_runs_select_member ON zaltyko.metric_runs AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_organization_access(metric_runs.organization_id) AS has_organization_access));
-- snapshot source line 8358: CreatePolicyStmt
CREATE POLICY metric_values_select_member ON zaltyko.metric_values AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_organization_access(metric_values.organization_id) AS has_organization_access));
-- snapshot source line 8360: CreatePolicyStmt
CREATE POLICY organization_members_select_self ON zaltyko.organization_members AS PERMISSIVE FOR select TO authenticated USING (user_id = (SELECT auth.uid() AS uid) AND status = CAST('active' AS zaltyko.member_status));
-- snapshot source line 8362: CreatePolicyStmt
CREATE POLICY organization_sports_select_member ON zaltyko.organization_sports AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_organization_access(organization_sports.organization_id) AS has_organization_access));
-- snapshot source line 8364: CreatePolicyStmt
CREATE POLICY organizations_select_member ON zaltyko.organizations AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_organization_access(organizations.id) AS has_organization_access));
-- snapshot source line 8366: CreatePolicyStmt
CREATE POLICY owner_dashboard_layouts_insert_self ON zaltyko.owner_dashboard_layouts AS PERMISSIVE FOR insert TO authenticated WITH CHECK (user_id = (SELECT auth.uid() AS uid) AND EXISTS (SELECT 1 FROM zaltyko.organization_members AS member WHERE member.organization_id = owner_dashboard_layouts.organization_id AND member.user_id = (SELECT auth.uid() AS uid) AND member.status = CAST('active' AS zaltyko.member_status) AND member.role = ANY(ARRAY[CAST('owner' AS zaltyko.member_role), CAST('manager' AS zaltyko.member_role), CAST('admin' AS zaltyko.member_role)])));
-- snapshot source line 8370: CreatePolicyStmt
CREATE POLICY owner_dashboard_layouts_select_self ON zaltyko.owner_dashboard_layouts AS PERMISSIVE FOR select TO authenticated USING (user_id = (SELECT auth.uid() AS uid) AND EXISTS (SELECT 1 FROM zaltyko.organization_members AS member WHERE member.organization_id = owner_dashboard_layouts.organization_id AND member.user_id = (SELECT auth.uid() AS uid) AND member.status = CAST('active' AS zaltyko.member_status) AND member.role = ANY(ARRAY[CAST('owner' AS zaltyko.member_role), CAST('manager' AS zaltyko.member_role), CAST('admin' AS zaltyko.member_role)])));
-- snapshot source line 8374: CreatePolicyStmt
CREATE POLICY owner_dashboard_layouts_update_self ON zaltyko.owner_dashboard_layouts AS PERMISSIVE FOR update TO authenticated USING (user_id = (SELECT auth.uid() AS uid) AND EXISTS (SELECT 1 FROM zaltyko.organization_members AS member WHERE member.organization_id = owner_dashboard_layouts.organization_id AND member.user_id = (SELECT auth.uid() AS uid) AND member.status = CAST('active' AS zaltyko.member_status) AND member.role = ANY(ARRAY[CAST('owner' AS zaltyko.member_role), CAST('manager' AS zaltyko.member_role), CAST('admin' AS zaltyko.member_role)]))) WITH CHECK (user_id = (SELECT auth.uid() AS uid) AND EXISTS (SELECT 1 FROM zaltyko.organization_members AS member WHERE member.organization_id = owner_dashboard_layouts.organization_id AND member.user_id = (SELECT auth.uid() AS uid) AND member.status = CAST('active' AS zaltyko.member_status) AND member.role = ANY(ARRAY[CAST('owner' AS zaltyko.member_role), CAST('manager' AS zaltyko.member_role), CAST('admin' AS zaltyko.member_role)])));
-- snapshot source line 8380: CreatePolicyStmt
CREATE POLICY owner_signup_consent_audits_self_read ON zaltyko.owner_signup_consent_audits AS PERMISSIVE FOR select TO authenticated USING (user_id = (SELECT auth.uid() AS uid));
-- snapshot source line 8382: CreatePolicyStmt
CREATE POLICY owner_signup_consents_self_read ON zaltyko.owner_signup_consents AS PERMISSIVE FOR select TO authenticated USING (user_id = (SELECT auth.uid() AS uid));
-- snapshot source line 8384: CreatePolicyStmt
CREATE POLICY payment_allocations_select_member ON zaltyko.payment_allocations AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_organization_access(payment_allocations.organization_id) AS has_organization_access));
-- snapshot source line 8386: CreatePolicyStmt
CREATE POLICY payment_attempts_select_member ON zaltyko.payment_attempts AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_organization_access(payment_attempts.organization_id) AS has_organization_access));
-- snapshot source line 8388: CreatePolicyStmt
CREATE POLICY payments_select_member ON zaltyko.payments AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_organization_access(payments.organization_id) AS has_organization_access));
-- snapshot source line 8390: CreatePolicyStmt
CREATE POLICY people_select_member ON zaltyko.people AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_organization_access(people.organization_id) AS has_organization_access));
-- snapshot source line 8392: CreatePolicyStmt
CREATE POLICY price_plan_class_template_coverage_deny_clients ON zaltyko.price_plan_class_template_coverage AS PERMISSIVE FOR all TO anon, authenticated USING (FALSE) WITH CHECK (FALSE);
-- snapshot source line 8394: CreatePolicyStmt
CREATE POLICY price_plans_select_member ON zaltyko.price_plans AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_organization_access(price_plans.organization_id) AS has_organization_access));
-- snapshot source line 8396: CreatePolicyStmt
CREATE POLICY programs_select_member ON zaltyko.programs AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_organization_access(programs.organization_id) AS has_organization_access));
-- snapshot source line 8398: CreatePolicyStmt
CREATE POLICY refunds_select_member ON zaltyko.refunds AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_organization_access(refunds.organization_id) AS has_organization_access));
-- snapshot source line 8400: CreatePolicyStmt
CREATE POLICY retention_cohort_projection_runs_select_owner ON zaltyko.retention_cohort_projection_runs AS PERMISSIVE FOR select TO authenticated USING (EXISTS (SELECT 1 FROM zaltyko.organization_members AS member WHERE member.organization_id = retention_cohort_projection_runs.organization_id AND member.user_id = (SELECT auth.uid() AS uid) AND member.status = CAST('active' AS zaltyko.member_status) AND member.role = ANY(ARRAY[CAST('owner' AS zaltyko.member_role), CAST('admin' AS zaltyko.member_role), CAST('manager' AS zaltyko.member_role)]) AND ((retention_cohort_projection_runs.location_id IS NULL AND member.location_scope_mode = CAST('all' AS zaltyko.location_scope_mode)) OR (retention_cohort_projection_runs.location_id IS NOT NULL AND (member.location_scope_mode = CAST('all' AS zaltyko.location_scope_mode) OR EXISTS (SELECT 1 FROM zaltyko.member_location_scopes AS scope WHERE scope.organization_id = member.organization_id AND scope.member_id = member.id AND scope.location_id = retention_cohort_projection_runs.location_id))))));
-- snapshot source line 8406: CreatePolicyStmt
CREATE POLICY retention_cohort_projections_select_owner ON zaltyko.retention_cohort_projections AS PERMISSIVE FOR select TO authenticated USING (EXISTS (SELECT 1 FROM zaltyko.organization_members AS member WHERE member.organization_id = retention_cohort_projections.organization_id AND member.user_id = (SELECT auth.uid() AS uid) AND member.status = CAST('active' AS zaltyko.member_status) AND member.role = ANY(ARRAY[CAST('owner' AS zaltyko.member_role), CAST('admin' AS zaltyko.member_role), CAST('manager' AS zaltyko.member_role)]) AND ((retention_cohort_projections.location_id IS NULL AND member.location_scope_mode = CAST('all' AS zaltyko.location_scope_mode)) OR (retention_cohort_projections.location_id IS NOT NULL AND (member.location_scope_mode = CAST('all' AS zaltyko.location_scope_mode) OR EXISTS (SELECT 1 FROM zaltyko.member_location_scopes AS scope WHERE scope.organization_id = member.organization_id AND scope.member_id = member.id AND scope.location_id = retention_cohort_projections.location_id))))));
-- snapshot source line 8412: CreatePolicyStmt
CREATE POLICY session_staff_select_member ON zaltyko.session_staff AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_organization_access(session_staff.organization_id) AS has_organization_access));
-- snapshot source line 8414: CreatePolicyStmt
CREATE POLICY sessions_select_scoped ON zaltyko.sessions AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_location_access(sessions.organization_id, sessions.location_id) AS has_location_access));
-- snapshot source line 8416: CreatePolicyStmt
CREATE POLICY spaces_select_scoped ON zaltyko.spaces AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_location_access(spaces.organization_id, spaces.location_id) AS has_location_access));
-- snapshot source line 8418: CreatePolicyStmt
CREATE POLICY sport_profiles_select_catalog ON zaltyko.sport_profiles AS PERMISSIVE FOR select TO authenticated USING (TRUE);
-- snapshot source line 8420: CreatePolicyStmt
CREATE POLICY staff_profiles_select_member ON zaltyko.staff_profiles AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_organization_access(staff_profiles.organization_id) AS has_organization_access));
-- snapshot source line 8422: CreatePolicyStmt
CREATE POLICY trial_followups_select_scoped ON zaltyko.trial_followups AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_location_access(trial_followups.organization_id, trial_followups.location_id) AS has_location_access));
-- snapshot source line 8424: CreatePolicyStmt
CREATE POLICY trial_status_history_select_scoped ON zaltyko.trial_status_history AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_location_access(trial_status_history.organization_id, trial_status_history.location_id) AS has_location_access));
-- snapshot source line 8426: CreatePolicyStmt
CREATE POLICY trials_select_scoped ON zaltyko.trials AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_location_access(trials.organization_id, trials.location_id) AS has_location_access));
-- snapshot source line 8428: CreatePolicyStmt
CREATE POLICY waitlist_entries_select_scoped ON zaltyko.waitlist_entries AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_location_access(waitlist_entries.organization_id, waitlist_entries.location_id) AS has_location_access));
-- snapshot source line 8430: CreatePolicyStmt
CREATE POLICY waitlist_offers_select_scoped ON zaltyko.waitlist_offers AS PERMISSIVE FOR select TO authenticated USING ((SELECT zaltyko_domain_private.has_location_access(waitlist_offers.organization_id, waitlist_offers.location_id) AS has_location_access));
-- Exact source owner statements, applied after the selected objects exist.
-- source lines 58: owner AST
ALTER SCHEMA zaltyko OWNER TO postgres;
-- source lines 61: owner AST
ALTER SCHEMA zaltyko_domain_private OWNER TO postgres;
-- source lines 303: owner AST
ALTER TYPE zaltyko.attendance_status OWNER TO postgres;
-- source lines 304: owner AST
ALTER TYPE zaltyko.benchmark_profile_status OWNER TO postgres;
-- source lines 305: owner AST
ALTER TYPE zaltyko.billing_cadence OWNER TO postgres;
-- source lines 306: owner AST
ALTER TYPE zaltyko.charge_status OWNER TO postgres;
-- source lines 307: owner AST
ALTER TYPE zaltyko.contact_consent_status OWNER TO postgres;
-- source lines 308: owner AST
ALTER TYPE zaltyko.data_quality_issue_status OWNER TO postgres;
-- source lines 309: owner AST
ALTER TYPE zaltyko.enrollment_source OWNER TO postgres;
-- source lines 310: owner AST
ALTER TYPE zaltyko.enrollment_status OWNER TO postgres;
-- source lines 311: owner AST
ALTER TYPE zaltyko.entitlement_source OWNER TO postgres;
-- source lines 312: owner AST
ALTER TYPE zaltyko.family_collection_mode OWNER TO postgres;
-- source lines 313: owner AST
ALTER TYPE zaltyko.family_relationship OWNER TO postgres;
-- source lines 314: owner AST
ALTER TYPE zaltyko.group_membership_status OWNER TO postgres;
-- source lines 315: owner AST
ALTER TYPE zaltyko.guardian_contact_kind OWNER TO postgres;
-- source lines 316: owner AST
ALTER TYPE zaltyko.health_dimension OWNER TO postgres;
-- source lines 317: owner AST
ALTER TYPE zaltyko.health_score_status OWNER TO postgres;
-- source lines 318: owner AST
ALTER TYPE zaltyko.insight_action_status OWNER TO postgres;
-- source lines 319: owner AST
ALTER TYPE zaltyko.insight_delivery_channel OWNER TO postgres;
-- source lines 320: owner AST
ALTER TYPE zaltyko.insight_delivery_status OWNER TO postgres;
-- source lines 321: owner AST
ALTER TYPE zaltyko.insight_outcome OWNER TO postgres;
-- source lines 322: owner AST
ALTER TYPE zaltyko.insight_rule_status OWNER TO postgres;
-- source lines 323: owner AST
ALTER TYPE zaltyko.insight_run_status OWNER TO postgres;
-- source lines 324: owner AST
ALTER TYPE zaltyko.insight_severity OWNER TO postgres;
-- source lines 325: owner AST
ALTER TYPE zaltyko.insight_status OWNER TO postgres;
-- source lines 326: owner AST
ALTER TYPE zaltyko.invoice_status OWNER TO postgres;
-- source lines 327: owner AST
ALTER TYPE zaltyko.lifecycle_status OWNER TO postgres;
-- source lines 328: owner AST
ALTER TYPE zaltyko.location_scope_mode OWNER TO postgres;
-- source lines 329: owner AST
ALTER TYPE zaltyko.manual_payment_method OWNER TO postgres;
-- source lines 330: owner AST
ALTER TYPE zaltyko.member_role OWNER TO postgres;
-- source lines 331: owner AST
ALTER TYPE zaltyko.member_status OWNER TO postgres;
-- source lines 332: owner AST
ALTER TYPE zaltyko.metric_direction OWNER TO postgres;
-- source lines 333: owner AST
ALTER TYPE zaltyko.metric_grain OWNER TO postgres;
-- source lines 334: owner AST
ALTER TYPE zaltyko.metric_quality OWNER TO postgres;
-- source lines 335: owner AST
ALTER TYPE zaltyko.metric_run_status OWNER TO postgres;
-- source lines 336: owner AST
ALTER TYPE zaltyko.metric_unit OWNER TO postgres;
-- source lines 337: owner AST
ALTER TYPE zaltyko.normalization_direction OWNER TO postgres;
-- source lines 338: owner AST
ALTER TYPE zaltyko.organization_payment_account_status OWNER TO postgres;
-- source lines 339: owner AST
ALTER TYPE zaltyko.organization_saas_trial_status OWNER TO postgres;
-- source lines 340: owner AST
ALTER TYPE zaltyko.organization_sport_role OWNER TO postgres;
-- source lines 341: owner AST
ALTER TYPE zaltyko.organization_sport_status OWNER TO postgres;
-- source lines 342: owner AST
ALTER TYPE zaltyko.organization_status OWNER TO postgres;
-- source lines 343: owner AST
ALTER TYPE zaltyko.outbox_status OWNER TO postgres;
-- source lines 344: owner AST
ALTER TYPE zaltyko.payment_attempt_status OWNER TO postgres;
-- source lines 345: owner AST
ALTER TYPE zaltyko.payment_authorization_status OWNER TO postgres;
-- source lines 346: owner AST
ALTER TYPE zaltyko.payment_source OWNER TO postgres;
-- source lines 347: owner AST
ALTER TYPE zaltyko.payment_status OWNER TO postgres;
-- source lines 348: owner AST
ALTER TYPE zaltyko.program_kind OWNER TO postgres;
-- source lines 349: owner AST
ALTER TYPE zaltyko.provider_environment OWNER TO postgres;
-- source lines 350: owner AST
ALTER TYPE zaltyko.provider_event_status OWNER TO postgres;
-- source lines 351: owner AST
ALTER TYPE zaltyko.reconciliation_status OWNER TO postgres;
-- source lines 352: owner AST
ALTER TYPE zaltyko.refund_status OWNER TO postgres;
-- source lines 353: owner AST
ALTER TYPE zaltyko.saas_billing_interval OWNER TO postgres;
-- source lines 354: owner AST
ALTER TYPE zaltyko.saas_plan_code OWNER TO postgres;
-- source lines 355: owner AST
ALTER TYPE zaltyko.score_version_status OWNER TO postgres;
-- source lines 356: owner AST
ALTER TYPE zaltyko.session_status OWNER TO postgres;
-- source lines 357: owner AST
ALTER TYPE zaltyko.sport_profile_status OWNER TO postgres;
-- source lines 358: owner AST
ALTER TYPE zaltyko.stripe_environment OWNER TO postgres;
-- source lines 359: owner AST
ALTER TYPE zaltyko.trial_followup_channel OWNER TO postgres;
-- source lines 360: owner AST
ALTER TYPE zaltyko.trial_followup_outcome OWNER TO postgres;
-- source lines 361: owner AST
ALTER TYPE zaltyko.trial_status OWNER TO postgres;
-- source lines 362: owner AST
ALTER TYPE zaltyko.waitlist_offer_status OWNER TO postgres;
-- source lines 363: owner AST
ALTER TYPE zaltyko.waitlist_status OWNER TO postgres;
-- source lines 3933: owner AST
ALTER TABLE zaltyko.athletes OWNER TO postgres;
-- source lines 3934: owner AST
ALTER TABLE zaltyko.attendance_records OWNER TO postgres;
-- source lines 3935: owner AST
ALTER TABLE zaltyko.audit_log OWNER TO postgres;
-- source lines 3936: owner AST
ALTER TABLE zaltyko.benchmark_metric_targets OWNER TO postgres;
-- source lines 3937: owner AST
ALTER TABLE zaltyko.benchmark_profiles OWNER TO postgres;
-- source lines 3938: owner AST
ALTER TABLE zaltyko.charges OWNER TO postgres;
-- source lines 3939: owner AST
ALTER TABLE zaltyko.class_template_groups OWNER TO postgres;
-- source lines 3940: owner AST
ALTER TABLE zaltyko.class_template_weekdays OWNER TO postgres;
-- source lines 3941: owner AST
ALTER TABLE zaltyko.class_templates OWNER TO postgres;
-- source lines 3942: owner AST
ALTER TABLE zaltyko.data_quality_issues OWNER TO postgres;
-- source lines 3943: owner AST
ALTER TABLE zaltyko.enrollment_pauses OWNER TO postgres;
-- source lines 3944: owner AST
ALTER TABLE zaltyko.enrollment_price_assignments OWNER TO postgres;
-- source lines 3945: owner AST
ALTER TABLE zaltyko.enrollment_status_history OWNER TO postgres;
-- source lines 3946: owner AST
ALTER TABLE zaltyko.enrollments OWNER TO postgres;
-- source lines 3947: owner AST
ALTER TABLE zaltyko.facilities OWNER TO postgres;
-- source lines 3948: owner AST
ALTER TABLE zaltyko.families OWNER TO postgres;
-- source lines 3949: owner AST
ALTER TABLE zaltyko.family_collection_preferences OWNER TO postgres;
-- source lines 3950: owner AST
ALTER TABLE zaltyko.family_guardians OWNER TO postgres;
-- source lines 3951: owner AST
ALTER TABLE zaltyko.family_members OWNER TO postgres;
-- source lines 3952: owner AST
ALTER TABLE zaltyko.family_payers OWNER TO postgres;
-- source lines 3953: owner AST
ALTER TABLE zaltyko.family_payment_authorizations OWNER TO postgres;
-- source lines 3954: owner AST
ALTER TABLE zaltyko.financial_reconciliation_runs OWNER TO postgres;
-- source lines 3955: owner AST
ALTER TABLE zaltyko.group_membership_history OWNER TO postgres;
-- source lines 3956: owner AST
ALTER TABLE zaltyko.group_memberships OWNER TO postgres;
-- source lines 3957: owner AST
ALTER TABLE zaltyko.groups OWNER TO postgres;
-- source lines 3958: owner AST
ALTER TABLE zaltyko.guardian_contacts OWNER TO postgres;
-- source lines 3959: owner AST
ALTER TABLE zaltyko.guardians OWNER TO postgres;
-- source lines 3960: owner AST
ALTER TABLE zaltyko.health_score_dimension_snapshots OWNER TO postgres;
-- source lines 3961: owner AST
ALTER TABLE zaltyko.health_score_dimension_weights OWNER TO postgres;
-- source lines 3962: owner AST
ALTER TABLE zaltyko.health_score_metric_contributions OWNER TO postgres;
-- source lines 3963: owner AST
ALTER TABLE zaltyko.health_score_metric_weights OWNER TO postgres;
-- source lines 3964: owner AST
ALTER TABLE zaltyko.health_score_snapshots OWNER TO postgres;
-- source lines 3965: owner AST
ALTER TABLE zaltyko.health_score_versions OWNER TO postgres;
-- source lines 3966: owner AST
ALTER TABLE zaltyko.insight_actions OWNER TO postgres;
-- source lines 3967: owner AST
ALTER TABLE zaltyko.insight_notifications OWNER TO postgres;
-- source lines 3968: owner AST
ALTER TABLE zaltyko.insight_rule_runs OWNER TO postgres;
-- source lines 3969: owner AST
ALTER TABLE zaltyko.insight_rule_versions OWNER TO postgres;
-- source lines 3970: owner AST
ALTER TABLE zaltyko.insight_run_observations OWNER TO postgres;
-- source lines 3971: owner AST
ALTER TABLE zaltyko.insight_status_history OWNER TO postgres;
-- source lines 3972: owner AST
ALTER TABLE zaltyko.insights OWNER TO postgres;
-- source lines 3973: owner AST
ALTER TABLE zaltyko.invoice_line_enrollments OWNER TO postgres;
-- source lines 3974: owner AST
ALTER TABLE zaltyko.invoice_lines OWNER TO postgres;
-- source lines 3975: owner AST
ALTER TABLE zaltyko.invoices OWNER TO postgres;
-- source lines 3976: owner AST
ALTER TABLE zaltyko.locations OWNER TO postgres;
-- source lines 3977: owner AST
ALTER TABLE zaltyko.member_location_scopes OWNER TO postgres;
-- source lines 3978: owner AST
ALTER TABLE zaltyko.metric_definitions OWNER TO postgres;
-- source lines 3979: owner AST
ALTER TABLE zaltyko.metric_event_consumptions OWNER TO postgres;
-- source lines 3980: owner AST
ALTER TABLE zaltyko.metric_invalidations OWNER TO postgres;
-- source lines 3981: owner AST
ALTER TABLE zaltyko.metric_run_values OWNER TO postgres;
-- source lines 3982: owner AST
ALTER TABLE zaltyko.metric_runs OWNER TO postgres;
-- source lines 3983: owner AST
ALTER TABLE zaltyko.metric_values OWNER TO postgres;
-- source lines 3984: owner AST
ALTER TABLE zaltyko.organization_bootstrap_commands OWNER TO postgres;
-- source lines 3985: owner AST
ALTER TABLE zaltyko.organization_entitlement_changes OWNER TO postgres;
-- source lines 3986: owner AST
ALTER TABLE zaltyko.organization_entitlements OWNER TO postgres;
-- source lines 3987: owner AST
ALTER TABLE zaltyko.organization_members OWNER TO postgres;
-- source lines 3988: owner AST
ALTER TABLE zaltyko.organization_payment_provider_accounts OWNER TO postgres;
-- source lines 3989: owner AST
ALTER TABLE zaltyko.organization_saas_checkout_operations OWNER TO postgres;
-- source lines 3990: owner AST
ALTER TABLE zaltyko.organization_saas_customers OWNER TO postgres;
-- source lines 3991: owner AST
ALTER TABLE zaltyko.organization_saas_subscriptions OWNER TO postgres;
-- source lines 3992: owner AST
ALTER TABLE zaltyko.organization_saas_trials OWNER TO postgres;
-- source lines 3993: owner AST
ALTER TABLE zaltyko.organization_saas_webhook_events OWNER TO postgres;
-- source lines 3994: owner AST
ALTER TABLE zaltyko.organization_saas_webhook_payload_conflicts OWNER TO postgres;
-- source lines 3995: owner AST
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_decisions OWNER TO postgres;
-- source lines 3996: owner AST
ALTER TABLE zaltyko.organization_saas_webhook_reconciliation_results OWNER TO postgres;
-- source lines 3997: owner AST
ALTER TABLE zaltyko.organization_sports OWNER TO postgres;
-- source lines 3998: owner AST
ALTER TABLE zaltyko.organizations OWNER TO postgres;
-- source lines 3999: owner AST
ALTER TABLE zaltyko.outbox_events OWNER TO postgres;
-- source lines 4000: owner AST
ALTER TABLE zaltyko.owner_dashboard_layouts OWNER TO postgres;
-- source lines 4001: owner AST
ALTER TABLE zaltyko.owner_signup_consent_audits OWNER TO postgres;
-- source lines 4002: owner AST
ALTER TABLE zaltyko.owner_signup_consent_policy OWNER TO postgres;
-- source lines 4003: owner AST
ALTER TABLE zaltyko.owner_signup_consents OWNER TO postgres;
-- source lines 4004: owner AST
ALTER TABLE zaltyko.payment_allocations OWNER TO postgres;
-- source lines 4005: owner AST
ALTER TABLE zaltyko.payment_attempts OWNER TO postgres;
-- source lines 4006: owner AST
ALTER TABLE zaltyko.payment_provider_events OWNER TO postgres;
-- source lines 4007: owner AST
ALTER TABLE zaltyko.payments OWNER TO postgres;
-- source lines 4008: owner AST
ALTER TABLE zaltyko.people OWNER TO postgres;
-- source lines 4009: owner AST
ALTER TABLE zaltyko.price_plan_class_template_coverage OWNER TO postgres;
-- source lines 4010: owner AST
ALTER TABLE zaltyko.price_plans OWNER TO postgres;
-- source lines 4011: owner AST
ALTER TABLE zaltyko.programs OWNER TO postgres;
-- source lines 4012: owner AST
ALTER TABLE zaltyko.refunds OWNER TO postgres;
-- source lines 4013: owner AST
ALTER TABLE zaltyko.retention_cohort_projection_runs OWNER TO postgres;
-- source lines 4014: owner AST
ALTER TABLE zaltyko.retention_cohort_projections OWNER TO postgres;
-- source lines 4015: owner AST
ALTER TABLE zaltyko.session_staff OWNER TO postgres;
-- source lines 4016: owner AST
ALTER TABLE zaltyko.sessions OWNER TO postgres;
-- source lines 4017: owner AST
ALTER TABLE zaltyko.spaces OWNER TO postgres;
-- source lines 4018: owner AST
ALTER TABLE zaltyko.sport_profiles OWNER TO postgres;
-- source lines 4019: owner AST
ALTER TABLE zaltyko.staff_profiles OWNER TO postgres;
-- source lines 4020: owner AST
ALTER TABLE zaltyko.trial_followups OWNER TO postgres;
-- source lines 4021: owner AST
ALTER TABLE zaltyko.trial_status_history OWNER TO postgres;
-- source lines 4022: owner AST
ALTER TABLE zaltyko.trials OWNER TO postgres;
-- source lines 4023: owner AST
ALTER TABLE zaltyko.waitlist_entries OWNER TO postgres;
-- source lines 4024: owner AST
ALTER TABLE zaltyko.waitlist_offers OWNER TO postgres;
-- source lines 5600: owner AST
ALTER FUNCTION zaltyko.guard_entitlement_revision () OWNER TO postgres;
-- source lines 5692: owner AST
ALTER FUNCTION zaltyko.guard_organization_saas_trial () OWNER TO postgres;
-- source lines 5718: owner AST
ALTER FUNCTION zaltyko.guard_organization_saas_webhook_identity () OWNER TO postgres;
-- source lines 5751: owner AST
ALTER FUNCTION zaltyko.guard_saas_reconciliation_decision_link () OWNER TO postgres;
-- source lines 5988: owner AST
ALTER FUNCTION zaltyko.guard_saas_reconciliation_result_insert () OWNER TO postgres;
-- source lines 6244: owner AST
ALTER FUNCTION zaltyko.guard_saas_webhook_requeue () OWNER TO postgres;
-- source lines 6267: owner AST
ALTER FUNCTION zaltyko.record_entitlement_revision () OWNER TO postgres;
-- source lines 6280: owner AST
ALTER FUNCTION zaltyko.reject_entitlement_history_mutation () OWNER TO postgres;
-- source lines 6292: owner AST
ALTER FUNCTION zaltyko.reject_owner_signup_consent_audit_mutation () OWNER TO postgres;
-- source lines 6305: owner AST
ALTER FUNCTION zaltyko.reject_saas_reconciliation_mutation () OWNER TO postgres;
-- source lines 6324: owner AST
ALTER FUNCTION zaltyko.seed_free_entitlement () OWNER TO postgres;
-- source lines 6351: owner AST
ALTER FUNCTION zaltyko_domain_private.has_location_access (target_organization_id uuid, target_location_id uuid) OWNER TO postgres;
-- source lines 6368: owner AST
ALTER FUNCTION zaltyko_domain_private.has_organization_access (target_organization_id uuid) OWNER TO postgres;
-- source lines 6382: owner AST
ALTER FUNCTION zaltyko_domain_private.prevent_invoice_line_enrollment_mutation () OWNER TO postgres;
-- source lines 6395: owner AST
ALTER FUNCTION zaltyko_domain_private.reject_audit_mutation () OWNER TO postgres;
-- source lines 6408: owner AST
ALTER FUNCTION zaltyko_domain_private.reject_insight_history_mutation () OWNER TO postgres;
-- Object-level normalization is emitted after all selected DDL and ownership statements.
DO $canonical_rehearsal_object_acl_reset$
DECLARE v_schema text; v_role text; v_type text;
BEGIN
  FOREACH v_schema IN ARRAY ARRAY['zaltyko', 'zaltyko_domain_private'] LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON SCHEMA %I FROM PUBLIC', v_schema);
    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA %I FROM PUBLIC', v_schema);
    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA %I FROM PUBLIC', v_schema);
    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA %I FROM PUBLIC', v_schema);
    FOR v_role IN SELECT rolname FROM pg_roles WHERE rolname <> 'postgres' ORDER BY rolname LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES ON SCHEMA %I FROM %I', v_schema, v_role);
      EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA %I FROM %I', v_schema, v_role);
      EXECUTE format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA %I FROM %I', v_schema, v_role);
      EXECUTE format('REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA %I FROM %I', v_schema, v_role);
      FOR v_type IN SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = v_schema AND t.typtype = 'e' ORDER BY t.typname LOOP
        EXECUTE format('REVOKE USAGE ON TYPE %I.%I FROM %I', v_schema, v_type, v_role);
      END LOOP;
    END LOOP;
    FOR v_type IN SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = v_schema AND t.typtype = 'e' ORDER BY t.typname LOOP
      EXECUTE format('REVOKE USAGE ON TYPE %I.%I FROM PUBLIC', v_schema, v_type);
    END LOOP;
  END LOOP;
END
$canonical_rehearsal_object_acl_reset$;
-- Exact target-only ACL AST statements, deduplicated by deparsed SQL.
-- source lines 8462: explicit source ACL
GRANT USAGE ON SCHEMA zaltyko TO authenticated;
-- source lines 8463: explicit source ACL
GRANT USAGE ON SCHEMA zaltyko TO service_role;
-- source lines 8464: explicit source ACL
GRANT USAGE ON SCHEMA zaltyko_domain_private TO authenticated;
-- source lines 8465: explicit source ACL
GRANT USAGE ON SCHEMA zaltyko_domain_private TO service_role;
-- source lines 8897: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.athletes TO service_role;
-- source lines 8898: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.attendance_records TO service_role;
-- source lines 8899: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.audit_log TO service_role;
-- source lines 8900: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.benchmark_metric_targets TO service_role;
-- source lines 8901: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.benchmark_profiles TO service_role;
-- source lines 8902: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.charges TO service_role;
-- source lines 8903: explicit source ACL
GRANT SELECT ON TABLE zaltyko.class_template_groups TO authenticated;
-- source lines 8904: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.class_template_groups TO service_role;
-- source lines 8905: explicit source ACL
GRANT SELECT ON TABLE zaltyko.class_template_weekdays TO authenticated;
-- source lines 8906: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.class_template_weekdays TO service_role;
-- source lines 8907: explicit source ACL
GRANT SELECT ON TABLE zaltyko.class_templates TO authenticated;
-- source lines 8908: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.class_templates TO service_role;
-- source lines 8909: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.data_quality_issues TO service_role;
-- source lines 8910: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.enrollment_pauses TO service_role;
-- source lines 8911: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.enrollment_price_assignments TO service_role;
-- source lines 8912: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.enrollment_status_history TO service_role;
-- source lines 8913: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.enrollments TO service_role;
-- source lines 8914: explicit source ACL
GRANT SELECT ON TABLE zaltyko.facilities TO authenticated;
-- source lines 8915: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.facilities TO service_role;
-- source lines 8916: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.families TO service_role;
-- source lines 8917: explicit source ACL
GRANT INSERT, SELECT, UPDATE ON TABLE zaltyko.family_collection_preferences TO service_role;
-- source lines 8918: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.family_guardians TO service_role;
-- source lines 8919: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.family_members TO service_role;
-- source lines 8920: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.family_payers TO service_role;
-- source lines 8921: explicit source ACL
GRANT INSERT, SELECT, UPDATE ON TABLE zaltyko.family_payment_authorizations TO service_role;
-- source lines 8922: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.financial_reconciliation_runs TO service_role;
-- source lines 8923: explicit source ACL
GRANT SELECT ON TABLE zaltyko.group_membership_history TO authenticated;
-- source lines 8924: explicit source ACL
GRANT INSERT, SELECT ON TABLE zaltyko.group_membership_history TO service_role;
-- source lines 8925: explicit source ACL
GRANT SELECT ON TABLE zaltyko.group_memberships TO authenticated;
-- source lines 8926: explicit source ACL
GRANT INSERT, SELECT, UPDATE ON TABLE zaltyko.group_memberships TO service_role;
-- source lines 8927: explicit source ACL
GRANT SELECT ON TABLE zaltyko.groups TO authenticated;
-- source lines 8928: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.groups TO service_role;
-- source lines 8929: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.guardian_contacts TO service_role;
-- source lines 8930: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.guardians TO service_role;
-- source lines 8931: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.health_score_dimension_snapshots TO service_role;
-- source lines 8932: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.health_score_dimension_weights TO service_role;
-- source lines 8933: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.health_score_metric_contributions TO service_role;
-- source lines 8934: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.health_score_metric_weights TO service_role;
-- source lines 8935: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.health_score_snapshots TO service_role;
-- source lines 8936: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.health_score_versions TO service_role;
-- source lines 8937: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.insight_actions TO service_role;
-- source lines 8938: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.insight_notifications TO service_role;
-- source lines 8939: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.insight_rule_runs TO service_role;
-- source lines 8940: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.insight_rule_versions TO service_role;
-- source lines 8941: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.insight_run_observations TO service_role;
-- source lines 8942: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.insight_status_history TO service_role;
-- source lines 8943: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.insights TO service_role;
-- source lines 8944: explicit source ACL
GRANT INSERT, SELECT ON TABLE zaltyko.invoice_line_enrollments TO service_role;
-- source lines 8945: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.invoice_lines TO service_role;
-- source lines 8946: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.invoices TO service_role;
-- source lines 8947: explicit source ACL
GRANT SELECT ON TABLE zaltyko.locations TO authenticated;
-- source lines 8948: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.locations TO service_role;
-- source lines 8949: explicit source ACL
GRANT SELECT ON TABLE zaltyko.member_location_scopes TO authenticated;
-- source lines 8950: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.member_location_scopes TO service_role;
-- source lines 8951: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.metric_definitions TO service_role;
-- source lines 8952: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.metric_event_consumptions TO service_role;
-- source lines 8953: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.metric_invalidations TO service_role;
-- source lines 8954: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.metric_run_values TO service_role;
-- source lines 8955: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.metric_runs TO service_role;
-- source lines 8956: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.metric_values TO service_role;
-- source lines 8957: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.organization_bootstrap_commands TO service_role;
-- source lines 8958: explicit source ACL
GRANT INSERT, SELECT ON TABLE zaltyko.organization_entitlement_changes TO service_role;
-- source lines 8959: explicit source ACL
GRANT INSERT, SELECT, UPDATE ON TABLE zaltyko.organization_entitlements TO service_role;
-- source lines 8960: explicit source ACL
GRANT SELECT ON TABLE zaltyko.organization_members TO authenticated;
-- source lines 8961: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.organization_members TO service_role;
-- source lines 8962: explicit source ACL
GRANT INSERT, SELECT, UPDATE ON TABLE zaltyko.organization_payment_provider_accounts TO service_role;
-- source lines 8963: explicit source ACL
GRANT INSERT, SELECT, UPDATE ON TABLE zaltyko.organization_saas_checkout_operations TO service_role;
-- source lines 8964: explicit source ACL
GRANT INSERT, SELECT, UPDATE ON TABLE zaltyko.organization_saas_customers TO service_role;
-- source lines 8965: explicit source ACL
GRANT INSERT, SELECT, UPDATE ON TABLE zaltyko.organization_saas_subscriptions TO service_role;
-- source lines 8966: explicit source ACL
GRANT INSERT, SELECT, UPDATE ON TABLE zaltyko.organization_saas_trials TO service_role;
-- source lines 8967: explicit source ACL
GRANT INSERT, SELECT, UPDATE ON TABLE zaltyko.organization_saas_webhook_events TO service_role;
-- source lines 8968: explicit source ACL
GRANT INSERT, SELECT, UPDATE ON TABLE zaltyko.organization_saas_webhook_payload_conflicts TO service_role;
-- source lines 8969: explicit source ACL
GRANT INSERT, SELECT ON TABLE zaltyko.organization_saas_webhook_reconciliation_decisions TO service_role;
-- source lines 8970: explicit source ACL
GRANT INSERT, SELECT ON TABLE zaltyko.organization_saas_webhook_reconciliation_results TO service_role;
-- source lines 8971: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.organization_sports TO service_role;
-- source lines 8972: explicit source ACL
GRANT SELECT ON TABLE zaltyko.organizations TO authenticated;
-- source lines 8973: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.organizations TO service_role;
-- source lines 8974: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.outbox_events TO service_role;
-- source lines 8975: explicit source ACL
GRANT INSERT, SELECT, UPDATE ON TABLE zaltyko.owner_dashboard_layouts TO authenticated;
-- source lines 8976: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.owner_dashboard_layouts TO service_role;
-- source lines 8977: explicit source ACL
GRANT SELECT ON TABLE zaltyko.owner_signup_consent_audits TO authenticated;
-- source lines 8978: explicit source ACL
GRANT INSERT, SELECT ON TABLE zaltyko.owner_signup_consent_audits TO service_role;
-- source lines 8979: explicit source ACL
GRANT SELECT ON TABLE zaltyko.owner_signup_consent_policy TO service_role;
-- source lines 8980: explicit source ACL
GRANT SELECT ON TABLE zaltyko.owner_signup_consents TO authenticated;
-- source lines 8981: explicit source ACL
GRANT INSERT, SELECT, UPDATE ON TABLE zaltyko.owner_signup_consents TO service_role;
-- source lines 8982: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.payment_allocations TO service_role;
-- source lines 8983: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.payment_attempts TO service_role;
-- source lines 8984: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.payment_provider_events TO service_role;
-- source lines 8985: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.payments TO service_role;
-- source lines 8986: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.people TO service_role;
-- source lines 8987: explicit source ACL
GRANT INSERT, SELECT, UPDATE ON TABLE zaltyko.price_plan_class_template_coverage TO service_role;
-- source lines 8988: explicit source ACL
GRANT SELECT ON TABLE zaltyko.price_plans TO authenticated;
-- source lines 8989: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.price_plans TO service_role;
-- source lines 8990: explicit source ACL
GRANT SELECT ON TABLE zaltyko.programs TO authenticated;
-- source lines 8991: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.programs TO service_role;
-- source lines 8992: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.refunds TO service_role;
-- source lines 8993: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.retention_cohort_projection_runs TO service_role;
-- source lines 8994: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.retention_cohort_projections TO service_role;
-- source lines 8995: explicit source ACL
GRANT SELECT ON TABLE zaltyko.session_staff TO authenticated;
-- source lines 8996: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.session_staff TO service_role;
-- source lines 8997: explicit source ACL
GRANT SELECT ON TABLE zaltyko.sessions TO authenticated;
-- source lines 8998: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.sessions TO service_role;
-- source lines 8999: explicit source ACL
GRANT SELECT ON TABLE zaltyko.spaces TO authenticated;
-- source lines 9000: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.spaces TO service_role;
-- source lines 9001: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.sport_profiles TO service_role;
-- source lines 9002: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.staff_profiles TO service_role;
-- source lines 9003: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.trial_followups TO service_role;
-- source lines 9004: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.trial_status_history TO service_role;
-- source lines 9005: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.trials TO service_role;
-- source lines 9006: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.waitlist_entries TO service_role;
-- source lines 9007: explicit source ACL
GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE zaltyko.waitlist_offers TO service_role;
-- source lines 9038,9067: explicit source ACL
GRANT EXECUTE ON FUNCTION zaltyko.guard_saas_reconciliation_result_insert () TO PUBLIC;
-- source lines 9039,9069: explicit source ACL
GRANT EXECUTE ON FUNCTION zaltyko.guard_saas_webhook_requeue () TO PUBLIC;
-- source lines 9040: explicit source ACL
GRANT EXECUTE ON FUNCTION zaltyko_domain_private.has_location_access (target_organization_id uuid, target_location_id uuid) TO authenticated;
-- source lines 9041: explicit source ACL
GRANT EXECUTE ON FUNCTION zaltyko_domain_private.has_location_access (target_organization_id uuid, target_location_id uuid) TO service_role;
-- source lines 9042: explicit source ACL
GRANT EXECUTE ON FUNCTION zaltyko_domain_private.has_organization_access (target_organization_id uuid) TO authenticated;
-- source lines 9043: explicit source ACL
GRANT EXECUTE ON FUNCTION zaltyko_domain_private.has_organization_access (target_organization_id uuid) TO service_role;
-- source lines 9105: explicit source ACL
GRANT USAGE ON TYPE zaltyko.attendance_status TO PUBLIC;
-- source lines 9106: explicit source ACL
GRANT USAGE ON TYPE zaltyko.benchmark_profile_status TO PUBLIC;
-- source lines 9107: explicit source ACL
GRANT USAGE ON TYPE zaltyko.billing_cadence TO PUBLIC;
-- source lines 9108: explicit source ACL
GRANT USAGE ON TYPE zaltyko.charge_status TO PUBLIC;
-- source lines 9109: explicit source ACL
GRANT USAGE ON TYPE zaltyko.contact_consent_status TO PUBLIC;
-- source lines 9110: explicit source ACL
GRANT USAGE ON TYPE zaltyko.data_quality_issue_status TO PUBLIC;
-- source lines 9111: explicit source ACL
GRANT USAGE ON TYPE zaltyko.enrollment_source TO PUBLIC;
-- source lines 9112: explicit source ACL
GRANT USAGE ON TYPE zaltyko.enrollment_status TO PUBLIC;
-- source lines 9113: explicit source ACL
GRANT USAGE ON TYPE zaltyko.entitlement_source TO PUBLIC;
-- source lines 9114: explicit source ACL
GRANT USAGE ON TYPE zaltyko.family_collection_mode TO PUBLIC;
-- source lines 9115: explicit source ACL
GRANT USAGE ON TYPE zaltyko.family_relationship TO PUBLIC;
-- source lines 9116: explicit source ACL
GRANT USAGE ON TYPE zaltyko.group_membership_status TO PUBLIC;
-- source lines 9117: explicit source ACL
GRANT USAGE ON TYPE zaltyko.guardian_contact_kind TO PUBLIC;
-- source lines 9118: explicit source ACL
GRANT USAGE ON TYPE zaltyko.health_dimension TO PUBLIC;
-- source lines 9119: explicit source ACL
GRANT USAGE ON TYPE zaltyko.health_score_status TO PUBLIC;
-- source lines 9120: explicit source ACL
GRANT USAGE ON TYPE zaltyko.insight_action_status TO PUBLIC;
-- source lines 9121: explicit source ACL
GRANT USAGE ON TYPE zaltyko.insight_delivery_channel TO PUBLIC;
-- source lines 9122: explicit source ACL
GRANT USAGE ON TYPE zaltyko.insight_delivery_status TO PUBLIC;
-- source lines 9123: explicit source ACL
GRANT USAGE ON TYPE zaltyko.insight_outcome TO PUBLIC;
-- source lines 9124: explicit source ACL
GRANT USAGE ON TYPE zaltyko.insight_rule_status TO PUBLIC;
-- source lines 9125: explicit source ACL
GRANT USAGE ON TYPE zaltyko.insight_run_status TO PUBLIC;
-- source lines 9126: explicit source ACL
GRANT USAGE ON TYPE zaltyko.insight_severity TO PUBLIC;
-- source lines 9127: explicit source ACL
GRANT USAGE ON TYPE zaltyko.insight_status TO PUBLIC;
-- source lines 9128: explicit source ACL
GRANT USAGE ON TYPE zaltyko.invoice_status TO PUBLIC;
-- source lines 9129: explicit source ACL
GRANT USAGE ON TYPE zaltyko.lifecycle_status TO PUBLIC;
-- source lines 9130: explicit source ACL
GRANT USAGE ON TYPE zaltyko.location_scope_mode TO PUBLIC;
-- source lines 9131: explicit source ACL
GRANT USAGE ON TYPE zaltyko.manual_payment_method TO PUBLIC;
-- source lines 9132: explicit source ACL
GRANT USAGE ON TYPE zaltyko.member_role TO PUBLIC;
-- source lines 9133: explicit source ACL
GRANT USAGE ON TYPE zaltyko.member_status TO PUBLIC;
-- source lines 9134: explicit source ACL
GRANT USAGE ON TYPE zaltyko.metric_direction TO PUBLIC;
-- source lines 9135: explicit source ACL
GRANT USAGE ON TYPE zaltyko.metric_grain TO PUBLIC;
-- source lines 9136: explicit source ACL
GRANT USAGE ON TYPE zaltyko.metric_quality TO PUBLIC;
-- source lines 9137: explicit source ACL
GRANT USAGE ON TYPE zaltyko.metric_run_status TO PUBLIC;
-- source lines 9138: explicit source ACL
GRANT USAGE ON TYPE zaltyko.metric_unit TO PUBLIC;
-- source lines 9139: explicit source ACL
GRANT USAGE ON TYPE zaltyko.normalization_direction TO PUBLIC;
-- source lines 9140: explicit source ACL
GRANT USAGE ON TYPE zaltyko.organization_payment_account_status TO PUBLIC;
-- source lines 9141: explicit source ACL
GRANT USAGE ON TYPE zaltyko.organization_saas_trial_status TO PUBLIC;
-- source lines 9142: explicit source ACL
GRANT USAGE ON TYPE zaltyko.organization_sport_role TO PUBLIC;
-- source lines 9143: explicit source ACL
GRANT USAGE ON TYPE zaltyko.organization_sport_status TO PUBLIC;
-- source lines 9144: explicit source ACL
GRANT USAGE ON TYPE zaltyko.organization_status TO PUBLIC;
-- source lines 9145: explicit source ACL
GRANT USAGE ON TYPE zaltyko.outbox_status TO PUBLIC;
-- source lines 9146: explicit source ACL
GRANT USAGE ON TYPE zaltyko.payment_attempt_status TO PUBLIC;
-- source lines 9147: explicit source ACL
GRANT USAGE ON TYPE zaltyko.payment_authorization_status TO PUBLIC;
-- source lines 9148: explicit source ACL
GRANT USAGE ON TYPE zaltyko.payment_source TO PUBLIC;
-- source lines 9149: explicit source ACL
GRANT USAGE ON TYPE zaltyko.payment_status TO PUBLIC;
-- source lines 9150: explicit source ACL
GRANT USAGE ON TYPE zaltyko.program_kind TO PUBLIC;
-- source lines 9151: explicit source ACL
GRANT USAGE ON TYPE zaltyko.provider_environment TO PUBLIC;
-- source lines 9152: explicit source ACL
GRANT USAGE ON TYPE zaltyko.provider_event_status TO PUBLIC;
-- source lines 9153: explicit source ACL
GRANT USAGE ON TYPE zaltyko.reconciliation_status TO PUBLIC;
-- source lines 9154: explicit source ACL
GRANT USAGE ON TYPE zaltyko.refund_status TO PUBLIC;
-- source lines 9155: explicit source ACL
GRANT USAGE ON TYPE zaltyko.saas_billing_interval TO PUBLIC;
-- source lines 9156: explicit source ACL
GRANT USAGE ON TYPE zaltyko.saas_plan_code TO PUBLIC;
-- source lines 9157: explicit source ACL
GRANT USAGE ON TYPE zaltyko.score_version_status TO PUBLIC;
-- source lines 9158: explicit source ACL
GRANT USAGE ON TYPE zaltyko.session_status TO PUBLIC;
-- source lines 9159: explicit source ACL
GRANT USAGE ON TYPE zaltyko.sport_profile_status TO PUBLIC;
-- source lines 9160: explicit source ACL
GRANT USAGE ON TYPE zaltyko.stripe_environment TO PUBLIC;
-- source lines 9161: explicit source ACL
GRANT USAGE ON TYPE zaltyko.trial_followup_channel TO PUBLIC;
-- source lines 9162: explicit source ACL
GRANT USAGE ON TYPE zaltyko.trial_followup_outcome TO PUBLIC;
-- source lines 9163: explicit source ACL
GRANT USAGE ON TYPE zaltyko.trial_status TO PUBLIC;
-- source lines 9164: explicit source ACL
GRANT USAGE ON TYPE zaltyko.waitlist_offer_status TO PUBLIC;
-- source lines 9165: explicit source ACL
GRANT USAGE ON TYPE zaltyko.waitlist_status TO PUBLIC;
-- Exact canonical-schema default ACL AST statements.
-- source lines 419: explicit source default ACL
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA zaltyko GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO service_role;
-- source lines 420: explicit source default ACL
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA zaltyko GRANT DELETE, INSERT, maintain, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO service_role;
COMMIT;
