import { sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { getAppUrl } from "@/lib/env";
import { sendEmailWithLogging } from "@/lib/email/email-service";
import { logger } from "@/lib/logger";
import type { OperationalActor } from "@/modules/shared/application/actor";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { appendAuditEntry, lockCommand } from "@/modules/shared/infrastructure/transactional-records";
import { noticeDedupeKey } from "@/modules/family-access/domain/family-access-hash";
import {
  FAMILY_NOTICE_RECIPIENT_LIMIT,
  familyIdempotencyKeySchema,
  familyNoticeEmail,
  familyUuidSchema,
  manualNoticeCommandSchema,
  sessionChangeCommandSchema,
  sessionNoticeText,
  type FamilyNoticeKind,
} from "@/modules/family-access/domain/family-access-contract";
import {
  assertFamilyManager,
  assertOrganizationOperational,
  auditKey,
  familyAccessTransaction,
  fingerprint,
  iso,
  memberLocationIds,
  priorCommand,
  rows,
  type Tx,
} from "@/modules/family-access/application/family-access-shared";
import { isFamilyAccessAvailableForPage } from "@/modules/family-access/application/family-access-storage";

/** Sesiones futuras que la academia puede cancelar o cambiar desde Familias y avisos. */
const UPCOMING_DAYS = 14;
const UPCOMING_LIMIT = 100;
const OWNER_NOTICES_LIMIT = 30;
const EMAIL_CONCURRENCY = 4;

type SessionRow = {
  id: string;
  organization_id: string;
  location_id: string;
  class_template_id: string;
  status: "scheduled" | "completed" | "cancelled";
  starts_at: string | Date;
  ends_at: string | Date;
  started: boolean;
  class_name: string;
  location_name: string;
  timezone: string;
};

export type NoticeCreated = {
  noticeId: string;
  recipients: number;
  replayed: boolean;
};

/**
 * Familias a las que se dirige un aviso: tutores activos con un vínculo
 * activo y permiso de ver gimnastas (can_view_athletes) en una familia activa
 * con una gimnasta activa y vigente en `athleteSet`. Una familia sin ese
 * permiso no recibe avisos sobre la gimnasta: es el mismo permiso que el
 * portal exige para mostrar horario y asistencia.
 */
function recipientGuardians(input: { organizationId: string; athleteSet: SQL; onDate: SQL }) {
  return sql`
    select distinct g.id as guardian_id, g.auth_user_id
    from (${input.athleteSet}) as target(athlete_id)
    join zaltyko.athletes a on a.organization_id=${input.organizationId}::uuid and a.id=target.athlete_id and a.is_active
    join zaltyko.family_members fm on fm.organization_id=a.organization_id and fm.athlete_id=a.id
      and fm.starts_on <= ${input.onDate} and (fm.ends_on is null or fm.ends_on >= ${input.onDate})
    join zaltyko.families f on f.organization_id=fm.organization_id and f.id=fm.family_id and f.is_active
    join zaltyko.family_guardians fg on fg.organization_id=f.organization_id and fg.family_id=f.id
      and fg.is_active and fg.can_view_athletes
    join zaltyko.guardians g on g.organization_id=fg.organization_id and g.id=fg.guardian_id and g.is_active
  `;
}

/** Gimnastas inscritas (prueba o activa) en la clase el día `onDate`. */
function classAthletes(organizationId: string, classTemplateId: string, onDate: SQL) {
  return sql`select e.athlete_id from zaltyko.enrollments e
    where e.organization_id=${organizationId}::uuid and e.class_template_id=${classTemplateId}::uuid
      and e.status in ('trial','active') and e.starts_on <= ${onDate} and (e.ends_on is null or e.ends_on >= ${onDate})`;
}

/** Gimnastas activas del grupo hoy. */
function groupAthletes(organizationId: string, groupId: string, onDate: SQL) {
  return sql`select m.athlete_id from zaltyko.group_memberships m
    where m.organization_id=${organizationId}::uuid and m.group_id=${groupId}::uuid
      and m.status='active' and m.starts_on <= ${onDate} and (m.ends_on is null or m.ends_on >= ${onDate})`;
}

/**
 * Crea el aviso y sus destinatarios en la transacción del cambio. La clave
 * (organización, dedupe_key) hace que el mismo cambio no cree dos avisos.
 * El estado del correo se decide aquí: sin cuenta vinculada no hay a quién
 * escribir (la academia lo ve), y una preferencia desactivada se respeta.
 */
async function createNotice(tx: Tx, input: {
  organizationId: string;
  locationId: string;
  kind: FamilyNoticeKind;
  sessionId: string | null;
  classTemplateId: string | null;
  groupId: string | null;
  title: string;
  body: string;
  dedupeKey: string;
  memberId: string;
  recipients: SQL;
}): Promise<NoticeCreated> {
  const inserted = await rows<{ id: string }>(tx, sql`insert into zaltyko.family_notices
      (organization_id, location_id, kind, session_id, class_template_id, group_id, title, body, dedupe_key, created_by_member_id)
    values (${input.organizationId}::uuid, ${input.locationId}::uuid, ${input.kind}, ${input.sessionId}::uuid, ${input.classTemplateId}::uuid,
      ${input.groupId}::uuid, ${input.title}, ${input.body}, ${input.dedupeKey}, ${input.memberId}::uuid)
    on conflict (organization_id, dedupe_key) do nothing
    returning id::text`);
  if (!inserted[0]) {
    const existing = await rows<{ id: string; recipients: number }>(tx, sql`select n.id::text,
        (select count(*)::int from zaltyko.family_notice_recipients r where r.organization_id=n.organization_id and r.notice_id=n.id) as recipients
      from zaltyko.family_notices n where n.organization_id=${input.organizationId}::uuid and n.dedupe_key=${input.dedupeKey}`);
    return { noticeId: existing[0]!.id, recipients: existing[0]!.recipients, replayed: true };
  }
  const noticeId = inserted[0].id;
  const preferenceColumn = input.kind === "manual" ? sql`p.email_manual_notices` : sql`p.email_session_changes`;
  const added = await rows<{ count: number }>(tx, sql`
    with targets as (${input.recipients}),
    limited as (select * from targets limit ${FAMILY_NOTICE_RECIPIENT_LIMIT + 1}),
    ins as (
      insert into zaltyko.family_notice_recipients (organization_id, notice_id, guardian_id, email_status)
      select ${input.organizationId}::uuid, ${noticeId}::uuid, t.guardian_id,
        case
          when t.auth_user_id is null then 'skipped_no_account'
          when coalesce(${preferenceColumn}, true) = false then 'skipped_preference'
          else 'pending'
        end
      from limited t
      left join zaltyko.guardian_notification_preferences p
        on p.organization_id=${input.organizationId}::uuid and p.guardian_id=t.guardian_id
      returning 1
    )
    select count(*)::int as count from ins`);
  const count = added[0]?.count ?? 0;
  if (count > FAMILY_NOTICE_RECIPIENT_LIMIT) {
    throw new OperationalError("INVALID_RELATION", `Un aviso puede llegar como mucho a ${FAMILY_NOTICE_RECIPIENT_LIMIT} familias.`, 422);
  }
  return { noticeId, recipients: count, replayed: false };
}

const MAX_EMAIL_ATTEMPTS = 3;
const RETRY_AFTER_MINUTES = 5;

type ClaimedEmail = {
  recipient_id: string;
  organization_id: string;
  notice_id: string;
  guardian_id: string;
  email_attempts: number;
  email: string | null;
  title: string;
  body: string;
  academy: string;
  kind: FamilyNoticeKind;
};

/**
 * Reclama un lote de correos pendientes: suma un intento y anota la hora antes
 * de enviar, con SKIP LOCKED, para que dos procesos (la petición y el cron)
 * nunca manden el mismo correo a la vez. Un fallo vuelve a intentarse pasados
 * unos minutos, como mucho tres veces.
 */
async function claimPendingEmails(scope: { organizationId?: string; noticeId?: string }, limit: number): Promise<ClaimedEmail[]> {
  return familyAccessTransaction(async (tx) => rows<ClaimedEmail>(tx, sql`
    with picked as (
      select r.id
      from zaltyko.family_notice_recipients r
      join zaltyko.organizations o on o.id=r.organization_id and o.status in ('trial','active')
      where r.email_status='pending'
        and (r.email_attempted_at is null or r.email_attempted_at < clock_timestamp() - make_interval(mins => ${RETRY_AFTER_MINUTES}))
        ${scope.organizationId ? sql`and r.organization_id=${scope.organizationId}::uuid` : sql``}
        ${scope.noticeId ? sql`and r.notice_id=${scope.noticeId}::uuid` : sql``}
      order by r.created_at, r.id
      limit ${limit}
      for update of r skip locked
    ), claimed as (
      update zaltyko.family_notice_recipients r
        set email_attempts=r.email_attempts+1, email_attempted_at=clock_timestamp()
      from picked where r.id=picked.id
      returning r.id, r.organization_id, r.notice_id, r.guardian_id, r.email_attempts
    )
    select c.id::text as recipient_id, c.organization_id::text, c.notice_id::text, c.guardian_id::text, c.email_attempts,
      lower(btrim(u.email)) as email, n.title, n.body, o.name as academy, n.kind
    from claimed c
    join zaltyko.family_notices n on n.organization_id=c.organization_id and n.id=c.notice_id
    join zaltyko.organizations o on o.id=c.organization_id
    left join zaltyko.guardians g on g.organization_id=c.organization_id and g.id=c.guardian_id and g.is_active
    left join auth.users u on u.id=g.auth_user_id and u.email_confirmed_at is not null`));
}

async function sendClaimedEmail(item: ClaimedEmail, portalUrl: string): Promise<"sent" | "retry" | "failed" | "skipped_no_account"> {
  let outcome: "sent" | "retry" | "failed" | "skipped_no_account";
  if (!item.email) {
    outcome = "skipped_no_account";
  } else {
    let accepted = false;
    try {
      const message = familyNoticeEmail({ academyName: item.academy, kind: item.kind, title: item.title, body: item.body, portalUrl });
      accepted = await sendEmailWithLogging({
        to: item.email,
        subject: message.subject,
        html: message.html,
        text: message.text,
        template: "family_notice",
        dedupeKey: `family-notice:${item.notice_id}:${item.guardian_id}`,
        metadata: { noticeId: item.notice_id },
      });
    } catch (error) {
      logger.error("family_access.notice_email_failed", error instanceof Error ? error : undefined, { noticeId: item.notice_id });
    }
    outcome = accepted ? "sent" : item.email_attempts >= MAX_EMAIL_ATTEMPTS ? "failed" : "retry";
  }
  if (outcome !== "retry") {
    try {
      await db.execute(sql`update zaltyko.family_notice_recipients set email_status=${outcome}
        where organization_id=${item.organization_id}::uuid and id=${item.recipient_id}::uuid and email_status='pending'`);
    } catch (error) {
      logger.error("family_access.notice_status_failed", error instanceof Error ? error : undefined, { noticeId: item.notice_id });
    }
  }
  return outcome;
}

export type NoticeDelivery = { sent: number; failed: number; pending: number };

/**
 * Envía correos pendientes por lotes pequeños, después de confirmar la
 * transacción del aviso, hasta agotar la cola o el tiempo. Lo que queda
 * pendiente (o falló y toca reintentar) lo recoge el cron
 * /api/cron/family-notices. El correo va a la dirección verificada de la
 * cuenta que aceptó la invitación, nunca a una escrita a mano.
 */
export async function deliverNoticeEmails(
  scope: { organizationId?: string; noticeId?: string },
  options: { batchSize?: number; budgetMs?: number } = {}
): Promise<NoticeDelivery> {
  const batchSize = options.batchSize ?? 10;
  const deadline = Date.now() + (options.budgetMs ?? 8_000);
  const portalUrl = `${getAppUrl()}/familia/avisos`;
  const result: NoticeDelivery = { sent: 0, failed: 0, pending: 0 };
  while (Date.now() < deadline) {
    const batch = await claimPendingEmails(scope, batchSize);
    if (batch.length === 0) break;
    const queue = [...batch];
    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const outcome = await sendClaimedEmail(item, portalUrl);
        if (outcome === "sent") result.sent += 1;
        else if (outcome === "failed") result.failed += 1;
        else if (outcome === "retry") result.pending += 1;
      }
    };
    await Promise.all(Array.from({ length: EMAIL_CONCURRENCY }, () => worker()));
  }
  return result;
}

