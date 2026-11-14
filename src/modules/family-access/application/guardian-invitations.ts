import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";

import { getAppUrl } from "@/lib/env";
import { sendEmailWithLogging } from "@/lib/email/email-service";
import { logger } from "@/lib/logger";
import type { OperationalActor } from "@/modules/shared/application/actor";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { appendAuditEntry, lockCommand } from "@/modules/shared/infrastructure/transactional-records";
import { TEAM_VERIFIED_EMAIL_OAUTH_PROVIDERS } from "@/modules/staff/domain/team-access-contract";
import { sha256Hex } from "@/modules/family-access/domain/family-access-hash";
import {
  FAMILY_BULK_INVITATION_LIMIT,
  FAMILY_INVITATION_RESEND_COOLDOWN_MINUTES,
  FAMILY_INVITATION_TTL_DAYS,
  familyAccessCommandSchema,
  familyIdempotencyKeySchema,
  familyInvitationEmail,
  familyInvitationUrl,
  familyTokenSchema,
  guardianPortalActions,
  guardianPortalStatus,
  type FamilyAccessCommand,
  type GuardianPortalStatus,
} from "@/modules/family-access/domain/family-access-contract";
import {
  assertFamilyManager,
  assertOrganizationOperational,
  auditKey,
  familyAccessTransaction,
  fingerprint,
  iso,
  priorCommand,
  rows,
  type Tx,
} from "@/modules/family-access/application/family-access-shared";

/** Hasta mil tutores por academia en el listado; más se registra, nunca se trunca en silencio. */
const MAX_GUARDIANS = 1000;

/**
 * Una sola respuesta para todo enlace inservible: desconocido, usado,
 * revocado, caducado, de otra cuenta o con el correo cambiado. Nadie puede
 * saber cuál de esos casos se dio.
 */
const invalidInvitation = () =>
  new OperationalError(
    "NOT_FOUND",
    "Este enlace de invitación no es válido para tu cuenta. Puede haber caducado, haberse usado o haberse sustituido: pide uno nuevo a tu academia.",
    404
  );
const conflict = (message: string) => new OperationalError("INVALID_STATE_TRANSITION", message, 409);

export type OwnerGuardianAccessRow = {
  guardianId: string;
  name: string;
  email: string | null;
  athletes: string[];
  status: GuardianPortalStatus;
  actions: ReturnType<typeof guardianPortalActions>;
  invitation: { id: string; revision: number; expiresAt: string; lastSentAt: string | null; grantViewAthletes: boolean } | null;
  linkedSince: string | null;
  canViewAthletes: boolean;
};

export type OwnerFamilyAccessList = {
  guardians: OwnerGuardianAccessRow[];
  truncated: boolean;
};

export type FamilyAccessCommandResult = {
  action: FamilyAccessCommand["action"];
  replayed: boolean;
  /** Enlace para copiarlo una sola vez (invitar o reenviar a un tutor). Nunca en una repetición. */
  link: string | null;
  emailSent: boolean | null;
  invitationId: string | null;
  counts?: { invited: number; emailed: number; skippedNoEmail: number; skippedExisting: number };
};

type GuardianRow = {
  guardian_id: string;
  given_name: string;
  family_name: string;
  auth_user_id: string | null;
  email: string | null;
  athletes: string[] | null;
  can_view: boolean;
};

type InvitationRow = {
  id: string;
  guardian_id: string;
  normalized_email: string;
  status: "pending" | "accepted" | "revoked";
  grant_view_athletes: boolean;
  expires_at: string | Date;
  revision: number;
  last_sent_at: string | Date | null;
  accepted_at: string | Date | null;
  accepted_by_user_id: string | null;
  organization_id: string;
  expired: boolean;
};

/**
 * Tutores de la academia con al menos un vínculo activo a una familia activa
 * que hoy tiene una gimnasta activa. Correo: el principal de guardian_contacts.
 */
