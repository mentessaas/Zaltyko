-- Keep disposable staging aligned with production's tenant boundary for
-- sensitive athlete documents. Additive and idempotent.

ALTER TABLE public.athlete_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS athlete_documents_tenant_access
  ON public.athlete_documents;

CREATE POLICY athlete_documents_tenant_access
  ON public.athlete_documents
  FOR ALL
  TO public
  USING (
    zaltyko_private.is_admin()
    OR tenant_id = zaltyko_private.get_current_tenant()
  )
  WITH CHECK (
    zaltyko_private.is_admin()
    OR tenant_id = zaltyko_private.get_current_tenant()
  );

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.athlete_documents
  TO authenticated, service_role;
