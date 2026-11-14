-- CANDIDATE ONLY. Requiere autorización de Elvis antes de cualquier aplicación
-- alojada (staging o producción). No aplicado en ningún entorno.
-- Recordatorios de impago de cuotas de familias (docs/producto/recordatorios-de-impago.md).
-- Dos relaciones nuevas en zaltyko; no cambia filas ni tablas existentes.
--
-- Zaltyko no cobra a las familias: la academia registra los pagos a mano y
-- este candidato solo guarda (1) la plantilla y los límites que cada academia
-- configura y (2) un registro de cuándo se recordó cada cuota, que es lo que
-- hace cumplir el límite «un recordatorio por cuota cada N días».
-- La función va detrás de ZALTYKO_PAYMENT_REMINDERS_ENABLED (apagada por
-- defecto); mientras estas tablas no existan responde «no disponible» (503).
--
-- RGPD: el registro no guarda el correo ni el nombre del destinatario, solo el
-- id del tutor pagador (guardian_id), que apunta a una ficha ya existente. El
-- correo vive donde ya vive (zaltyko.guardian_contacts) y en email_logs, que
-- gestiona el emisor común. No hay texto libre del mensaje en el registro.
-- Requiere PostgreSQL 15 o superior: `on delete set null (columna)`. El
-- preflight aborta con un mensaje claro en versiones anteriores.
-- Reinstalar aborta antes de tocar nada: una instalación parcial o divergente
-- exige reconciliación humana, nunca reparación.
do $payment_reminders_candidate_preflight$
begin
  if current_setting('server_version_num')::integer < 150000 then
    raise exception 'Payment reminders candidate requires PostgreSQL 15 or later (ON DELETE SET NULL with a column list); found %', current_setting('server_version');
  end if;
  if to_regclass('zaltyko.payment_reminder_settings') is not null
     or to_regclass('zaltyko.payment_reminders') is not null then
    raise exception 'Payment reminders candidate requires zaltyko.payment_reminder_settings and zaltyko.payment_reminders absent; inspect existing schema before promotion';
  end if;
  if to_regclass('zaltyko.charges') is null
     or to_regclass('zaltyko.guardians') is null
     or to_regclass('zaltyko.organization_members') is null then
    raise exception 'Payment reminders candidate requires the canonical charges, guardians and organization_members tables';
  end if;
end;
$payment_reminders_candidate_preflight$;

-- Plantilla, datos de pago y límites de cada academia (una fila por academia).
-- subject_template y body_template en null significan «usar el texto por
-- defecto de Zaltyko». payment_instructions es texto libre de la academia
-- (IBAN, Bizum, efectivo...): es dato de la academia, no de la familia, y
-- nunca debe incluir datos de terceros. min_interval_days es el mínimo de días
-- entre dos recordatorios de la misma cuota. is_auto_enabled (apagado por
-- defecto) activa un único recordatorio automático por cuota,
-- auto_after_days días después del vencimiento.
create table zaltyko.payment_reminder_settings (
  organization_id uuid primary key references zaltyko.organizations(id) on delete cascade,
  subject_template text,
  body_template text,
  payment_instructions text,
  reply_to_email text,
  min_interval_days integer not null default 7,
  is_auto_enabled boolean not null default false,
  auto_after_days integer not null default 3,
  version integer not null default 1,
  updated_by_member_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_reminder_settings_interval_check
    check (min_interval_days between 1 and 90),
  constraint payment_reminder_settings_auto_after_check
    check (auto_after_days between 1 and 60),
  constraint payment_reminder_settings_subject_check
    check (subject_template is null or (btrim(subject_template) <> '' and char_length(subject_template) <= 150)),
  constraint payment_reminder_settings_body_check
    check (body_template is null or (btrim(body_template) <> '' and char_length(body_template) <= 4000)),
  constraint payment_reminder_settings_instructions_check
    check (payment_instructions is null or char_length(payment_instructions) <= 1000),
  constraint payment_reminder_settings_reply_to_check
    check (reply_to_email is null or (char_length(reply_to_email) <= 254 and reply_to_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  constraint payment_reminder_settings_version_check
    check (version > 0),
  constraint payment_reminder_settings_member_fk
    foreign key (organization_id, updated_by_member_id) references zaltyko.organization_members(organization_id, id) on delete set null (updated_by_member_id)
);

-- Un recordatorio por cuota y envío. status:
-- - pending: reservado dentro de la transacción que comprueba el límite y aún
--   sin respuesta del proveedor (cuenta para el límite 15 minutos);
-- - sent: el proveedor aceptó el envío (cuenta para el límite N días);
-- - failed: no se envió o no se pudo confirmar (no cuenta; se puede reintentar).
-- Varias cuotas de la misma familia y moneda se avisan en un solo correo: sus
-- filas comparten email_group_id. requested_by_member_id es null en los
-- automáticos. El importe pendiente se guarda solo como cifra del momento.
-- Borrados: la cuota o la academia borran en cascada; el tutor pagador y el
-- miembro que lo pidió pasan a null (PostgreSQL 15+), de modo que borrar a una
-- persona no destruye el historial de la cuota ni anula organization_id.
create table zaltyko.payment_reminders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references zaltyko.organizations(id) on delete cascade,
  charge_id uuid not null,
  guardian_id uuid,
  email_group_id uuid not null,
  origin text not null,
  status text not null default 'pending',
  outstanding_cents bigint not null,
  currency text not null,
  requested_by_member_id uuid,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint payment_reminders_origin_check
    check (origin in ('manual', 'automatic')),
  constraint payment_reminders_status_check
    check (status in ('pending', 'sent', 'failed')),
  constraint payment_reminders_outstanding_check
    check (outstanding_cents >= 0),
  constraint payment_reminders_sent_at_check
    check ((status = 'sent') = (sent_at is not null)),
  constraint payment_reminders_charge_fk
    foreign key (organization_id, charge_id) references zaltyko.charges(organization_id, id) on delete cascade,
  constraint payment_reminders_guardian_fk
    foreign key (organization_id, guardian_id) references zaltyko.guardians(organization_id, id) on delete set null (guardian_id),
  constraint payment_reminders_member_fk
    foreign key (organization_id, requested_by_member_id) references zaltyko.organization_members(organization_id, id) on delete set null (requested_by_member_id)
);

create index payment_reminders_charge_idx
  on zaltyko.payment_reminders(organization_id, charge_id, created_at desc);

alter table zaltyko.payment_reminder_settings enable row level security;
alter table zaltyko.payment_reminder_settings force row level security;
alter table zaltyko.payment_reminders enable row level security;
alter table zaltyko.payment_reminders force row level security;
revoke all on table zaltyko.payment_reminder_settings from public, anon, authenticated;
revoke all on table zaltyko.payment_reminders from public, anon, authenticated;
-- Sin políticas ni grants para clientes directos: el único escritor y lector es
-- el servidor, que autoriza con resolveOwnerScope (propiedad o administración)
-- y el alcance de sedes. Los datos son de la academia (responsable); Zaltyko
-- los trata por su cuenta.