function guardiansQuery(organizationId: string, guardianId?: string) {
  return sql`
    select g.id::text as guardian_id, p.given_name, p.family_name, g.auth_user_id::text,
      (select c.normalized_value from zaltyko.guardian_contacts c
        where c.organization_id=g.organization_id and c.guardian_id=g.id and c.kind='email' and c.is_primary
        limit 1) as email,
      array(
        select distinct coalesce(nullif(btrim(ap.preferred_name),''), ap.given_name) || ' ' || ap.family_name
        from zaltyko.family_guardians fg
        join zaltyko.families f on f.organization_id=fg.organization_id and f.id=fg.family_id and f.is_active
        join zaltyko.family_members fm on fm.organization_id=f.organization_id and fm.family_id=f.id
          and fm.starts_on <= (now() at time zone o.default_timezone)::date
          and (fm.ends_on is null or fm.ends_on >= (now() at time zone o.default_timezone)::date)
        join zaltyko.athletes a on a.organization_id=fm.organization_id and a.id=fm.athlete_id and a.is_active
        join zaltyko.people ap on ap.organization_id=a.organization_id and ap.id=a.person_id
        where fg.organization_id=g.organization_id and fg.guardian_id=g.id and fg.is_active
        order by 1
      ) as athletes,
      exists (select 1 from zaltyko.family_guardians fg2
        where fg2.organization_id=g.organization_id and fg2.guardian_id=g.id and fg2.is_active and fg2.can_view_athletes) as can_view
    from zaltyko.guardians g
    join zaltyko.organizations o on o.id=g.organization_id
    join zaltyko.people p on p.organization_id=g.organization_id and p.id=g.person_id
    where g.organization_id=${organizationId}::uuid and g.is_active
      ${guardianId ? sql`and g.id=${guardianId}::uuid` : sql``}
      and exists (
        select 1 from zaltyko.family_guardians fg
        join zaltyko.families f on f.organization_id=fg.organization_id and f.id=fg.family_id and f.is_active
        join zaltyko.family_members fm on fm.organization_id=f.organization_id and fm.family_id=f.id
          and fm.starts_on <= (now() at time zone o.default_timezone)::date
          and (fm.ends_on is null or fm.ends_on >= (now() at time zone o.default_timezone)::date)
        join zaltyko.athletes a on a.organization_id=fm.organization_id and a.id=fm.athlete_id and a.is_active
        where fg.organization_id=g.organization_id and fg.guardian_id=g.id and fg.is_active
      )
    order by p.family_name, p.given_name, g.id
  `;
}

async function latestInvitations(tx: Tx, organizationId: string, guardianIds: string[]): Promise<Map<string, InvitationRow>> {
  if (guardianIds.length === 0) return new Map();
  const list = await rows<InvitationRow>(tx, sql`
    select distinct on (i.guardian_id) i.id::text, i.guardian_id::text, i.normalized_email, i.status, i.grant_view_athletes,
      i.expires_at, i.revision, i.last_sent_at, i.accepted_at, i.accepted_by_user_id::text, i.organization_id::text,
      (i.expires_at <= clock_timestamp()) as expired
    from zaltyko.guardian_access_invitations i
    where i.organization_id=${organizationId}::uuid
      and i.guardian_id in (${sql.join(guardianIds.map((id) => sql`${id}::uuid`), sql`,`)})
    order by i.guardian_id, i.created_at desc, i.id desc`);
  return new Map(list.map((row): [string, InvitationRow] => [row.guardian_id, row]));
}

function accessRow(guardian: GuardianRow, invitation: InvitationRow | undefined, now: Date): OwnerGuardianAccessRow {
  const status = guardianPortalStatus({
    hasLinkedAccount: guardian.auth_user_id !== null,
    latestInvitation: invitation ? { status: invitation.status, expiresAt: iso(invitation.expires_at) } : null,
    now,
  });
  return {
    guardianId: guardian.guardian_id,
    name: `${guardian.given_name} ${guardian.family_name}`.trim(),
    email: guardian.email,
    athletes: guardian.athletes ?? [],
    status,
    actions: guardianPortalActions(status, guardian.email !== null),
    invitation: invitation
      ? {
          id: invitation.id,
          revision: invitation.revision,
          expiresAt: iso(invitation.expires_at),
          lastSentAt: invitation.last_sent_at ? iso(invitation.last_sent_at) : null,
          grantViewAthletes: invitation.grant_view_athletes,
        }
      : null,
    linkedSince: guardian.auth_user_id !== null && invitation?.status === "accepted" && invitation.accepted_at ? iso(invitation.accepted_at) : null,
    canViewAthletes: guardian.can_view,
  };
}

