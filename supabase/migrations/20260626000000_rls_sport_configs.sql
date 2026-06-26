-- RLS para tablas del modulo sport-config que quedaron sin policies en Sprint 7.
-- Tablas afectadas:
--   - academy_sport_configs (academy_id)
--   - athlete_sport_configs (athlete_id + academy_sport_config_id)
--   - coach_sport_configs (coach_id + academy_sport_config_id)
--
-- Patrón consistente con `20260625000001_rls_lateral_modules.sql`:
-- helper functions `is_admin()` y `academy_in_current_tenant()` ya instaladas.

-- academy_sport_configs: tenant via academy_id
ALTER TABLE "academy_sport_configs" ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "academy_sport_configs" TO authenticated, service_role;

DROP POLICY IF EXISTS "academy_sport_configs_tenant_access" ON "academy_sport_configs";
CREATE POLICY "academy_sport_configs_tenant_access" ON "academy_sport_configs"
  FOR ALL USING (
    is_admin() OR academy_in_current_tenant(academy_id)
  )
  WITH CHECK (
    is_admin() OR academy_in_current_tenant(academy_id)
  );

-- athlete_sport_configs: tenant via academy_sport_config_id -> academy_id
ALTER TABLE "athlete_sport_configs" ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "athlete_sport_configs" TO authenticated, service_role;

DROP POLICY IF EXISTS "athlete_sport_configs_tenant_access" ON "athlete_sport_configs";
CREATE POLICY "athlete_sport_configs_tenant_access" ON "athlete_sport_configs"
  FOR ALL USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM academy_sport_configs c
      WHERE c.id = athlete_sport_configs.academy_sport_config_id
        AND academy_in_current_tenant(c.academy_id)
    )
  )
  WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM academy_sport_configs c
      WHERE c.id = athlete_sport_configs.academy_sport_config_id
        AND academy_in_current_tenant(c.academy_id)
    )
  );

-- coach_sport_configs: tenant via academy_sport_config_id -> academy_id
ALTER TABLE "coach_sport_configs" ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "coach_sport_configs" TO authenticated, service_role;

DROP POLICY IF EXISTS "coach_sport_configs_tenant_access" ON "coach_sport_configs";
CREATE POLICY "coach_sport_configs_tenant_access" ON "coach_sport_configs"
  FOR ALL USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM academy_sport_configs c
      WHERE c.id = coach_sport_configs.academy_sport_config_id
        AND academy_in_current_tenant(c.academy_id)
    )
  )
  WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM academy_sport_configs c
      WHERE c.id = coach_sport_configs.academy_sport_config_id
        AND academy_in_current_tenant(c.academy_id)
    )
  );