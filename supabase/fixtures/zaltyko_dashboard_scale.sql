-- Synthetic scale-only fixture. No personal data or external provider calls.
-- Target: 1 organization, 10 locations, 5k athletes, 1k classes,
-- 100k sessions/year, 2m attendance rows, 250k charges + 250k payments,
-- and 36 months of score snapshots.

insert into auth.users (id)
select md5('zdash-user-' || n)::uuid
from generate_series(1, 20) n;

insert into zaltyko.organizations (
  id, name, status, country_code, default_timezone, default_currency
) values (
  '50000000-0000-4000-8000-000000000001',
  'Academia Sintética Escala', 'active', 'ES', 'Europe/Madrid', 'EUR'
);

insert into zaltyko.locations (id, organization_id, code, name)
select md5('zdash-location-' || n)::uuid,
  '50000000-0000-4000-8000-000000000001',
  'sede-' || lpad(n::text, 2, '0'), 'Sede Sintética ' || n
from generate_series(1, 10) n;

insert into zaltyko.organization_members (
  id, organization_id, user_id, role, status, location_scope_mode
)
select md5('zdash-member-' || n)::uuid,
  '50000000-0000-4000-8000-000000000001',
  md5('zdash-user-' || n)::uuid,
  'owner', 'active', 'all'
from generate_series(1, 20) n;

insert into zaltyko.programs (
  id, organization_id, name, discipline, status
)
select md5('zdash-program-' || n)::uuid,
  '50000000-0000-4000-8000-000000000001',
  'Programa sintético ' || n, 'artistic_gymnastics', 'active'
from generate_series(1, 10) n;

insert into zaltyko.people (id, organization_id, given_name, family_name)
select md5('zdash-person-' || n)::uuid,
  '50000000-0000-4000-8000-000000000001', 'Atleta', 'Sintético ' || n
from generate_series(1, 5000) n;

insert into zaltyko.athletes (id, organization_id, person_id)
select md5('zdash-athlete-' || n)::uuid,
  '50000000-0000-4000-8000-000000000001',
  md5('zdash-person-' || n)::uuid
from generate_series(1, 5000) n;

insert into zaltyko.groups (
  id, organization_id, location_id, program_id, name, capacity, status
)
select md5('zdash-group-' || n)::uuid,
  '50000000-0000-4000-8000-000000000001',
  md5('zdash-location-' || (((n - 1) / 25) + 1))::uuid,
  md5('zdash-program-' || (((n - 1) / 25) + 1))::uuid,
  'Grupo sintético ' || n, 20, 'active'
from generate_series(1, 250) n;

insert into zaltyko.group_memberships (
  id, organization_id, group_id, athlete_id, status, starts_on
)
select md5('zdash-group-member-' || n)::uuid,
  '50000000-0000-4000-8000-000000000001',
  md5('zdash-group-' || (((n - 1) / 20) + 1))::uuid,
  md5('zdash-athlete-' || n)::uuid,
  'active', '2023-10-01'
from generate_series(1, 5000) n;

insert into zaltyko.class_templates (
  id, organization_id, location_id, program_id, name, capacity, status, effective_from
)
select md5('zdash-class-' || n)::uuid,
  '50000000-0000-4000-8000-000000000001',
  md5('zdash-location-' || (((((n - 1) / 4) / 25) + 1)))::uuid,
  md5('zdash-program-' || (((n - 1) / 100) + 1))::uuid,
  'Clase sintética ' || n, 25, 'active', '2023-10-01'
from generate_series(1, 1000) n;

insert into zaltyko.class_template_groups (
  id, organization_id, class_template_id, group_id
)
select md5('zdash-class-group-' || n)::uuid,
  '50000000-0000-4000-8000-000000000001',
  md5('zdash-class-' || n)::uuid,
  md5('zdash-group-' || (((n - 1) / 4) + 1))::uuid
from generate_series(1, 1000) n;

insert into zaltyko.class_template_weekdays (
  id, organization_id, class_template_id, iso_weekday, starts_at_local, ends_at_local
)
select md5('zdash-class-weekday-' || n || '-' || weekday)::uuid,
  '50000000-0000-4000-8000-000000000001',
  md5('zdash-class-' || n)::uuid, weekday,
  case when weekday = 2 then '17:00'::time else '18:30'::time end,
  case when weekday = 2 then '18:30'::time else '20:00'::time end
from generate_series(1, 1000) n
cross join (values (2), (4)) as days(weekday);