async function loadSession(tx: Tx, organizationId: string, sessionId: string, lock: boolean): Promise<SessionRow> {
  const found = await rows<SessionRow>(tx, sql`select s.id::text, s.organization_id::text, s.location_id::text, s.class_template_id::text,
      s.status::text as status, s.starts_at, s.ends_at, (s.starts_at <= clock_timestamp()) as started,
      ct.name as class_name, l.name as location_name, l.timezone
    from zaltyko.sessions s
    join zaltyko.class_templates ct on ct.organization_id=s.organization_id and ct.id=s.class_template_id
    join zaltyko.locations l on l.organization_id=s.organization_id and l.id=s.location_id
    where s.organization_id=${organizationId}::uuid and s.id=${sessionId}::uuid
    ${lock ? sql`for update of s` : sql``}`);
  const row = found[0];
  if (!row) throw new OperationalError("NOT_FOUND", "Sesión no encontrada", 404);
  return row;
}

function localDate(instant: Date | string, timezone: string): SQL {
  return sql`(${iso(instant)}::timestamptz at time zone ${timezone})::date`;
}

export type SessionChangeResult = NoticeCreated & {
  sessionId: string;
  /** Al cambiar de hora: la sesión original, que queda cancelada. */
  previousSessionId: string | null;
  status: "cancelled" | "scheduled";
  startsAt: string;
  endsAt: string;
  emails: NoticeDelivery | null;
};

