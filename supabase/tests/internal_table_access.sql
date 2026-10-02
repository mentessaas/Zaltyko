-- Run only against an isolated/local database after the applicable migrations.
BEGIN;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lead_interactions', 'zaltyko_schema_migrations'] LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      RAISE EXCEPTION 'required internal table % is missing', t;
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass(format('public.%I', t))) THEN
      RAISE EXCEPTION '% must have RLS enabled', t;
    END IF;
    IF has_table_privilege('anon',format('public.%I',t),'SELECT')
       OR has_table_privilege('anon',format('public.%I',t),'INSERT')
       OR has_table_privilege('anon',format('public.%I',t),'UPDATE')
       OR has_table_privilege('anon',format('public.%I',t),'DELETE')
       OR has_table_privilege('authenticated',format('public.%I',t),'SELECT')
       OR has_table_privilege('authenticated',format('public.%I',t),'INSERT')
       OR has_table_privilege('authenticated',format('public.%I',t),'UPDATE')
       OR has_table_privilege('authenticated',format('public.%I',t),'DELETE') THEN
      RAISE EXCEPTION '% must not grant client table access', t;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename=t AND policyname=t || '_client_denied'
        AND permissive='RESTRICTIVE' AND cmd='ALL'
        AND roles @> ARRAY['anon'::name,'authenticated'::name]
        AND qual='false' AND with_check='false'
    ) THEN
      RAISE EXCEPTION '% must have a restrictive client-deny policy', t;
    END IF;
    IF NOT has_table_privilege('service_role',format('public.%I',t),'SELECT')
       OR NOT has_table_privilege('service_role',format('public.%I',t),'INSERT')
       OR NOT has_table_privilege('service_role',format('public.%I',t),'UPDATE')
       OR NOT has_table_privilege('service_role',format('public.%I',t),'DELETE') THEN
      RAISE EXCEPTION 'service_role must retain server-side access to %', t;
    END IF;
  END LOOP;
END $$;

SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM 1 FROM public.lead_interactions;
    RAISE EXCEPTION 'anon read lead interactions';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM public.zaltyko_schema_migrations;
    RAISE EXCEPTION 'anon read the migration ledger';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    INSERT INTO public.lead_interactions
      (lead_id,submission_id,name,email,reason,source,message)
    VALUES (gen_random_uuid(),gen_random_uuid(),'Test','test@example.com','demo','test','denied');
    RAISE EXCEPTION 'authenticated user wrote lead interactions';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

ROLLBACK;
