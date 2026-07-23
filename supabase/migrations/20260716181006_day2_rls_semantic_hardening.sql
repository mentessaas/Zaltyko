-- Día 2: least privilege intratenant y helpers RLS privados.
-- Esta migración está versionada para revisión. NO se aplicó a producción.

CREATE SCHEMA IF NOT EXISTS zaltyko_private;
REVOKE ALL ON SCHEMA zaltyko_private FROM PUBLIC;
REVOKE ALL ON SCHEMA zaltyko_private FROM anon;
GRANT USAGE ON SCHEMA zaltyko_private TO authenticated;

CREATE OR REPLACE FUNCTION zaltyko_private.current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT p.id
  FROM public.profiles AS p
  WHERE p.user_id = auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION zaltyko_private.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT p.tenant_id
  FROM public.profiles AS p
  WHERE p.user_id = auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION zaltyko_private.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
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
$$;

CREATE OR REPLACE FUNCTION zaltyko_private.is_academy_manager(target_academy_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
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
$$;

CREATE OR REPLACE FUNCTION zaltyko_private.row_in_current_tenant(target_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT zaltyko_private.is_super_admin()
    OR target_tenant_id = zaltyko_private.current_tenant_id()
$$;

CREATE OR REPLACE FUNCTION zaltyko_private.is_academy_member(target_academy_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
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
$$;

CREATE OR REPLACE FUNCTION zaltyko_private.is_assigned_coach(target_class_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
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
$$;

CREATE OR REPLACE FUNCTION zaltyko_private.can_access_athlete(target_athlete_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
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
$$;

CREATE OR REPLACE FUNCTION zaltyko_private.can_access_guardian(target_guardian_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
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
$$;

CREATE OR REPLACE FUNCTION zaltyko_private.can_access_class(target_class_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
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
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA zaltyko_private FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA zaltyko_private FROM anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA zaltyko_private TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA zaltyko_private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Compatibilidad para policies históricas. Se elimina el bypass global del rol
-- profile `admin`: solo `super_admin` puede cruzar tenants.
CREATE OR REPLACE FUNCTION public.get_current_tenant()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$ SELECT zaltyko_private.current_tenant_id() $$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$ SELECT zaltyko_private.is_super_admin() $$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$ SELECT zaltyko_private.is_super_admin() $$;

CREATE OR REPLACE FUNCTION public.academy_in_current_tenant(target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.academies AS a
    WHERE a.id = target
      AND a.tenant_id = zaltyko_private.current_tenant_id()
  )
$$;

REVOKE ALL ON FUNCTION public.get_current_tenant() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.academy_in_current_tenant(uuid) FROM PUBLIC;
-- Algunas policies públicas históricas evalúan estos wrappers. Sus resultados
-- anónimos son NULL/false y no exponen filas ni objetos completos.
GRANT EXECUTE ON FUNCTION public.get_current_tenant() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academy_in_current_tenant(uuid) TO anon, authenticated;

-- Los catálogos deportivos globales viven en `public`, pero no son una API
-- anónima. RLS queda habilitado como defensa en profundidad; clientes
-- autenticados solo pueden leerlos y las escrituras siguen reservadas al
-- backend privilegiado/service_role.
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sport_disciplines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sport_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sport_locale_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terminology_dictionary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apparatus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competition_types ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.countries,
  public.sport_disciplines,
  public.sport_branches,
  public.sport_locale_configs,
  public.terminology_dictionary,
  public.apparatus,
  public.programs,
  public.levels,
  public.categories,
  public.competition_types
FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE
  public.countries,
  public.sport_disciplines,
  public.sport_branches,
  public.sport_locale_configs,
  public.terminology_dictionary,
  public.apparatus,
  public.programs,
  public.levels,
  public.categories,
  public.competition_types
FROM authenticated;
GRANT SELECT ON TABLE
  public.countries,
  public.sport_disciplines,
  public.sport_branches,
  public.sport_locale_configs,
  public.terminology_dictionary,
  public.apparatus,
  public.programs,
  public.levels,
  public.categories,
  public.competition_types
TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE
  public.countries,
  public.sport_disciplines,
  public.sport_branches,
  public.sport_locale_configs,
  public.terminology_dictionary,
  public.apparatus,
  public.programs,
  public.levels,
  public.categories,
  public.competition_types
TO service_role;

DROP POLICY IF EXISTS "countries_authenticated_read" ON public.countries;
CREATE POLICY "countries_authenticated_read" ON public.countries FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "sport_disciplines_authenticated_read" ON public.sport_disciplines;
CREATE POLICY "sport_disciplines_authenticated_read" ON public.sport_disciplines FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "sport_branches_authenticated_read" ON public.sport_branches;
CREATE POLICY "sport_branches_authenticated_read" ON public.sport_branches FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "sport_locale_configs_authenticated_read" ON public.sport_locale_configs;
CREATE POLICY "sport_locale_configs_authenticated_read" ON public.sport_locale_configs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "terminology_dictionary_authenticated_read" ON public.terminology_dictionary;
CREATE POLICY "terminology_dictionary_authenticated_read" ON public.terminology_dictionary FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "apparatus_authenticated_read" ON public.apparatus;
CREATE POLICY "apparatus_authenticated_read" ON public.apparatus FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "programs_authenticated_read" ON public.programs;
CREATE POLICY "programs_authenticated_read" ON public.programs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "levels_authenticated_read" ON public.levels;
CREATE POLICY "levels_authenticated_read" ON public.levels FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "categories_authenticated_read" ON public.categories;
CREATE POLICY "categories_authenticated_read" ON public.categories FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "competition_types_authenticated_read" ON public.competition_types;
CREATE POLICY "competition_types_authenticated_read" ON public.competition_types FOR SELECT TO authenticated USING (true);

-- El helper que devolvía profiles completos deja de ser necesario.
DROP POLICY IF EXISTS "academy_link_requests_tenant_or_target_access" ON public.academy_link_requests;
CREATE POLICY "academy_link_requests_tenant_or_target_access"
  ON public.academy_link_requests FOR ALL TO authenticated
  USING (
    zaltyko_private.is_super_admin()
    OR tenant_id = zaltyko_private.current_tenant_id()
    OR target_profile_id = zaltyko_private.current_profile_id()
  )
  WITH CHECK (
    zaltyko_private.is_super_admin()
    OR tenant_id = zaltyko_private.current_tenant_id()
    OR target_profile_id = zaltyko_private.current_profile_id()
  );
DROP POLICY IF EXISTS "academy_link_requests_target_response" ON public.academy_link_requests;
CREATE POLICY "academy_link_requests_target_response"
  ON public.academy_link_requests FOR UPDATE TO authenticated
  USING (target_profile_id = zaltyko_private.current_profile_id())
  WITH CHECK (target_profile_id = zaltyko_private.current_profile_id());
DROP FUNCTION IF EXISTS public.get_current_profile();

-- El helper de rol obsoleto queda sustituido por el rol SQL objetivo.
DROP POLICY IF EXISTS "plans_read" ON public.plans;
CREATE POLICY "plans_read" ON public.plans FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "academies_select" ON public.academies;
CREATE POLICY "academies_select" ON public.academies FOR SELECT TO authenticated
  USING (zaltyko_private.is_academy_member(id));
DROP POLICY IF EXISTS "academies_modify" ON public.academies;
CREATE POLICY "academies_modify" ON public.academies FOR ALL TO authenticated
  USING (zaltyko_private.is_academy_manager(id) AND zaltyko_private.row_in_current_tenant(tenant_id))
  WITH CHECK (zaltyko_private.is_academy_manager(id) AND zaltyko_private.row_in_current_tenant(tenant_id));

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_manage_tenant" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated
  USING (
    zaltyko_private.is_super_admin()
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.memberships AS target_membership
      JOIN public.memberships AS current_membership
        ON current_membership.academy_id = target_membership.academy_id
      WHERE target_membership.user_id = profiles.user_id
        AND current_membership.user_id = auth.uid()
        AND current_membership.role = 'owner'::public.membership_role
    )
  );
DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM authenticated;
GRANT UPDATE (name, photo_url, phone, bio, active_academy_id) ON public.profiles TO authenticated;
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "memberships_select" ON public.memberships;
CREATE POLICY "memberships_select" ON public.memberships FOR SELECT TO authenticated
  USING (
    zaltyko_private.is_super_admin()
    OR user_id = auth.uid()
    OR zaltyko_private.is_academy_manager(academy_id)
  );
DROP POLICY IF EXISTS "memberships_modify" ON public.memberships;
CREATE POLICY "memberships_modify" ON public.memberships FOR ALL TO authenticated
  USING (zaltyko_private.is_academy_manager(academy_id))
  WITH CHECK (zaltyko_private.is_academy_manager(academy_id));

DROP POLICY IF EXISTS "athletes_select" ON public.athletes;
CREATE POLICY "athletes_select" ON public.athletes FOR SELECT TO authenticated
  USING (zaltyko_private.can_access_athlete(id));
DROP POLICY IF EXISTS "athletes_modify" ON public.athletes;
DROP POLICY IF EXISTS "athletes_insert" ON public.athletes;
CREATE POLICY "athletes_insert" ON public.athletes FOR INSERT TO authenticated
  WITH CHECK (zaltyko_private.is_academy_manager(academy_id) AND zaltyko_private.row_in_current_tenant(tenant_id));
DROP POLICY IF EXISTS "athletes_update" ON public.athletes;
CREATE POLICY "athletes_update" ON public.athletes FOR UPDATE TO authenticated
  USING (zaltyko_private.row_in_current_tenant(tenant_id) AND (
    zaltyko_private.is_academy_manager(academy_id)
    OR zaltyko_private.can_access_athlete(id)
       AND EXISTS (SELECT 1 FROM public.coaches co WHERE co.user_id = auth.uid())
  ))
  WITH CHECK (zaltyko_private.row_in_current_tenant(tenant_id) AND (
    zaltyko_private.is_academy_manager(academy_id)
    OR zaltyko_private.can_access_athlete(id)
       AND EXISTS (SELECT 1 FROM public.coaches co WHERE co.user_id = auth.uid())
  ));
DROP POLICY IF EXISTS "athletes_delete" ON public.athletes;
CREATE POLICY "athletes_delete" ON public.athletes FOR DELETE TO authenticated
  USING (zaltyko_private.is_academy_manager(academy_id) AND zaltyko_private.row_in_current_tenant(tenant_id));

DROP POLICY IF EXISTS "guardians_select" ON public.guardians;
CREATE POLICY "guardians_select" ON public.guardians FOR SELECT TO authenticated
  USING (zaltyko_private.is_super_admin() OR zaltyko_private.can_access_guardian(id));
DROP POLICY IF EXISTS "guardians_modify" ON public.guardians;
CREATE POLICY "guardians_modify" ON public.guardians FOR ALL TO authenticated
  USING (zaltyko_private.can_access_guardian(id) AND zaltyko_private.row_in_current_tenant(tenant_id))
  WITH CHECK (zaltyko_private.can_access_guardian(id) AND zaltyko_private.row_in_current_tenant(tenant_id));

DROP POLICY IF EXISTS "guardian_athletes_select" ON public.guardian_athletes;
CREATE POLICY "guardian_athletes_select" ON public.guardian_athletes FOR SELECT TO authenticated
  USING (
    zaltyko_private.can_access_guardian(guardian_id)
    OR EXISTS (
      SELECT 1 FROM public.athletes a
      WHERE a.id = athlete_id
        AND zaltyko_private.is_academy_manager(a.academy_id)
    )
  );
DROP POLICY IF EXISTS "guardian_athletes_modify" ON public.guardian_athletes;
CREATE POLICY "guardian_athletes_modify" ON public.guardian_athletes FOR ALL TO authenticated
  USING (zaltyko_private.row_in_current_tenant(tenant_id) AND (
    EXISTS (SELECT 1 FROM public.athletes a WHERE a.id = athlete_id AND zaltyko_private.is_academy_manager(a.academy_id))
  ))
  WITH CHECK (zaltyko_private.row_in_current_tenant(tenant_id) AND (
    EXISTS (SELECT 1 FROM public.athletes a WHERE a.id = athlete_id AND zaltyko_private.is_academy_manager(a.academy_id))
  ));

DROP POLICY IF EXISTS "classes_select" ON public.classes;
CREATE POLICY "classes_select" ON public.classes FOR SELECT TO authenticated
  USING (zaltyko_private.can_access_class(id));
DROP POLICY IF EXISTS "classes_modify" ON public.classes;
CREATE POLICY "classes_modify" ON public.classes FOR ALL TO authenticated
  USING (zaltyko_private.is_academy_manager(academy_id) AND zaltyko_private.row_in_current_tenant(tenant_id))
  WITH CHECK (zaltyko_private.is_academy_manager(academy_id) AND zaltyko_private.row_in_current_tenant(tenant_id));

DROP POLICY IF EXISTS "class_sessions_select" ON public.class_sessions;
CREATE POLICY "class_sessions_select" ON public.class_sessions FOR SELECT TO authenticated
  USING (zaltyko_private.can_access_class(class_id));
DROP POLICY IF EXISTS "class_sessions_modify" ON public.class_sessions;
CREATE POLICY "class_sessions_modify" ON public.class_sessions FOR ALL TO authenticated
  USING (zaltyko_private.row_in_current_tenant(tenant_id) AND (
    zaltyko_private.is_assigned_coach(class_id)
    OR EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_id AND zaltyko_private.is_academy_manager(c.academy_id))
  ))
  WITH CHECK (zaltyko_private.row_in_current_tenant(tenant_id) AND (
    zaltyko_private.is_assigned_coach(class_id)
    OR EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_id AND zaltyko_private.is_academy_manager(c.academy_id))
  ));

DROP POLICY IF EXISTS "class_coach_assignments_select" ON public.class_coach_assignments;
CREATE POLICY "class_coach_assignments_select" ON public.class_coach_assignments FOR SELECT TO authenticated
  USING (
    zaltyko_private.is_assigned_coach(class_id)
    OR EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_id AND zaltyko_private.is_academy_manager(c.academy_id))
  );
DROP POLICY IF EXISTS "class_coach_assignments_modify" ON public.class_coach_assignments;
CREATE POLICY "class_coach_assignments_modify" ON public.class_coach_assignments FOR ALL TO authenticated
  USING (zaltyko_private.row_in_current_tenant(tenant_id) AND EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_id AND zaltyko_private.is_academy_manager(c.academy_id)))
  WITH CHECK (zaltyko_private.row_in_current_tenant(tenant_id) AND EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_id AND zaltyko_private.is_academy_manager(c.academy_id)));

DROP POLICY IF EXISTS "class_enrollments_tenant_access" ON public.class_enrollments;
DROP POLICY IF EXISTS "class_enrollments_select" ON public.class_enrollments;
CREATE POLICY "class_enrollments_select" ON public.class_enrollments FOR SELECT TO authenticated
  USING (
    zaltyko_private.can_access_class(class_id)
    AND zaltyko_private.can_access_athlete(athlete_id)
  );
DROP POLICY IF EXISTS "class_enrollments_modify" ON public.class_enrollments;
CREATE POLICY "class_enrollments_modify" ON public.class_enrollments FOR ALL TO authenticated
  USING (zaltyko_private.row_in_current_tenant(tenant_id) AND (
    zaltyko_private.is_assigned_coach(class_id)
    OR zaltyko_private.is_academy_manager(academy_id)
  ))
  WITH CHECK (zaltyko_private.row_in_current_tenant(tenant_id) AND (
    zaltyko_private.is_assigned_coach(class_id)
    OR zaltyko_private.is_academy_manager(academy_id)
  ));

DROP POLICY IF EXISTS "attendance_records_select" ON public.attendance_records;
CREATE POLICY "attendance_records_select" ON public.attendance_records FOR SELECT TO authenticated
  USING (zaltyko_private.can_access_athlete(athlete_id));
DROP POLICY IF EXISTS "attendance_records_modify" ON public.attendance_records;
CREATE POLICY "attendance_records_modify" ON public.attendance_records FOR ALL TO authenticated
  USING (zaltyko_private.row_in_current_tenant(tenant_id) AND (
    EXISTS (
      SELECT 1 FROM public.class_sessions cs
      JOIN public.classes c ON c.id = cs.class_id
      WHERE cs.id = session_id
        AND (zaltyko_private.is_assigned_coach(c.id) OR zaltyko_private.is_academy_manager(c.academy_id))
    )
  ))
  WITH CHECK (zaltyko_private.row_in_current_tenant(tenant_id) AND (
    EXISTS (
      SELECT 1 FROM public.class_sessions cs
      JOIN public.classes c ON c.id = cs.class_id
      WHERE cs.id = session_id
        AND (zaltyko_private.is_assigned_coach(c.id) OR zaltyko_private.is_academy_manager(c.academy_id))
    )
  ));

DROP POLICY IF EXISTS "athlete_assessments_select" ON public.athlete_assessments;
CREATE POLICY "athlete_assessments_select" ON public.athlete_assessments FOR SELECT TO authenticated
  USING (zaltyko_private.can_access_athlete(athlete_id));
DROP POLICY IF EXISTS "athlete_assessments_modify" ON public.athlete_assessments;
CREATE POLICY "athlete_assessments_modify" ON public.athlete_assessments FOR ALL TO authenticated
  USING (zaltyko_private.row_in_current_tenant(tenant_id) AND (
    zaltyko_private.is_academy_manager(academy_id)
    OR zaltyko_private.can_access_athlete(athlete_id)
       AND EXISTS (SELECT 1 FROM public.coaches co WHERE co.user_id = auth.uid())
  ))
  WITH CHECK (zaltyko_private.row_in_current_tenant(tenant_id) AND (
    zaltyko_private.is_academy_manager(academy_id)
    OR zaltyko_private.can_access_athlete(athlete_id)
       AND EXISTS (SELECT 1 FROM public.coaches co WHERE co.user_id = auth.uid())
  ));

DROP POLICY IF EXISTS "assessment_scores_select" ON public.assessment_scores;
CREATE POLICY "assessment_scores_select" ON public.assessment_scores FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.athlete_assessments aa WHERE aa.id = assessment_id AND zaltyko_private.can_access_athlete(aa.athlete_id))
  );
