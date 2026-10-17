-- Metadata only. No transaction control, DDL, application rows or ledger rows.
-- Run only inside an independently established READ ONLY transaction.
-- total_rows > the LIMIT means INCOMPLETE: do not infer absence or readiness.

-- 1. Expected namespaces, including legacy helpers without inspecting their body.
SELECT expected.schema_name, n.oid IS NOT NULL AS schema_exists,
       n.nspowner = (SELECT r.oid FROM pg_catalog.pg_roles r
                     WHERE r.rolname = CURRENT_USER) AS owned_by_effective_role,
       pg_catalog.has_schema_privilege(n.oid, 'USAGE') AS effective_usage,
       pg_catalog.has_schema_privilege(n.oid, 'CREATE') AS effective_create
FROM (VALUES ('public'), ('auth'), ('zaltyko'), ('zaltyko_domain_private'),
             ('zaltyko_private')) AS expected(schema_name)
LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = expected.schema_name
ORDER BY expected.schema_name
LIMIT 5;

-- 2. Effective-role and resolved-path capabilities, never identity/path strings.
SELECT CURRENT_USER = SESSION_USER AS effective_equals_session_role,
       r.rolsuper AS effective_superuser, r.rolbypassrls AS effective_bypassrls,
       r.rolinherit AS effective_inherits,
       'public' = ANY(pg_catalog.current_schemas(false)) AS path_has_public,
       'auth' = ANY(pg_catalog.current_schemas(false)) AS path_has_auth,
       'zaltyko' = ANY(pg_catalog.current_schemas(false)) AS path_has_zaltyko,
       'zaltyko_domain_private' = ANY(pg_catalog.current_schemas(false))
         AS path_has_domain_private,
       EXISTS (SELECT 1 FROM pg_catalog.unnest(pg_catalog.current_schemas(false)) s(name)
               WHERE s.name NOT IN ('public', 'auth', 'zaltyko',
                                     'zaltyko_domain_private', 'pg_catalog'))
         AS path_has_other_redacted
FROM pg_catalog.pg_roles r
WHERE r.rolname = CURRENT_USER
LIMIT 1;

-- 3. Relations, RLS flags and effective DB privileges. No relation contents.
SELECT n.nspname AS schema_name, c.relname AS relation_name, c.relkind,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
       pg_catalog.has_table_privilege(c.oid, 'SELECT') AS effective_select,
       pg_catalog.has_table_privilege(c.oid, 'INSERT') AS effective_insert,
       pg_catalog.has_table_privilege(c.oid, 'UPDATE') AS effective_update,
       pg_catalog.has_table_privilege(c.oid, 'DELETE') AS effective_delete,
       pg_catalog.count(*) OVER () AS total_rows
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public', 'auth', 'zaltyko', 'zaltyko_domain_private')
  AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
ORDER BY n.nspname, c.relname
LIMIT 400;

-- 4. Column shape. Defaults, generated expressions and comments are excluded.
SELECT n.nspname AS schema_name, c.relname AS relation_name,
       a.attnum AS column_position, a.attname AS column_name,
       tn.nspname AS type_schema, t.typname AS type_name, a.atttypmod,
       a.attnotnull AS not_null, a.atthasdef AS has_default,
       a.attidentity AS identity_kind, a.attgenerated AS generated_kind,
       pg_catalog.count(*) OVER () AS total_rows
FROM pg_catalog.pg_attribute a
JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_type t ON t.oid = a.atttypid
JOIN pg_catalog.pg_namespace tn ON tn.oid = t.typnamespace
WHERE n.nspname IN ('public', 'auth', 'zaltyko', 'zaltyko_domain_private')
  AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY n.nspname, c.relname, a.attnum
LIMIT 8000;

-- 5. Constraint shape. No constraint names, checks, predicates or literal text.
SELECT n.nspname AS schema_name, c.relname AS relation_name,
       k.contype, k.convalidated, k.condeferrable, k.condeferred,
       k.conkey AS column_positions, k.confkey AS referenced_column_positions,
       CASE WHEN rn.nspname IN ('public', 'auth', 'zaltyko', 'zaltyko_domain_private')
            THEN rn.nspname ELSE 'OTHER_REDACTED' END AS referenced_schema,
       CASE WHEN rn.nspname IN ('public', 'auth', 'zaltyko', 'zaltyko_domain_private')
            THEN rc.relname ELSE NULL END AS referenced_relation,
       k.confupdtype, k.confdeltype, k.confmatchtype,
       k.conbin IS NOT NULL AS has_check_expression,
       pg_catalog.count(*) OVER () AS total_rows
FROM pg_catalog.pg_constraint k
JOIN pg_catalog.pg_class c ON c.oid = k.conrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_catalog.pg_class rc ON rc.oid = k.confrelid
LEFT JOIN pg_catalog.pg_namespace rn ON rn.oid = rc.relnamespace
WHERE n.nspname IN ('public', 'auth', 'zaltyko', 'zaltyko_domain_private')
ORDER BY n.nspname, c.relname, k.contype, k.oid
LIMIT 4000;

