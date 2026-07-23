-- Día 3: aislamiento por academia para recursos de comunicación.
-- Migración aditiva, versionada para revisión. NO se aplicó a producción.

BEGIN;

ALTER TABLE public.message_templates
  ADD COLUMN IF NOT EXISTS academy_id uuid
  REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.message_groups
  ADD COLUMN IF NOT EXISTS academy_id uuid
  REFERENCES public.academies(id) ON DELETE CASCADE;
ALTER TABLE public.scheduled_notifications
  ADD COLUMN IF NOT EXISTS academy_id uuid
  REFERENCES public.academies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS message_templates_academy_idx
  ON public.message_templates (academy_id);
CREATE INDEX IF NOT EXISTS message_groups_academy_idx
  ON public.message_groups (academy_id);
CREATE INDEX IF NOT EXISTS scheduled_notifications_academy_idx
  ON public.scheduled_notifications (academy_id);

-- Solo hay una asignación inequívoca cuando el tenant posee una única academia.
WITH single_academy AS (
  SELECT tenant_id, min(id::text)::uuid AS academy_id
  FROM public.academies
  WHERE tenant_id IS NOT NULL
  GROUP BY tenant_id
  HAVING count(*) = 1
)
UPDATE public.message_templates AS resource
SET academy_id = scope.academy_id
FROM single_academy AS scope
WHERE resource.tenant_id = scope.tenant_id
  AND resource.academy_id IS NULL
  AND resource.is_system = false;

WITH single_academy AS (
  SELECT tenant_id, min(id::text)::uuid AS academy_id
  FROM public.academies
  WHERE tenant_id IS NOT NULL
  GROUP BY tenant_id
  HAVING count(*) = 1
)
UPDATE public.message_groups AS resource
SET academy_id = scope.academy_id
FROM single_academy AS scope
WHERE resource.tenant_id = scope.tenant_id
  AND resource.academy_id IS NULL;

WITH single_academy AS (
  SELECT tenant_id, min(id::text)::uuid AS academy_id
  FROM public.academies
  WHERE tenant_id IS NOT NULL
  GROUP BY tenant_id
  HAVING count(*) = 1
)
UPDATE public.scheduled_notifications AS resource
SET academy_id = scope.academy_id
FROM single_academy AS scope
WHERE resource.tenant_id = scope.tenant_id
  AND resource.academy_id IS NULL;

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "message_templates_select" ON public.message_templates;
DROP POLICY IF EXISTS "message_templates_modify" ON public.message_templates;
DROP POLICY IF EXISTS "message_templates_tenant_access" ON public.message_templates;
DROP POLICY IF EXISTS "message_templates_insert" ON public.message_templates;
DROP POLICY IF EXISTS "message_templates_update" ON public.message_templates;
DROP POLICY IF EXISTS "message_templates_delete" ON public.message_templates;

CREATE POLICY "message_templates_select" ON public.message_templates
  FOR SELECT TO authenticated USING (
    CASE WHEN auth.uid() IS NULL THEN false ELSE (
      zaltyko_private.is_super_admin()
      OR (
        academy_id IS NULL
        AND is_system = true
        AND (tenant_id IS NULL OR zaltyko_private.row_in_current_tenant(tenant_id))
      )
      OR (
        zaltyko_private.row_in_current_tenant(tenant_id)
        AND zaltyko_private.is_academy_member(academy_id)
      )
    ) END
  );
CREATE POLICY "message_templates_insert" ON public.message_templates
  FOR INSERT WITH CHECK (
    academy_id IS NOT NULL
    AND zaltyko_private.row_in_current_tenant(tenant_id)
    AND zaltyko_private.is_academy_manager(academy_id)
  );
CREATE POLICY "message_templates_update" ON public.message_templates
  FOR UPDATE USING (
    academy_id IS NOT NULL
    AND zaltyko_private.row_in_current_tenant(tenant_id)
    AND zaltyko_private.is_academy_manager(academy_id)
  ) WITH CHECK (
    academy_id IS NOT NULL
    AND zaltyko_private.row_in_current_tenant(tenant_id)
    AND zaltyko_private.is_academy_manager(academy_id)
  );
