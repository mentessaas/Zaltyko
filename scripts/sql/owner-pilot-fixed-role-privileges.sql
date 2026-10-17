-- Catalog-only supplement to owner-pilot-catalog-preflight.sql.
-- No connection/executor: independently establish READ ONLY and a 10s timeout.
-- Fixed technical labels only. Missing role/object => NULL privileges, not denial.

-- 1. Capabilities of the three named roles, NOT the identity of the app connection.
WITH expected(role_category) AS (
  VALUES ('anon'), ('authenticated'), ('service_role')
)
SELECT e.role_category, r.oid IS NOT NULL AS role_exists,
       r.rolsuper AS role_superuser, r.rolbypassrls AS role_bypassrls,
       r.rolinherit AS role_inherits
FROM expected e
LEFT JOIN pg_catalog.pg_roles r ON r.rolname = e.role_category
ORDER BY e.role_category
LIMIT 3;

-- 2. Effective schema privileges include applicable inheritance and PUBLIC.
WITH expected(role_category) AS (
  VALUES ('anon'), ('authenticated'), ('service_role')
), namespaces(schema_category) AS (
  VALUES ('zaltyko'), ('zaltyko_domain_private')
)
SELECT e.role_category, s.schema_category,
       r.oid IS NOT NULL AS role_exists, n.oid IS NOT NULL AS schema_exists,
       CASE WHEN r.oid IS NOT NULL AND n.oid IS NOT NULL
            THEN pg_catalog.has_schema_privilege(r.oid, n.oid, 'USAGE') END AS effective_usage,
       CASE WHEN r.oid IS NOT NULL AND n.oid IS NOT NULL
            THEN pg_catalog.has_schema_privilege(r.oid, n.oid, 'CREATE') END AS effective_create
FROM expected e CROSS JOIN namespaces s
LEFT JOIN pg_catalog.pg_roles r ON r.rolname = e.role_category
LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = s.schema_category
ORDER BY e.role_category, s.schema_category
LIMIT 6;

-- 3. Fixed sensitive subset: metadata only, never relation contents.
WITH expected(role_category) AS (
  VALUES ('anon'), ('authenticated'), ('service_role')
), targets(schema_category, relation_category) AS (
  VALUES ('zaltyko', 'organizations'), ('zaltyko', 'enrollments'),
         ('zaltyko', 'invoices'), ('zaltyko', 'invoice_line_enrollments'),
         ('zaltyko', 'payments'), ('zaltyko', 'outbox_events'),
         ('zaltyko_domain_private', 'e2e_schema_migrations'),
         ('zaltyko_domain_private', 'e2e_delta_schema_migrations')
)
SELECT e.role_category, t.schema_category, t.relation_category,
       r.oid IS NOT NULL AS role_exists, c.oid IS NOT NULL AS relation_exists,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
       r.oid = c.relowner AS role_owns_relation,
       CASE WHEN r.oid IS NOT NULL AND c.oid IS NOT NULL THEN pg_catalog.pg_has_role(r.oid, c.relowner, 'USAGE') END AS role_inherits_owner_privileges,
       CASE WHEN r.oid IS NOT NULL AND c.oid IS NOT NULL THEN pg_catalog.has_table_privilege(r.oid, c.oid, 'SELECT') END AS effective_select,
       CASE WHEN r.oid IS NOT NULL AND c.oid IS NOT NULL THEN pg_catalog.has_table_privilege(r.oid, c.oid, 'INSERT') END AS effective_insert,
       CASE WHEN r.oid IS NOT NULL AND c.oid IS NOT NULL THEN pg_catalog.has_table_privilege(r.oid, c.oid, 'UPDATE') END AS effective_update,
       CASE WHEN r.oid IS NOT NULL AND c.oid IS NOT NULL THEN pg_catalog.has_table_privilege(r.oid, c.oid, 'DELETE') END AS effective_delete,
       CASE WHEN r.oid IS NOT NULL AND c.oid IS NOT NULL THEN pg_catalog.has_table_privilege(r.oid, c.oid, 'TRUNCATE') END AS effective_truncate,
       CASE WHEN r.oid IS NOT NULL AND c.oid IS NOT NULL THEN pg_catalog.has_table_privilege(r.oid, c.oid, 'REFERENCES') END AS effective_references,
       CASE WHEN r.oid IS NOT NULL AND c.oid IS NOT NULL THEN pg_catalog.has_table_privilege(r.oid, c.oid, 'TRIGGER') END AS effective_trigger,
       CASE WHEN r.oid IS NOT NULL AND c.oid IS NOT NULL THEN pg_catalog.has_any_column_privilege(r.oid, c.oid, 'SELECT') END AS any_column_select,
       CASE WHEN r.oid IS NOT NULL AND c.oid IS NOT NULL THEN pg_catalog.has_any_column_privilege(r.oid, c.oid, 'INSERT') END AS any_column_insert,
       CASE WHEN r.oid IS NOT NULL AND c.oid IS NOT NULL THEN pg_catalog.has_any_column_privilege(r.oid, c.oid, 'UPDATE') END AS any_column_update
FROM expected e CROSS JOIN targets t
LEFT JOIN pg_catalog.pg_roles r ON r.rolname = e.role_category
LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = t.schema_category
LEFT JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid
                             AND c.relname = t.relation_category
                             AND c.relkind IN ('r', 'p')
ORDER BY e.role_category, t.schema_category, t.relation_category
LIMIT 24;