-- 6. Index shape. Zero column position denotes expression, not its contents.
SELECT n.nspname AS schema_name, c.relname AS relation_name, am.amname AS method,
       i.indisunique, i.indisprimary, i.indisvalid, i.indisready,
       i.indnkeyatts, i.indnatts, i.indkey AS column_positions,
       i.indexprs IS NOT NULL AS has_expression,
       i.indpred IS NOT NULL AS has_predicate, pg_catalog.count(*) OVER () AS total_rows
FROM pg_catalog.pg_index i
JOIN pg_catalog.pg_class c ON c.oid = i.indrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_class ix ON ix.oid = i.indexrelid
JOIN pg_catalog.pg_am am ON am.oid = ix.relam
WHERE n.nspname IN ('public', 'auth', 'zaltyko', 'zaltyko_domain_private')
ORDER BY n.nspname, c.relname, i.indexrelid
LIMIT 4000;

-- 7. Policy shape, without names, expressions, role names or expression hashes.
SELECT n.nspname AS schema_name, c.relname AS relation_name,
       p.polcmd, p.polpermissive,
       p.polqual IS NOT NULL AS has_using_expression,
       p.polwithcheck IS NOT NULL AS has_check_expression,
       0::pg_catalog.oid = ANY(p.polroles) AS applies_public,
       (SELECT r.oid FROM pg_catalog.pg_roles r WHERE r.rolname = 'anon')
         = ANY(p.polroles) AS applies_anon,
       (SELECT r.oid FROM pg_catalog.pg_roles r WHERE r.rolname = 'authenticated')
         = ANY(p.polroles) AS applies_authenticated,
       (SELECT r.oid FROM pg_catalog.pg_roles r WHERE r.rolname = 'service_role')
         = ANY(p.polroles) AS applies_service_role,
       pg_catalog.cardinality(p.polroles) AS role_count,
       pg_catalog.count(*) OVER () AS total_rows
FROM pg_catalog.pg_policy p
JOIN pg_catalog.pg_class c ON c.oid = p.polrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public', 'auth', 'zaltyko', 'zaltyko_domain_private')
ORDER BY n.nspname, c.relname, p.polcmd, p.oid
LIMIT 4000;

-- 8. Table ACLs, including implicit owner defaults. Only fixed role categories.
SELECT DISTINCT n.nspname AS schema_name, c.relname AS relation_name,
       CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
            WHEN acl.grantee = (SELECT r.oid FROM pg_catalog.pg_roles r WHERE r.rolname = 'anon') THEN 'anon'
            WHEN acl.grantee = (SELECT r.oid FROM pg_catalog.pg_roles r WHERE r.rolname = 'authenticated') THEN 'authenticated'
            WHEN acl.grantee = (SELECT r.oid FROM pg_catalog.pg_roles r WHERE r.rolname = 'service_role') THEN 'service_role'
            ELSE 'OTHER_REDACTED' END AS role_category,
       acl.privilege_type, acl.is_grantable, pg_catalog.count(*) OVER () AS total_rows
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL pg_catalog.aclexplode(
  COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))) acl
WHERE n.nspname IN ('public', 'auth', 'zaltyko', 'zaltyko_domain_private')
  AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
ORDER BY schema_name, relation_name, role_category, acl.privilege_type, acl.is_grantable
LIMIT 12000;

-- 9. Functions: structural identity only. No body, config, defaults or owners.
SELECT n.nspname AS schema_name, p.proname AS routine_name,
       p.prokind, p.pronargs, p.prosecdef, p.provolatile,
       p.proargtypes AS argument_type_oids,
       tn.nspname AS return_type_schema, t.typname AS return_type_name,
       pg_catalog.count(*) OVER () AS total_rows
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
JOIN pg_catalog.pg_type t ON t.oid = p.prorettype
JOIN pg_catalog.pg_namespace tn ON tn.oid = t.typnamespace
WHERE n.nspname IN ('public', 'auth', 'zaltyko', 'zaltyko_domain_private')
ORDER BY n.nspname, p.proname, p.oid
LIMIT 2000;

-- 10. Required extension presence/version/schema. No configuration table data.
SELECT expected.extension_name, e.oid IS NOT NULL AS extension_exists,
       e.extversion,
       CASE WHEN n.nspname IN ('public', 'extensions', 'pg_catalog', 'zaltyko')
            THEN n.nspname ELSE 'OTHER_REDACTED' END AS extension_schema
FROM (VALUES ('btree_gist'), ('pgcrypto')) AS expected(extension_name)
LEFT JOIN pg_catalog.pg_extension e ON e.extname = expected.extension_name
LEFT JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
ORDER BY expected.extension_name
LIMIT 2;
