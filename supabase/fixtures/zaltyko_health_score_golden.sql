-- Synthetic organization-owned benchmark. It is test evidence, not a market claim.
insert into zaltyko.benchmark_profiles (
  id, organization_id, key, name, market, currency, organization_type,
  discipline_scope, source_title, source_year, methodology_notes,
  effective_from, version, status
) values (
  '30000000-0000-0000-0000-000000000961',
  '30000000-0000-0000-0000-000000000001',
  'synthetic_acceptance_profile', 'Perfil sintético de aceptación', 'test', null,
  'synthetic', 'gymnastics', 'Fixture sintético PR-06', 2026,
  'Objetivos fabricados exclusivamente para comprobar fórmulas y gates.',
  '2026-01-01', 1, 'active'
);

insert into zaltyko.benchmark_metric_targets (
  benchmark_profile_id, metric_key, target_numeric, currency, grain,
  normalization_direction, notes
) values
  ('30000000-0000-0000-0000-000000000961', 'class_fill_rate', 0.75, null, 'month', 'higher_better', 'Meta sintética'),
  ('30000000-0000-0000-0000-000000000961', 'cohort_retention_rate', 0.80, null, 'month', 'higher_better', 'Meta sintética'),
  ('30000000-0000-0000-0000-000000000961', 'churn_rate', 0.05, null, 'month', 'lower_better', 'Meta sintética'),
  ('30000000-0000-0000-0000-000000000961', 'collection_rate', 0.95, 'EUR', 'month', 'higher_better', 'Meta sintética'),
  ('30000000-0000-0000-0000-000000000961', 'attendance_coverage', 0.95, null, 'month', 'higher_better', 'Meta sintética');
