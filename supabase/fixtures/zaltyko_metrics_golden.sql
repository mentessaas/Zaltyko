-- Frozen synthetic fixture for metric formulas. No real identities or contact data.

insert into auth.users (id) values ('30000000-0000-0000-0000-000000000101');
insert into zaltyko.organizations (id, name, status) values
  ('30000000-0000-0000-0000-000000000001', 'Academia Métricas Sintética', 'active');
insert into zaltyko.locations (id, organization_id, code, name) values
  ('30000000-0000-0000-0000-000000000011', '30000000-0000-0000-0000-000000000001', 'metricas', 'Sede Métricas Sintética');
insert into zaltyko.organization_members (
  id, organization_id, user_id, role, status, location_scope_mode
) values (
  '30000000-0000-0000-0000-000000000201',
  '30000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000101',
  'owner', 'active', 'all'
);

insert into zaltyko.facilities (id, organization_id, location_id, name) values
  ('30000000-0000-0000-0000-000000000031', '30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000011', 'Instalación Sintética');
insert into zaltyko.spaces (id, organization_id, location_id, facility_id, name, capacity) values
  ('30000000-0000-0000-0000-000000000041', '30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000011', '30000000-0000-0000-0000-000000000031', 'Sala 10', 10),
  ('30000000-0000-0000-0000-000000000042', '30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000011', '30000000-0000-0000-0000-000000000031', 'Sala 100', 100);
insert into zaltyko.organization_sports (
  id, organization_id, country_code, sport_profile_id, role, status
) values (
  '30000000-0000-0000-0000-000000000702',
  '30000000-0000-0000-0000-000000000001',
  'ES',
  '70000000-0000-4000-8000-000000000001',
  'primary',
  'active'
);
insert into zaltyko.programs (
  id, organization_id, name, kind, organization_sport_id, activity_key, status
) values (
  '30000000-0000-0000-0000-000000000701',
  '30000000-0000-0000-0000-000000000001',
  'Programa Métricas', 'gymnastics_sport',
  '30000000-0000-0000-0000-000000000702', null, 'active'
);
insert into zaltyko.class_templates (
  id, organization_id, location_id, program_id, default_space_id, name,
  capacity, status, effective_from
) values
  ('30000000-0000-0000-0000-000000000801', '30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000011', '30000000-0000-0000-0000-000000000701', '30000000-0000-0000-0000-000000000041', 'Clase 10', 10, 'active', '2026-08-01'),
  ('30000000-0000-0000-0000-000000000802', '30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000011', '30000000-0000-0000-0000-000000000701', '30000000-0000-0000-0000-000000000042', 'Clase 100', 100, 'active', '2026-08-01');
insert into zaltyko.sessions (
  id, organization_id, location_id, class_template_id, space_id, status,
  starts_at, ends_at
) values
  ('30000000-0000-0000-0000-000000000901', '30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000011', '30000000-0000-0000-0000-000000000801', '30000000-0000-0000-0000-000000000041', 'completed', '2026-09-15 16:00:00+02', '2026-09-15 17:00:00+02'),
  ('30000000-0000-0000-0000-000000000902', '30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000011', '30000000-0000-0000-0000-000000000802', '30000000-0000-0000-0000-000000000042', 'completed', '2026-09-15 18:00:00+02', '2026-09-15 19:00:00+02');

insert into zaltyko.people (id, organization_id, given_name, family_name)
select md5('metric-person-' || item)::uuid,
       '30000000-0000-0000-0000-000000000001',
       'Persona Sintética ' || item,
       'Métrica'
from generate_series(1, 86) item;
insert into zaltyko.athletes (id, organization_id, person_id)
select md5('metric-athlete-' || item)::uuid,
       '30000000-0000-0000-0000-000000000001',
       md5('metric-person-' || item)::uuid
from generate_series(1, 85) item;
insert into zaltyko.guardians (id, organization_id, person_id) values
  ('30000000-0000-0000-0000-000000000501', '30000000-0000-0000-0000-000000000001', md5('metric-person-86')::uuid);