/**
 * La academia cancela o cambia de hora una sesión futura y, en la misma
 * transacción, se crea el aviso a las familias de las gimnastas inscritas ese
 * día. Repetir el comando con la misma clave devuelve el mismo resultado.
 */
export async function changeSessionAndNotify(input: {
  actor: OperationalActor;
  sessionId: string;
  command: unknown;
  idempotencyKey: string;
}): Promise<SessionChangeResult> {
  familyUuidSchema.parse(input.sessionId);
  const command = sessionChangeCommandSchema.parse(input.command);
  const clientKey = familyIdempotencyKeySchema.parse(input.idempotencyKey);
  const key = auditKey("family_session_change", input.actor.userId, clientKey);
  const requestHash = fingerprint({ sessionId: input.sessionId, command });

  const result = await familyAccessTransaction(async (tx): Promise<Omit<SessionChangeResult, "emails">> => {
    await lockCommand(tx, command.organizationId, `${input.actor.userId}:family-session:${clientKey}`);
    const prior = await priorCommand(tx, { organizationId: command.organizationId, key, requestHash });
    if (prior) {
      await assertFamilyManager(tx, { ...command, actor: input.actor, allSites: false });
      return { ...(prior as Omit<SessionChangeResult, "emails" | "replayed">), replayed: true };
    }
    // Primero el rol y la sede de quien pide; después la sesión. Una sesión
    // de otra sede responde igual que una inexistente.
    const member = await assertFamilyManager(tx, { organizationId: command.organizationId, locationId: command.locationId, actor: input.actor, allSites: false, write: true });
    const found = await loadSession(tx, command.organizationId, input.sessionId, false);
    if (found.location_id !== command.locationId) throw new OperationalError("NOT_FOUND", "Sesión no encontrada", 404);
    await assertOrganizationOperational(tx, command.organizationId);
    // Mismo cerrojo de plantilla que la generación de sesiones y las
    // sustituciones (session-service.insertTemplateSessionsInRange).
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${command.organizationId}:sessions:${found.class_template_id}`}, 0))`);
    const session = await loadSession(tx, command.organizationId, input.sessionId, true);
    if (session.status !== "scheduled") throw new OperationalError("INVALID_STATE_TRANSITION", "Solo se puede cambiar una sesión programada.", 409);
    if (session.started) throw new OperationalError("INVALID_STATE_TRANSITION", "La sesión ya ha empezado: no se puede cancelar ni cambiar.", 409);

    const startsAt = new Date(session.starts_at);
    const endsAt = new Date(session.ends_at);
    let onDate = localDate(startsAt, session.timezone);
    let athleteSet = classAthletes(command.organizationId, session.class_template_id, onDate);
    let kind: "session_cancelled" | "session_rescheduled";
    let dedupeKey: string;
    let next: { startsAt: Date; endsAt: Date } | null = null;
    let resultSessionId = session.id;
    let previousSessionId: string | null = null;
    if (command.action === "cancel") {
      kind = "session_cancelled";
      dedupeKey = noticeDedupeKey([session.id, "cancelled"]);
      await tx.execute(sql`update zaltyko.sessions set status='cancelled', cancellation_reason=${command.reason},
          updated_at=clock_timestamp()
        where organization_id=${command.organizationId}::uuid and id=${session.id}::uuid`);
    } else {
      kind = "session_rescheduled";
      next = { startsAt: new Date(command.startsAt), endsAt: new Date(command.endsAt) };
      if (next.startsAt.getTime() <= Date.now()) throw new OperationalError("INVALID_DATE_RANGE", "La nueva hora debe ser futura.", 422);
      if (next.startsAt.getTime() === startsAt.getTime() && next.endsAt.getTime() === endsAt.getTime()) {
        throw new OperationalError("INVALID_DATE_RANGE", "La nueva hora es la misma que la actual.", 422);
      }
      const clash = await rows<{ id: string }>(tx, sql`select id::text from zaltyko.sessions
        where organization_id=${command.organizationId}::uuid and class_template_id=${session.class_template_id}::uuid
          and starts_at=${next.startsAt.toISOString()}::timestamptz and id<>${session.id}::uuid`);
      if (clash.length) throw new OperationalError("INVALID_STATE_TRANSITION", "Ya hay otra sesión de esta clase a esa hora.", 409);
      dedupeKey = noticeDedupeKey([session.id, "rescheduled", next.startsAt.toISOString(), next.endsAt.toISOString()]);
      if (next.startsAt.getTime() === startsAt.getTime()) {
        // Solo cambia la hora de fin: la franja de la plantilla es la misma.
        await tx.execute(sql`update zaltyko.sessions set ends_at=${next.endsAt.toISOString()}::timestamptz, updated_at=clock_timestamp()
          where organization_id=${command.organizationId}::uuid and id=${session.id}::uuid`);
      } else {
        // La original se cancela (y su franja sigue ocupada, así que regenerar
        // sesiones no la vuelve a crear) y se crea una sesión nueva a la hora
        // nueva, con las mismas entrenadoras.
        await tx.execute(sql`update zaltyko.sessions set status='cancelled', cancellation_reason='Cambio de horario',
            updated_at=clock_timestamp()
          where organization_id=${command.organizationId}::uuid and id=${session.id}::uuid`);
        const created = await rows<{ id: string }>(tx, sql`insert into zaltyko.sessions
            (organization_id, location_id, class_template_id, space_id, status, starts_at, ends_at, capacity_override)
          select organization_id, location_id, class_template_id, space_id, 'scheduled',
            ${next.startsAt.toISOString()}::timestamptz, ${next.endsAt.toISOString()}::timestamptz, capacity_override
          from zaltyko.sessions where organization_id=${command.organizationId}::uuid and id=${session.id}::uuid
          returning id::text`);
        const createdId = created[0]?.id;
        if (!createdId) throw new OperationalError("FEATURE_NOT_AVAILABLE", "No se pudo crear la sesión con el horario nuevo.", 503);
        await tx.execute(sql`insert into zaltyko.session_staff (organization_id, session_id, staff_profile_id, assignment_role)
          select organization_id, ${createdId}::uuid, staff_profile_id, assignment_role from zaltyko.session_staff
          where organization_id=${command.organizationId}::uuid and session_id=${session.id}::uuid`);
        previousSessionId = session.id;
        resultSessionId = createdId;
      }
      // Familias de las gimnastas inscritas el día original o el nuevo, con la
      // pertenencia a la familia vigente el día nuevo.
      const newDate = localDate(next.startsAt, session.timezone);
      athleteSet = sql`${athleteSet} union ${classAthletes(command.organizationId, session.class_template_id, newDate)}`;
      onDate = newDate;
    }
    const text = sessionNoticeText({
      kind,
      className: session.class_name,
      locationName: session.location_name,
      timeZone: session.timezone,
      startsAt,
      endsAt,
      ...(next ? { newStartsAt: next.startsAt, newEndsAt: next.endsAt } : {}),
      reason: command.reason,
    });
    const notice = await createNotice(tx, {
      organizationId: command.organizationId,
      locationId: session.location_id,
      kind,
      sessionId: resultSessionId,
      classTemplateId: session.class_template_id,
      groupId: null,
      title: text.title,
      body: text.body,
      dedupeKey,
      memberId: member.id,
      recipients: recipientGuardians({ organizationId: command.organizationId, athleteSet, onDate }),
    });
    const stored = {
      ...notice,
      sessionId: resultSessionId,
      previousSessionId,
      status: command.action === "cancel" ? ("cancelled" as const) : ("scheduled" as const),
      startsAt: (next?.startsAt ?? startsAt).toISOString(),
      endsAt: (next?.endsAt ?? endsAt).toISOString(),
    };
    await appendAuditEntry(tx, {
      organizationId: command.organizationId,
      locationId: session.location_id,
      actorUserId: input.actor.userId,
      action: command.action === "cancel" ? "session.cancelled" : "session.rescheduled",
      targetType: "session",
      targetId: session.id,
      idempotencyKey: key,
      before: { status: session.status, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() },
      after: { status: stored.status, startsAt: stored.startsAt, endsAt: stored.endsAt, noticeId: notice.noticeId, sessionId: resultSessionId },
      metadata: { requestHash, result: { ...stored, replayed: false }, memberId: member.id },
    });
    return stored;
  });
  const emails = result.replayed ? null : await deliverNoticeEmails({ organizationId: command.organizationId, noticeId: result.noticeId });
  return { ...result, emails };
}