insert into zaltyko.enrollments (
  id, organization_id, location_id, athlete_id, class_template_id,
  status, starts_on, source
)
select md5('zdash-enrollment-' || class_no || '-' || athlete_slot)::uuid,
  '50000000-0000-4000-8000-000000000001',
  md5('zdash-location-' || (((((class_no - 1) / 4) / 25) + 1)))::uuid,
  md5('zdash-athlete-' || (((((class_no - 1) / 4) * 20) + athlete_slot)))::uuid,
  md5('zdash-class-' || class_no)::uuid,
  'active', '2023-10-01', 'owner'
from generate_series(1, 1000) class_no
cross join generate_series(1, 20) athlete_slot;

insert into zaltyko.sessions (
  id, organization_id, location_id, class_template_id, status,
  starts_at, ends_at, capacity_override
)
select md5('zdash-session-' || n)::uuid,
  '50000000-0000-4000-8000-000000000001',
  md5('zdash-location-' || (((((class_no - 1) / 4) / 25) + 1)))::uuid,
  md5('zdash-class-' || class_no)::uuid,
  'completed',
  (timestamp '2025-01-06 17:00:00' + ((session_in_class - 1) * interval '3 days 12 hours')) at time zone 'Europe/Madrid',
  (timestamp '2025-01-06 18:30:00' + ((session_in_class - 1) * interval '3 days 12 hours')) at time zone 'Europe/Madrid',
  25
from generate_series(1, 100000) n
cross join lateral (
  select ((n - 1) / 100 + 1)::integer as class_no,
         ((n - 1) % 100 + 1)::integer as session_in_class
) parts;

insert into zaltyko.attendance_records (
  id, organization_id, location_id, session_id, enrollment_id, athlete_id,
  status, recorded_at
)
select md5('zdash-attendance-' || n || '-' || attendee)::uuid,
  '50000000-0000-4000-8000-000000000001',
  md5('zdash-location-' || (((((class_no - 1) / 4) / 25) + 1)))::uuid,
  md5('zdash-session-' || n)::uuid,
  md5('zdash-enrollment-' || class_no || '-' || attendee)::uuid,
  md5('zdash-athlete-' || (((((class_no - 1) / 4) * 20) + attendee)))::uuid,
  case when (n + attendee) % 4 = 0 then 'absent'::zaltyko.attendance_status
       when (n + attendee) % 4 = 1 then 'present'::zaltyko.attendance_status
       when (n + attendee) % 4 = 2 then 'late'::zaltyko.attendance_status
       else 'excused'::zaltyko.attendance_status end,
  timestamp '2025-01-06 17:00:00' + ((session_in_class - 1) * interval '3 days 12 hours')
from generate_series(1, 100000) n
cross join generate_series(1, 20) attendee
cross join lateral (
  select ((n - 1) / 100 + 1)::integer as class_no,
         ((n - 1) % 100 + 1)::integer as session_in_class
) parts;

insert into zaltyko.families (id, organization_id, external_reference)
select md5('zdash-family-' || n)::uuid,
  '50000000-0000-4000-8000-000000000001', 'scale-family-' || n
from generate_series(1, 5000) n;

insert into zaltyko.invoices (
  id, organization_id, location_id, family_id, reference, status, currency,
  total_amount_cents, issued_at, due_at, idempotency_key
)
select md5('zdash-invoice-' || n)::uuid,
  '50000000-0000-4000-8000-000000000001',
  md5('zdash-location-' || (((n - 1) % 10) + 1))::uuid,
  md5('zdash-family-' || (((n - 1) % 5000) + 1))::uuid,
  'SCALE-' || lpad(n::text, 6, '0'), 'paid', 'EUR', 5000,
  timestamp '2023-10-01 09:00:00' + ((n - 1) % 1095) * interval '1 day',
  timestamp '2023-10-05 09:00:00' + ((n - 1) % 1095) * interval '1 day',
  'scale-invoice-' || n
from generate_series(1, 250000) n;

insert into zaltyko.invoice_lines (
  id, organization_id, invoice_id, line_type, quantity,
  unit_amount_cents, amount_cents, currency, service_period_start, service_period_end
)
select md5('zdash-invoice-line-' || n)::uuid,
  '50000000-0000-4000-8000-000000000001',
  md5('zdash-invoice-' || n)::uuid, 'membership', 1, 5000, 5000, 'EUR',
  (date '2023-10-01' + (((n - 1) % 36) * interval '1 month'))::date,
  ((date '2023-10-01' + (((n - 1) % 36) * interval '1 month')) + interval '1 month - 1 day')::date
from generate_series(1, 250000) n;

