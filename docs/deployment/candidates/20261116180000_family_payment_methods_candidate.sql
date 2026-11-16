-- CANDIDATE ONLY. Requiere autorización de Elvis antes de cualquier aplicación
-- alojada (staging o producción). No aplicado en ningún entorno.
-- Cobro automático de cuotas, Fase 2: la persona pagadora de una familia guarda
-- una tarjeta o una domiciliación bancaria en la cuenta Stripe conectada de su
-- academia (docs/architecture/adr/0028-cobro-automatico-de-cuotas-con-connect.md).
-- Requiere antes la candidata de la Fase 1
-- (20261116120000_connect_onboarding_candidate.sql).
--
-- - Tabla nueva zaltyko.family_payment_setup_attempts: cada intento de guardar
--   un método de pago, con la referencia del Customer (cus_) y de la
--   preparación (seti_) en la cuenta conectada y la evidencia recortada del
--   consentimiento. Pasa a completed cuando se crea la autorización.
-- - Columna nueva family_payment_authorizations.payment_method_kind ('card' o
--   'sepa_debit'), obligatoria en una autorización activa; una domiciliación
--   activa exige además su mandate_reference.
--
-- La función va detrás de ZALTYKO_FAMILY_PAYMENT_METHODS_ENABLED (apagada por
-- defecto); mientras la tabla o la columna no existan responde «no disponible».
--
-- RGPD: solo referencias opacas de Stripe (cus_, seti_, pm_, mandate_) y
-- evidencia del consentimiento recortada: versión, fecha, tutor, IP recortada
-- (IPv4 /24, IPv6 /48), agente de navegador hasta 120 caracteres y SHA-256 del
-- texto aceptado. Nunca número de tarjeta, IBAN, marca, últimos dígitos,
-- nombre del titular ni correo: esos datos los recoge y guarda Stripe.
-- Solo service_role (RLS ENABLE y FORCE, sin grants a anon ni authenticated),
-- igual que family_payment_authorizations.
-- El archivo abre y cierra su propia transacción, con lock_timeout: si no
-- obtiene el bloqueo, no cambia nada. Reinstalar aborta antes de tocar nada:
-- una instalación parcial o divergente exige reconciliación humana, nunca
-- reparación.
begin;

set local lock_timeout = '5s';

do $family_payment_methods_candidate_preflight$
begin
  if to_regclass('zaltyko.family_payment_authorizations') is null
     or to_regclass('zaltyko.family_payers') is null
     or to_regclass('zaltyko.family_guardians') is null
     or to_regclass('zaltyko.organization_payment_provider_accounts') is null then
    raise exception 'Family payment methods candidate requires the canonical family_payment_authorizations, family_payers, family_guardians and organization_payment_provider_accounts tables';
  end if;
  if (
    select count(*)
      from pg_attribute
     where attrelid = 'zaltyko.organization_payment_provider_accounts'::regclass
       and attname in ('sepa_debit_payments_capability_status', 'requirements_state')
       and attnum > 0
       and not attisdropped
  ) <> 2 then
    raise exception 'Family payment methods candidate requires the Connect onboarding candidate (sepa_debit_payments_capability_status and requirements_state) installed first';
  end if;
  if to_regclass('zaltyko.family_payment_setup_attempts') is not null
     or exists (
       select 1
         from pg_attribute
        where attrelid = 'zaltyko.family_payment_authorizations'::regclass
          and attname = 'payment_method_kind'
          and attnum > 0
          and not attisdropped
     ) then
    raise exception 'Family payment methods candidate requires family_payment_setup_attempts and family_payment_authorizations.payment_method_kind absent; inspect existing schema before promotion';
  end if;
end;
$family_payment_methods_candidate_preflight$;

-- Tipo del método de una autorización. Las filas existentes (ninguna activa
-- mientras la función no exista) quedan con null.
alter table zaltyko.family_payment_authorizations
  add column payment_method_kind text
    constraint family_payment_authorizations_method_kind_check
      check (payment_method_kind is null or payment_method_kind in ('card', 'sepa_debit')),
  add constraint family_payment_authorizations_active_method_kind_required
    check (status <> 'active' or payment_method_kind is not null),
  add constraint family_payment_authorizations_active_sepa_mandate_required
    check (status <> 'active' or payment_method_kind <> 'sepa_debit' or mandate_reference is not null);