export async function listOwnerFamilyAccess(input: {
  organizationId: string;
  locationId: string;
  actor: OperationalActor;
}): Promise<OwnerFamilyAccessList> {
  return familyAccessTransaction(async (tx) => {
    await assertFamilyManager(tx, { ...input, allSites: true });
    const guardians = await rows<GuardianRow>(tx, sql`${guardiansQuery(input.organizationId)} limit ${MAX_GUARDIANS + 1}`);
    const truncated = guardians.length > MAX_GUARDIANS;
    if (truncated) logger.error("family_access.guardians_truncated", undefined, { limit: MAX_GUARDIANS });
    const kept = guardians.slice(0, MAX_GUARDIANS);
    const latest = await latestInvitations(tx, input.organizationId, kept.map((row) => row.guardian_id));
    const now = new Date();
    return { guardians: kept.map((row) => accessRow(row, latest.get(row.guardian_id), now)), truncated };
  });
}

type PendingEmail = { email: string; token: string; expiresAt: Date; invitationId: string };

async function readGuardian(tx: Tx, organizationId: string, guardianId: string, lock: boolean): Promise<GuardianRow> {
  if (lock) {
    await tx.execute(sql`select id from zaltyko.guardians where organization_id=${organizationId}::uuid and id=${guardianId}::uuid for update`);
  }
  const found = await rows<GuardianRow>(tx, guardiansQuery(organizationId, guardianId));
  const guardian = found[0];
  if (!guardian) throw new OperationalError("NOT_FOUND", "El tutor no está activo o no tiene una familia activa en esta academia.", 404);
  return guardian;
}

async function readInvitation(tx: Tx, organizationId: string, invitationId: string, lock: boolean): Promise<InvitationRow> {
  const found = await rows<InvitationRow>(tx, sql`select id::text, guardian_id::text, normalized_email, status, grant_view_athletes,
      expires_at, revision, last_sent_at, accepted_at, accepted_by_user_id::text, organization_id::text,
      (expires_at <= clock_timestamp()) as expired
    from zaltyko.guardian_access_invitations
    where organization_id=${organizationId}::uuid and id=${invitationId}::uuid ${lock ? sql`for update` : sql``}`);
  const row = found[0];
  if (!row) throw new OperationalError("NOT_FOUND", "Invitación no encontrada", 404);
  return row;
}

async function createInvitation(tx: Tx, input: {
  organizationId: string;
  guardian: GuardianRow;
  actor: OperationalActor;
  grantViewAthletes: boolean;
}): Promise<PendingEmail> {
  if (!input.guardian.email) throw conflict("El tutor no tiene un correo principal. Añádelo en sus contactos antes de invitarle.");
  if (input.guardian.auth_user_id) throw conflict("Este tutor ya tiene acceso al portal.");
  const pending = await rows<{ id: string }>(tx, sql`select id::text from zaltyko.guardian_access_invitations
    where organization_id=${input.organizationId}::uuid and guardian_id=${input.guardian.guardian_id}::uuid and status='pending'`);
  if (pending.length) throw conflict("Ya hay una invitación pendiente para este tutor. Reenvíala o revócala.");
  const token = randomBytes(32).toString("base64url");
  const inserted = await rows<{ id: string; expires_at: string | Date }>(tx, sql`insert into zaltyko.guardian_access_invitations
      (organization_id, guardian_id, normalized_email, grant_view_athletes, invited_by_member_id, token_sha256, expires_at, last_sent_at)
    values (${input.organizationId}::uuid, ${input.guardian.guardian_id}::uuid, ${input.guardian.email}, ${input.grantViewAthletes},
      ${input.actor.memberId}::uuid, ${sha256Hex(token)}, clock_timestamp() + make_interval(days => ${FAMILY_INVITATION_TTL_DAYS}), clock_timestamp())
    returning id::text, expires_at`);
  const row = inserted[0];
  if (!row) throw new OperationalError("FEATURE_NOT_AVAILABLE", "No se pudo crear la invitación.", 503);
  return { email: input.guardian.email, token, expiresAt: new Date(row.expires_at), invitationId: row.id };
}

async function audit(tx: Tx, input: {
  organizationId: string;
  actor: OperationalActor;
  action: string;
  targetType: string;
  targetId: string | null;
  key: string;
  requestHash: string;
  result: Record<string, unknown>;
  after?: Record<string, unknown>;
}) {
  await appendAuditEntry(tx, {
    organizationId: input.organizationId,
    locationId: null,
    actorUserId: input.actor.userId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    idempotencyKey: input.key,
    after: input.after ?? null,
    metadata: { requestHash: input.requestHash, result: input.result, memberId: input.actor.memberId },
  });
}