insert into zaltyko.charges (
  id, organization_id, location_id, invoice_id, invoice_line_id, family_id,
  status, amount_cents, currency, due_at, service_period_start,
  service_period_end, idempotency_key
)
select md5('zdash-charge-' || n)::uuid,
  '50000000-0000-4000-8000-000000000001',
  md5('zdash-location-' || (((n - 1) % 10) + 1))::uuid,
  md5('zdash-invoice-' || n)::uuid,
  md5('zdash-invoice-line-' || n)::uuid,
  md5('zdash-family-' || (((n - 1) % 5000) + 1))::uuid,
  'paid', 5000, 'EUR',
  timestamp '2023-10-05 09:00:00' + ((n - 1) % 1095) * interval '1 day',
  (date '2023-10-01' + (((n - 1) % 36) * interval '1 month'))::date,
  ((date '2023-10-01' + (((n - 1) % 36) * interval '1 month')) + interval '1 month - 1 day')::date,
  'scale-charge-' || n
from generate_series(1, 250000) n;

insert into zaltyko.payments (
  id, organization_id, location_id, family_id, status, amount_cents, currency,
  processor, environment, provider_payment_id, received_at, idempotency_key
)
select md5('zdash-payment-' || n)::uuid,
  '50000000-0000-4000-8000-000000000001',
  md5('zdash-location-' || (((n - 1) % 10) + 1))::uuid,
  md5('zdash-family-' || (((n - 1) % 5000) + 1))::uuid,
  'succeeded', 5000, 'EUR', 'synthetic-load', 'sandbox',
  'scale-provider-payment-' || n,
  timestamp '2023-10-05 10:00:00' + ((n - 1) % 1095) * interval '1 day',
  'scale-payment-' || n
from generate_series(1, 250000) n;

insert into zaltyko.payment_allocations (
  id, organization_id, payment_id, charge_id, amount_cents, currency,
  allocated_at, idempotency_key
)
select md5('zdash-allocation-' || n)::uuid,
  '50000000-0000-4000-8000-000000000001',
  md5('zdash-payment-' || n)::uuid,
  md5('zdash-charge-' || n)::uuid,
  5000, 'EUR',
  timestamp '2023-10-05 10:01:00' + ((n - 1) % 1095) * interval '1 day',
  'scale-allocation-' || n
from generate_series(1, 250000) n;

insert into zaltyko.benchmark_profiles (
  id, organization_id, key, name, market, currency, organization_type,
  discipline_scope, source_title, source_year, methodology_notes,
  effective_from, version, status
) values (
  '50000000-0000-4000-8000-000000000961',
  '50000000-0000-4000-8000-000000000001',
  'synthetic_scale_profile', 'Perfil sintético de escala', 'test', 'EUR',
  'synthetic', 'gymnastics', 'Fixture de rendimiento; no es benchmark de mercado',
  2026, 'Datos fabricados para medir consultas, nunca referencia de negocio.',
  '2023-10-01', 1, 'active'
);

insert into zaltyko.benchmark_metric_targets (
  benchmark_profile_id, metric_key, target_numeric, currency, grain,
  normalization_direction, notes
)
select '50000000-0000-4000-8000-000000000961', metric_key, target_numeric,
  currency, 'month', direction::zaltyko.normalization_direction,
  'Objetivo sintético exclusivo del harness de carga.'
from (values
  ('class_fill_rate', 0.75::numeric, null::text, 'higher_better'),
  ('cohort_retention_rate', 0.80::numeric, null::text, 'higher_better'),
  ('churn_rate', 0.05::numeric, null::text, 'lower_better'),
  ('collection_rate', 0.95::numeric, 'EUR', 'higher_better'),
  ('attendance_coverage', 0.95::numeric, null::text, 'higher_better')
) targets(metric_key, target_numeric, currency, direction);

insert into zaltyko.metric_runs (
  organization_id, authorization_location_id, period_start, period_end,
  currency, formula_set_version, status, source_watermark, idempotency_key, completed_at
)
select '50000000-0000-4000-8000-000000000001',
  md5('zdash-location-1')::uuid,
  month_start::date, (month_start + interval '1 month - 1 day')::date,
  'EUR', 'zaltyko_metrics_v1', 'succeeded', now() - interval '1 minute',
  'scale-metric-run-' || n, now()
from generate_series(0, 35) n
cross join lateral (select date '2023-10-01' + n * interval '1 month' as month_start) period;

