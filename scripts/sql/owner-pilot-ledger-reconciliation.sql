-- Sandbox only: deployment history metadata, never financial/business/Auth rows.
-- Precondition: catalog confirms this exact private relation and columns exist.
-- Execute only on aeeootdmuiqkfeernskw inside READ ONLY with 10s statement timeout.
-- Expected literals copied from production-schema-manifest-5d072d19.json.
WITH expected(sequence, filename, version, checksum) AS (
  VALUES
    (1, '20261006080702_establish_zaltyko_domain_foundation.sql', '20261006080702', '925035bc477c99031a42dfed6681701b39911b679e9a0ebb4a801654cae490e0'),
    (2, '20261013100000_model_sport_profiles_and_complementary_activities.sql', '20261013100000', '238f3eb4fd49033f526e2ed97383d3c3954f38661dbd1291b17da5459ab8bde7'),
    (3, '20261006085254_add_operational_enrollment_invariants.sql', '20261006085254', '8f77222e3e653cb1062b60c877c3389c354f611c0cfddf075ab764fc957786b1'),
    (4, '20261006090034_add_trials_waitlists_families.sql', '20261006090034', '7561ac07a133bbbf31319faab6445e132a14dbbaf380df4c925b523566ab1d44'),
    (5, '20261006093047_add_internal_billing_ledger.sql', '20261006093047', '60aecb28f12db1ce4588e361649636ac137026f9652ddc773c8982f870ab7aa7'),
    (6, '20261006094607_add_versioned_metric_engine.sql', '20261006094607', '1c292e6c9fb9bd514e802608399c2c818fca47cfba469b2f818bf240e120d9de'),
    (7, '20261006100146_add_explainable_health_score.sql', '20261006100146', '6889ca37c6f2f6a128521416fe7c1894e8fc9407193a77da4650680fc38f5760'),
    (8, '20261006113000_add_actionable_insights.sql', '20261006113000', 'c7668beb5b249bd1049a89128e0c5d2375d91ec1b1d53f5d15137101e18c88b2'),
    (9, '20261006123000_add_organization_bootstrap.sql', '20261006123000', '8743984e7614990dd77d70beb3c528b98b0a983872cc265b1f75c64187f13b35'),
    (10, '20261006131000_add_organization_default_currency.sql', '20261006131000', '3ecac1c3307b502320c08b1984a25ba7b518ae460e17c34cbc37c06a41b3c73c'),
    (11, '20261006160012_track_owner_pipeline_freshness.sql', '20261006160012', '8c391de53ae0d6b5b9d99cefe3fb31e0af8116395f9058d67bf49ec359ff5026'),
    (12, '20261006165917_owner_cohort_retention_projections.sql', '20261006165917', '599e01586738b47fe55bf755db05b818138bcd7b35266fac543abeec08efd242'),
    (13, '20261013120000_owner_dashboard_layout_preferences.sql', '20261013120000', '6bac2775a38f59dfb50c7c3e95ad87ded59381f56ea9b22ac18842ed20ae755c'),
    (14, '20261013082806_organization_payment_accounts.sql', '20261013082806', '09a5d20ad3db559bbd2c2ea0f88fc8c3d2f8a23edafbb88ecaf84fc0850264b5'),
    (15, '20261013160000_canonical_family_collection_and_entitlements.sql', '20261013160000', '26681ba811375945539b622bda57e51e765d5fbd61b8afd094282647331cad08'),
    (16, '20261013170001_record_group_membership_history.sql', '20261013170001', '6d555ed6324ef7784966f533dd63745d2244b2e4f931eae6ad0f7e31b7e0b926'),
    (17, '20261013235142_owner_signup_consent_canonical.sql', '20261013235142', 'addaafa75b1770a3ae7a68fb7eec274a7dd1e5936e792371a5562b0f4ae8508d'),
    (18, '20261014001209_monthly_athlete_tariff_coverage_and_invoice_line_enrollments.sql', '20261014001209', 'a95007f6e4fff135c856b21889de27204ab37768b5853c6aa9592d829497395d')
), reconciled AS (
  SELECT e.sequence, e.filename,
         pg_catalog.count(l.filename) AS registered_rows,
         COALESCE(pg_catalog.bool_and(l.version = e.version), false) AS version_matches,
         COALESCE(pg_catalog.bool_and(l.checksum = e.checksum), false) AS checksum_matches
  FROM expected e
  LEFT JOIN zaltyko_domain_private.e2e_schema_migrations l ON l.filename = e.filename
  GROUP BY e.sequence, e.filename
), extra AS (
  SELECT pg_catalog.count(*) AS unexpected_registered_rows
  FROM zaltyko_domain_private.e2e_schema_migrations l
  WHERE NOT EXISTS (SELECT 1 FROM expected e WHERE e.filename = l.filename)
)
SELECT pg_catalog.json_build_object(
  'expected', (SELECT pg_catalog.json_agg(r ORDER BY r.sequence) FROM reconciled r),
  'unexpected_registered_rows', (SELECT unexpected_registered_rows FROM extra)
) AS deployment_history_comparison;