async function deliverInvitation(organizationName: string, mail: PendingEmail): Promise<boolean> {
  const url = familyInvitationUrl(getAppUrl(), mail.token);
  const message = familyInvitationEmail({ academyName: organizationName, url, expiresAt: mail.expiresAt });
  try {
    return await sendEmailWithLogging({
      to: mail.email,
      subject: message.subject,
      html: message.html,
      text: message.text,
      template: "family_portal_invitation",
      // Un envío por token: reenviar rota el token y vuelve a enviar.
      dedupeKey: `family-invitation:${sha256Hex(mail.token)}`,
      metadata: { invitationId: mail.invitationId },
    });
  } catch (error) {
    logger.error("family_access.invitation_email_failed", error instanceof Error ? error : undefined, { invitationId: mail.invitationId });
    return false;
  }
}

/**
 * Comandos de la academia sobre el acceso de familias. Cada uno: bandera,
 * candidato, cerrojo del comando, autorización repetida dentro, auditoría con
 * la clave de idempotencia y, después de confirmar, el correo.
 */
export async function runFamilyAccessCommand(input: {
  actor: OperationalActor;
  command: unknown;
  idempotencyKey: string;
}): Promise<FamilyAccessCommandResult> {
  const command = familyAccessCommandSchema.parse(input.command);
  const clientKey = familyIdempotencyKeySchema.parse(input.idempotencyKey);
  const key = auditKey("family_access", input.actor.userId, clientKey);
  const requestHash = fingerprint(command);
  const mails: PendingEmail[] = [];
  let organizationName = "";

  const result = await familyAccessTransaction(async (tx): Promise<FamilyAccessCommandResult> => {
    await lockCommand(tx, command.organizationId, `${input.actor.userId}:family-access:${clientKey}`);
    const reducesAccess = command.action === "revoke" || command.action === "remove_access";
    await assertFamilyManager(tx, { organizationId: command.organizationId, locationId: command.locationId, actor: input.actor, allSites: true, write: !reducesAccess });
    const prior = await priorCommand(tx, { organizationId: command.organizationId, key, requestHash });
    if (prior) {
      const counts = prior.counts as FamilyAccessCommandResult["counts"] | undefined;
      return {
        action: command.action,
        replayed: true,
        link: null,
        emailSent: null,
        invitationId: typeof prior.invitationId === "string" ? prior.invitationId : null,
        ...(counts ? { counts } : {}),
      };
    }
    // Revocar o retirar acceso sigue siendo posible en una academia inactiva:
    // solo quita acceso.
    const organization = reducesAccess ? null : await assertOrganizationOperational(tx, command.organizationId);
    organizationName = organization?.name ?? "";

    if (command.action === "invite") {
      const guardian = await readGuardian(tx, command.organizationId, command.guardianId, true);
      const mail = await createInvitation(tx, { organizationId: command.organizationId, guardian, actor: input.actor, grantViewAthletes: command.grantViewAthletes });
      mails.push(mail);
      const stored = { action: command.action, invitationId: mail.invitationId, emailSent: null };
      await audit(tx, { organizationId: command.organizationId, actor: input.actor, action: "family_access.invitation_invite", targetType: "guardian_access_invitation", targetId: mail.invitationId, key, requestHash, result: stored, after: { guardianId: guardian.guardian_id, grantViewAthletes: command.grantViewAthletes } });
      return { ...stored, replayed: false, link: familyInvitationUrl(getAppUrl(), mail.token) };
    }

    if (command.action === "invite_all") {
      const guardians = await rows<GuardianRow>(tx, sql`${guardiansQuery(command.organizationId)} limit ${MAX_GUARDIANS}`);
      const latest = await latestInvitations(tx, command.organizationId, guardians.map((row) => row.guardian_id));
      let skippedNoEmail = 0;
      let skippedExisting = 0;
      for (const guardian of guardians) {
        if (!guardian.email) { skippedNoEmail += 1; continue; }
        const last = latest.get(guardian.guardian_id);
        if (guardian.auth_user_id || last?.status === "pending") { skippedExisting += 1; continue; }
        if (mails.length >= FAMILY_BULK_INVITATION_LIMIT) { skippedExisting += 1; continue; }
        await tx.execute(sql`select id from zaltyko.guardians where organization_id=${command.organizationId}::uuid and id=${guardian.guardian_id}::uuid for update`);
        mails.push(await createInvitation(tx, { organizationId: command.organizationId, guardian, actor: input.actor, grantViewAthletes: command.grantViewAthletes }));
      }
      const counts = { invited: mails.length, emailed: 0, skippedNoEmail, skippedExisting };
      const stored = { action: command.action, invitationId: null, emailSent: null, counts };
      await audit(tx, { organizationId: command.organizationId, actor: input.actor, action: "family_access.invitation_invite_all", targetType: "organization", targetId: command.organizationId, key, requestHash, result: stored, after: { grantViewAthletes: command.grantViewAthletes, invited: mails.length } });
      return { ...stored, replayed: false, link: null };
    }

    if (command.action === "resend") {
      const invitation = await readInvitation(tx, command.organizationId, command.invitationId, true);
      if (invitation.revision !== command.revision) throw new OperationalError("VERSION_CONFLICT", "La invitación cambió. Actualiza el listado antes de continuar.", 409);
      if (invitation.status !== "pending") throw conflict("La invitación ya no está pendiente.");
      const guardian = await readGuardian(tx, command.organizationId, invitation.guardian_id, true);
      if (guardian.auth_user_id) throw conflict("Este tutor ya tiene acceso al portal.");
      if (!guardian.email) throw conflict("El tutor ya no tiene un correo principal. Añádelo antes de reenviar.");
      const recent = await rows<{ recent: boolean }>(tx, sql`select (last_sent_at is not null and last_sent_at > clock_timestamp() - make_interval(mins => ${FAMILY_INVITATION_RESEND_COOLDOWN_MINUTES})) as recent
        from zaltyko.guardian_access_invitations where organization_id=${command.organizationId}::uuid and id=${invitation.id}::uuid`);
      if (recent[0]?.recent) throw new OperationalError("INVALID_STATE_TRANSITION", `Espera ${FAMILY_INVITATION_RESEND_COOLDOWN_MINUTES} minutos entre dos envíos de la misma invitación.`, 429);
      const token = randomBytes(32).toString("base64url");
      // Reenviar rota el token (el enlace anterior deja de valer), renueva la
      // caducidad y toma el correo principal actual del tutor.
      const updated = await rows<{ expires_at: string | Date }>(tx, sql`update zaltyko.guardian_access_invitations
        set token_sha256=${sha256Hex(token)}, normalized_email=${guardian.email}, invited_by_member_id=${input.actor.memberId}::uuid,
          expires_at=clock_timestamp() + make_interval(days => ${FAMILY_INVITATION_TTL_DAYS}), last_sent_at=clock_timestamp(),
          revision=revision+1, updated_at=clock_timestamp()
        where organization_id=${command.organizationId}::uuid and id=${invitation.id}::uuid returning expires_at`);
      const mail = { email: guardian.email, token, expiresAt: new Date(updated[0]!.expires_at), invitationId: invitation.id };
      mails.push(mail);
      const stored = { action: command.action, invitationId: invitation.id, emailSent: null };
      await audit(tx, { organizationId: command.organizationId, actor: input.actor, action: "family_access.invitation_resend", targetType: "guardian_access_invitation", targetId: invitation.id, key, requestHash, result: stored, after: { revision: invitation.revision + 1 } });
      return { ...stored, replayed: false, link: familyInvitationUrl(getAppUrl(), token) };
    }

    if (command.action === "revoke") {
      const invitation = await readInvitation(tx, command.organizationId, command.invitationId, true);
      if (invitation.revision !== command.revision) throw new OperationalError("VERSION_CONFLICT", "La invitación cambió. Actualiza el listado antes de continuar.", 409);
      if (invitation.status !== "pending") throw conflict("La invitación ya no está pendiente.");
      await tx.execute(sql`update zaltyko.guardian_access_invitations
        set status='revoked', revoked_by_member_id=${input.actor.memberId}::uuid, revoked_at=clock_timestamp(),
          revision=revision+1, updated_at=clock_timestamp()
        where organization_id=${command.organizationId}::uuid and id=${invitation.id}::uuid`);
      const stored = { action: command.action, invitationId: invitation.id, emailSent: null };
      await audit(tx, { organizationId: command.organizationId, actor: input.actor, action: "family_access.invitation_revoke", targetType: "guardian_access_invitation", targetId: invitation.id, key, requestHash, result: stored });
      return { ...stored, replayed: false, link: null };
    }

    // remove_access: la cuenta deja de estar vinculada; el portal deja de
    // mostrar datos en la siguiente petición (sin caché). El permiso de ver
    // gimnastas del vínculo familiar no se toca.
    const locked = await rows<{ auth_user_id: string | null }>(tx, sql`select auth_user_id::text from zaltyko.guardians
      where organization_id=${command.organizationId}::uuid and id=${command.guardianId}::uuid for update`);
    if (!locked[0]) throw new OperationalError("NOT_FOUND", "Tutor no encontrado", 404);
    if (!locked[0].auth_user_id) throw conflict("Este tutor no tiene una cuenta vinculada.");
    await tx.execute(sql`update zaltyko.guardians set auth_user_id=null, updated_at=clock_timestamp()
      where organization_id=${command.organizationId}::uuid and id=${command.guardianId}::uuid`);
    const stored = { action: command.action, invitationId: null, emailSent: null };
    await audit(tx, { organizationId: command.organizationId, actor: input.actor, action: "family_access.access_removed", targetType: "guardian", targetId: command.guardianId, key, requestHash, result: stored });
    return { ...stored, replayed: false, link: null };
  });

  if (result.replayed || mails.length === 0) return result;
  let emailed = 0;
  for (const mail of mails) {
    if (await deliverInvitation(organizationName, mail)) emailed += 1;
  }
  if (result.counts) return { ...result, counts: { ...result.counts, emailed } };
  return { ...result, emailSent: emailed === 1 };
}

