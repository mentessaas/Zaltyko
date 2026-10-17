-- Seed one legacy per-enrollment invoice line before the additive migration.
insert into zaltyko.locations (id, organization_id, code, name) values (
  '10000000-0000-0000-0000-000000000012',
  '10000000-0000-0000-0000-000000000001',
  'sede-otra', 'Sede Sintética Alternativa'
);

insert into zaltyko.people (id, organization_id, given_name, family_name) values (
  '10000000-0000-0000-0000-000000000303',
  '10000000-0000-0000-0000-000000000001', 'Atleta', 'Sintética Adicional'
);
insert into zaltyko.athletes (id, organization_id, person_id) values (
  '10000000-0000-0000-0000-000000000402',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000303'
);
insert into zaltyko.family_members (
  id, organization_id, family_id, athlete_id, relationship, starts_on
) values (
  '10000000-0000-0000-0000-000000000622',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000601',
  '10000000-0000-0000-0000-000000000402', 'parent', date '2026-01-01'
);

insert into zaltyko.price_plans (
  id, organization_id, name, cadence, amount_cents, currency
) values (
  '10000000-0000-0000-0000-000000000901',
  '10000000-0000-0000-0000-000000000001',
  'Tarifa sintética mensual', 'monthly', 3000, 'EUR'
);

insert into zaltyko.class_templates (
  id, organization_id, location_id, program_id, name, capacity, status,
  effective_from
) values
  (
    '10000000-0000-0000-0000-000000000803',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000011',
    '10000000-0000-0000-0000-000000000701',
    'Clase Sintética Complementaria', 8, 'active', current_date - 30
  ),
  (
    '10000000-0000-0000-0000-000000000804',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000011',
    '10000000-0000-0000-0000-000000000701',
    'Clase Sintética Sin Inscripción', 8, 'active', current_date - 30
  );

insert into zaltyko.enrollments (
  id, organization_id, location_id, athlete_id, class_template_id, price_plan_id,
  status, starts_on, source
) values
  (
    '10000000-0000-0000-0000-000000000851',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000011',
    '10000000-0000-0000-0000-000000000401',
    '10000000-0000-0000-0000-000000000801',
    '10000000-0000-0000-0000-000000000901',
    'active', date '2026-01-01', 'owner'
  ),
  (
    '10000000-0000-0000-0000-000000000852',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000011',
    '10000000-0000-0000-0000-000000000401',
    '10000000-0000-0000-0000-000000000803',
    '10000000-0000-0000-0000-000000000901',
    'active', date '2026-01-01', 'owner'
  ),
  (
    '10000000-0000-0000-0000-000000000853',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000011',
    '10000000-0000-0000-0000-000000000402',
    '10000000-0000-0000-0000-000000000804',
    '10000000-0000-0000-0000-000000000901',
    'active', date '2026-01-01', 'owner'
  );

insert into zaltyko.enrollment_price_assignments (
  id, organization_id, location_id, enrollment_id, price_plan_id,
  unit_amount_cents, currency, starts_on
) values
  (
    '10000000-0000-0000-0000-000000000861',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000011',
    '10000000-0000-0000-0000-000000000851',
    '10000000-0000-0000-0000-000000000901', 3000, 'EUR', date '2026-01-01'
  ),
  (
    '10000000-0000-0000-0000-000000000862',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000011',
    '10000000-0000-0000-0000-000000000852',
    '10000000-0000-0000-0000-000000000901', 3000, 'EUR', date '2026-01-01'
  ),
  (
    '10000000-0000-0000-0000-000000000863',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000011',
    '10000000-0000-0000-0000-000000000853',
    '10000000-0000-0000-0000-000000000901', 3000, 'EUR', date '2026-01-01'
  );

insert into zaltyko.invoices (
  id, organization_id, location_id, family_id, family_payer_id, reference,
  status, currency, total_amount_cents, issued_at, due_at, idempotency_key
) values (
  '10000000-0000-0000-0000-000000000871',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000011',
  '10000000-0000-0000-0000-000000000601',
  '10000000-0000-0000-0000-000000000631',
  'SYNTH-MONTHLY-LEGACY', 'issued', 'EUR', 3000, now(),
  now() + interval '7 days', 'synthetic-monthly-legacy-before-migration'
);

insert into zaltyko.invoice_lines (
  id, organization_id, invoice_id, enrollment_id, price_plan_id, line_type,
  quantity, unit_amount_cents, amount_cents, currency,
  service_period_start, service_period_end
) values (
  '10000000-0000-0000-0000-000000000881',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000871',
  '10000000-0000-0000-0000-000000000851',
  '10000000-0000-0000-0000-000000000901', 'monthly_fee', 1, 3000, 3000, 'EUR',
  date '2026-10-01', date '2026-10-31'
);