insert into zaltyko.families (id, organization_id, external_reference) values
  ('30000000-0000-0000-0000-000000000601', '30000000-0000-0000-0000-000000000001', 'fixture-metrics-family');
insert into zaltyko.family_guardians (
  id, organization_id, family_id, guardian_id, relationship, can_manage_enrollments
) values (
  '30000000-0000-0000-0000-000000000611', '30000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000601', '30000000-0000-0000-0000-000000000501',
  'legal_guardian', true
);
insert into zaltyko.family_payers (
  id, organization_id, family_id, guardian_id, is_primary, starts_on
) values (
  '30000000-0000-0000-0000-000000000631', '30000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000601', '30000000-0000-0000-0000-000000000501',
  true, '2026-08-01'
);

insert into zaltyko.enrollments (
  id, organization_id, location_id, athlete_id, class_template_id, status,
  starts_on, ends_on, source
)
select md5('metric-enrollment-' || item)::uuid,
       '30000000-0000-0000-0000-000000000001',
       '30000000-0000-0000-0000-000000000011',
       md5('metric-athlete-' || item)::uuid,
       case when item <= 5
         then '30000000-0000-0000-0000-000000000801'::uuid
         else '30000000-0000-0000-0000-000000000802'::uuid end,
       case when item = 1 then 'completed'::zaltyko.enrollment_status
            when item = 85 then 'cancelled'::zaltyko.enrollment_status
            else 'active'::zaltyko.enrollment_status end,
       '2026-08-01',
       case when item = 1 then '2026-09-20'::date
            when item = 85 then '2026-09-25'::date end,
       'import'
from generate_series(1, 85) item;
insert into zaltyko.enrollment_status_history (
  organization_id, enrollment_id, from_status, to_status, reason_code,
  idempotency_key, effective_on, changed_at
)
select '30000000-0000-0000-0000-000000000001',
       md5('metric-enrollment-' || item)::uuid,
       null, 'active', 'fixture', 'metric-active-' || item,
       '2026-08-01', '2026-08-01 00:00:00+02'
from generate_series(1, 85) item;
insert into zaltyko.enrollment_status_history (
  organization_id, enrollment_id, from_status, to_status, reason_code,
  idempotency_key, effective_on, changed_at
) values
  ('30000000-0000-0000-0000-000000000001', md5('metric-enrollment-1')::uuid, 'active', 'completed', 'transfer', 'metric-transfer-out', '2026-09-20', '2026-09-20 09:00:00+02'),
  ('30000000-0000-0000-0000-000000000001', md5('metric-enrollment-85')::uuid, 'active', 'cancelled', 'withdrawal', 'metric-real-churn', '2026-09-25', '2026-09-25 09:00:00+02');
insert into zaltyko.enrollments (
  id, organization_id, location_id, athlete_id, class_template_id, status,
  starts_on, source, source_entity_id
) values (
  '30000000-0000-0000-0000-000000000921',
  '30000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000011',
  md5('metric-athlete-1')::uuid,
  '30000000-0000-0000-0000-000000000802',
  'active', '2026-09-20', 'transfer', md5('metric-enrollment-1')::uuid
);
insert into zaltyko.enrollment_status_history (
  organization_id, enrollment_id, from_status, to_status, reason_code,
  idempotency_key, effective_on, changed_at
) values (
  '30000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000921', null, 'active', 'transfer',
  'metric-transfer-in', '2026-09-20', '2026-09-20 09:00:01+02'
);

insert into zaltyko.attendance_records (
  organization_id, location_id, session_id, enrollment_id, athlete_id, status,
  recorded_by_member_id, recorded_at
)
select '30000000-0000-0000-0000-000000000001',
       '30000000-0000-0000-0000-000000000011',
       case when item <= 5
         then '30000000-0000-0000-0000-000000000901'::uuid
         else '30000000-0000-0000-0000-000000000902'::uuid end,
       md5('metric-enrollment-' || item)::uuid,
       md5('metric-athlete-' || item)::uuid,
       case when item <= 74 then 'present'::zaltyko.attendance_status
            else 'absent'::zaltyko.attendance_status end,
       '30000000-0000-0000-0000-000000000201',
       '2026-09-15 20:00:00+02'