// ---------------------------------------------------------------------------
// Lado de la familia: revisar y aceptar
// ---------------------------------------------------------------------------

/**
 * Correo verificado de la cuenta de Auth, nunca el de un cuerpo o de los
 * metadatos de sesión. Mismo criterio que el acceso de equipo: identidad de
 * correo con confirmación obligatoria, o un proveedor OAuth de la lista que
 * declara email_verified=true.
 */
async function confirmedEmail(tx: Tx, userId: string): Promise<string> {
  const found = await rows<{ email: string }>(tx, sql`select lower(btrim(email)) as email from auth.users
    where id=${userId}::uuid and email_confirmed_at is not null and email is not null and btrim(email)<>'' for share`);
  const email = found[0]?.email;
  if (!email) throw invalidInvitation();
  const providers = sql.join(TEAM_VERIFIED_EMAIL_OAUTH_PROVIDERS.map((provider) => sql`${provider}`), sql`,`);
  const verified = await rows<{ ok: boolean }>(tx, sql`select exists (
      select 1 from auth.identities i
      where i.user_id=${userId}::uuid and lower(btrim(i.identity_data->>'email'))=${email}
        and (i.provider='email'
          or (i.provider in (${providers}) and lower(coalesce(i.identity_data->>'email_verified','false'))='true'))
    ) as ok`);
  if (verified[0]?.ok !== true) throw invalidInvitation();
  return email;
}

