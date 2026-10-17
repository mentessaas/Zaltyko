do $$
declare
  protected_tables integer;
begin
  select count(*)::integer
  into protected_tables
  from pg_class relation
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'zaltyko'
    and relation.relname = any (array[
      'enrollment_price_assignments', 'invoices', 'invoice_lines', 'charges',
      'payments', 'payment_attempts', 'payment_allocations', 'refunds',
      'payment_provider_events', 'financial_reconciliation_runs'
    ])
    and relation.relrowsecurity
    and relation.relforcerowsecurity;

  if protected_tables <> 10 then
    raise exception 'Expected 10 ledger tables with forced RLS, found %', protected_tables;
  end if;

  if has_table_privilege('authenticated', 'zaltyko.invoices', 'SELECT')
    or has_table_privilege('authenticated', 'zaltyko.payment_provider_events', 'SELECT')
    or has_table_privilege('anon', 'zaltyko.payments', 'SELECT') then
    raise exception 'Financial tables must remain unavailable through Data API grants';
  end if;

  if not has_table_privilege('service_role', 'zaltyko.invoices', 'SELECT,INSERT,UPDATE,DELETE')
    or not has_table_privilege('service_role', 'zaltyko.payment_provider_events', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'service_role lacks required ledger privileges';
  end if;
end
$$;

insert into zaltyko.invoices (
  id, organization_id, location_id, family_id, family_payer_id,
  reference, status, currency, total_amount_cents, issued_at, due_at,
  idempotency_key
) values (
  '10000000-0000-0000-0000-000000000701',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000011',
  '10000000-0000-0000-0000-000000000601',
  '10000000-0000-0000-0000-000000000631',
  'SYNTH-2026-0001', 'issued', 'EUR', 10000, now(), now() + interval '7 days',
  'ledger-foundation-invoice'
);

insert into zaltyko.invoice_lines (
  id, organization_id, invoice_id, line_type, quantity, unit_amount_cents,
  amount_cents, currency, service_period_start, service_period_end
) values (
  '10000000-0000-0000-0000-000000000711',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000701',
  'membership', 1, 10000, 10000, 'EUR', current_date, current_date
);

insert into zaltyko.charges (
  id, organization_id, location_id, invoice_id, invoice_line_id, family_id,
  family_payer_id, status, amount_cents, currency, due_at,
  service_period_start, service_period_end, idempotency_key
) values (
  '10000000-0000-0000-0000-000000000721',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000011',
  '10000000-0000-0000-0000-000000000701',
  '10000000-0000-0000-0000-000000000711',
  '10000000-0000-0000-0000-000000000601',
  '10000000-0000-0000-0000-000000000631',
  'due', 10000, 'EUR', now() + interval '7 days', current_date, current_date,
  'ledger-foundation-charge'
);

insert into zaltyko.payments (
  id, organization_id, location_id, family_id, family_payer_id, status,
  amount_cents, currency, processor, environment, provider_payment_id,
  received_at, idempotency_key
) values (
  '10000000-0000-0000-0000-000000000731',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000011',
  '10000000-0000-0000-0000-000000000601',
  '10000000-0000-0000-0000-000000000631',
  'succeeded', 6000, 'EUR', 'local', 'sandbox', 'pay_synthetic_001', now(),
  'ledger-foundation-payment'
);

do $$
begin
  begin
    insert into zaltyko.payment_allocations (
      organization_id, payment_id, charge_id, amount_cents, currency,
      allocated_at, idempotency_key
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000731',
      '10000000-0000-0000-0000-000000000721',
      100, 'USD', now(), 'ledger-cross-currency'
    );
    raise exception 'Cross-currency allocation was accepted';
  exception
    when foreign_key_violation then null;
  end;
end
$$;

do $$
begin
  begin
    insert into zaltyko.invoices (
      organization_id, family_id, reference, currency, total_amount_cents,
      due_at, idempotency_key
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000601',
      'SYNTH-CROSS-TENANT', 'EUR', 100, now(), 'ledger-cross-tenant'
    );
    raise exception 'Cross-tenant invoice was accepted';
  exception
    when foreign_key_violation then null;
  end;
end
$$;

insert into zaltyko.payment_provider_events (
  organization_id, processor, environment, provider_event_id, event_type,
  payload_sha256, payload, signature_verified
) values (
  '10000000-0000-0000-0000-000000000001', 'local', 'sandbox',
  'evt_synthetic_001', 'payment.succeeded', repeat('a', 64), '{}'::jsonb, true
);

do $$
begin
  begin
    insert into zaltyko.payment_provider_events (
      organization_id, processor, environment, provider_event_id, event_type,
      payload_sha256, payload, signature_verified
    ) values (
      '10000000-0000-0000-0000-000000000001', 'local', 'sandbox',
      'evt_synthetic_001', 'payment.succeeded', repeat('a', 64), '{}'::jsonb, true
    );
    raise exception 'Duplicate provider event was accepted';
  exception
    when unique_violation then null;
  end;
end
$$;
