-- Sprint 6C.3: Endurecer policies permisivas (lote 1: marketplace + empleo + ads + push).
--
-- Reemplaza policies "allow_authenticated" (que permiten cualquier lectura/escritura
-- entre usuarios autenticados) por policies que filtran por user_id o academy_id.
--
-- Cubre: marketplace_listings, marketplace_ratings, empleo_listings,
-- empleo_applications, tickets, ticket_responses, ticket_attachments,
-- advertisements, featured_listings, push_subscriptions.

-- ========================================
-- marketplace_listings (user-scoped)
-- ========================================
DROP POLICY IF EXISTS "allow_authenticated" ON "marketplace_listings";
DROP POLICY IF EXISTS "marketplace_listings_user_access" ON "marketplace_listings";

-- Cualquiera puede ver listings activos (marketplace es publico)
CREATE POLICY "marketplace_listings_select" ON "marketplace_listings"
  FOR SELECT USING (
    status = 'active'::marketplace_listing_status OR is_admin()
  );

-- Solo el dueno puede crear/modificar/eliminar
CREATE POLICY "marketplace_listings_insert" ON "marketplace_listings"
  FOR INSERT WITH CHECK (
    user_id = auth.uid() OR is_admin()
  );

CREATE POLICY "marketplace_listings_update" ON "marketplace_listings"
  FOR UPDATE USING (
    user_id = auth.uid() OR is_admin()
  )
  WITH CHECK (
    user_id = auth.uid() OR is_admin()
  );

CREATE POLICY "marketplace_listings_delete" ON "marketplace_listings"
  FOR DELETE USING (
    user_id = auth.uid() OR is_admin()
  );

-- ========================================
-- marketplace_ratings (sobre listings)
-- ========================================
DROP POLICY IF EXISTS "allow_authenticated" ON "marketplace_ratings";
DROP POLICY IF EXISTS "marketplace_ratings_user_access" ON "marketplace_ratings";

CREATE POLICY "marketplace_ratings_select" ON "marketplace_ratings"
  FOR SELECT USING (true);

CREATE POLICY "marketplace_ratings_insert" ON "marketplace_ratings"
  FOR INSERT WITH CHECK (
    reviewer_id = auth.uid() OR is_admin()
  );

CREATE POLICY "marketplace_ratings_update" ON "marketplace_ratings"
  FOR UPDATE USING (
    reviewer_id = auth.uid() OR is_admin()
  );

-- ========================================
-- empleo_listings (academy-scoped via academy_id)
-- ========================================
DROP POLICY IF EXISTS "allow_authenticated" ON "empleo_listings";
DROP POLICY IF EXISTS "empleo_listings_tenant_access" ON "empleo_listings";

-- Cualquiera puede ver listings activos (empleo es publico)
CREATE POLICY "empleo_listings_select" ON "empleo_listings"
  FOR SELECT USING (
    status = 'active' OR is_admin() OR academy_in_current_tenant(academy_id)
  );

-- Solo el dueno (academia) puede crear/modificar
CREATE POLICY "empleo_listings_insert" ON "empleo_listings"
  FOR INSERT WITH CHECK (
    academy_in_current_tenant(academy_id) OR is_admin()
  );

CREATE POLICY "empleo_listings_update" ON "empleo_listings"
  FOR UPDATE USING (
    academy_in_current_tenant(academy_id) OR is_admin()
  );

-- ========================================
-- empleo_applications (user-scoped, sobre listings)
-- ========================================
DROP POLICY IF EXISTS "allow_authenticated" ON "empleo_applications";
DROP POLICY IF EXISTS "empleo_applications_user_access" ON "empleo_applications";

CREATE POLICY "empleo_applications_select" ON "empleo_applications"
  FOR SELECT USING (
    user_id = auth.uid() OR is_admin()
    OR EXISTS (
      SELECT 1 FROM empleo_listings el
      WHERE el.id = empleo_applications.listing_id
        AND academy_in_current_tenant(el.academy_id)
    )
  );

