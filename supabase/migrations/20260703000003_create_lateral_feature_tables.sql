-- Crear las 15 tablas laterales restantes definidas en el ORM que faltaban en la DB real
-- (verificado 2026-07-03). Hace que la DB coincida 1:1 con src/db/schema.
--
-- Evaluaciones avanzadas: assessment_types, assessment_rubrics, rubric_criteria, assessment_videos
-- Competición: competition_results
-- Federación: federative_licenses
-- CRM: leads
-- Leak profitability: leak_action_history
-- Roles: academy_roles, role_members
-- Reportes: scheduled_reports
-- Templates (catálogo global, hijas de templates): template_apparatus,
--   template_competition_levels, template_license_config, template_scoring_config
--
-- RLS: la conexión de la app es rol postgres con BYPASSRLS, así que las policies
-- son defensa en profundidad (acceso directo del cliente Supabase). Patrón:
--   columna academy_id  -> is_admin() OR academy_in_current_tenant(academy_id)
--   columna tenant_id   -> is_admin() OR academy_in_current_tenant(tenant_id)  [la app guarda academy_id ahí]
--   catálogos globales   -> SELECT abierto, escritura solo super-admin
--   tablas hijas         -> scope vía subconsulta al padre

-- ============================================================================
-- assessment_types (catálogo global)
-- ============================================================================
CREATE TABLE IF NOT EXISTS assessment_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL,
  description text,
  is_active text NOT NULL DEFAULT 'true'
);
CREATE INDEX IF NOT EXISTS assessment_types_name_idx ON assessment_types (name);
ALTER TABLE assessment_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "assessment_types_select" ON assessment_types;
CREATE POLICY "assessment_types_select" ON assessment_types FOR SELECT USING (true);
DROP POLICY IF EXISTS "assessment_types_modify" ON assessment_types;
CREATE POLICY "assessment_types_modify" ON assessment_types FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ============================================================================
-- assessment_rubrics (tenant-scoped; tenant_id NULL = rúbrica de sistema)
-- ============================================================================
CREATE TABLE IF NOT EXISTS assessment_rubrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  name varchar(200) NOT NULL,
  description text,
  type varchar(100) NOT NULL,
  is_active text NOT NULL DEFAULT 'true',
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assessment_rubrics_tenant_idx ON assessment_rubrics (tenant_id);
ALTER TABLE assessment_rubrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "assessment_rubrics_select" ON assessment_rubrics;
CREATE POLICY "assessment_rubrics_select" ON assessment_rubrics
  FOR SELECT USING (is_admin() OR tenant_id IS NULL OR academy_in_current_tenant(tenant_id));
DROP POLICY IF EXISTS "assessment_rubrics_modify" ON assessment_rubrics;
CREATE POLICY "assessment_rubrics_modify" ON assessment_rubrics
  FOR ALL USING (is_admin() OR academy_in_current_tenant(tenant_id))
  WITH CHECK (is_admin() OR academy_in_current_tenant(tenant_id));

-- ============================================================================
-- rubric_criteria (hija de assessment_rubrics)
-- ============================================================================
CREATE TABLE IF NOT EXISTS rubric_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rubric_id uuid NOT NULL REFERENCES assessment_rubrics(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  description text,
  max_points integer DEFAULT 0,
  weight integer DEFAULT 0,
  order_index integer DEFAULT 0
);
CREATE INDEX IF NOT EXISTS rubric_criteria_rubric_idx ON rubric_criteria (rubric_id);
ALTER TABLE rubric_criteria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rubric_criteria_select" ON rubric_criteria;
CREATE POLICY "rubric_criteria_select" ON rubric_criteria
  FOR SELECT USING (
    is_admin() OR rubric_id IN (
      SELECT id FROM assessment_rubrics WHERE tenant_id IS NULL OR academy_in_current_tenant(tenant_id)
    )
  );
DROP POLICY IF EXISTS "rubric_criteria_modify" ON rubric_criteria;
CREATE POLICY "rubric_criteria_modify" ON rubric_criteria
  FOR ALL USING (
    is_admin() OR rubric_id IN (SELECT id FROM assessment_rubrics WHERE academy_in_current_tenant(tenant_id))
  )
  WITH CHECK (
    is_admin() OR rubric_id IN (SELECT id FROM assessment_rubrics WHERE academy_in_current_tenant(tenant_id))
  );

-- ============================================================================
-- assessment_videos (hija de athlete_assessments)
-- ============================================================================
CREATE TABLE IF NOT EXISTS assessment_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES athlete_assessments(id) ON DELETE CASCADE,
  url text NOT NULL,
  title varchar(200),
  description text,
  thumbnail_url text,
  duration text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assessment_videos_assessment_idx ON assessment_videos (assessment_id);