CREATE POLICY "message_templates_delete" ON public.message_templates
  FOR DELETE USING (
    academy_id IS NOT NULL
    AND zaltyko_private.row_in_current_tenant(tenant_id)
    AND zaltyko_private.is_academy_manager(academy_id)
  );

DROP POLICY IF EXISTS "message_groups_select" ON public.message_groups;
DROP POLICY IF EXISTS "message_groups_modify" ON public.message_groups;
DROP POLICY IF EXISTS "message_groups_tenant_access" ON public.message_groups;
DROP POLICY IF EXISTS "message_groups_insert" ON public.message_groups;
DROP POLICY IF EXISTS "message_groups_update" ON public.message_groups;
DROP POLICY IF EXISTS "message_groups_delete" ON public.message_groups;

CREATE POLICY "message_groups_select" ON public.message_groups
  FOR SELECT TO authenticated USING (
    CASE WHEN auth.uid() IS NULL THEN false ELSE (
      zaltyko_private.row_in_current_tenant(tenant_id)
      AND zaltyko_private.is_academy_member(academy_id)
    ) END
  );
CREATE POLICY "message_groups_insert" ON public.message_groups
  FOR INSERT WITH CHECK (
    academy_id IS NOT NULL
    AND zaltyko_private.row_in_current_tenant(tenant_id)
    AND zaltyko_private.is_academy_manager(academy_id)
  );
CREATE POLICY "message_groups_update" ON public.message_groups
  FOR UPDATE USING (
    academy_id IS NOT NULL
    AND zaltyko_private.row_in_current_tenant(tenant_id)
    AND zaltyko_private.is_academy_manager(academy_id)
  ) WITH CHECK (
    academy_id IS NOT NULL
    AND zaltyko_private.row_in_current_tenant(tenant_id)
    AND zaltyko_private.is_academy_manager(academy_id)
  );
CREATE POLICY "message_groups_delete" ON public.message_groups
  FOR DELETE USING (
    academy_id IS NOT NULL
    AND zaltyko_private.row_in_current_tenant(tenant_id)
    AND zaltyko_private.is_academy_manager(academy_id)
  );

DROP POLICY IF EXISTS "scheduled_notifications_select" ON public.scheduled_notifications;
DROP POLICY IF EXISTS "scheduled_notifications_modify" ON public.scheduled_notifications;
DROP POLICY IF EXISTS "scheduled_notifications_tenant_access" ON public.scheduled_notifications;
DROP POLICY IF EXISTS "scheduled_notifications_insert" ON public.scheduled_notifications;
DROP POLICY IF EXISTS "scheduled_notifications_update" ON public.scheduled_notifications;
DROP POLICY IF EXISTS "scheduled_notifications_delete" ON public.scheduled_notifications;

CREATE POLICY "scheduled_notifications_select" ON public.scheduled_notifications
  FOR SELECT TO authenticated USING (
    CASE WHEN auth.uid() IS NULL THEN false ELSE (
      zaltyko_private.row_in_current_tenant(tenant_id)
      AND zaltyko_private.is_academy_member(academy_id)
    ) END
  );
CREATE POLICY "scheduled_notifications_insert" ON public.scheduled_notifications
  FOR INSERT WITH CHECK (
    academy_id IS NOT NULL
    AND zaltyko_private.row_in_current_tenant(tenant_id)
    AND zaltyko_private.is_academy_manager(academy_id)
  );
CREATE POLICY "scheduled_notifications_update" ON public.scheduled_notifications
  FOR UPDATE USING (
    academy_id IS NOT NULL
    AND zaltyko_private.row_in_current_tenant(tenant_id)
    AND zaltyko_private.is_academy_manager(academy_id)
  ) WITH CHECK (
    academy_id IS NOT NULL
    AND zaltyko_private.row_in_current_tenant(tenant_id)
    AND zaltyko_private.is_academy_manager(academy_id)
  );
CREATE POLICY "scheduled_notifications_delete" ON public.scheduled_notifications
  FOR DELETE USING (
    academy_id IS NOT NULL
    AND zaltyko_private.row_in_current_tenant(tenant_id)
    AND zaltyko_private.is_academy_manager(academy_id)
  );

COMMIT;