CREATE POLICY "empleo_applications_insert" ON "empleo_applications"
  FOR INSERT WITH CHECK (
    user_id = auth.uid() OR is_admin()
  );

CREATE POLICY "empleo_applications_update" ON "empleo_applications"
  FOR UPDATE USING (
    user_id = auth.uid() OR is_admin()
  );

-- ========================================
-- tickets + ticket_responses + ticket_attachments (academy-scoped)
-- Schema usa created_by / user_id / uploaded_by (no reporter_id/author_id)
-- ========================================
DROP POLICY IF EXISTS "allow_authenticated" ON "tickets";
DROP POLICY IF EXISTS "allow_authenticated" ON "ticket_responses";
DROP POLICY IF EXISTS "allow_authenticated" ON "ticket_attachments";

-- tickets: creator + assigned_to + academy staff pueden ver
CREATE POLICY "tickets_tenant_access" ON "tickets"
  FOR ALL USING (
    is_admin()
    OR created_by = auth.uid()
    OR assigned_to = auth.uid()
    OR academy_in_current_tenant(academy_id)
  )
  WITH CHECK (
    is_admin() OR academy_in_current_tenant(academy_id)
  );

CREATE POLICY "ticket_responses_tenant_access" ON "ticket_responses"
  FOR ALL USING (
    is_admin()
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = ticket_responses.ticket_id
        AND (t.created_by = auth.uid()
             OR t.assigned_to = auth.uid()
             OR academy_in_current_tenant(t.academy_id))
    )
  )
  WITH CHECK (
    is_admin() OR user_id = auth.uid()
  );

CREATE POLICY "ticket_attachments_tenant_access" ON "ticket_attachments"
  FOR ALL USING (
    is_admin()
    OR uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = ticket_attachments.ticket_id
        AND (t.created_by = auth.uid()
             OR t.assigned_to = auth.uid()
             OR academy_in_current_tenant(t.academy_id))
    )
  )
  WITH CHECK (
    is_admin() OR uploaded_by = auth.uid()
  );

-- ========================================
-- advertisements (global, admin-only writes)
-- ========================================
DROP POLICY IF EXISTS "allow_authenticated" ON "advertisements";
DROP POLICY IF EXISTS "advertisements_user_access" ON "advertisements";

CREATE POLICY "advertisements_select" ON "advertisements"
  FOR SELECT USING (
    is_active = true OR is_admin()
  );

CREATE POLICY "advertisements_admin_only" ON "advertisements"
  FOR ALL USING (
    is_admin()
  )
  WITH CHECK (
    is_admin()
  );

-- ========================================
-- featured_listings (global, admin-only writes)
-- ========================================
DROP POLICY IF EXISTS "allow_authenticated" ON "featured_listings";
DROP POLICY IF EXISTS "featured_listings_user_access" ON "featured_listings";

CREATE POLICY "featured_listings_select" ON "featured_listings"
  FOR SELECT USING (true);

CREATE POLICY "featured_listings_admin_only" ON "featured_listings"
  FOR ALL USING (
    is_admin()
  )
  WITH CHECK (
    is_admin()
  );

-- ========================================
-- push_subscriptions (user-scoped, personal)
-- ========================================
DROP POLICY IF EXISTS "allow_authenticated" ON "push_subscriptions";
DROP POLICY IF EXISTS "push_subscriptions_user_access" ON "push_subscriptions";

CREATE POLICY "push_subscriptions_user_access" ON "push_subscriptions"
  FOR ALL USING (
    is_admin() OR user_id = auth.uid()
  )
  WITH CHECK (
    is_admin() OR user_id = auth.uid()
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "marketplace_listings" TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "marketplace_ratings" TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "empleo_listings" TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "empleo_applications" TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "tickets" TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "ticket_responses" TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "ticket_attachments" TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "advertisements" TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "featured_listings" TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "push_subscriptions" TO authenticated, service_role;