ALTER TABLE assessment_videos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "assessment_videos_select" ON assessment_videos;
CREATE POLICY "assessment_videos_select" ON assessment_videos
  FOR SELECT USING (
    is_admin() OR assessment_id IN (SELECT id FROM athlete_assessments WHERE academy_in_current_tenant(academy_id))
  );
DROP POLICY IF EXISTS "assessment_videos_modify" ON assessment_videos;
CREATE POLICY "assessment_videos_modify" ON assessment_videos
  FOR ALL USING (
    is_admin() OR assessment_id IN (SELECT id FROM athlete_assessments WHERE academy_in_current_tenant(academy_id))
  )
  WITH CHECK (
    is_admin() OR assessment_id IN (SELECT id FROM athlete_assessments WHERE academy_in_current_tenant(academy_id))
  );

-- ============================================================================
-- competition_results (tenant-scoped)
-- ============================================================================
CREATE TABLE IF NOT EXISTS competition_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  athlete_id uuid NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  event_id uuid REFERENCES events(id) ON DELETE SET NULL,
  sport_config_id uuid REFERENCES academy_sport_configs(id) ON DELETE SET NULL,
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
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS competition_results_tenant_idx ON competition_results (tenant_id);
CREATE INDEX IF NOT EXISTS competition_results_athlete_idx ON competition_results (athlete_id);
CREATE INDEX IF NOT EXISTS competition_results_event_idx ON competition_results (event_id);
CREATE INDEX IF NOT EXISTS competition_results_sport_config_idx ON competition_results (sport_config_id);
CREATE INDEX IF NOT EXISTS competition_results_apparatus_idx ON competition_results (apparatus);
CREATE INDEX IF NOT EXISTS competition_results_rank_idx ON competition_results (rank);
ALTER TABLE competition_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "competition_results_select" ON competition_results;
CREATE POLICY "competition_results_select" ON competition_results
  FOR SELECT USING (is_admin() OR academy_in_current_tenant(tenant_id));
DROP POLICY IF EXISTS "competition_results_modify" ON competition_results;
CREATE POLICY "competition_results_modify" ON competition_results
  FOR ALL USING (is_admin() OR academy_in_current_tenant(tenant_id))
  WITH CHECK (is_admin() OR academy_in_current_tenant(tenant_id));

-- ============================================================================
-- federative_licenses (tenant-scoped)
-- ============================================================================
CREATE TABLE IF NOT EXISTS federative_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  person_id uuid NOT NULL,
  person_type text NOT NULL,
  sport_config_id uuid REFERENCES academy_sport_configs(id) ON DELETE SET NULL,
  license_number text NOT NULL,
  license_type text NOT NULL,
  federation text NOT NULL,
  country text NOT NULL DEFAULT 'ES',
  valid_from date NOT NULL,
  valid_until date NOT NULL,
  medical_certificate_expiry date,
  status text NOT NULL DEFAULT 'active',
  annual_fee_cents integer,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS federative_licenses_tenant_idx ON federative_licenses (tenant_id);
CREATE INDEX IF NOT EXISTS federative_licenses_person_idx ON federative_licenses (person_id);
CREATE INDEX IF NOT EXISTS federative_licenses_status_idx ON federative_licenses (status);
CREATE INDEX IF NOT EXISTS federative_licenses_sport_config_idx ON federative_licenses (sport_config_id);
CREATE INDEX IF NOT EXISTS federative_licenses_valid_until_idx ON federative_licenses (valid_until);
CREATE INDEX IF NOT EXISTS federative_licenses_license_number_idx ON federative_licenses (license_number);
ALTER TABLE federative_licenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "federative_licenses_select" ON federative_licenses;
CREATE POLICY "federative_licenses_select" ON federative_licenses
  FOR SELECT USING (is_admin() OR academy_in_current_tenant(tenant_id));
DROP POLICY IF EXISTS "federative_licenses_modify" ON federative_licenses;
CREATE POLICY "federative_licenses_modify" ON federative_licenses
  FOR ALL USING (is_admin() OR academy_in_current_tenant(tenant_id))
  WITH CHECK (is_admin() OR academy_in_current_tenant(tenant_id));

-- ============================================================================
-- leads (captura pública desde landing; PII -> lectura solo admin)
-- ============================================================================
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text,
  source text DEFAULT 'landing_page',
  plan text,
  metadata text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "leads_insert" ON leads;
CREATE POLICY "leads_insert" ON leads FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "leads_select" ON leads;
CREATE POLICY "leads_select" ON leads FOR SELECT USING (is_admin());
DROP POLICY IF EXISTS "leads_update" ON leads;
CREATE POLICY "leads_update" ON leads FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "leads_delete" ON leads;
CREATE POLICY "leads_delete" ON leads FOR DELETE USING (is_admin());