/**
 * Aviso de sustitución, después de guardar las entrenadoras de una sesión.
 * Sin la función activa no hace nada (devuelve null): la sustitución ya está
 * guardada y nunca falla por el aviso. El texto no nombra a nadie ni copia el
 * motivo interno.
 */
export async function notifySessionSubstitution(input: {
  actor: OperationalActor;
  organizationId: string;
  sessionId: string;
  staffProfileIds: readonly string[];
  /** Momento de la sustitución guardada: cada sustitución nueva es otro aviso. */
  substitutionChangedAt: string;
}): Promise<NoticeCreated | null> {
  if (!(await isFamilyAccessAvailableForPage())) return null;
  try {
    const notice = await familyAccessTransaction(async (tx) => {
      const session = await loadSession(tx, input.organizationId, input.sessionId, false);
      const member = await assertFamilyManager(tx, { organizationId: input.organizationId, locationId: session.location_id, actor: input.actor, allSites: false });
      if (session.status !== "scheduled" || session.started) return null;
      const startsAt = new Date(session.starts_at);
      const endsAt = new Date(session.ends_at);
      const onDate = localDate(startsAt, session.timezone);
      const text = sessionNoticeText({
        kind: "session_substitution",
        className: session.class_name,
        locationName: session.location_name,
        timeZone: session.timezone,
        startsAt,
        endsAt,
      });
      return createNotice(tx, {
        organizationId: input.organizationId,
        locationId: session.location_id,
        kind: "session_substitution",
        sessionId: session.id,
        classTemplateId: session.class_template_id,
        groupId: null,
        title: text.title,
        body: text.body,
        dedupeKey: noticeDedupeKey([session.id, "substitution", input.substitutionChangedAt, ...[...input.staffProfileIds].sort()]),
        memberId: member.id,
        recipients: recipientGuardians({
          organizationId: input.organizationId,
          athleteSet: classAthletes(input.organizationId, session.class_template_id, onDate),
          onDate,
        }),
      });
    });
    if (notice && !notice.replayed) await deliverNoticeEmails({ organizationId: input.organizationId, noticeId: notice.noticeId });
    return notice;
  } catch (error) {
    logger.error("family_access.substitution_notice_failed", error instanceof Error ? error : undefined, { sessionId: input.sessionId });
    return null;
  }
}

