-- Completes the snapshot inventory for the four tenant-scoped public tables
-- and adds fail-closed policies to server-only tenant tables already in it.
-- This migration is intended to replay only after the guarded empty-database
-- current-state baseline; it is never a remote repair script.
BEGIN;

CREATE TABLE public.actor_pages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid,
  academy_id uuid,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  public_slug text NOT NULL,
  public_visible boolean DEFAULT false NOT NULL,
  published_at timestamp with time zone,
  display_name text NOT NULL,
  tagline text,
  bio_blocks jsonb DEFAULT '[]'::jsonb NOT NULL,
  photo_url text,
  contact_email text,
  contact_phone text,
  social_links jsonb DEFAULT '{}'::jsonb,
  theme jsonb DEFAULT '{}'::jsonb NOT NULL,
  seo_title text,
  seo_description text,
  seo_image_url text,
  language text DEFAULT 'es' NOT NULL,
  auto_translate boolean DEFAULT false NOT NULL,
  consent_status text DEFAULT 'not_required' NOT NULL,
  blocked_reason text,
  blocked_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT actor_pages_pkey PRIMARY KEY (id),
  CONSTRAINT actor_pages_academy_id_academies_id_fk
    FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE SET NULL
);

CREATE TABLE public.actor_consents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  actor_page_id uuid NOT NULL,
  guardian_user_id uuid NOT NULL,
  guardian_relationship text NOT NULL,
  consent_scope text NOT NULL,
  granted_at timestamp with time zone NOT NULL,
  expires_at timestamp with time zone,
  revoked_at timestamp with time zone,
  revoked_reason text,
  ip_address text,
  user_agent text,
  CONSTRAINT actor_consents_pkey PRIMARY KEY (id),
  CONSTRAINT actor_consents_actor_page_id_actor_pages_id_fk
    FOREIGN KEY (actor_page_id) REFERENCES public.actor_pages(id) ON DELETE CASCADE
);

