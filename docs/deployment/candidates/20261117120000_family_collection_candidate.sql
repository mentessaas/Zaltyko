-- CANDIDATE ONLY. Requiere autorización de Elvis antes de cualquier aplicación
-- alojada (staging o producción). No aplicado en ningún entorno.
-- Cobro automático de cuotas, Fase 3: cobrar cada día las cuotas mensuales con
-- la tarjeta o la domiciliación que la familia guardó en la Fase 2, en la
-- cuenta Stripe conectada de su academia
-- (docs/architecture/adr/0028-cobro-automatico-de-cuotas-con-connect.md).
-- Requiere antes las candidatas de la Fase 1
-- (20261116120000_connect_onboarding_candidate.sql) y de la Fase 2
-- (20261116180000_family_payment_methods_candidate.sql).
--
-- - Tabla nueva zaltyko.family_collection_attempts: cada intento de cobrar una
--   factura mensual (una por familia, sede y mes). Avanza por pasos cortos:
--   claimed (reclamado, todavía sin cobro en Stripe) → created (cobro creado,
--   con su pi_) → processing | succeeded | failed | canceled. Un solo intento
--   no terminal por factura (índice único parcial), como mucho cinco por
--   factura y tres reanudaciones por intento. Un intento canceled sin pi_ es la
--   puerta que se cerró en la fecha de cobro: failure_code guarda su motivo y
--   la cuota vuelve a manual. Un succeeded enlaza el pago registrado en el
--   libro y el estado del reparto entre cuotas.
-- - Tabla nueva zaltyko.family_collection_attempt_charges: qué parte del
--   intento corresponde a cada cuota.
-- - Tabla nueva zaltyko.organization_collection_settings: día de cobro de la
--   academia. Sin fila, o con null, se cobra el día de vencimiento; con un día
--   del 1 al 31, ese día del mes (el ajuste al último día de los meses más
--   cortos lo hace el dominio, no la base).
--
-- No se reutiliza zaltyko.payment_attempts: exige provider_attempt_id antes de
-- llamar a Stripe (aquí el intento se reclama antes de crear el cobro, para no
-- cobrar dos veces), no enlaza las cuotas que cubre y usa el entorno
-- sandbox|live del libro en vez del test|live de la cuenta conectada.
--
-- La función va detrás de ZALTYKO_FAMILY_AUTOMATIC_COLLECTION_ENABLED (apagada
-- por defecto); mientras estas tablas no existan responde «no disponible».
--
-- RGPD: solo referencias opacas de Stripe (pi_) y códigos de Stripe
-- (failure_code, decline_code: minúsculas, dígitos y guion bajo, hasta 64).
-- Nunca mensajes de Stripe, número de tarjeta, IBAN, nombre ni correo.
-- Solo service_role (RLS ENABLE y FORCE, sin grants a anon ni authenticated),
-- igual que family_payment_authorizations.
-- El archivo abre y cierra su propia transacción, con lock_timeout: si no
-- obtiene el bloqueo, no cambia nada. Reinstalar aborta antes de tocar nada:
-- una instalación parcial o divergente exige reconciliación humana, nunca
-- reparación.
begin;

set local lock_timeout = '5s';

do $family_collection_candidate_preflight$
begin
  -- on delete set null (columna) necesita PostgreSQL 15 o posterior.
  if current_setting('server_version_num')::integer < 150000 then
    raise exception 'Family collection candidate requires PostgreSQL 15 or later';
  end if;
  if to_regclass('zaltyko.organizations') is null
     or to_regclass('zaltyko.locations') is null
     or to_regclass('zaltyko.organization_members') is null
     or to_regclass('zaltyko.families') is null
     or to_regclass('zaltyko.family_payers') is null
     or to_regclass('zaltyko.invoices') is null
     or to_regclass('zaltyko.charges') is null
     or to_regclass('zaltyko.payments') is null
     or to_regclass('zaltyko.family_payment_authorizations') is null
     or to_regclass('zaltyko.organization_payment_provider_accounts') is null then
    raise exception 'Family collection candidate requires the canonical organizations, locations, organization_members, families, family_payers, invoices, charges, payments, family_payment_authorizations and organization_payment_provider_accounts tables';
  end if;
  if (
    select count(*)
      from pg_attribute
     where attrelid = 'zaltyko.organization_payment_provider_accounts'::regclass
       and attname in ('sepa_debit_payments_capability_status', 'requirements_state')
       and attnum > 0
       and not attisdropped
  ) <> 2 then
    raise exception 'Family collection candidate requires the Connect onboarding candidate (sepa_debit_payments_capability_status and requirements_state) installed first';
  end if;
  if to_regclass('zaltyko.family_payment_setup_attempts') is null
     or not exists (
       select 1
         from pg_attribute
        where attrelid = 'zaltyko.family_payment_authorizations'::regclass
          and attname = 'payment_method_kind'
          and attnum > 0
          and not attisdropped
     ) then
    raise exception 'Family collection candidate requires the family payment methods candidate (family_payment_setup_attempts and family_payment_authorizations.payment_method_kind) installed first';
  end if;
  if to_regclass('zaltyko.family_collection_attempts') is not null
     or to_regclass('zaltyko.family_collection_attempt_charges') is not null
     or to_regclass('zaltyko.organization_collection_settings') is not null then
    raise exception 'Family collection candidate requires family_collection_attempts, family_collection_attempt_charges and organization_collection_settings absent; inspect existing schema before promotion';
  end if;
