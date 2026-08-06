-- Ejecutar SOLO contra una base Supabase local/aislada después de aplicar todas
-- las migraciones. Todo queda dentro de una transacción y termina en ROLLBACK.
BEGIN;

INSERT INTO public.profiles (id, user_id, tenant_id, name, role)
VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Owner A', 'owner'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'Owner B', 'owner'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Coach A', 'coach'),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Parent A', 'parent'),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'Athlete A', 'athlete'),
  ('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'Viewer A', 'owner'),
  ('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'Other parent', 'parent'),
  ('10000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000001', 'Super admin', 'super_admin');

INSERT INTO public.academies (id, tenant_id, name, owner_id)
VALUES
  ('20000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Academy A', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'Academy B', '10000000-0000-0000-0000-000000000002');

INSERT INTO public.memberships (id, user_id, academy_id, role)
VALUES
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'owner'),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'owner'),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'coach'),
  ('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', 'viewer'),
  ('30000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', 'viewer'),
  ('30000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000001', 'viewer'),
  ('30000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000001', 'viewer');

INSERT INTO public.coaches (id, tenant_id, academy_id, name, profile_id, user_id)
VALUES ('40000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Coach A', '10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003');

INSERT INTO public.classes (id, tenant_id, academy_id, name)
VALUES
  ('50000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Assigned A'),
  ('50000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Unassigned A'),
  ('50000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'Academy B class');

INSERT INTO public.class_coach_assignments (id, tenant_id, class_id, coach_id)
VALUES ('60000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001');

INSERT INTO public.athletes (id, tenant_id, academy_id, user_id, name)
VALUES
  ('70000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', 'Linked athlete'),
  ('70000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', NULL, 'Other minor'),
  ('70000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', NULL, 'Academy B athlete');

INSERT INTO public.class_enrollments (id, tenant_id, academy_id, class_id, athlete_id)
VALUES
  ('80000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001'),
  ('80000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000002');

INSERT INTO public.guardians (id, tenant_id, profile_id, name)
VALUES
  ('90000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'Parent A'),
  ('90000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'Other parent');
INSERT INTO public.guardian_athletes (id, tenant_id, guardian_id, athlete_id)
VALUES
  ('91000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001'),
  ('91000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000002');

INSERT INTO public.class_sessions (id, tenant_id, class_id, coach_id, session_date)
VALUES
  ('92000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', CURRENT_DATE),
  ('92000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', NULL, CURRENT_DATE);

INSERT INTO public.attendance_records (id, tenant_id, session_id, athlete_id)
VALUES
  ('93000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001'),
  ('93000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000002');

INSERT INTO public.athlete_assessments (id, tenant_id, academy_id, athlete_id, session_id, assessed_by, assessment_date)
VALUES
  ('94000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', CURRENT_DATE),
  ('94000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000002', NULL, CURRENT_DATE);

INSERT INTO public.charges (id, tenant_id, academy_id, athlete_id, label, amount_cents, period)
VALUES
  ('95000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'Linked charge', 1000, '2026-07'),
  ('95000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', 'Other charge', 1000, '2026-07');

-- Comunicación: una fila local por academia y una plantilla global de sistema.
INSERT INTO public.message_templates (id, tenant_id, academy_id, name, template_type, body, is_system)
VALUES
  ('97000000-0000-0000-0000-000000000001', NULL, NULL, 'System template', 'system', 'Global', true),
  ('97000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Academy A template', 'academy', 'A', false),
  ('97000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'Academy B template', 'academy', 'B', false);

INSERT INTO public.message_groups (id, tenant_id, academy_id, name)
VALUES
  ('97100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Academy A group'),
  ('97100000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'Academy B group');

INSERT INTO public.scheduled_notifications (id, tenant_id, academy_id, channel, scheduled_for)
VALUES
  ('97200000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'in_app', now()),
  ('97200000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'in_app', now());

-- Catálogos globales: lectura autenticada, nunca anónima ni mutación browser.
INSERT INTO public.countries (id, code, name)
VALUES ('96000000-0000-0000-0000-000000000001', 'ZZ', 'Fixture country');

-- Owner A: CRUD local permitido, academia B invisible.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
DO $$ BEGIN
  IF zaltyko_private.current_profile_id() <> '10000000-0000-0000-0000-000000000001'::uuid THEN RAISE EXCEPTION 'authenticated helper identity failed'; END IF;
  IF (SELECT count(*) FROM public.countries) <> 1 THEN RAISE EXCEPTION 'authenticated catalog read failed'; END IF;
  IF (SELECT count(*) FROM public.athletes) <> 2 THEN RAISE EXCEPTION 'owner A athlete scope failed'; END IF;
  IF (SELECT count(*) FROM public.message_templates) <> 2 THEN RAISE EXCEPTION 'owner A template scope failed'; END IF;
  IF (SELECT count(*) FROM public.message_groups) <> 1 THEN RAISE EXCEPTION 'owner A message group scope failed'; END IF;
  IF (SELECT count(*) FROM public.scheduled_notifications) <> 1 THEN RAISE EXCEPTION 'owner A scheduled notification scope failed'; END IF;
  IF EXISTS (SELECT 1 FROM public.academies WHERE id = '20000000-0000-0000-0000-000000000002') THEN RAISE EXCEPTION 'owner A crossed academy'; END IF;
  BEGIN
    INSERT INTO public.classes (id, tenant_id, academy_id, name)
    VALUES ('50000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'Cross-academy probe');
    RAISE EXCEPTION 'owner A wrote academy B';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.athletes (id, tenant_id, academy_id, name)
    VALUES ('70000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Fake tenant probe');
    RAISE EXCEPTION 'client tenant_id widened write';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.message_groups (id, tenant_id, academy_id, name)
    VALUES ('97100000-0000-0000-0000-000000000009', 'b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'Cross-academy message group');
    RAISE EXCEPTION 'owner A wrote academy B communication';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
INSERT INTO public.classes (id, tenant_id, academy_id, name)
VALUES ('50000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Owner write probe');
DELETE FROM public.classes WHERE id = '50000000-0000-0000-0000-000000000004';

-- Coach: solo clase/sesión/menor asignados; sin tutores ni cobros.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
DO $$ BEGIN
  IF (SELECT array_agg(id ORDER BY id) FROM public.classes) <> ARRAY['50000000-0000-0000-0000-000000000001'::uuid] THEN RAISE EXCEPTION 'coach class scope failed'; END IF;
  IF (SELECT count(*) FROM public.class_sessions) <> 1 THEN RAISE EXCEPTION 'coach session scope failed'; END IF;
  IF (SELECT count(*) FROM public.athletes) <> 1 THEN RAISE EXCEPTION 'coach athlete scope failed'; END IF;
  IF (SELECT count(*) FROM public.guardians) <> 0 THEN RAISE EXCEPTION 'coach saw guardian PII'; END IF;
  IF (SELECT count(*) FROM public.charges) <> 0 THEN RAISE EXCEPTION 'coach saw billing'; END IF;
  IF (SELECT count(*) FROM public.message_groups) <> 1 THEN RAISE EXCEPTION 'coach communication read scope failed'; END IF;
  BEGIN
    INSERT INTO public.message_groups (id, tenant_id, academy_id, name)
    VALUES ('97100000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Coach write probe');
    RAISE EXCEPTION 'coach wrote communication through Data API';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
UPDATE public.attendance_records SET status = 'absent' WHERE id = '93000000-0000-0000-0000-000000000001';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.attendance_records WHERE id = '93000000-0000-0000-0000-000000000002') THEN RAISE EXCEPTION 'coach saw unassigned attendance'; END IF;
END $$;

-- Parent: solo su menor, su vínculo y su cobro; nunca el otro menor.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
DO $$ BEGIN
  IF (SELECT array_agg(id) FROM public.athletes) <> ARRAY['70000000-0000-0000-0000-000000000001'::uuid] THEN RAISE EXCEPTION 'parent athlete scope failed'; END IF;
  IF (SELECT count(*) FROM public.guardian_athletes) <> 1 THEN RAISE EXCEPTION 'parent link scope failed'; END IF;
  IF (SELECT count(*) FROM public.charges) <> 1 THEN RAISE EXCEPTION 'parent charge scope failed'; END IF;
  IF (SELECT count(*) FROM public.message_templates) <> 2 THEN RAISE EXCEPTION 'parent template scope failed'; END IF;
END $$;

-- Athlete: solo su perfil/progreso y ningún dato financiero.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.athletes) <> 1 THEN RAISE EXCEPTION 'athlete self scope failed'; END IF;
  IF (SELECT count(*) FROM public.athlete_assessments) <> 1 THEN RAISE EXCEPTION 'athlete progress scope failed'; END IF;
  IF (SELECT count(*) FROM public.charges) <> 0 THEN RAISE EXCEPTION 'athlete saw financial data'; END IF;
  IF (SELECT count(*) FROM public.message_groups) <> 1 THEN RAISE EXCEPTION 'athlete communication scope failed'; END IF;
END $$;

-- Viewer: contexto de academia sin tablas administrativas.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000006', true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.academies) <> 1 THEN RAISE EXCEPTION 'viewer academy context failed'; END IF;
  IF (SELECT count(*) FROM public.athletes) <> 0 THEN RAISE EXCEPTION 'viewer saw athletes'; END IF;
  IF (SELECT count(*) FROM public.billing_items) <> 0 THEN RAISE EXCEPTION 'viewer saw billing items'; END IF;
  IF (SELECT count(*) FROM public.message_groups) <> 1 THEN RAISE EXCEPTION 'viewer communication scope failed'; END IF;
END $$;

-- tenant_id enviado por cliente no concede nada: el sujeto sigue siendo viewer.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.athletes WHERE tenant_id = 'a0000000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'client tenant widened access'; END IF;
END $$;

-- Super admin conserva el contrato global.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000008', true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.academies) <> 2 THEN RAISE EXCEPTION 'super admin global scope failed'; END IF;
  IF (SELECT count(*) FROM public.athletes) <> 3 THEN RAISE EXCEPTION 'super admin athlete scope failed'; END IF;
  IF (SELECT count(*) FROM public.message_groups) <> 2 THEN RAISE EXCEPTION 'super admin communication scope failed'; END IF;
END $$;

-- Anónimo: ninguna tabla privada y ningún helper privado invocable.
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'anon', true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.athletes) <> 0 THEN RAISE EXCEPTION 'anon saw athletes'; END IF;
  IF (SELECT count(*) FROM public.message_templates) <> 0 THEN RAISE EXCEPTION 'anon saw global system template'; END IF;
  IF (SELECT count(*) FROM public.message_groups) <> 0 THEN RAISE EXCEPTION 'anon saw message groups'; END IF;
  IF (SELECT count(*) FROM public.scheduled_notifications) <> 0 THEN RAISE EXCEPTION 'anon saw scheduled notifications'; END IF;
  BEGIN
    PERFORM 1 FROM public.countries;
    RAISE EXCEPTION 'anon read authenticated catalog';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    PERFORM zaltyko_private.current_profile_id();
    RAISE EXCEPTION 'anon invoked private helper';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;

RESET ROLE;
ROLLBACK;
