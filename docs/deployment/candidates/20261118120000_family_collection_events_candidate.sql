-- CANDIDATE ONLY. Requiere autorización de Elvis antes de cualquier aplicación
-- alojada (staging o producción). No aplicado en ningún entorno.
-- Cobro automático de cuotas, Fase 4: lo que pasa en Stripe con los cobros
-- automáticos llega a Zaltyko por eventos de las cuentas conectadas; la
-- familia puede confirmar el pago con su banco; las disputas quedan anotadas
-- (docs/architecture/adr/0028-cobro-automatico-de-cuotas-con-connect.md).
-- Requiere antes la candidata de la Fase 3
-- (20261117120000_family_collection_candidate.sql), tal cual la instala esa
-- candidata, y las tablas del libro zaltyko.payments,
-- zaltyko.payment_provider_events y zaltyko.refunds (historial aplicado).
--
-- - zaltyko.family_collection_attempts: estado nuevo requires_action (el banco
--   pide a la familia que confirme el pago). Exige su pi_, tarjeta como método
--   y un plazo en la columna nueva action_deadline_at: ningún intento se queda
--   esperando sin fecha, el proceso diario lo cierra al vencer. Cuenta como
--   intento abierto: el índice único parcial que impide dos intentos no
--   terminales de la misma factura se rehace con requires_action.
-- - Tabla nueva zaltyko.family_collection_disputes: una fila por disputa de un
--   cobro automático (dp_… o du_…, única por academia), con su intento, su
--   pago registrado, el cargo de Stripe (ch_… o py_…), el importe en EUR, el
--   estado de Stripe, el código del motivo, el plazo para responder, si el
--   banco retiró el dinero, cuándo se escribieron las filas de devolución
--   (reversed_at), cuándo se abrió y cuándo se cerró (solo en estados
--   cerrados) y el último evento que la tocó.
-- - Sin tabla de eventos ni de devoluciones nuevas: los eventos se guardan una
--   vez por id en zaltyko.payment_provider_events y las devoluciones y las
--   disputas perdidas son filas de zaltyko.refunds, ya en el historial.
--
-- La función va detrás de ZALTYKO_FAMILY_COLLECTION_EVENTS_ENABLED (apagada
-- por defecto); mientras esta forma no exista, el código sigue con la de la
-- Fase 3 y no lee action_deadline_at ni las disputas.
--
-- RGPD: solo referencias opacas de Stripe (pi_, ch_, py_, dp_, du_) y códigos
-- de Stripe (reason_code: minúsculas, dígitos y guion bajo, hasta 64). Nunca
-- mensajes de Stripe, pruebas de la disputa, número de tarjeta, IBAN, nombre ni
-- correo. Solo service_role (RLS ENABLE y FORCE, sin grants a anon ni
-- authenticated), igual que family_collection_attempts.
-- El archivo abre y cierra su propia transacción, con lock_timeout: si no
-- obtiene el bloqueo, no cambia nada. Reinstalar aborta antes de tocar nada:
-- una instalación parcial o divergente exige reconciliación humana, nunca
-- reparación. La vuelta atrás va comentada al final y no se ejecuta con este
-- archivo.
begin;

set local lock_timeout = '5s';

