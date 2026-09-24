DROP INDEX IF EXISTS public.invitations_email_tenant_unique;
CREATE UNIQUE INDEX IF NOT EXISTS invitations_pending_email_tenant_unique
  ON public.invitations (tenant_id, email)
  WHERE status = 'pending';
