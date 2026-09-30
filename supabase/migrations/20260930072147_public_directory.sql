-- Independent public directory: no operational owner, auth account or billing creation.
CREATE TABLE public.directory_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL CHECK(kind IN ('academy','event','organization')),
 data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'), slug text NOT NULL,
 publication text NOT NULL DEFAULT 'draft' CHECK(publication IN ('draft','pending','published','withdrawn')),
 representation text NOT NULL DEFAULT 'unclaimed' CHECK(representation IN ('unclaimed','verified','disputed')),
 academy_id uuid UNIQUE REFERENCES public.academies(id) ON DELETE SET NULL,
 event_id uuid UNIQUE REFERENCES public.events(id) ON DELETE SET NULL,
 merged_into uuid REFERENCES public.directory_entries(id),
 reviewed_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(academy_id IS NULL OR kind='academy'), CHECK(event_id IS NULL OR kind='event'), CHECK(merged_into IS NULL OR merged_into<>id)
);
CREATE INDEX directory_entries_public_idx ON public.directory_entries(kind,publication);
CREATE INDEX directory_entries_country_idx ON public.directory_entries((data->>'countryCode'));
CREATE INDEX directory_entries_date_idx ON public.directory_entries((data->>'startDate'));
CREATE INDEX directory_entries_merged_idx ON public.directory_entries(merged_into);
CREATE TABLE public.directory_grants (
 entry_id uuid PRIMARY KEY REFERENCES public.directory_entries(id), user_id uuid NOT NULL REFERENCES auth.users(id),
 approved_by uuid NOT NULL REFERENCES auth.users(id), approved_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX directory_grants_user_idx ON public.directory_grants(user_id);
CREATE INDEX directory_grants_approver_idx ON public.directory_grants(approved_by);
CREATE TABLE public.directory_claims (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entry_id uuid NOT NULL REFERENCES public.directory_entries(id), user_id uuid NOT NULL REFERENCES auth.users(id),
 relationship text NOT NULL, evidence text, evidence_path text,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','disputed','withdrawn')),
 decision text, decided_by uuid REFERENCES auth.users(id), decided_at timestamptz,
 retain_evidence boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX directory_claims_pending_idx ON public.directory_claims(entry_id,user_id) WHERE status IN ('pending','disputed');
CREATE INDEX directory_claims_user_idx ON public.directory_claims(user_id);
CREATE INDEX directory_claims_decider_idx ON public.directory_claims(decided_by);
CREATE TABLE public.directory_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entry_id uuid REFERENCES public.directory_entries(id), user_id uuid REFERENCES auth.users(id),
 kind text NOT NULL CHECK(kind IN ('edit','proposal','correction','removal','import')), data jsonb NOT NULL,
 base_version timestamptz, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')), decision text,
 created_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz
);
CREATE INDEX directory_revisions_entry_idx ON public.directory_revisions(entry_id);
CREATE INDEX directory_revisions_user_idx ON public.directory_revisions(user_id);
CREATE TABLE public.directory_sources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, url text UNIQUE NOT NULL, country_code text NOT NULL,
 adapter text NOT NULL DEFAULT 'manual', terms_url text, "authorization" text,
 enabled boolean NOT NULL DEFAULT false, checked_at timestamptz, last_error text, last_result jsonb
);
CREATE TABLE public.directory_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id uuid NOT NULL REFERENCES public.directory_sources(id),
 fingerprint text NOT NULL, status text NOT NULL DEFAULT 'pending', summary jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_id,fingerprint)
);
CREATE TABLE public.directory_import_rows (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL REFERENCES public.directory_batches(id), source_id uuid NOT NULL REFERENCES public.directory_sources(id),
 external_id text NOT NULL, entry_id uuid REFERENCES public.directory_entries(id), candidate jsonb NOT NULL, error text,
 status text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(batch_id,external_id)
);
CREATE INDEX directory_import_rows_source_idx ON public.directory_import_rows(source_id,external_id);
CREATE INDEX directory_import_rows_entry_idx ON public.directory_import_rows(entry_id);
CREATE TABLE public.directory_favorites (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, entry_id uuid NOT NULL REFERENCES public.directory_entries(id),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,entry_id)
);
CREATE INDEX directory_favorites_entry_idx ON public.directory_favorites(entry_id);
CREATE TABLE public.directory_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users(id), email text NOT NULL,
 purpose text NOT NULL CHECK(purpose IN ('calendar','favorite_changes','marketing','kit','claim_updates')), filters jsonb NOT NULL DEFAULT '{}',
 policy_version text NOT NULL, source text NOT NULL, confirmed_at timestamptz, withdrawn_at timestamptz,
 token_hash text UNIQUE NOT NULL, token_expires_at timestamptz NOT NULL, bounce_at timestamptz, complaint_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX directory_subscriptions_user_idx ON public.directory_subscriptions(user_id);
CREATE TABLE public.directory_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subscription_id uuid NOT NULL REFERENCES public.directory_subscriptions(id),
 dedupe_key text UNIQUE NOT NULL, status text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0,
 lease_until timestamptz, provider_id text, error text, created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz
);
CREATE INDEX directory_deliveries_subscription_idx ON public.directory_deliveries(subscription_id);
CREATE TABLE public.directory_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entry_id uuid REFERENCES public.directory_entries(id), actor_id uuid REFERENCES auth.users(id),
 action text NOT NULL, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX directory_audit_entry_idx ON public.directory_audit(entry_id);
CREATE INDEX directory_audit_actor_idx ON public.directory_audit(actor_id);
-- All mutations pass through server authorization and transactions; the Data API is read-only.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['directory_entries','directory_grants','directory_claims','directory_revisions','directory_sources','directory_batches','directory_import_rows','directory_favorites','directory_subscriptions','directory_deliveries','directory_audit'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated',t);
 EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 END LOOP;
END $$;
-- Public entries contain only validated public information. Private workflow records stay inaccessible.
GRANT SELECT ON public.directory_entries TO anon,authenticated;
CREATE POLICY directory_entries_public ON public.directory_entries FOR SELECT TO anon,authenticated USING (
 publication='published' AND merged_into IS NULL AND academy_id IS NULL AND event_id IS NULL
 -- Linked data must use the live server projection; never expose a stale operational copy through the Data API.
);
-- Server-only private evidence bucket. There are deliberately no client read/write policies.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('directory-evidence','directory-evidence',false,5242880,ARRAY['application/pdf','image/jpeg','image/png']) ON CONFLICT(id) DO NOTHING;

CREATE UNIQUE INDEX directory_subscriptions_active_idx ON public.directory_subscriptions(lower(email),purpose,md5(filters::text)) WHERE withdrawn_at IS NULL;
-- Removing an operational authority must never turn its previous projection into a public external listing.
CREATE FUNCTION public.directory_withdraw_deleted_authority() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_TABLE_NAME='academies' THEN UPDATE directory_entries SET publication='withdrawn',updated_at=now() WHERE academy_id=OLD.id;
 ELSE UPDATE directory_entries SET publication='withdrawn',updated_at=now() WHERE event_id=OLD.id; END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER directory_academy_deleted BEFORE DELETE ON public.academies FOR EACH ROW EXECUTE FUNCTION public.directory_withdraw_deleted_authority();
CREATE TRIGGER directory_event_deleted BEFORE DELETE ON public.events FOR EACH ROW EXECUTE FUNCTION public.directory_withdraw_deleted_authority();
REVOKE EXECUTE ON FUNCTION public.directory_withdraw_deleted_authority() FROM PUBLIC,anon,authenticated;