do $family_collection_events_candidate_preflight$
begin
  -- on delete set null (columna) necesita PostgreSQL 15 o posterior.
  if current_setting('server_version_num')::integer < 150000 then
    raise exception 'Family collection events candidate requires PostgreSQL 15 or later';
  end if;
  if to_regclass('zaltyko.organizations') is null
     or to_regclass('zaltyko.payments') is null
     or to_regclass('zaltyko.payment_provider_events') is null
     or to_regclass('zaltyko.refunds') is null then
    raise exception 'Family collection events candidate requires the canonical organizations, payments, payment_provider_events and refunds tables';
  end if;
  if to_regclass('zaltyko.family_collection_disputes') is not null
     or exists (
       select 1
         from pg_attribute
        where attrelid = to_regclass('zaltyko.family_collection_attempts')
          and attname = 'action_deadline_at'
          and attnum > 0
          and not attisdropped
     )
     or exists (
       select 1
         from pg_constraint
        where conrelid = to_regclass('zaltyko.family_collection_attempts')
          and conname = 'family_collection_attempts_action_deadline_check'
     ) then
    raise exception 'Family collection events candidate requires family_collection_disputes, family_collection_attempts.action_deadline_at and family_collection_attempts_action_deadline_check absent; inspect existing schema before promotion';
  end if;
  -- La Fase 3 tal cual: sus tres tablas, las columnas exactas de los intentos,
  -- sus dos checks de estado sin requires_action y el índice de un intento
  -- abierto con su predicado de la Fase 3.
  if to_regclass('zaltyko.family_collection_attempts') is null
     or to_regclass('zaltyko.family_collection_attempt_charges') is null
     or to_regclass('zaltyko.organization_collection_settings') is null
     or coalesce((
       select array_agg(column_name::text || '|' || data_type::text || '|' || is_nullable::text order by column_name::text collate "C")
         from information_schema.columns
        where table_schema = 'zaltyko'
          and table_name = 'family_collection_attempts'
     ) <> array[
       'allocation_status|text|YES',
       'amount_cents|bigint|NO',
       'attempt_number|integer|NO',
       'authorization_id|uuid|YES',
       'claimed_at|timestamp with time zone|NO',
       'completed_at|timestamp with time zone|YES',
       'created_at|timestamp with time zone|NO',
       'currency|text|NO',
       'decline_code|text|YES',
       'failure_code|text|YES',
       'family_id|uuid|NO',
       'family_payer_id|uuid|YES',
       'id|uuid|NO',
       'invoice_id|uuid|NO',
       'location_id|uuid|NO',
       'next_retry_at|timestamp with time zone|YES',
       'organization_id|uuid|NO',
       'payment_id|uuid|YES',
       'payment_method_kind|text|YES',
       'payment_provider_account_id|uuid|YES',
       'provider_payment_intent_reference|text|YES',
       'resume_count|integer|NO',
       'status|text|NO',
       'updated_at|timestamp with time zone|NO'
     ]::text[], true)
     or (
       select count(*)
         from pg_constraint
        where conrelid = to_regclass('zaltyko.family_collection_attempts')
          and conname in ('family_collection_attempts_status_check', 'family_collection_attempts_intent_reference_by_status')
          and contype = 'c'
          and position('requires_action' in pg_get_constraintdef(oid)) = 0
     ) <> 2
     or not exists (
       select 1
         from pg_index i
        where i.indexrelid = to_regclass('zaltyko.family_collection_attempts_open_uq')
          and i.indrelid = to_regclass('zaltyko.family_collection_attempts')
          and i.indisunique
          and i.indisvalid
          and pg_get_expr(i.indpred, i.indrelid) in (
            'status = ANY (ARRAY[''claimed''::text, ''created''::text, ''processing''::text])',
            '(status = ANY (ARRAY[''claimed''::text, ''created''::text, ''processing''::text]))'
          )
     ) then
    raise exception 'Family collection events candidate requires the family collection candidate (20261117120000) installed first, with its exact shape';
  end if;
end;
$family_collection_events_candidate_preflight$;

-- requires_action: la familia tiene que confirmar el pago con su banco. Solo
-- tarjeta (la domiciliación no pide confirmación), siempre con su pi_ y con
-- plazo. Los checks nuevos validan las filas que ya hay: ninguna está en
-- requires_action, porque el estado no existía.
alter table zaltyko.family_collection_attempts
  add column action_deadline_at timestamptz,
  drop constraint family_collection_attempts_status_check,
  add constraint family_collection_attempts_status_check check (status in ('claimed', 'created', 'processing', 'requires_action', 'succeeded', 'failed', 'canceled')),
  drop constraint family_collection_attempts_intent_reference_by_status,
  add constraint family_collection_attempts_intent_reference_by_status check ((status not in ('created', 'processing', 'requires_action', 'succeeded') or provider_payment_intent_reference is not null) and (status <> 'claimed' or provider_payment_intent_reference is null)),
  add constraint family_collection_attempts_action_deadline_check check (status <> 'requires_action' or (action_deadline_at is not null and payment_method_kind = 'card'));

-- Nunca dos cobros a la vez de la misma factura: un solo intento no terminal,
-- ahora contando también el que espera la confirmación del banco.
drop index zaltyko.family_collection_attempts_open_uq;
create unique index family_collection_attempts_open_uq
  on zaltyko.family_collection_attempts (organization_id, invoice_id)
  where status in ('claimed', 'created', 'processing', 'requires_action');