export type ManualNoticeResult = NoticeCreated & { emails: NoticeDelivery | null };

/** Aviso manual a una clase o a un grupo. Idempotente por clave del cliente. */
export async function sendManualNotice(input: {
  actor: OperationalActor;
  command: unknown;
  idempotencyKey: string;
}): Promise<ManualNoticeResult> {
  const command = manualNoticeCommandSchema.parse(input.command);
  const clientKey = familyIdempotencyKeySchema.parse(input.idempotencyKey);
  const dedupeKey = noticeDedupeKey(["manual", input.actor.userId, clientKey]);
  const requestHash = fingerprint(command);
  const key = auditKey("family_manual_notice", input.actor.userId, clientKey);

  const notice = await familyAccessTransaction(async (tx) => {
    await lockCommand(tx, command.organizationId, `${input.actor.userId}:family-notice:${clientKey}`);
    const prior = await priorCommand(tx, { organizationId: command.organizationId, key, requestHash });
    if (prior) {
      await assertFamilyManager(tx, { ...command, actor: input.actor, allSites: false });
      return { ...(prior as Omit<NoticeCreated, "replayed">), replayed: true };
    }
    const today = (timezone: string) => sql`(clock_timestamp() at time zone ${timezone})::date`;
    const member = await assertFamilyManager(tx, { organizationId: command.organizationId, locationId: command.locationId, actor: input.actor, allSites: false, write: true });
    let target: { location_id: string; timezone: string } | undefined;
    if (command.target.kind === "class") {
      target = (await rows<{ location_id: string; timezone: string }>(tx, sql`select ct.location_id::text, l.timezone
        from zaltyko.class_templates ct join zaltyko.locations l on l.organization_id=ct.organization_id and l.id=ct.location_id
        where ct.organization_id=${command.organizationId}::uuid and ct.id=${command.target.classTemplateId}::uuid and ct.status='active'`))[0];
    } else {
      target = (await rows<{ location_id: string; timezone: string }>(tx, sql`select gr.location_id::text, l.timezone
        from zaltyko.groups gr join zaltyko.locations l on l.organization_id=gr.organization_id and l.id=gr.location_id
        where gr.organization_id=${command.organizationId}::uuid and gr.id=${command.target.groupId}::uuid and gr.status='active'`))[0];
    }
    if (!target || target.location_id !== command.locationId) {
      throw new OperationalError("INVALID_RELATION", "Elige una clase o un grupo activo de esta academia.", 400);
    }
    await assertOrganizationOperational(tx, command.organizationId);
    const onDate = today(target.timezone);
    const created = await createNotice(tx, {
      organizationId: command.organizationId,
      locationId: target.location_id,
      kind: "manual",
      sessionId: null,
      classTemplateId: command.target.kind === "class" ? command.target.classTemplateId : null,
      groupId: command.target.kind === "group" ? command.target.groupId : null,
      title: command.title,
      body: command.body,
      dedupeKey,
      memberId: member.id,
      recipients: recipientGuardians({
        organizationId: command.organizationId,
        athleteSet: command.target.kind === "class"
          ? classAthletes(command.organizationId, command.target.classTemplateId, onDate)
          : groupAthletes(command.organizationId, command.target.groupId, onDate),
        onDate,
      }),
    });
    await appendAuditEntry(tx, {
      organizationId: command.organizationId,
      locationId: target.location_id,
      actorUserId: input.actor.userId,
      action: "family_notice.manual_sent",
      targetType: "family_notice",
      targetId: created.noticeId,
      idempotencyKey: key,
      after: { recipients: created.recipients, target: command.target },
      metadata: { requestHash, result: { noticeId: created.noticeId, recipients: created.recipients }, memberId: member.id },
    });
    return created;
  });
  const emails = notice.replayed ? null : await deliverNoticeEmails({ organizationId: command.organizationId, noticeId: notice.noticeId });
  return { ...notice, emails };
}

