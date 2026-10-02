-- Run only against an isolated/local Supabase database after migrations.
-- Synthetic rows and all role probes are rolled back at the end.
BEGIN;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'directory_grants',
    'directory_claims',
    'directory_revisions',
    'directory_sources',
    'directory_batches',
    'directory_import_rows',
    'directory_favorites',
    'directory_subscriptions',
    'directory_deliveries',
    'directory_audit'
  ] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass(format('public.%I',t))) THEN
      RAISE EXCEPTION '% must have RLS enabled', t;
    END IF;
    IF has_table_privilege('anon',format('public.%I',t),'SELECT')
       OR has_table_privilege('authenticated',format('public.%I',t),'SELECT') THEN
      RAISE EXCEPTION '% must stay unreadable through the Data API', t;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename=t AND policyname=t || '_client_denied'
        AND cmd='ALL' AND roles @> ARRAY['anon'::name,'authenticated'::name]
    ) THEN
      RAISE EXCEPTION '% must have its explicit client-deny policy', t;
    END IF;
  END LOOP;
END $$;

INSERT INTO public.directory_entries(id,kind,data,slug,publication,merged_into)
VALUES
  ('a1000000-0000-4000-8000-000000000001','academy','{}','qa-directory-public','published',NULL),
  ('a1000000-0000-4000-8000-000000000002','academy','{}','qa-directory-draft','draft',NULL),
  ('a1000000-0000-4000-8000-000000000003','academy','{}','qa-directory-merged','published','a1000000-0000-4000-8000-000000000001');

SET LOCAL ROLE anon;
DO $$ BEGIN
  IF (SELECT array_agg(slug ORDER BY slug) FROM public.directory_entries WHERE slug LIKE 'qa-directory-%')
      IS DISTINCT FROM ARRAY['qa-directory-public'] THEN
    RAISE EXCEPTION 'anon must see only published, unmerged, unlinked directory entries';
  END IF;
  BEGIN
    PERFORM 1 FROM public.directory_claims;
    RAISE EXCEPTION 'anon read private claims';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.directory_entries(kind,data,slug) VALUES ('academy','{}','qa-directory-forbidden');
    RAISE EXCEPTION 'anon wrote directory entries';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF (SELECT array_agg(slug ORDER BY slug) FROM public.directory_entries WHERE slug LIKE 'qa-directory-%')
      IS DISTINCT FROM ARRAY['qa-directory-public'] THEN
    RAISE EXCEPTION 'authenticated users must see only published, unmerged, unlinked entries';
  END IF;
  BEGIN
    PERFORM 1 FROM public.directory_claims;
    RAISE EXCEPTION 'authenticated user read private claims';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ BEGIN
  IF NOT has_table_privilege(current_user,'public.directory_claims','SELECT') THEN
    RAISE EXCEPTION 'service_role must retain server-side workflow access';
  END IF;
END $$;

ROLLBACK;