-- Disputas de un cobro automático. El intento y el pago en restrict (nunca se
-- borra un pago ni su rastro); el último evento en set null solo de su
-- columna (la academia sigue igual); la academia borra en cascada.
create table zaltyko.family_collection_disputes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  attempt_id uuid not null,
  payment_id uuid not null,
  provider_dispute_reference text not null,
  provider_charge_reference text not null,
  amount_cents bigint not null,
  currency text not null,
  status text not null,
  reason_code text,
  evidence_due_at timestamptz,
  funds_withdrawn boolean not null default false,
  reversed_at timestamptz,
  opened_at timestamptz not null,
  closed_at timestamptz,
  last_provider_event_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint family_collection_disputes_reference_uq unique (organization_id, provider_dispute_reference),
  constraint family_collection_disputes_reference_format check (char_length(provider_dispute_reference) <= 255 and provider_dispute_reference ~ '^(dp|du)_[A-Za-z0-9_]+$'),
  constraint family_collection_disputes_charge_reference_format check (char_length(provider_charge_reference) <= 255 and provider_charge_reference ~ '^(ch|py)_[A-Za-z0-9_]+$'),
  constraint family_collection_disputes_amount_check check (amount_cents > 0),
  constraint family_collection_disputes_currency_check check (currency = 'EUR'),
  constraint family_collection_disputes_status_check check (status in ('warning_needs_response', 'warning_under_review', 'warning_closed', 'needs_response', 'under_review', 'won', 'lost', 'prevented')),
  constraint family_collection_disputes_reason_code_format check (reason_code is null or reason_code ~ '^[a-z0-9_]{1,64}$'),
  constraint family_collection_disputes_closed_iff_final check ((status in ('won', 'lost', 'warning_closed', 'prevented')) = (closed_at is not null)),
  constraint family_collection_disputes_attempt_fk
    foreign key (organization_id, attempt_id)
    references zaltyko.family_collection_attempts (organization_id, id) on delete restrict,
  constraint family_collection_disputes_payment_fk
    foreign key (organization_id, payment_id, currency)
    references zaltyko.payments (organization_id, id, currency) on delete restrict,
  constraint family_collection_disputes_last_event_fk
    foreign key (organization_id, last_provider_event_id)
    references zaltyko.payment_provider_events (organization_id, id) on delete set null (last_provider_event_id)
);

-- Disputas de una academia por estado (panel y avisos).
create index family_collection_disputes_status_idx
  on zaltyko.family_collection_disputes (organization_id, status, updated_at);
-- Disputas de un intento.
create index family_collection_disputes_attempt_idx
  on zaltyko.family_collection_disputes (organization_id, attempt_id);
-- Borrar un evento pone a null el último evento de sus disputas.
create index family_collection_disputes_event_idx
  on zaltyko.family_collection_disputes (organization_id, last_provider_event_id);

alter table zaltyko.family_collection_disputes enable row level security;
alter table zaltyko.family_collection_disputes force row level security;

revoke all on table zaltyko.family_collection_disputes
  from public, anon, authenticated, service_role;
grant select, insert, update on table zaltyko.family_collection_disputes
  to service_role;

comment on table zaltyko.family_collection_disputes is
  'Disputas de los cobros automáticos de cuotas en la cuenta Stripe conectada de la academia (Fase 4). Solo referencias opacas (dp_, du_, ch_, py_), importes, estados y códigos de Stripe; nunca mensajes, pruebas, datos de tarjeta, banco ni identidad. Solo servidor.';
comment on column zaltyko.family_collection_attempts.action_deadline_at is
  'Plazo para que la familia confirme el pago con su banco (estado requires_action). Al vencer, el proceso diario cierra el intento.';

commit;

-- VUELTA ATRÁS. Comentada: no se ejecuta con este archivo y requiere la misma
-- autorización de Elvis. Antes: apagar ZALTYKO_FAMILY_COLLECTION_EVENTS_ENABLED
-- y comprobar que ningún intento está en requires_action (si queda alguno, el
-- check de estado de la Fase 3 aborta la transacción y no cambia nada). Borra
-- las disputas guardadas: exportarlas antes si importan; las devoluciones ya
-- escritas siguen en zaltyko.refunds. Deja la Fase 3 exactamente como la
-- instaló su candidata (tests/family-collection-events-pg.test.ts lo
-- comprueba ejecutando este bloque).
-- >>> vuelta atrás
-- begin;
-- set local lock_timeout = '5s';
-- drop table zaltyko.family_collection_disputes;
-- drop index zaltyko.family_collection_attempts_open_uq;
-- alter table zaltyko.family_collection_attempts
--   drop constraint family_collection_attempts_action_deadline_check,
--   drop constraint family_collection_attempts_intent_reference_by_status,
--   add constraint family_collection_attempts_intent_reference_by_status check ((status not in ('created', 'processing', 'succeeded') or provider_payment_intent_reference is not null) and (status <> 'claimed' or provider_payment_intent_reference is null)),
--   drop constraint family_collection_attempts_status_check,
--   add constraint family_collection_attempts_status_check check (status in ('claimed', 'created', 'processing', 'succeeded', 'failed', 'canceled')),
--   drop column action_deadline_at;
-- create unique index family_collection_attempts_open_uq
--   on zaltyko.family_collection_attempts (organization_id, invoice_id)
--   where status in ('claimed', 'created', 'processing');
-- commit;
-- <<< vuelta atrás
