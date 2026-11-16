-- CANDIDATE ONLY. Requiere autorización de Elvis antes de cualquier aplicación
-- alojada (staging o producción). No aplicado en ningún entorno.
-- Cobro automático de cuotas, Fase 1: conectar la cuenta Stripe de la academia
-- (docs/architecture/adr/0028-cobro-automatico-de-cuotas-con-connect.md).
-- Añade dos columnas a zaltyko.organization_payment_provider_accounts; no crea
-- tablas, no cambia filas existentes salvo rellenar los valores por defecto y
-- no toca permisos.
--
-- - sepa_debit_payments_capability_status: último estado de la capacidad
--   sepa_debit_payments de la cuenta conectada, sincronizado desde el
--   servidor. En la Fase 1 es informativo; el estado de la cuenta (status)
--   depende solo de card_payments. En la Fase 2 firmar una domiciliación
--   exigirá el valor exacto 'active'.
-- - requirements_state: resumen mínimo de los requisitos pendientes de Stripe,
--   como código cerrado: none, user_action, stripe_review o past_due.
--
-- La función va detrás de ZALTYKO_CONNECT_ONBOARDING_ENABLED (apagada por
-- defecto); mientras estas columnas no existan responde «no disponible».
--
-- RGPD: solo códigos de estado. Ni nombres, ni documentos, ni datos bancarios,
-- ni la lista de requisitos de Stripe: esos datos los recoge y guarda Stripe en
-- su propio formulario. La tabla ya es solo de service_role (RLS ENABLE y
-- FORCE, sin grants a anon ni authenticated) y este candidato no lo cambia.
-- Reinstalar aborta antes de tocar nada: una instalación parcial o divergente
-- exige reconciliación humana, nunca reparación.
do $connect_onboarding_candidate_preflight$
begin
  if to_regclass('zaltyko.organization_payment_provider_accounts') is null then
    raise exception 'Connect onboarding candidate requires the canonical zaltyko.organization_payment_provider_accounts table';
  end if;
  if exists (
    select 1
      from pg_attribute
     where attrelid = 'zaltyko.organization_payment_provider_accounts'::regclass
       and attname in ('sepa_debit_payments_capability_status', 'requirements_state')
       and attnum > 0
       and not attisdropped
  ) then
    raise exception 'Connect onboarding candidate requires sepa_debit_payments_capability_status and requirements_state absent; inspect existing schema before promotion';
  end if;
end;
$connect_onboarding_candidate_preflight$;

-- Una cuenta nueva nace sin datos enviados: SEPA pendiente y la academia con
-- requisitos por completar. Los valores por defecto son constantes, así que
-- añadir las columnas no reescribe la tabla.
alter table zaltyko.organization_payment_provider_accounts
  add column sepa_debit_payments_capability_status text not null default 'pending'
    constraint organization_payment_provider_accounts_sepa_status_not_blank
      check (btrim(sepa_debit_payments_capability_status) <> ''),
  add column requirements_state text not null default 'user_action'
    constraint organization_payment_provider_accounts_requirements_state_check
      check (requirements_state in ('none', 'user_action', 'stripe_review', 'past_due'));

comment on column zaltyko.organization_payment_provider_accounts.sepa_debit_payments_capability_status is
  'Último estado de la capacidad sepa_debit_payments sincronizado desde el servidor. Informativo en la Fase 1; la domiciliación exigirá el valor exacto active.';
comment on column zaltyko.organization_payment_provider_accounts.requirements_state is
  'Resumen de requisitos pendientes de Stripe: none, user_action, stripe_review o past_due. Solo un código, nunca datos personales.';
