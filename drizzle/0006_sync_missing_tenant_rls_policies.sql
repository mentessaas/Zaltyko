-- Runtime hardening: these tables were protected in source migrations but
-- lacked policies in the production database. Keep the policy contract in git.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['academy_diagnostics','academy_expenses','churn_reasons','coach_compensation','class_waiting_list'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated, service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_access ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_tenant_access ON public.%I FOR ALL USING (is_admin() OR tenant_id = get_current_tenant()) WITH CHECK (is_admin() OR tenant_id = get_current_tenant())', t, t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.athlete_documents TO authenticated, service_role;
DROP POLICY IF EXISTS athlete_documents_tenant_access ON public.athlete_documents;
CREATE POLICY athlete_documents_tenant_access ON public.athlete_documents
  FOR ALL USING (is_admin() OR tenant_id = get_current_tenant())
  WITH CHECK (is_admin() OR tenant_id = get_current_tenant());
