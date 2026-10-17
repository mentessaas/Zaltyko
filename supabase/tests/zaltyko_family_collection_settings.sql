do $$
declare
  expected_tables text[] := array[
    'organization_saas_subscriptions',
    'organization_entitlements',
    'organization_entitlement_changes',
    'family_collection_preferences',
    'organization_payment_provider_accounts',
    'family_payment_authorizations'
  ];
  protected_tables integer;
  target_table text;
begin
  select count(*)::integer into protected_tables
  from pg_class relation
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'zaltyko'
    and relation.relname = any (expected_tables)
    and relation.relrowsecurity and relation.relforcerowsecurity;

  if protected_tables <> cardinality(expected_tables) then
    raise exception 'Expected all entitlement/preference tables to force RLS';
  end if;

  foreach target_table in array expected_tables loop
    if has_table_privilege('anon', format('zaltyko.%I', target_table), 'SELECT')
      or has_table_privilege('authenticated', format('zaltyko.%I', target_table), 'SELECT')
      or has_table_privilege('authenticated', format('zaltyko.%I', target_table), 'INSERT,UPDATE,DELETE') then
      raise exception 'Data API must not access server-owned table %', target_table;
    end if;
  end loop;

  if not has_table_privilege('service_role', 'zaltyko.organization_saas_subscriptions', 'SELECT,INSERT,UPDATE')
    or has_table_privilege('service_role', 'zaltyko.organization_saas_subscriptions', 'DELETE')
    or not has_table_privilege('service_role', 'zaltyko.organization_entitlement_changes', 'SELECT,INSERT')
    or has_table_privilege('service_role', 'zaltyko.organization_entitlement_changes', 'UPDATE,DELETE')
    or not has_table_privilege('service_role', 'zaltyko.family_collection_preferences', 'SELECT,INSERT,UPDATE')
    or has_table_privilege('service_role', 'zaltyko.family_collection_preferences', 'DELETE')
    or not has_table_privilege('service_role', 'zaltyko.family_payment_authorizations', 'SELECT,INSERT,UPDATE')
    or has_table_privilege('service_role', 'zaltyko.family_payment_authorizations', 'DELETE')
    or not has_table_privilege('service_role', 'zaltyko.organization_payment_provider_accounts', 'SELECT,INSERT,UPDATE')
    or has_table_privilege('service_role', 'zaltyko.organization_payment_provider_accounts', 'DELETE') then
    raise exception 'Expected least-privilege server grants and append-only history';
  end if;
end
$$;

insert into zaltyko.organization_payment_provider_accounts (
  id, organization_id, provider_account_reference, environment, status,
  card_payments_capability_status
) values
  ('10000000-0000-0000-0000-000000000801',
   '10000000-0000-0000-0000-000000000001',
   'acct_synthetictest', 'test', 'active', 'active'),
  ('10000000-0000-0000-0000-000000000802',
   '10000000-0000-0000-0000-000000000001',
   'acct_syntheticlive', 'live', 'pending', 'pending'),
  ('20000000-0000-0000-0000-000000000801',
   '20000000-0000-0000-0000-000000000001',
   'acct_syntheticothertenant', 'test', 'active', 'active');

insert into zaltyko.family_payment_authorizations (
  organization_id, family_id, family_payer_id, payment_provider_account_id,
  status, provider_setup_reference, payment_method_reference, consent_version,
  consent_evidence_reference, consent_evidence_sha256, consented_at,
  consented_by_guardian_id
) values (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000601',
  '10000000-0000-0000-0000-000000000631',
  '10000000-0000-0000-0000-000000000801',
  'active', 'seti_synthetic_001', 'pm_synthetic_001',
  'synthetic-v1', 'synthetic://consent/record-001', repeat('a', 64), now(),
  '10000000-0000-0000-0000-000000000501'
);

do $$
begin
  begin
    insert into zaltyko.family_payment_authorizations (
      organization_id, family_id, family_payer_id,
      payment_provider_account_id, status, provider_setup_reference,
      payment_method_reference
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000601',
      '10000000-0000-0000-0000-000000000631',
      '10000000-0000-0000-0000-000000000801',
      'pending', 'seti_synthetic_001', 'pm_duplicate_setup'
    );
    raise exception 'SetupIntent reference was accepted more than once';
  exception when unique_violation then null;
  end;
end
$$;

do $$
begin
  begin
    insert into zaltyko.family_payment_authorizations (
      organization_id, family_id, family_payer_id,
      payment_provider_account_id, provider_setup_reference,
      payment_method_reference
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000601',
      '10000000-0000-0000-0000-000000000631',
      '20000000-0000-0000-0000-000000000801',
      'seti_cross_tenant', 'pm_cross_tenant'
    );
    raise exception 'Cross-tenant payment account authorization was accepted';
  exception when foreign_key_violation then null;
  end;
end
$$;

do $$
declare
  plan zaltyko.saas_plan_code;
  revision integer;
  history_count integer;
begin
  select entitlement.plan_code, entitlement.revision into plan, revision
  from zaltyko.organization_entitlements entitlement
  where entitlement.organization_id = '10000000-0000-0000-0000-000000000001';
  if plan is distinct from 'free' or revision is distinct from 1 then
    raise exception 'New synthetic organization must receive Free entitlement revision 1';
  end if;

  select count(*)::integer into history_count
  from zaltyko.organization_entitlement_changes history
  where history.organization_id = '10000000-0000-0000-0000-000000000001'
    and history.revision = 1 and history.plan_code = 'free'
    and history.source = 'bootstrap';
  if history_count <> 1 then
    raise exception 'Free entitlement bootstrap must append one immutable history row';
  end if;

  update zaltyko.organization_entitlements
  set plan_code = 'growth', source = 'contract',
      source_reference = 'synthetic-contract-001', subscription_id = null,
      effective_from = now(), effective_until = now() + interval '30 days'
  where organization_id = '10000000-0000-0000-0000-000000000001';

  select entitlement.revision into revision
  from zaltyko.organization_entitlements entitlement
  where entitlement.organization_id = '10000000-0000-0000-0000-000000000001';
  if revision is distinct from 2 then
    raise exception 'Entitlement business changes must advance revision';
  end if;

  select count(*)::integer into history_count
  from zaltyko.organization_entitlement_changes history
  where history.organization_id = '10000000-0000-0000-0000-000000000001'
    and history.revision = 2 and history.plan_code = 'growth'
    and history.source = 'contract';
  if history_count <> 1 then
    raise exception 'Entitlement change must append one snapshot';
  end if;

  begin
    update zaltyko.organization_entitlement_changes history
    set plan_code = 'starter'
    where history.organization_id = '10000000-0000-0000-0000-000000000001'
      and history.revision = 1;
    raise exception 'Entitlement history must reject updates';
  exception when sqlstate '55000' then null;
  end;
end
$$;

do $$
declare
  mode zaltyko.family_collection_mode;
  history_count integer;
begin
  select collection_mode into mode
  from zaltyko.charges
  where id = '10000000-0000-0000-0000-000000000721';
  if mode <> 'manual' then
    raise exception 'Existing and newly inserted charges must default to manual';
  end if;

  select count(*)::integer into history_count
  from zaltyko.organization_entitlement_changes history
  where history.organization_id = '10000000-0000-0000-0000-000000000001';
  if history_count <> 2 then
    raise exception 'Expected exactly two entitlement revisions for synthetic org';
  end if;
end
$$;