end;
$family_collection_candidate_preflight$;

-- payer, autorización, cuenta y tipo pueden faltar solo en un intento canceled:
-- la puerta lo escribe también cuando ya no hay pagador, autorización o cuenta
-- (ninguna cuota se queda sin intento terminal ni recordatorios). Por lo mismo,
-- un canceled sin cobro en Stripe puede llevar una moneda distinta de EUR: la
-- de su factura (clave foránea), para que la puerta cierre también esa factura;
-- cualquier otro intento es en EUR.
create table zaltyko.family_collection_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  location_id uuid not null,
  invoice_id uuid not null,
  family_id uuid not null,
  family_payer_id uuid,
  authorization_id uuid,
  payment_provider_account_id uuid,
  attempt_number integer not null,
  payment_method_kind text,
  amount_cents bigint not null,
  currency text not null,
  status text not null,
  provider_payment_intent_reference text,
  failure_code text,
  decline_code text,
  next_retry_at timestamptz,
  resume_count integer not null default 0,
  payment_id uuid,
  allocation_status text,
  claimed_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint family_collection_attempts_organization_id_id_uq unique (organization_id, id),
  constraint family_collection_attempts_number_uq unique (organization_id, invoice_id, attempt_number),
  constraint family_collection_attempts_intent_uq unique (organization_id, provider_payment_intent_reference),
  constraint family_collection_attempts_payment_uq unique (organization_id, payment_id),
  constraint family_collection_attempts_attempt_number_check check (attempt_number between 1 and 5),
  constraint family_collection_attempts_method_kind_check check (payment_method_kind is null or payment_method_kind in ('card', 'sepa_debit')),
  constraint family_collection_attempts_amount_check check (amount_cents > 0),
  constraint family_collection_attempts_currency_check check (currency = 'EUR' or (status = 'canceled' and provider_payment_intent_reference is null)),
  constraint family_collection_attempts_status_check check (status in ('claimed', 'created', 'processing', 'succeeded', 'failed', 'canceled')),
  constraint family_collection_attempts_allocation_status_check check (allocation_status is null or allocation_status in ('pending', 'allocated', 'needs_review')),
  constraint family_collection_attempts_resume_count_check check (resume_count between 0 and 3),
  constraint family_collection_attempts_intent_reference_format check (provider_payment_intent_reference is null or (char_length(provider_payment_intent_reference) <= 255 and provider_payment_intent_reference ~ '^pi_[A-Za-z0-9_]+$')),
  constraint family_collection_attempts_intent_reference_by_status check ((status not in ('created', 'processing', 'succeeded') or provider_payment_intent_reference is not null) and (status <> 'claimed' or provider_payment_intent_reference is null)),
  constraint family_collection_attempts_failure_code_format check (failure_code is null or failure_code ~ '^[a-z0-9_]{1,64}$'),
  constraint family_collection_attempts_decline_code_format check (decline_code is null or decline_code ~ '^[a-z0-9_]{1,64}$'),
  constraint family_collection_attempts_codes_only_when_unsuccessful check (status in ('failed', 'canceled') or (failure_code is null and decline_code is null)),
  constraint family_collection_attempts_reason_required check (provider_payment_intent_reference is not null or status not in ('failed', 'canceled') or failure_code is not null),
  constraint family_collection_attempts_next_retry_only_failed check (next_retry_at is null or status = 'failed'),
  constraint family_collection_attempts_payment_iff_succeeded check ((status = 'succeeded') = (payment_id is not null)),
  constraint family_collection_attempts_allocation_iff_succeeded check ((status = 'succeeded') = (allocation_status is not null)),
  constraint family_collection_attempts_completed_iff_terminal check ((status in ('succeeded', 'failed', 'canceled')) = (completed_at is not null)),
  constraint family_collection_attempts_references_required check (status = 'canceled' or (family_payer_id is not null and authorization_id is not null and payment_provider_account_id is not null and payment_method_kind is not null)),
  constraint family_collection_attempts_location_fk
    foreign key (organization_id, location_id)
    references zaltyko.locations (organization_id, id) on delete restrict,
  constraint family_collection_attempts_invoice_fk
    foreign key (organization_id, location_id, invoice_id)
    references zaltyko.invoices (organization_id, location_id, id) on delete restrict,
  constraint family_collection_attempts_invoice_currency_fk
    foreign key (organization_id, invoice_id, currency)
    references zaltyko.invoices (organization_id, id, currency) on delete restrict,
  constraint family_collection_attempts_family_fk
    foreign key (organization_id, family_id)
    references zaltyko.families (organization_id, id) on delete restrict,
  constraint family_collection_attempts_payer_fk
    foreign key (organization_id, family_id, family_payer_id)
    references zaltyko.family_payers (organization_id, family_id, id) on delete restrict,
  constraint family_collection_attempts_authorization_fk
    foreign key (organization_id, authorization_id)
    references zaltyko.family_payment_authorizations (organization_id, id) on delete restrict,
  constraint family_collection_attempts_provider_account_fk
    foreign key (organization_id, payment_provider_account_id)
    references zaltyko.organization_payment_provider_accounts (organization_id, id) on delete restrict,
  constraint family_collection_attempts_payment_fk
    foreign key (organization_id, payment_id, currency)
    references zaltyko.payments (organization_id, id, currency) on delete restrict
);