// ---------------------------------------------------------------------------
// Lectura de la academia: opciones, sesiones próximas y quién ha leído
// ---------------------------------------------------------------------------

export type OwnerNoticeRecipient = {
  guardianName: string;
  readAt: string | null;
  emailStatus: "pending" | "sent" | "failed" | "skipped_preference" | "skipped_no_account";
};

export type OwnerNotice = {
  id: string;
  kind: FamilyNoticeKind;
  title: string;
  body: string;
  createdAt: string;
  locationName: string;
  targetName: string | null;
  recipients: OwnerNoticeRecipient[];
};

export type OwnerNoticesBundle = {
  notices: OwnerNotice[];
  classes: Array<{ id: string; name: string; locationId: string; locationName: string }>;
  groups: Array<{ id: string; name: string; locationId: string; locationName: string }>;
  upcomingSessions: Array<{ id: string; className: string; locationName: string; timezone: string; startsAt: string; endsAt: string; locationId: string }>;
};

export async function getOwnerNoticesBundle(input: {
  organizationId: string;
  locationId: string;
  actor: OperationalActor;
}): Promise<OwnerNoticesBundle> {
  return familyAccessTransaction(async (tx) => {
    const member = await assertFamilyManager(tx, { ...input, allSites: false });
    const locationIds = await memberLocationIds(tx, { organizationId: input.organizationId, memberId: member.id, scopeMode: member.locationScopeMode });
    if (locationIds.length === 0) return { notices: [], classes: [], groups: [], upcomingSessions: [] };
    const inLocations = (column: SQL) => sql`${column} in (${sql.join(locationIds.map((id) => sql`${id}::uuid`), sql`,`)})`;
    const notices = await rows<{
      id: string; kind: FamilyNoticeKind; title: string; body: string; created_at: string | Date; location_name: string; target_name: string | null;
    }>(tx, sql`select n.id::text, n.kind, n.title, n.body, n.created_at, l.name as location_name,
        coalesce(ct.name, gr.name) as target_name
      from zaltyko.family_notices n
      join zaltyko.locations l on l.organization_id=n.organization_id and l.id=n.location_id
      left join zaltyko.class_templates ct on ct.organization_id=n.organization_id and ct.id=n.class_template_id
      left join zaltyko.groups gr on gr.organization_id=n.organization_id and gr.id=n.group_id
      where n.organization_id=${input.organizationId}::uuid and ${inLocations(sql`n.location_id`)}
      order by n.created_at desc, n.id limit ${OWNER_NOTICES_LIMIT}`);
    const recipients = notices.length === 0 ? [] : await rows<{
      notice_id: string; given_name: string; family_name: string; read_at: string | Date | null; email_status: OwnerNoticeRecipient["emailStatus"];
    }>(tx, sql`select r.notice_id::text, p.given_name, p.family_name, r.read_at, r.email_status
      from zaltyko.family_notice_recipients r
      join zaltyko.guardians g on g.organization_id=r.organization_id and g.id=r.guardian_id
      join zaltyko.people p on p.organization_id=g.organization_id and p.id=g.person_id
      where r.organization_id=${input.organizationId}::uuid
        and r.notice_id in (${sql.join(notices.map((notice) => sql`${notice.id}::uuid`), sql`,`)})
      order by p.family_name, p.given_name, r.id`);
    const classes = await rows<{ id: string; name: string; location_id: string; location_name: string }>(tx, sql`select ct.id::text, ct.name, ct.location_id::text, l.name as location_name
      from zaltyko.class_templates ct join zaltyko.locations l on l.organization_id=ct.organization_id and l.id=ct.location_id
      where ct.organization_id=${input.organizationId}::uuid and ct.status='active' and ${inLocations(sql`ct.location_id`)}
      order by ct.name, ct.id limit 300`);
    const groups = await rows<{ id: string; name: string; location_id: string; location_name: string }>(tx, sql`select gr.id::text, gr.name, gr.location_id::text, l.name as location_name
      from zaltyko.groups gr join zaltyko.locations l on l.organization_id=gr.organization_id and l.id=gr.location_id
      where gr.organization_id=${input.organizationId}::uuid and gr.status='active' and ${inLocations(sql`gr.location_id`)}
      order by gr.name, gr.id limit 300`);
    const upcoming = await rows<{
      id: string; class_name: string; location_name: string; timezone: string; starts_at: string | Date; ends_at: string | Date; location_id: string;
    }>(tx, sql`select s.id::text, ct.name as class_name, l.name as location_name, l.timezone, s.starts_at, s.ends_at, s.location_id::text
      from zaltyko.sessions s
      join zaltyko.class_templates ct on ct.organization_id=s.organization_id and ct.id=s.class_template_id
      join zaltyko.locations l on l.organization_id=s.organization_id and l.id=s.location_id
      where s.organization_id=${input.organizationId}::uuid and s.status='scheduled' and ${inLocations(sql`s.location_id`)}
        and s.starts_at > clock_timestamp() and s.starts_at < clock_timestamp() + make_interval(days => ${UPCOMING_DAYS})
      order by s.starts_at, s.id limit ${UPCOMING_LIMIT}`);
    return {
      notices: notices.map((notice) => ({
        id: notice.id,
        kind: notice.kind,
        title: notice.title,
        body: notice.body,
        createdAt: iso(notice.created_at),
        locationName: notice.location_name,
        targetName: notice.target_name,
        recipients: recipients
          .filter((recipient) => recipient.notice_id === notice.id)
          .map((recipient) => ({
            guardianName: `${recipient.given_name} ${recipient.family_name}`.trim(),
            readAt: recipient.read_at ? iso(recipient.read_at) : null,
            emailStatus: recipient.email_status,
          })),
      })),
      classes: classes.map((row) => ({ id: row.id, name: row.name, locationId: row.location_id, locationName: row.location_name })),
      groups: groups.map((row) => ({ id: row.id, name: row.name, locationId: row.location_id, locationName: row.location_name })),
      upcomingSessions: upcoming.map((row) => ({
        id: row.id,
        className: row.class_name,
        locationName: row.location_name,
        timezone: row.timezone,
        startsAt: iso(row.starts_at),
        endsAt: iso(row.ends_at),
        locationId: row.location_id,
      })),
    };
  });
}