DROP POLICY IF EXISTS "assessment_scores_modify" ON public.assessment_scores;
CREATE POLICY "assessment_scores_modify" ON public.assessment_scores FOR ALL TO authenticated
  USING (zaltyko_private.row_in_current_tenant(tenant_id) AND (
    EXISTS (
      SELECT 1 FROM public.athlete_assessments aa
      WHERE aa.id = assessment_id
        AND (
          zaltyko_private.is_academy_manager(aa.academy_id)
          OR zaltyko_private.can_access_athlete(aa.athlete_id)
             AND EXISTS (SELECT 1 FROM public.coaches co WHERE co.user_id = auth.uid())
        )
    )
  ))
  WITH CHECK (zaltyko_private.row_in_current_tenant(tenant_id) AND (
    EXISTS (
      SELECT 1 FROM public.athlete_assessments aa
      WHERE aa.id = assessment_id
        AND (
          zaltyko_private.is_academy_manager(aa.academy_id)
          OR zaltyko_private.can_access_athlete(aa.athlete_id)
             AND EXISTS (SELECT 1 FROM public.coaches co WHERE co.user_id = auth.uid())
        )
    )
  ));

DROP POLICY IF EXISTS "charges_select" ON public.charges;
CREATE POLICY "charges_select" ON public.charges FOR SELECT TO authenticated
  USING (
    zaltyko_private.is_academy_manager(academy_id)
    OR EXISTS (
      SELECT 1 FROM public.guardian_athletes ga
      JOIN public.guardians g ON g.id = ga.guardian_id
      WHERE ga.athlete_id = charges.athlete_id
        AND g.profile_id = zaltyko_private.current_profile_id()
    )
  );
