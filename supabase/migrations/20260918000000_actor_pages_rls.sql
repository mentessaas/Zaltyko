-- 20260918000000_actor_pages_rls.sql
-- T1 — Web pública editable por cada actor.
-- RLS policies para actor_pages, actor_consents y suppliers.
-- Sigue el patrón del proyecto: SELECT/UPDATE/INSERT/DELETE por rol.

-- ============================================================================
-- HELPER: actor_page_is_owner
-- Devuelve true si el profile actual es "dueño" del entity de la página.
-- Cubre los 4 tipos: academy (owner_id = user), coach (user_id o profile_id),
-- athlete (user_id = profile.user_id), supplier (owner_user_id).
-- ============================================================================
CREATE OR REPLACE FUNCTION actor_page_is_owner(p_actor_page actor_pages)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles prof WHERE prof.user_id = auth.uid()
  )
  AND (
    (p_actor_page.entity_type = 'academy' AND EXISTS (
       SELECT 1 FROM academies a
        WHERE a.id = p_actor_page.entity_id
          AND a.owner_id = (SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1)
    ))
    OR (p_actor_page.entity_type = 'coach' AND EXISTS (
       SELECT 1 FROM coaches c
        WHERE c.id = p_actor_page.entity_id
          AND (c.user_id = auth.uid() OR c.profile_id = (SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1))
    ))
    OR (p_actor_page.entity_type = 'athlete' AND EXISTS (
       SELECT 1 FROM athletes at
        WHERE at.id = p_actor_page.entity_id
          AND at.user_id = (SELECT user_id FROM profiles WHERE user_id = auth.uid())
    ))
    OR (p_actor_page.entity_type = 'supplier' AND EXISTS (
       SELECT 1 FROM suppliers s
        WHERE s.id = p_actor_page.entity_id
          AND s.owner_user_id = auth.uid()
    ))
  );
$$;

COMMENT ON FUNCTION actor_page_is_owner(actor_pages) IS
  'Devuelve true si el usuario actual es dueño (cualquier tipo) del entity de la página';

-- ============================================================================
-- ACTOR_PAGES
-- Lectura pública: cualquiera puede ver páginas publicadas y no bloqueadas.
-- Lectura owner: dueño del entity puede leer/editar su página (incluso drafts).
-- ============================================================================
ALTER TABLE actor_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "actor_pages_public_select" ON actor_pages;
CREATE POLICY "actor_pages_public_select" ON actor_pages
  FOR SELECT USING (
    is_admin()
    OR public_visible = true
       AND published_at IS NOT NULL
       AND blocked_at IS NULL
       AND (entity_type <> 'athlete' OR consent_status <> 'revoked')
    OR actor_page_is_owner(actor_pages)
    OR (entity_type = 'academy' AND EXISTS (
         SELECT 1 FROM academies a
          WHERE a.id = actor_pages.entity_id
            AND a.tenant_id = get_current_tenant()
       ))
  );

DROP POLICY IF EXISTS "actor_pages_modify" ON actor_pages;
CREATE POLICY "actor_pages_modify" ON actor_pages
  FOR ALL USING (
    is_admin()
    OR actor_page_is_owner(actor_pages)
  ) WITH CHECK (
    is_admin()
    OR actor_page_is_owner(actor_pages)
  );

-- ============================================================================
-- ACTOR_CONSENTS
-- Lectura: admin o guardian del atleta.
-- Inserción: solo guardian legal del atleta.
-- Update: solo guardian (revocación) o admin.
-- ============================================================================
ALTER TABLE actor_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "actor_consents_select" ON actor_consents;
CREATE POLICY "actor_consents_select" ON actor_consents
  FOR SELECT USING (
    is_admin()
    OR guardian_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM actor_pages ap
       WHERE ap.id = actor_consents.actor_page_id
         AND actor_page_is_owner(ap)
    )
  );

DROP POLICY IF EXISTS "actor_consents_insert" ON actor_consents;
CREATE POLICY "actor_consents_insert" ON actor_consents
  FOR INSERT WITH CHECK (
    is_admin()
    OR guardian_user_id = auth.uid()
  );

DROP POLICY IF EXISTS "actor_consents_update" ON actor_consents;
CREATE POLICY "actor_consents_update" ON actor_consents
  FOR UPDATE USING (
    is_admin()
    OR guardian_user_id = auth.uid()
  );

-- ============================================================================
-- SUPPLIERS
-- Lectura: cualquiera puede ver suppliers verificados (marketplace público futuro).
-- Lectura owner: dueño del supplier.
-- Modify: solo dueño o admin.
-- ============================================================================
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "suppliers_public_select" ON suppliers;
CREATE POLICY "suppliers_public_select" ON suppliers
  FOR SELECT USING (
    is_admin()
    OR owner_user_id = auth.uid()
    OR kyc_status = 'verified'
  );

DROP POLICY IF EXISTS "suppliers_modify" ON suppliers;
CREATE POLICY "suppliers_modify" ON suppliers
  FOR ALL USING (
    is_admin()
    OR owner_user_id = auth.uid()
  ) WITH CHECK (
    is_admin()
    OR owner_user_id = auth.uid()
  );

-- ============================================================================
-- INDICES de soporte para RLS (evitar seq scan)
-- ============================================================================
CREATE INDEX IF NOT EXISTS "actor_pages_visibility_idx"
  ON actor_pages (public_visible, published_at)
  WHERE public_visible = true;

CREATE INDEX IF NOT EXISTS "suppliers_verified_idx"
  ON suppliers (kyc_status)
  WHERE kyc_status = 'verified';
