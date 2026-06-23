-- RLS for academy_link_requests
-- Tabla creada en 20260623103000 sin políticas. Esta migración habilita RLS con
-- dos dimensiones: aislamiento por tenant (staff de academia) y acceso por
-- target_profile_id (usuario receptor puede ver/aceptar/rechazar).

ALTER TABLE "academy_link_requests" ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "academy_link_requests" TO authenticated, service_role;

DROP POLICY IF EXISTS "academy_link_requests_tenant_or_target_access" ON "academy_link_requests";
CREATE POLICY "academy_link_requests_tenant_or_target_access" ON "academy_link_requests"
  FOR ALL USING (
    is_admin()
    OR "tenant_id" = get_current_tenant()
    OR "target_profile_id" = get_current_profile()
  )
  WITH CHECK (
    is_admin()
    OR "tenant_id" = get_current_tenant()
  );

DROP POLICY IF EXISTS "academy_link_requests_target_response" ON "academy_link_requests";
CREATE POLICY "academy_link_requests_target_response" ON "academy_link_requests"
  FOR UPDATE USING (
    "target_profile_id" = get_current_profile()
  )
  WITH CHECK (
    "target_profile_id" = get_current_profile()
  );