async function invitationByToken(tx: Tx, token: string, lock: boolean): Promise<InvitationRow> {
  const target = await rows<{ id: string; organization_id: string }>(tx, sql`select id::text, organization_id::text
    from zaltyko.guardian_access_invitations where token_sha256=${sha256Hex(token)}`);
  const found = target[0];
  if (!found) throw invalidInvitation();
  const row = await readInvitation(tx, found.organization_id, found.id, lock);
  // El token pudo rotar mientras esperábamos el cerrojo.
  const still = await rows<{ id: string }>(tx, sql`select id::text from zaltyko.guardian_access_invitations
    where organization_id=${row.organization_id}::uuid and id=${row.id}::uuid and token_sha256=${sha256Hex(token)}`);
  if (!still.length) throw invalidInvitation();
  return row;
}

/**
 * El tutor sigue activo, con una familia activa, y su correo principal actual
 * es el de la invitación: si la academia lo corrigió, el enlace viejo no vale.
 */
async function assertGuardianStillMatches(tx: Tx, row: InvitationRow, lock: boolean): Promise<GuardianRow> {
  let guardian: GuardianRow;
  try {
    guardian = await readGuardian(tx, row.organization_id, row.guardian_id, lock);
  } catch {
    throw invalidInvitation();
  }
  if (guardian.email !== row.normalized_email) throw invalidInvitation();
  return guardian;
}

export type FamilyInvitationInspection = { academyName: string; grantViewAthletes: boolean };

