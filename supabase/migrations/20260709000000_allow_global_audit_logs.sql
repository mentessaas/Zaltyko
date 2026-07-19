-- Align the existing audit_logs table with the Drizzle schema before writing
-- platform-level entries. The remote table may predate these descriptive columns.
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS user_email text,
  ADD COLUMN IF NOT EXISTS module text NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS resource_name text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'success';

-- Super Admin actions such as creating/deleting users and academies use tenant_id = NULL.
-- Null entries remain platform-only: regular tenant users cannot read or write them.

DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;
CREATE POLICY "audit_logs_select" ON audit_logs
  FOR SELECT USING (
    is_admin() OR (tenant_id IS NOT NULL AND tenant_id = get_current_tenant())
  );

DROP POLICY IF EXISTS "audit_logs_modify" ON audit_logs;
CREATE POLICY "audit_logs_modify" ON audit_logs
  FOR ALL USING (
    is_admin() OR (tenant_id IS NOT NULL AND tenant_id = get_current_tenant())
  ) WITH CHECK (
    is_admin() OR (tenant_id IS NOT NULL AND tenant_id = get_current_tenant())
  );