CREATE TABLE public.athlete_skills (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL,
  athlete_id uuid NOT NULL,
  skill_id uuid NOT NULL,
  status text DEFAULT 'learning' NOT NULL,
  score integer,
  observed_at date NOT NULL,
  observed_by uuid,
  notes text,
  evidence jsonb,
  visible_to_guardians boolean DEFAULT false NOT NULL,
  idempotency_key text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT athlete_skills_pkey PRIMARY KEY (id),
  CONSTRAINT athlete_skills_academy_id_academies_id_fk
    FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE,
  CONSTRAINT athlete_skills_athlete_id_athletes_id_fk
    FOREIGN KEY (athlete_id) REFERENCES public.athletes(id) ON DELETE CASCADE,
  CONSTRAINT athlete_skills_skill_id_skill_catalog_id_fk
    FOREIGN KEY (skill_id) REFERENCES public.skill_catalog(id) ON DELETE CASCADE,
  CONSTRAINT athlete_skills_observed_by_profiles_id_fk
    FOREIGN KEY (observed_by) REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TABLE public.products (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL,
  sku text,
  name text NOT NULL,
  description text,
  product_type text DEFAULT 'physical' NOT NULL,
  price_cents integer NOT NULL,
  currency text DEFAULT 'EUR' NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  is_featured boolean DEFAULT false NOT NULL,
  stock_quantity integer,
  low_stock_threshold integer DEFAULT 5,
  image_urls text[] DEFAULT ARRAY[]::text[],
  metadata jsonb DEFAULT '{}'::jsonb,
  visibility text DEFAULT 'public' NOT NULL,
  published_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT products_pkey PRIMARY KEY (id),
  CONSTRAINT products_academy_id_academies_id_fk
    FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE
);

CREATE TABLE public.sales (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL,
  customer_email text NOT NULL,
  customer_name text,
  subtotal_cents integer NOT NULL,
  total_cents integer NOT NULL,
  currency text DEFAULT 'EUR' NOT NULL,
  status text DEFAULT 'pending' NOT NULL,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  stripe_account_id text,
  paid_at timestamp with time zone,
  refunded_at timestamp with time zone,
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT sales_pkey PRIMARY KEY (id),
  CONSTRAINT sales_academy_id_academies_id_fk
    FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE
);

-- Match the snapshot's application owner and close inherited public-schema
-- default table grants before granting the server-only role.
ALTER TABLE public.actor_pages OWNER TO postgres;
ALTER TABLE public.actor_consents OWNER TO postgres;
ALTER TABLE public.athlete_skills OWNER TO postgres;
ALTER TABLE public.products OWNER TO postgres;
ALTER TABLE public.sales OWNER TO postgres;

REVOKE ALL PRIVILEGES ON TABLE public.actor_pages FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.actor_consents FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.athlete_skills FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.products FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.sales FROM PUBLIC, anon, authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON TABLE public.actor_pages TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON TABLE public.actor_consents TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON TABLE public.athlete_skills TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON TABLE public.products TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON TABLE public.sales TO service_role;

ALTER TABLE public.actor_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actor_pages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.actor_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actor_consents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.athlete_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athlete_skills FORCE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales FORCE ROW LEVEL SECURITY;

CREATE POLICY deny_all_non_bypass_access ON public.actor_pages
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY deny_all_non_bypass_access ON public.actor_consents
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY deny_all_non_bypass_access ON public.athlete_skills
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY deny_all_non_bypass_access ON public.products
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY deny_all_non_bypass_access ON public.sales
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

CREATE INDEX actor_pages_type_idx ON public.actor_pages USING btree (entity_type, public_visible);
CREATE UNIQUE INDEX actor_pages_entity_uq ON public.actor_pages USING btree (entity_type, entity_id);
CREATE UNIQUE INDEX actor_pages_slug_uq ON public.actor_pages USING btree (public_slug);
CREATE INDEX actor_pages_tenant_idx ON public.actor_pages USING btree (tenant_id);

CREATE INDEX actor_consents_page_idx ON public.actor_consents USING btree (actor_page_id);
CREATE INDEX actor_consents_guardian_idx ON public.actor_consents USING btree (guardian_user_id);

CREATE INDEX athlete_skills_observed_at_idx ON public.athlete_skills USING btree (observed_at);
CREATE INDEX athlete_skills_tenant_athlete_idx ON public.athlete_skills USING btree (tenant_id, athlete_id);
CREATE INDEX athlete_skills_athlete_skill_idx ON public.athlete_skills USING btree (athlete_id, skill_id);
CREATE UNIQUE INDEX athlete_skills_idempotency_idx ON public.athlete_skills USING btree (tenant_id, idempotency_key);

CREATE INDEX products_academy_idx ON public.products USING btree (academy_id);
CREATE INDEX products_academy_active_idx ON public.products USING btree (academy_id, is_active);
CREATE INDEX products_sku_idx ON public.products USING btree (academy_id, sku);

CREATE INDEX sales_academy_idx ON public.sales USING btree (academy_id);
CREATE INDEX sales_academy_status_idx ON public.sales USING btree (academy_id, status);
CREATE INDEX sales_status_created_idx ON public.sales USING btree (status, created_at);

-- The existing Zaltyko-domain tables are server-only: retain all ACLs exactly
-- as captured and add a restrictive deny policy as defense in depth.
CREATE POLICY deny_all_non_bypass_access ON zaltyko.audit_log
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY deny_all_non_bypass_access ON zaltyko.family_collection_preferences
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY deny_all_non_bypass_access ON zaltyko.family_payment_authorizations
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY deny_all_non_bypass_access ON zaltyko.health_score_metric_contributions
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY deny_all_non_bypass_access ON zaltyko.insight_notifications
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY deny_all_non_bypass_access ON zaltyko.insight_run_observations
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY deny_all_non_bypass_access ON zaltyko.insight_status_history
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY deny_all_non_bypass_access ON zaltyko.metric_event_consumptions
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY deny_all_non_bypass_access ON zaltyko.metric_invalidations
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY deny_all_non_bypass_access ON zaltyko.organization_bootstrap_commands
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY deny_all_non_bypass_access ON zaltyko.organization_entitlement_changes
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY deny_all_non_bypass_access ON zaltyko.organization_entitlements
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY deny_all_non_bypass_access ON zaltyko.organization_payment_provider_accounts
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY deny_all_non_bypass_access ON zaltyko.organization_saas_checkout_operations
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY deny_all_non_bypass_access ON zaltyko.organization_saas_customers
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY deny_all_non_bypass_access ON zaltyko.organization_saas_subscriptions
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY deny_all_non_bypass_access ON zaltyko.organization_saas_trials
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY deny_all_non_bypass_access ON zaltyko.organization_saas_webhook_events
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY deny_all_non_bypass_access ON zaltyko.organization_saas_webhook_payload_conflicts
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY deny_all_non_bypass_access ON zaltyko.organization_saas_webhook_reconciliation_decisions
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY deny_all_non_bypass_access ON zaltyko.organization_saas_webhook_reconciliation_results
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY deny_all_non_bypass_access ON zaltyko.outbox_events
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY deny_all_non_bypass_access ON zaltyko.payment_provider_events
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

COMMIT;
