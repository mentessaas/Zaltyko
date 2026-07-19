-- Audit logs are tenant-scoped by default. Only a Super Admin can access
-- platform-level entries or inspect logs outside their current tenant.

DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;
CREATE POLICY "audit_logs_select" ON audit_logs
  FOR SELECT USING (
    is_super_admin() OR (tenant_id IS NOT NULL AND tenant_id = get_current_tenant())
  );

DROP POLICY IF EXISTS "audit_logs_modify" ON audit_logs;
CREATE POLICY "audit_logs_modify" ON audit_logs
  FOR ALL USING (
    is_super_admin() OR (tenant_id IS NOT NULL AND tenant_id = get_current_tenant())
  ) WITH CHECK (
    is_super_admin() OR (tenant_id IS NOT NULL AND tenant_id = get_current_tenant())
  );