/** Solo lectura: ni consume el token ni escribe nada. */
export async function inspectFamilyInvitation(input: { userId: string; token: string }): Promise<FamilyInvitationInspection> {
  familyTokenSchema.parse(input.token);
  return familyAccessTransaction(async (tx) => {
    const email = await confirmedEmail(tx, input.userId);
    const row = await invitationByToken(tx, input.token, false);
    if (row.status !== "pending" || row.expired || row.normalized_email !== email) throw invalidInvitation();
    let organization: { name: string };
    try {
      organization = await assertOrganizationOperational(tx, row.organization_id);
    } catch {
      throw invalidInvitation();
    }
    const guardian = await assertGuardianStillMatches(tx, row, false);
    if (guardian.auth_user_id !== null) throw invalidInvitation();
    return { academyName: organization.name, grantViewAthletes: row.grant_view_athletes };
  });
}

export type FamilyInvitationAcceptance = { academyName: string; replayed: boolean };

export async function acceptFamilyInvitation(input: { userId: string; token: string }): Promise<FamilyInvitationAcceptance> {
  familyTokenSchema.parse(input.token);
  return familyAccessTransaction(async (tx) => {
    // Mismo orden de cerrojos que los comandos de la academia: academia y
    // comando primero, después la fila de la invitación (y el tutor).
    const target = await invitationByToken(tx, input.token, false);
    await lockCommand(tx, target.organization_id, `${input.userId}:family-invitation:${target.id}`);
    const row = await invitationByToken(tx, input.token, true);
    const email = await confirmedEmail(tx, input.userId);
    if (row.normalized_email !== email) throw invalidInvitation();
    let organization: { name: string };
    try {
      organization = await assertOrganizationOperational(tx, row.organization_id);
    } catch {
      throw invalidInvitation();
    }
    const guardian = await assertGuardianStillMatches(tx, row, true);
    // Repetición de la misma aceptación (doble clic, red): mismo resultado,
    // solo si la cuenta sigue vinculada a ese tutor.
    if (row.status === "accepted") {
      if (row.accepted_by_user_id !== input.userId || guardian.auth_user_id !== input.userId) throw invalidInvitation();
      return { academyName: organization.name, replayed: true };
    }
    if (row.status !== "pending" || row.expired) throw invalidInvitation();
    if (guardian.auth_user_id !== null) throw invalidInvitation();
    // Una cuenta es como mucho un tutor por academia (índice único).
    const other = await rows<{ id: string }>(tx, sql`select id::text from zaltyko.guardians
      where organization_id=${row.organization_id}::uuid and auth_user_id=${input.userId}::uuid`);
    if (other.length) throw conflict("Tu cuenta ya está vinculada a otra persona de esta academia. Consulta a la academia.");

    await tx.execute(sql`update zaltyko.guardians set auth_user_id=${input.userId}::uuid, updated_at=clock_timestamp()
      where organization_id=${row.organization_id}::uuid and id=${row.guardian_id}::uuid and auth_user_id is null`);
    if (row.grant_view_athletes) {
      // La academia lo confirmó al invitar: el tutor ve horario, asistencia y avisos.
      await tx.execute(sql`update zaltyko.family_guardians set can_view_athletes=true, updated_at=clock_timestamp()
        where organization_id=${row.organization_id}::uuid and guardian_id=${row.guardian_id}::uuid and is_active and not can_view_athletes`);
    }
    const consumed = await rows<{ id: string }>(tx, sql`update zaltyko.guardian_access_invitations
      set status='accepted', accepted_by_user_id=${input.userId}::uuid, accepted_at=clock_timestamp(),
        revision=revision+1, updated_at=clock_timestamp()
      where organization_id=${row.organization_id}::uuid and id=${row.id}::uuid and status='pending' and expires_at > clock_timestamp()
      returning id::text`);
    // Un cerrojo pudo esperar más allá de la caducidad: se deshace todo.
    if (consumed.length !== 1) throw invalidInvitation();
    await appendAuditEntry(tx, {
      organizationId: row.organization_id,
      locationId: null,
      actorUserId: input.userId,
      action: "family_access.invitation_accept",
      targetType: "guardian_access_invitation",
      targetId: row.id,
      idempotencyKey: `family_access_accept_${row.id}`,
      after: { guardianId: row.guardian_id, grantViewAthletes: row.grant_view_athletes },
      metadata: {},
    });
    return { academyName: organization.name, replayed: false };
  });
}