DROP POLICY IF EXISTS "charges_modify" ON public.charges;
CREATE POLICY "charges_modify" ON public.charges FOR ALL TO authenticated
  USING (zaltyko_private.is_academy_manager(academy_id) AND zaltyko_private.row_in_current_tenant(tenant_id))
  WITH CHECK (zaltyko_private.is_academy_manager(academy_id) AND zaltyko_private.row_in_current_tenant(tenant_id));

DROP POLICY IF EXISTS "billing_items_select" ON public.billing_items;
DROP POLICY IF EXISTS "billing_items_modify" ON public.billing_items;
CREATE POLICY "billing_items_select" ON public.billing_items FOR SELECT TO authenticated
  USING (zaltyko_private.is_academy_manager(academy_id));
CREATE POLICY "billing_items_modify" ON public.billing_items FOR ALL TO authenticated
  USING (zaltyko_private.is_academy_manager(academy_id) AND zaltyko_private.row_in_current_tenant(tenant_id))
  WITH CHECK (zaltyko_private.is_academy_manager(academy_id) AND zaltyko_private.row_in_current_tenant(tenant_id));

DROP POLICY IF EXISTS "billing_invoices_select" ON public.billing_invoices;
DROP POLICY IF EXISTS "billing_invoices_modify" ON public.billing_invoices;
CREATE POLICY "billing_invoices_select" ON public.billing_invoices FOR SELECT TO authenticated
  USING (zaltyko_private.is_academy_manager(academy_id));
CREATE POLICY "billing_invoices_modify" ON public.billing_invoices FOR ALL TO authenticated
  USING (zaltyko_private.is_academy_manager(academy_id) AND zaltyko_private.row_in_current_tenant(tenant_id))
  WITH CHECK (zaltyko_private.is_academy_manager(academy_id) AND zaltyko_private.row_in_current_tenant(tenant_id));
