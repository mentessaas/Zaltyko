-- Sprint auditoría: endurecer policies permisivas (lote 2).
--
-- Contexto: la verificación read-only contra producción (2026-07-03) detectó que
-- el lote 1 (20260625000002) NO cubrió estas tablas, que siguen con policies
-- "allow_authenticated" permitiendo escritura entre tenants, y que `conversations`
-- quedó SIN RLS habilitado. Se replica el patrón live de las tablas tenant sanas
-- (ej. charges): `is_admin() OR academy_in_current_tenant(academy_id)`.
--
-- Cubre:
--   Tenant-scoped (tienen academy_id): discount_campaigns, discount_usage_history,
--     conversations (además de faltarle ENABLE RLS).
--   Catálogos globales (sin columna de tenant): templates, template_competition_flow,
--     template_age_categories -> lectura abierta, escritura solo super-admin.

-- ============================================================================
-- TENANT-SCOPED: discount_campaigns
-- ============================================================================
DROP POLICY IF EXISTS "allow_authenticated" ON "discount_campaigns";
DROP POLICY IF EXISTS "discount_campaigns_tenant_access" ON "discount_campaigns";

CREATE POLICY "discount_campaigns_select" ON "discount_campaigns"
  FOR SELECT USING (is_admin() OR academy_in_current_tenant(academy_id));

CREATE POLICY "discount_campaigns_modify" ON "discount_campaigns"
  FOR ALL USING (is_admin() OR academy_in_current_tenant(academy_id))
  WITH CHECK (is_admin() OR academy_in_current_tenant(academy_id));

-- ============================================================================
-- TENANT-SCOPED: discount_usage_history
-- ============================================================================
DROP POLICY IF EXISTS "allow_authenticated" ON "discount_usage_history";
DROP POLICY IF EXISTS "discount_usage_history_tenant_access" ON "discount_usage_history";

CREATE POLICY "discount_usage_history_select" ON "discount_usage_history"
  FOR SELECT USING (is_admin() OR academy_in_current_tenant(academy_id));

CREATE POLICY "discount_usage_history_modify" ON "discount_usage_history"
  FOR ALL USING (is_admin() OR academy_in_current_tenant(academy_id))
  WITH CHECK (is_admin() OR academy_in_current_tenant(academy_id));

-- ============================================================================
-- TENANT-SCOPED: conversations (además: RLS estaba DESHABILITADO en prod)
-- ============================================================================
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_authenticated" ON "conversations";
DROP POLICY IF EXISTS "conversations_tenant_access" ON "conversations";

CREATE POLICY "conversations_select" ON "conversations"
  FOR SELECT USING (is_admin() OR academy_in_current_tenant(academy_id));

CREATE POLICY "conversations_modify" ON "conversations"
  FOR ALL USING (is_admin() OR academy_in_current_tenant(academy_id))
  WITH CHECK (is_admin() OR academy_in_current_tenant(academy_id));

-- ============================================================================
-- CATÁLOGO GLOBAL: templates (país/disciplina, sin columna de tenant)
-- Lectura abierta a autenticados; escritura solo super-admin.
-- ============================================================================
DROP POLICY IF EXISTS "allow_authenticated" ON "templates";

CREATE POLICY "templates_select" ON "templates"
  FOR SELECT USING (true);

CREATE POLICY "templates_modify" ON "templates"
  FOR ALL USING (is_admin())
  WITH CHECK (is_admin());

-- ============================================================================
-- CATÁLOGO GLOBAL: template_competition_flow
-- ============================================================================
DROP POLICY IF EXISTS "allow_authenticated" ON "template_competition_flow";

CREATE POLICY "template_competition_flow_select" ON "template_competition_flow"
  FOR SELECT USING (true);

CREATE POLICY "template_competition_flow_modify" ON "template_competition_flow"
  FOR ALL USING (is_admin())
  WITH CHECK (is_admin());

-- ============================================================================
-- CATÁLOGO GLOBAL: template_age_categories
-- ============================================================================
DROP POLICY IF EXISTS "Allow authenticated insert" ON "template_age_categories";
DROP POLICY IF EXISTS "Allow authenticated read" ON "template_age_categories";
DROP POLICY IF EXISTS "Allow authenticated update" ON "template_age_categories";
DROP POLICY IF EXISTS "allow_authenticated" ON "template_age_categories";

CREATE POLICY "template_age_categories_select" ON "template_age_categories"
  FOR SELECT USING (true);

CREATE POLICY "template_age_categories_modify" ON "template_age_categories"
  FOR ALL USING (is_admin())
  WITH CHECK (is_admin());