insert into zaltyko.metric_run_values (
  organization_id, metric_run_id, location_id, metric_key, period_start, period_end,
  value_numeric, currency, numerator, denominator, coverage, quality, dimensions,
  dimensions_sha256, formula_version, computed_at, source_watermark, diagnostics
)
select run.organization_id, run.id, null, definition.key,
  run.period_start, run.period_end,
  case when definition.key = 'net_collected_minor' then 250000::numeric
       when definition.key = 'collection_rate' then 0.90::numeric
       else 0.80::numeric end,
  case when definition.key in ('net_collected_minor', 'collection_rate') then 'EUR' else null end,
  80, 100, 1, 'complete', '{}'::jsonb,
  repeat('a', 64), definition.formula_version,
  run.completed_at, run.source_watermark, '{}'::jsonb
from zaltyko.metric_runs run
cross join zaltyko.metric_definitions definition
where run.organization_id = '50000000-0000-4000-8000-000000000001'
  and run.idempotency_key like 'scale-metric-run-%';

insert into zaltyko.health_score_snapshots (
  organization_id, location_id, metric_run_id, health_score_version_id,
  benchmark_profile_id, period_start, period_end, score, status, coverage,
  computed_at, source_watermark, idempotency_key, explanation
)
select run.organization_id, null, run.id,
  (select id from zaltyko.health_score_versions where key = 'zaltyko_owner_health' and version = 1),
  '50000000-0000-4000-8000-000000000961', run.period_start, run.period_end,
  83.28, 'healthy', 0.85, run.completed_at, run.source_watermark,
  'scale-health-score-' || run.idempotency_key, '{}'::jsonb
from zaltyko.metric_runs run
where run.organization_id = '50000000-0000-4000-8000-000000000001'
  and run.idempotency_key like 'scale-metric-run-%';

insert into zaltyko.health_score_dimension_snapshots (
  organization_id, health_score_snapshot_id, dimension, score, status,
  coverage, available_metric_weight, configured_metric_weight, explanation
)
select snapshot.organization_id, snapshot.id,
  dimension.dimension::zaltyko.health_dimension,
  case when dimension.dimension = 'workforce' then null else 82.00 end,
  case when dimension.dimension = 'workforce' then 'insufficient_data'::zaltyko.health_score_status
       else 'healthy'::zaltyko.health_score_status end,
  case when dimension.dimension = 'workforce' then 0 else 1 end,
  case when dimension.dimension = 'workforce' then 0 else 1 end,
  dimension.weight, '{}'::jsonb
from zaltyko.health_score_snapshots snapshot
cross join (values
  ('enrollment', 0.3000::numeric), ('financial', 0.3000::numeric),
  ('operational', 0.2500::numeric), ('workforce', 0.1500::numeric)
) dimension(dimension, weight)
where snapshot.organization_id = '50000000-0000-4000-8000-000000000001';

insert into zaltyko.health_score_metric_contributions (
  organization_id, health_score_snapshot_id, dimension, metric_key,
  metric_run_value_id, benchmark_target_id, actual_value, target_value,
  normalized_score, metric_weight, metric_coverage, effective_weight,
  quality, formula_version, explanation
)
select snapshot.organization_id, snapshot.id,
  item.dimension::zaltyko.health_dimension, item.metric_key,
  value.id, target.id, value.value_numeric, target.target_numeric,
  82.00, item.metric_weight, 1, item.metric_weight,
  'complete', 1, '{}'::jsonb
from zaltyko.health_score_snapshots snapshot
join zaltyko.metric_runs run on run.id = snapshot.metric_run_id
join (values
  ('enrollment', 'class_fill_rate', 0.45::numeric),
  ('enrollment', 'cohort_retention_rate', 0.35::numeric),
  ('enrollment', 'churn_rate', 0.20::numeric),
  ('financial', 'collection_rate', 1.00::numeric),
  ('operational', 'attendance_coverage', 1.00::numeric)
) item(dimension, metric_key, metric_weight) on true
join zaltyko.metric_run_values value
  on value.metric_run_id = run.id and value.metric_key = item.metric_key
left join zaltyko.benchmark_metric_targets target
  on target.benchmark_profile_id = snapshot.benchmark_profile_id
 and target.metric_key = item.metric_key
 and coalesce(target.currency, '') = coalesce(value.currency, '')
where snapshot.organization_id = '50000000-0000-4000-8000-000000000001';

analyze zaltyko.organizations;
analyze zaltyko.locations;
analyze zaltyko.organization_members;
analyze zaltyko.group_memberships;
analyze zaltyko.class_templates;
analyze zaltyko.class_template_groups;
analyze zaltyko.class_template_weekdays;
analyze zaltyko.enrollments;
analyze zaltyko.sessions;
analyze zaltyko.attendance_records;
analyze zaltyko.charges;
analyze zaltyko.payments;
analyze zaltyko.payment_allocations;
analyze zaltyko.metric_runs;
analyze zaltyko.metric_run_values;
analyze zaltyko.health_score_snapshots;