-- ============================================================================
-- leak_action_history (academy-scoped; academy_id real)
-- ============================================================================
CREATE TABLE IF NOT EXISTS leak_action_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  academy_id uuid NOT NULL REFERENCES academies(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  athlete_id uuid REFERENCES athletes(id) ON DELETE SET NULL,
  class_id uuid REFERENCES classes(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'whatsapp',
  message text,
  payload jsonb DEFAULT '{}'::jsonb,
  created_by_profile_id uuid,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leak_action_history_tenant_idx ON leak_action_history (tenant_id);
CREATE INDEX IF NOT EXISTS leak_action_history_academy_created_idx ON leak_action_history (academy_id, created_at);
CREATE INDEX IF NOT EXISTS leak_action_history_athlete_idx ON leak_action_history (athlete_id);
CREATE INDEX IF NOT EXISTS leak_action_history_class_idx ON leak_action_history (class_id);
ALTER TABLE leak_action_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "leak_action_history_select" ON leak_action_history;
CREATE POLICY "leak_action_history_select" ON leak_action_history
  FOR SELECT USING (is_admin() OR academy_in_current_tenant(academy_id));
DROP POLICY IF EXISTS "leak_action_history_modify" ON leak_action_history;
CREATE POLICY "leak_action_history_modify" ON leak_action_history
  FOR ALL USING (is_admin() OR academy_in_current_tenant(academy_id))
  WITH CHECK (is_admin() OR academy_in_current_tenant(academy_id));

-- ============================================================================
-- academy_roles (academy-scoped)
-- ============================================================================
CREATE TABLE IF NOT EXISTS academy_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id uuid NOT NULL REFERENCES academies(id) ON DELETE CASCADE,
  name varchar(100) NOT NULL,
  description text,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  type text NOT NULL DEFAULT 'custom',
  inherits_from uuid,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz,
  created_at timestamptz DEFAULT now(),
  created_by uuid
);
CREATE INDEX IF NOT EXISTS academy_roles_academy_idx ON academy_roles (academy_id);
ALTER TABLE academy_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "academy_roles_select" ON academy_roles;
CREATE POLICY "academy_roles_select" ON academy_roles
  FOR SELECT USING (is_admin() OR academy_in_current_tenant(academy_id));
DROP POLICY IF EXISTS "academy_roles_modify" ON academy_roles;
CREATE POLICY "academy_roles_modify" ON academy_roles
  FOR ALL USING (is_admin() OR academy_in_current_tenant(academy_id))
  WITH CHECK (is_admin() OR academy_in_current_tenant(academy_id));

-- ============================================================================
-- role_members (academy-scoped; el usuario ve sus propias asignaciones)
-- ============================================================================
CREATE TABLE IF NOT EXISTS role_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL,
  user_id uuid NOT NULL,
  academy_id uuid NOT NULL,
  member_role text NOT NULL DEFAULT 'viewer',
  permissions jsonb,
  assigned_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  custom_permissions jsonb,
  assigned_by uuid,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS role_members_role_idx ON role_members (role_id);
CREATE INDEX IF NOT EXISTS role_members_user_idx ON role_members (user_id);
CREATE INDEX IF NOT EXISTS role_members_academy_idx ON role_members (academy_id);
CREATE UNIQUE INDEX IF NOT EXISTS role_members_uq ON role_members (role_id, user_id);
ALTER TABLE role_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "role_members_select" ON role_members;
CREATE POLICY "role_members_select" ON role_members
  FOR SELECT USING (is_admin() OR user_id = auth.uid() OR academy_in_current_tenant(academy_id));
DROP POLICY IF EXISTS "role_members_modify" ON role_members;
CREATE POLICY "role_members_modify" ON role_members
  FOR ALL USING (is_admin() OR academy_in_current_tenant(academy_id))
  WITH CHECK (is_admin() OR academy_in_current_tenant(academy_id));

-- ============================================================================
-- scheduled_reports (academy-scoped)
-- ============================================================================
CREATE TABLE IF NOT EXISTS scheduled_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id uuid NOT NULL,
  name varchar(200) NOT NULL,
  report_type varchar(100) NOT NULL,
  schedule varchar(100) NOT NULL,
  params jsonb,
  last_run_at timestamptz,
  next_run_at timestamptz,
  is_active text NOT NULL DEFAULT 'true',
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scheduled_reports_academy_idx ON scheduled_reports (academy_id);
ALTER TABLE scheduled_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "scheduled_reports_select" ON scheduled_reports;
CREATE POLICY "scheduled_reports_select" ON scheduled_reports
  FOR SELECT USING (is_admin() OR academy_in_current_tenant(academy_id));
DROP POLICY IF EXISTS "scheduled_reports_modify" ON scheduled_reports;
CREATE POLICY "scheduled_reports_modify" ON scheduled_reports
  FOR ALL USING (is_admin() OR academy_in_current_tenant(academy_id))
  WITH CHECK (is_admin() OR academy_in_current_tenant(academy_id));

-- ============================================================================
-- template_apparatus (catálogo global; hija de templates)
-- ============================================================================
CREATE TABLE IF NOT EXISTS template_apparatus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  short_name text,
  has_rotation boolean NOT NULL DEFAULT false,
  is_optional boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS template_apparatus_template_idx ON template_apparatus (template_id);
CREATE INDEX IF NOT EXISTS template_apparatus_sort_idx ON template_apparatus (template_id, sort_order);
ALTER TABLE template_apparatus ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "template_apparatus_select" ON template_apparatus;
CREATE POLICY "template_apparatus_select" ON template_apparatus FOR SELECT USING (true);
DROP POLICY IF EXISTS "template_apparatus_modify" ON template_apparatus;
CREATE POLICY "template_apparatus_modify" ON template_apparatus FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ============================================================================
-- template_competition_levels (catálogo global; hija de templates)
-- ============================================================================
CREATE TABLE IF NOT EXISTS template_competition_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  is_competitive boolean NOT NULL DEFAULT false,
  min_age integer,
  max_age integer,
  sort_order integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS template_competition_levels_template_idx ON template_competition_levels (template_id);
CREATE INDEX IF NOT EXISTS template_competition_levels_sort_idx ON template_competition_levels (template_id, sort_order);
ALTER TABLE template_competition_levels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "template_competition_levels_select" ON template_competition_levels;
CREATE POLICY "template_competition_levels_select" ON template_competition_levels FOR SELECT USING (true);
DROP POLICY IF EXISTS "template_competition_levels_modify" ON template_competition_levels;
CREATE POLICY "template_competition_levels_modify" ON template_competition_levels FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ============================================================================
-- template_license_config (catálogo global; 1:1 con templates)
-- ============================================================================
CREATE TABLE IF NOT EXISTS template_license_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL UNIQUE REFERENCES templates(id) ON DELETE CASCADE,
  required_for_competition boolean NOT NULL DEFAULT true,
  required_for_training boolean NOT NULL DEFAULT false,
  renewal_months integer NOT NULL DEFAULT 12,
  documents_required jsonb DEFAULT '[]'::jsonb,
  annual_fee_cents integer,
  medical_certificate_required boolean NOT NULL DEFAULT true,
  medical_certificate_validity_months integer NOT NULL DEFAULT 12
);
CREATE INDEX IF NOT EXISTS template_license_config_template_idx ON template_license_config (template_id);
ALTER TABLE template_license_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "template_license_config_select" ON template_license_config;
CREATE POLICY "template_license_config_select" ON template_license_config FOR SELECT USING (true);
DROP POLICY IF EXISTS "template_license_config_modify" ON template_license_config;
CREATE POLICY "template_license_config_modify" ON template_license_config FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ============================================================================
-- template_scoring_config (catálogo global; 1:1 con templates)
-- ============================================================================
CREATE TABLE IF NOT EXISTS template_scoring_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL UNIQUE REFERENCES templates(id) ON DELETE CASCADE,
  scoring_type text NOT NULL DEFAULT 'd_e',
  max_difficulties integer NOT NULL DEFAULT 6,
  max_per_group integer NOT NULL DEFAULT 1,
  deductions_small integer NOT NULL DEFAULT 1,
  deductions_medium integer NOT NULL DEFAULT 3,
  deductions_large integer NOT NULL DEFAULT 5,
  deductions_fall integer NOT NULL DEFAULT 10,
  combo_bonus_2_elements integer NOT NULL DEFAULT 1,
  combo_bonus_3_plus_elements integer NOT NULL DEFAULT 2,
  min_difficulty_value integer NOT NULL DEFAULT 1,
  max_difficulty_value integer NOT NULL DEFAULT 26,
  extra_config jsonb
);
CREATE INDEX IF NOT EXISTS template_scoring_config_template_idx ON template_scoring_config (template_id);
ALTER TABLE template_scoring_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "template_scoring_config_select" ON template_scoring_config;
CREATE POLICY "template_scoring_config_select" ON template_scoring_config FOR SELECT USING (true);
DROP POLICY IF EXISTS "template_scoring_config_modify" ON template_scoring_config;
CREATE POLICY "template_scoring_config_modify" ON template_scoring_config FOR ALL USING (is_admin()) WITH CHECK (is_admin());