from generate_series(1, 85) item;

insert into zaltyko.waitlist_entries (
  organization_id, location_id, athlete_id, class_template_id,
  contact_guardian_id, contactable, contact_consent_status,
  contact_consent_recorded_at, status, joined_at
)
select '30000000-0000-0000-0000-000000000001',
       '30000000-0000-0000-0000-000000000011',
       md5('metric-athlete-' || item)::uuid,
       '30000000-0000-0000-0000-000000000801',
       '30000000-0000-0000-0000-000000000501',
       true, 'granted', '2026-09-10 10:00:00+02', 'waiting', '2026-09-10 10:00:00+02'
from generate_series(2, 4) item;

insert into zaltyko.invoices (
  id, organization_id, location_id, family_id, family_payer_id, reference,
  status, currency, total_amount_cents, issued_at, due_at, idempotency_key
) values (
  '30000000-0000-0000-0000-000000000941', '30000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000011', '30000000-0000-0000-0000-000000000601',
  '30000000-0000-0000-0000-000000000631', 'METRIC-100-EUR', 'partially_paid',
  'EUR', 10000, '2026-09-01 09:00:00+02', '2026-09-20 00:00:00+02', 'metric-invoice'
);
insert into zaltyko.invoice_lines (
  id, organization_id, invoice_id, line_type, quantity, unit_amount_cents,
  amount_cents, currency, service_period_start, service_period_end
) values (
  '30000000-0000-0000-0000-000000000942', '30000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000941', 'membership', 1, 10000, 10000,
  'EUR', '2026-09-01', '2026-09-30'
);
insert into zaltyko.charges (
  id, organization_id, location_id, invoice_id, invoice_line_id, family_id,
  family_payer_id, status, amount_cents, currency, due_at, service_period_start,
  service_period_end, idempotency_key
) values (
  '30000000-0000-0000-0000-000000000943', '30000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000011', '30000000-0000-0000-0000-000000000941',
  '30000000-0000-0000-0000-000000000942', '30000000-0000-0000-0000-000000000601',
  '30000000-0000-0000-0000-000000000631', 'partially_paid', 10000, 'EUR',
  '2026-09-20 00:00:00+02', '2026-09-01', '2026-09-30', 'metric-charge'
);
insert into zaltyko.payments (
  id, organization_id, location_id, family_id, family_payer_id, status,
  amount_cents, currency, processor, environment, provider_payment_id,
  received_at, idempotency_key
) values (
  '30000000-0000-0000-0000-000000000944', '30000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000011', '30000000-0000-0000-0000-000000000601',
  '30000000-0000-0000-0000-000000000631', 'partially_refunded', 6000, 'EUR',
  'local', 'sandbox', 'metric-payment', '2026-09-21 00:00:00+02', 'metric-payment'
);
insert into zaltyko.payment_allocations (
  id, organization_id, payment_id, charge_id, amount_cents, currency,
  allocated_at, idempotency_key
) values (
  '30000000-0000-0000-0000-000000000945', '30000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000944', '30000000-0000-0000-0000-000000000943',
  6000, 'EUR', '2026-09-21 00:00:00+02', 'metric-allocation'
);
insert into zaltyko.refunds (
  organization_id, payment_id, payment_allocation_id, status, amount_cents,
  currency, processor, environment, provider_refund_id, reason_code,
  refunded_at, idempotency_key
) values (
  '30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000944',
  '30000000-0000-0000-0000-000000000945', 'succeeded', 1000, 'EUR', 'local',
  'sandbox', 'metric-refund', 'fixture', '2026-09-22 00:00:00+02', 'metric-refund'
);
