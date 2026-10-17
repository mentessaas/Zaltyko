-- Fixed catalog-only evidence. No executor or transaction control.
-- Operator must independently establish READ ONLY and a 10s statement timeout.
-- Exactly one row / one JSON value; no intermediate results for clients to lose.
SELECT pg_catalog.jsonb_build_object(
  'server_version_num', pg_catalog.current_setting('server_version_num')::integer,
  'extensions', (
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'extension_name', expected.extension_name,
      'extension_exists', e.oid IS NOT NULL,
      'extversion', CASE WHEN e.extversion ~ '^[0-9]+([.][0-9]+)*$'
                         AND pg_catalog.length(e.extversion) <= 64
                        THEN e.extversion END,
      'version_format_valid', CASE WHEN e.oid IS NOT NULL
                         THEN e.extversion ~ '^[0-9]+([.][0-9]+)*$'
                          AND pg_catalog.length(e.extversion) <= 64 END,
      'schema_category', CASE WHEN e.oid IS NULL THEN NULL
                              WHEN n.nspname = 'public' THEN 'public'
                              WHEN n.nspname = 'extensions' THEN 'extensions'
                              WHEN n.nspname = 'pg_catalog' THEN 'pg_catalog'
                              ELSE 'OTHER_REDACTED' END
    ) ORDER BY expected.extension_name)
    FROM (VALUES ('ltree'), ('pgcrypto'), ('btree_gist')) AS expected(extension_name)
    LEFT JOIN pg_catalog.pg_extension e ON e.extname = expected.extension_name
    LEFT JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
  )
) AS version_extension_evidence;