create table zaltyko.family_payment_setup_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references zaltyko.organizations(id) on delete cascade,
  family_id uuid not null,
  family_payer_id uuid not null,
  guardian_id uuid not null,
  payment_provider_account_id uuid not null,
  payment_method_kind text not null,
  provider_customer_reference text not null,
  provider_setup_reference text not null,
  consent_version text not null,
  consent_text_sha256 text not null,
  consented_at timestamptz not null,
  client_ip_prefix text,
  user_agent_excerpt text,
  status text not null default 'open',
  authorization_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint family_payment_setup_attempts_organization_id_id_uq
    unique (organization_id, id),
  constraint family_payment_setup_attempts_setup_uq
    unique (organization_id, payment_provider_account_id, provider_setup_reference),
  constraint family_payment_setup_attempts_method_kind_check
    check (payment_method_kind in ('card', 'sepa_debit')),
  constraint family_payment_setup_attempts_customer_reference_not_blank
    check (btrim(provider_customer_reference) <> ''),
  constraint family_payment_setup_attempts_setup_reference_not_blank
    check (btrim(provider_setup_reference) <> ''),
  constraint family_payment_setup_attempts_consent_version_not_blank
    check (btrim(consent_version) <> ''),
  constraint family_payment_setup_attempts_consent_digest_valid
    check (consent_text_sha256 ~ '^[a-f0-9]{64}$'),
  constraint family_payment_setup_attempts_client_ip_prefix_length
    check (client_ip_prefix is null or char_length(client_ip_prefix) <= 64),
  constraint family_payment_setup_attempts_user_agent_excerpt_length
    check (user_agent_excerpt is null or char_length(user_agent_excerpt) <= 120),
  constraint family_payment_setup_attempts_status_check
    check (status in ('open', 'completed', 'abandoned')),
  constraint family_payment_setup_attempts_completed_authorization_valid
    check ((status = 'completed') = (authorization_id is not null)),
  constraint family_payment_setup_attempts_payer_fk
    foreign key (organization_id, family_id, family_payer_id)
    references zaltyko.family_payers (organization_id, family_id, id) on delete restrict,
  constraint family_payment_setup_attempts_provider_account_fk
    foreign key (organization_id, payment_provider_account_id)
    references zaltyko.organization_payment_provider_accounts (organization_id, id) on delete restrict,
  constraint family_payment_setup_attempts_guardian_fk
    foreign key (organization_id, family_id, guardian_id)
    references zaltyko.family_guardians (organization_id, family_id, guardian_id) on delete restrict,
  constraint family_payment_setup_attempts_authorization_fk
    foreign key (organization_id, authorization_id)
    references zaltyko.family_payment_authorizations (organization_id, id) on delete restrict
);

-- Reutilizar el Customer de la persona pagadora en la misma cuenta conectada.
create index family_payment_setup_attempts_customer_idx
  on zaltyko.family_payment_setup_attempts
    (organization_id, payment_provider_account_id, family_payer_id, created_at desc);

alter table zaltyko.family_payment_setup_attempts enable row level security;
alter table zaltyko.family_payment_setup_attempts force row level security;

revoke all on table zaltyko.family_payment_setup_attempts
  from public, anon, authenticated, service_role;
grant select, insert, update on table zaltyko.family_payment_setup_attempts
  to service_role;

comment on table zaltyko.family_payment_authorizations is
  'Autorización de cobro automático de una persona pagadora sobre la cuenta Stripe conectada de su academia (Fase 2). Solo referencias opacas (seti_, pm_, mandate_) y evidencia del consentimiento; nunca datos de tarjeta, banco ni identidad. Solo servidor.';
comment on column zaltyko.family_payment_authorizations.payment_method_kind is
  'Tipo del método guardado: card o sepa_debit. Obligatorio en una autorización activa; una domiciliación activa exige mandate_reference.';
comment on table zaltyko.family_payment_setup_attempts is
  'Intentos de guardar una tarjeta o una domiciliación de una persona pagadora en la cuenta Stripe conectada de su academia. Solo referencias opacas (cus_, seti_) y evidencia recortada del consentimiento (versión, fecha, tutor, IP /24 o /48, agente hasta 120 caracteres, SHA-256 del texto); nunca datos de tarjeta ni de banco. Solo servidor.';

commit;