-- Nunca dos cobros a la vez de la misma factura: un solo intento no terminal.
create unique index family_collection_attempts_open_uq
  on zaltyko.family_collection_attempts (organization_id, invoice_id)
  where status in ('claimed', 'created', 'processing');
-- Reintentos pendientes de una academia.
create index family_collection_attempts_retry_idx
  on zaltyko.family_collection_attempts (organization_id, status, next_retry_at);
-- Reanudar lo que quedó a medias (claimed o created sin cambios desde hace más de 15 minutos).
create index family_collection_attempts_resume_idx
  on zaltyko.family_collection_attempts (status, updated_at);

create table zaltyko.family_collection_attempt_charges (
  attempt_id uuid not null,
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  charge_id uuid not null,
  amount_cents bigint not null,
  constraint family_collection_attempt_charges_pkey primary key (attempt_id, charge_id),
  constraint family_collection_attempt_charges_amount_check check (amount_cents > 0),
  constraint family_collection_attempt_charges_attempt_fk
    foreign key (organization_id, attempt_id)
    references zaltyko.family_collection_attempts (organization_id, id) on delete cascade,
  constraint family_collection_attempt_charges_charge_fk
    foreign key (organization_id, charge_id)
    references zaltyko.charges (organization_id, id) on delete restrict
);

-- «¿Tiene esta cuota un cobro automático en curso?» (pago manual y cancelar).
create index family_collection_attempt_charges_charge_idx
  on zaltyko.family_collection_attempt_charges (organization_id, charge_id);

create table zaltyko.organization_collection_settings (
  organization_id uuid primary key references zaltyko.organizations(id) on delete cascade,
  collection_day_of_month smallint,
  version integer not null default 1,
  updated_by_member_id uuid,
  updated_at timestamptz not null default now(),
  constraint organization_collection_settings_day_check check (collection_day_of_month is null or collection_day_of_month between 1 and 31),
  constraint organization_collection_settings_version_check check (version > 0),
  constraint organization_collection_settings_member_fk
    foreign key (organization_id, updated_by_member_id)
    references zaltyko.organization_members (organization_id, id) on delete set null (updated_by_member_id)
);

-- Borrar a un miembro pone a null quién cambió el ajuste.
create index organization_collection_settings_member_idx
  on zaltyko.organization_collection_settings (organization_id, updated_by_member_id);

alter table zaltyko.family_collection_attempts enable row level security;
alter table zaltyko.family_collection_attempts force row level security;
alter table zaltyko.family_collection_attempt_charges enable row level security;
alter table zaltyko.family_collection_attempt_charges force row level security;
alter table zaltyko.organization_collection_settings enable row level security;
alter table zaltyko.organization_collection_settings force row level security;

revoke all on table zaltyko.family_collection_attempts
  from public, anon, authenticated, service_role;
revoke all on table zaltyko.family_collection_attempt_charges
  from public, anon, authenticated, service_role;
revoke all on table zaltyko.organization_collection_settings
  from public, anon, authenticated, service_role;
grant select, insert, update on table zaltyko.family_collection_attempts
  to service_role;
grant select, insert, update on table zaltyko.family_collection_attempt_charges
  to service_role;
grant select, insert, update on table zaltyko.organization_collection_settings
  to service_role;

comment on table zaltyko.family_collection_attempts is
  'Intentos de cobrar una factura mensual con el método guardado por la familia en la cuenta Stripe conectada de su academia (Fase 3). Solo la referencia opaca del cobro (pi_) y códigos de Stripe; nunca mensajes, datos de tarjeta, banco ni identidad. Solo servidor.';
comment on table zaltyko.family_collection_attempt_charges is
  'Reparto de un intento de cobro automático entre las cuotas de su factura. Solo servidor.';
comment on table zaltyko.organization_collection_settings is
  'Día de cobro automático de la academia: null o sin fila, el día de vencimiento; si no, un día del 1 al 31 (el último día del mes cuando no existe). Solo servidor.';

commit;
