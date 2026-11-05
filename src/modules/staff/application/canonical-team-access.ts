import { createHash, randomBytes } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import type { TransactionClient } from "@/lib/db-transactions";
import type { OperationalActor } from "@/modules/shared/application/actor";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { appendAuditEntry, assertIdempotencyPayload, lockCommand } from "@/modules/shared/infrastructure/transactional-records";
import {
  createTeamInvitationSchema, teamIdempotencyKeySchema, teamInvitationIdSchema,
  teamOrganizationSchema, teamTokenSchema,
  type TeamAccess, type TeamInvitation, type TeamInvitationAcceptance,
  type TeamInvitationInspection, type TeamInvitationResult, type TeamInvitationRevokeResult,
  type TeamLocation, type TeamMemberRole, type TeamMemberStatus,
} from "@/modules/staff/domain/team-access-contract";

type Tx = TransactionClient;
type InvitationRow = {
  id: string; organization_id: string; normalized_email: string;
  role: "manager" | "coach"; status: "pending" | "accepted" | "revoked";
  invited_by_member_id: string; expires_at: Date | string; revision: number;
  expired: boolean; accepted_by_user_id: string | null; accepted_member_id: string | null;
};
type Receipt = {
  operation: string; request_hash: string; invitation_id: string;
  invitation_status: InvitationRow["status"]; invitation_revision: number;
  invitation_expires_at: Date | string; member_id: string | null;
};
type OwnerInput = { organizationId: string; actor: OperationalActor };
type CommandInput = OwnerInput & { idempotencyKey: string };
type InvitationCommandInput = CommandInput & { invitationId: string; revision: number };

const unavailable = () => new OperationalError("FEATURE_NOT_AVAILABLE", "El acceso de equipo no está disponible. Inténtalo más tarde.", 503);
const invalidInvitation = () => new OperationalError("NOT_FOUND", "La invitación no está disponible para esta identidad.", 404);
const conflict = (message: string) => new OperationalError("INVALID_STATE_TRANSITION", message, 409);
const digest = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const fingerprint = (value: unknown) => digest(JSON.stringify(value));
const iso = (value: Date | string) => new Date(value).toISOString();

async function query<Row>(tx: Tx, statement: SQL): Promise<{ rows: Row[] }> {
  const result = await tx.execute(statement);
  return { rows: result.rows as unknown as Row[] };
}

/** Default-off, exact server flag; do this before opening any DB connection. */
export function assertTeamAccessEnabled(): void {
  if (process.env.ZALTYKO_TEAM_ACCESS_ENABLED !== "true") throw unavailable();
}

async function transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  assertTeamAccessEnabled();
  try {
    return await db.transaction(async tx => {
      // Missing/partial candidate or unreliable Auth schema fails closed. No
      // error object, SQL parameters, email, or token is logged or returned.
      await tx.execute(sql`select id, organization_id, normalized_email, role, status,
        invited_by_member_id, token_sha256, expires_at, revision, accepted_by_user_id,
        accepted_member_id, accepted_at, revoked_by_member_id, revoked_at, created_at, updated_at
        from zaltyko.organization_member_invitations where false`);
      await tx.execute(sql`select id, organization_id, invitation_id, location_id, created_at
        from zaltyko.organization_member_invitation_scopes where false`);
      await tx.execute(sql`select id, organization_id, actor_user_id, idempotency_key, operation,
        request_hash, invitation_id, invitation_status, invitation_revision, invitation_expires_at,
        member_id, created_at from zaltyko.organization_team_command_receipts where false`);
      return work(tx);
    });
  } catch (error) {
    if (error instanceof OperationalError) throw error;
    throw unavailable();
  }
}

async function organization(tx: Tx, organizationId: string) {
  const result = await query<{ id: string; name: string; status: string }>(tx, sql`
    select id::text,name,status::text from zaltyko.organizations where id=${organizationId}::uuid`);
  const row = result.rows[0];
  if (!row) throw new OperationalError("NOT_FOUND", "Organización no disponible", 404);
  return row;
}

async function assertOperationalOrganization(tx: Tx, organizationId: string) {
  const row = await organization(tx, organizationId);
  if (!["trial", "active"].includes(row.status)) throw conflict("La organización no admite cambios de acceso.");
  return row;
}

async function assertOwner(tx: Tx, input: OwnerInput, lock = false): Promise<void> {
  const result = await tx.execute(sql`select id from zaltyko.organization_members
    where organization_id=${input.organizationId}::uuid and id=${input.actor.memberId}::uuid
      and user_id=${input.actor.userId}::uuid and role='owner' and status='active' and location_scope_mode='all'
    ${lock ? sql`for share` : sql``}`);
  if (result.rows.length !== 1) throw new OperationalError("FORBIDDEN", "Solo un Owner activo con acceso a todas las sedes puede gestionar el equipo.", 403);
}

async function assertInviter(tx: Tx, row: InvitationRow): Promise<void> {
  const result = await tx.execute(sql`select id from zaltyko.organization_members
    where organization_id=${row.organization_id}::uuid and id=${row.invited_by_member_id}::uuid
      and role='owner' and status='active' and location_scope_mode='all' for share`);
  if (result.rows.length !== 1) throw invalidInvitation();
}

async function confirmedEmail(tx: Tx, userId: string): Promise<string> {
  // Auth-owned identity, never a body/session metadata email. The row lock keeps
  // an email/confirmation change from racing acceptance in this transaction.
  const result = await query<{ email: string }>(tx, sql`select lower(btrim(email)) as email from auth.users
    where id=${userId}::uuid and email_confirmed_at is not null and email is not null
      and btrim(email)<>'' for share`);
  const email = result.rows[0]?.email;
  if (!email) throw invalidInvitation();
  return email;
}

async function locationsFor(tx: Tx, row: InvitationRow, requireActive = false): Promise<TeamLocation[]> {
  const result = await query<{ id: string; name: string; is_active: boolean }>(tx, sql`
    select l.id::text,l.name,l.is_active from zaltyko.organization_member_invitation_scopes s
    join zaltyko.locations l on l.organization_id=s.organization_id and l.id=s.location_id
    where s.organization_id=${row.organization_id}::uuid and s.invitation_id=${row.id}::uuid
    order by l.id ${requireActive ? sql`for share of l` : sql``}`);
  if (requireActive && (!result.rows.length || result.rows.some(item => !item.is_active))) throw invalidInvitation();
  return result.rows.map(({ id, name }) => ({ id, name }));
}

async function explicitLocations(tx: Tx, organizationId: string, ids: string[]): Promise<TeamLocation[]> {
  const result = await query<{ id: string; name: string }>(tx, sql`select id::text,name from zaltyko.locations
    where organization_id=${organizationId}::uuid and is_active and id in (${sql.join(ids.map(id => sql`${id}::uuid`), sql`,`)})
    order by id for share`);
  if (result.rows.length !== ids.length) throw new OperationalError("INVALID_RELATION", "Selecciona sedes activas de esta organización.", 400);
  return result.rows;
}

async function readInvitation(tx: Tx, organizationId: string, id: string, lock = false): Promise<InvitationRow> {
  const result = await query<InvitationRow>(tx, sql`select id::text,organization_id::text,normalized_email,role::text,status,
    invited_by_member_id::text,expires_at,revision,(expires_at<=clock_timestamp()) as expired,
    accepted_by_user_id::text,accepted_member_id::text
    from zaltyko.organization_member_invitations
    where organization_id=${organizationId}::uuid and id=${id}::uuid ${lock ? sql`for update` : sql``}`);
  const row = result.rows[0];
  if (!row) throw new OperationalError("NOT_FOUND", "Invitación no encontrada", 404);
  if (!["manager", "coach"].includes(row.role) || !["pending", "accepted", "revoked"].includes(row.status)
    || !Number.isSafeInteger(row.revision) || row.revision < 1 || !Number.isFinite(new Date(row.expires_at).getTime())) throw unavailable();
  return row;
}

async function invitationDto(tx: Tx, row: InvitationRow, receipt?: Receipt): Promise<TeamInvitation> {
  const status = receipt?.invitation_status ?? row.status;
  const expiresAt = iso(receipt?.invitation_expires_at ?? row.expires_at);
  return { id: row.id, email: row.normalized_email, role: row.role, status,
    expired: status === "pending" && new Date(expiresAt).getTime() <= Date.now(), expiresAt,
    revision: receipt?.invitation_revision ?? row.revision, requestedLocations: await locationsFor(tx, row) };
}

async function priorReceipt(tx: Tx, input: { organizationId: string; userId: string; key: string; operation: string; hash: string }): Promise<Receipt | null> {
  const result = await query<Receipt>(tx, sql`select operation,request_hash,invitation_id::text,invitation_status,
    invitation_revision,invitation_expires_at,member_id::text from zaltyko.organization_team_command_receipts
    where organization_id=${input.organizationId}::uuid and actor_user_id=${input.userId}::uuid and idempotency_key=${input.key}`);
  const prior = result.rows[0];
  if (!prior) return null;
  assertIdempotencyPayload({ operation: prior.operation, request_hash: prior.request_hash }, { operation: input.operation, request_hash: input.hash });
  return prior;
}

async function record(tx: Tx, input: { row: InvitationRow; userId: string; key: string; operation: string; hash: string; memberId?: string; locationIds?: string[] }): Promise<void> {
  const { row } = input;
  const owners = await query<{ count: number }>(tx, sql`select count(*)::int as count from zaltyko.organization_members
    where organization_id=${row.organization_id}::uuid and role='owner' and status='active'`);
  if (!owners.rows[0]?.count) throw conflict("La organización debe conservar al menos un Owner activo.");
  await tx.execute(sql`insert into zaltyko.organization_team_command_receipts
    (organization_id,actor_user_id,idempotency_key,operation,request_hash,invitation_id,invitation_status,invitation_revision,invitation_expires_at,member_id)
    values (${row.organization_id}::uuid,${input.userId}::uuid,${input.key},${input.operation},${input.hash},${row.id}::uuid,
      ${row.status},${row.revision},${iso(row.expires_at)}::timestamptz,${input.memberId ?? null}::uuid)`);
  await appendAuditEntry(tx, { organizationId: row.organization_id, locationId: null,
    actorUserId: input.userId, action: `team.invitation_${input.operation}`, targetType: "organization_member_invitation",
    targetId: row.id, idempotencyKey: `team_${digest(`${input.userId}:${input.key}`)}`, after: { status: row.status, revision: row.revision,
      ...(input.memberId ? { memberId: input.memberId } : {}) }, metadata: { locationIds: input.locationIds ?? [] } });
}

function ownerCommand(input: CommandInput, operation: string, command: Record<string, unknown>) {
  teamOrganizationSchema.parse({ organizationId: input.organizationId });
  const key = digest(teamIdempotencyKeySchema.parse(input.idempotencyKey));
  return { key, operation, hash: fingerprint({ operation, organizationId: input.organizationId, ...command }) };
}

async function lockOwnerCommand(tx: Tx, input: CommandInput, key: string): Promise<void> {
  // Consistent order with every canonical writer: organization, command, member,
  // invitation, scopes. Authorization is repeated after the organization lock.
  await lockCommand(tx, input.organizationId, `${input.actor.userId}:team:${key}`);
  await assertOwner(tx, input, true);
}

export async function listCanonicalTeamAccess(input: OwnerInput): Promise<TeamAccess> {
  teamOrganizationSchema.parse({ organizationId: input.organizationId });
  return transaction(async tx => {
    await assertOwner(tx, input);
    const org = await organization(tx, input.organizationId);
    const active = await query<TeamLocation>(tx, sql`select id::text,name from zaltyko.locations
      where organization_id=${input.organizationId}::uuid and is_active order by id`);
    const invitations = await query<{ id: string }>(tx, sql`select id::text from zaltyko.organization_member_invitations
      where organization_id=${input.organizationId}::uuid order by created_at,id`);
    const memberRows = await query<{ id: string; role: TeamMemberRole; status: TeamMemberStatus; location_scope_mode: "all" | "selected" }>(tx, sql`
      select id::text,role::text,status::text,location_scope_mode::text from zaltyko.organization_members
      where organization_id=${input.organizationId}::uuid order by created_at,id`);
    const members: TeamAccess["members"] = [];
    for (const member of memberRows.rows) {
      let effectiveLocations: TeamLocation[] = [];
      if (member.status === "active" && ["active", "trial"].includes(org.status)) {
        if (member.location_scope_mode === "all") effectiveLocations = active.rows;
        else {
          const scopes = await query<TeamLocation>(tx, sql`select l.id::text,l.name from zaltyko.member_location_scopes s
            join zaltyko.locations l on l.organization_id=s.organization_id and l.id=s.location_id
            where s.organization_id=${input.organizationId}::uuid and s.member_id=${member.id}::uuid and l.is_active order by l.id`);
          effectiveLocations = scopes.rows;
        }
      }
      members.push({ id: member.id, role: member.role, status: member.status, locationScopeMode: member.location_scope_mode, effectiveLocations });
    }
    const invitationDtos: TeamInvitation[] = [];
    for (const { id } of invitations.rows) invitationDtos.push(await invitationDto(tx, await readInvitation(tx, input.organizationId, id)));
    return { organization: { id: org.id, name: org.name }, activeLocations: active.rows, invitations: invitationDtos, members };
  });
}

export async function createCanonicalTeamInvitation(input: CommandInput & { email: string; role: "manager" | "coach"; locationIds: string[] }): Promise<TeamInvitationResult> {
  const parsed = createTeamInvitationSchema.parse({ organizationId: input.organizationId, email: input.email, role: input.role, locationIds: input.locationIds });
  const command = ownerCommand(input, "invite", { email: parsed.email, role: parsed.role, locationIds: parsed.locationIds });
  return transaction(async tx => {
    await lockOwnerCommand(tx, input, command.key);
    const prior = await priorReceipt(tx, { organizationId: input.organizationId, userId: input.actor.userId, ...command });
    if (prior) return { invitation: await invitationDto(tx, await readInvitation(tx, input.organizationId, prior.invitation_id), prior), token: null, replayed: true };
    await assertOperationalOrganization(tx, input.organizationId);
    await explicitLocations(tx, input.organizationId, parsed.locationIds);
    const duplicate = await tx.execute(sql`select id from zaltyko.organization_member_invitations
      where organization_id=${input.organizationId}::uuid and normalized_email=${parsed.email} and status='pending'`);
    if (duplicate.rows.length) throw conflict("Ya existe una invitación pendiente para este correo. Reemítela de forma explícita.");
    const token = randomBytes(32).toString("base64url");
    const inserted = await query<{ id: string }>(tx, sql`insert into zaltyko.organization_member_invitations
      (organization_id,normalized_email,role,invited_by_member_id,token_sha256,expires_at)
      values (${input.organizationId}::uuid,${parsed.email},${parsed.role},${input.actor.memberId}::uuid,${digest(token)},clock_timestamp()+interval '7 days') returning id::text`);
    const id = inserted.rows[0]?.id;
    if (!id) throw unavailable();
    for (const locationId of parsed.locationIds) await tx.execute(sql`insert into zaltyko.organization_member_invitation_scopes
      (organization_id,invitation_id,location_id) values (${input.organizationId}::uuid,${id}::uuid,${locationId}::uuid)`);
    const row = await readInvitation(tx, input.organizationId, id);
    await record(tx, { row, userId: input.actor.userId, ...command, locationIds: parsed.locationIds });
    return { invitation: await invitationDto(tx, row), token, replayed: false };
  });
}

function validateVersion(row: InvitationRow, revision: number): void {
  if (row.revision !== revision) throw new OperationalError("VERSION_CONFLICT", "La invitación cambió. Actualiza el listado antes de continuar.", 409);
  if (row.status !== "pending") throw conflict("La invitación ya no está pendiente.");
}

export async function reissueCanonicalTeamInvitation(input: InvitationCommandInput): Promise<TeamInvitationResult> {
  teamInvitationIdSchema.parse(input.invitationId);
  if (!Number.isSafeInteger(input.revision) || input.revision < 1) throw new OperationalError("INVALID_RELATION", "Revisión inválida", 400);
  const command = ownerCommand(input, "reissue", { invitationId: input.invitationId, revision: input.revision });
  return transaction(async tx => {
    await lockOwnerCommand(tx, input, command.key);
    const prior = await priorReceipt(tx, { organizationId: input.organizationId, userId: input.actor.userId, ...command });
    if (prior) return { invitation: await invitationDto(tx, await readInvitation(tx, input.organizationId, prior.invitation_id), prior), token: null, replayed: true };
    const row = await readInvitation(tx, input.organizationId, input.invitationId, true);
    validateVersion(row, input.revision);
    await assertOperationalOrganization(tx, input.organizationId);
    const scopes = await locationsFor(tx, row, true);
    const token = randomBytes(32).toString("base64url");
    await tx.execute(sql`update zaltyko.organization_member_invitations set token_sha256=${digest(token)},
      invited_by_member_id=${input.actor.memberId}::uuid,expires_at=clock_timestamp()+interval '7 days',revision=revision+1,updated_at=clock_timestamp()
      where organization_id=${input.organizationId}::uuid and id=${input.invitationId}::uuid`);
    const updated = await readInvitation(tx, input.organizationId, input.invitationId);
    await record(tx, { row: updated, userId: input.actor.userId, ...command, locationIds: scopes.map(item => item.id) });
    return { invitation: await invitationDto(tx, updated), token, replayed: false };
  });
}

export async function revokeCanonicalTeamInvitation(input: InvitationCommandInput): Promise<TeamInvitationRevokeResult> {
  teamInvitationIdSchema.parse(input.invitationId);
  if (!Number.isSafeInteger(input.revision) || input.revision < 1) throw new OperationalError("INVALID_RELATION", "Revisión inválida", 400);
  const command = ownerCommand(input, "revoke", { invitationId: input.invitationId, revision: input.revision });
  return transaction(async tx => {
    await lockOwnerCommand(tx, input, command.key);
    const prior = await priorReceipt(tx, { organizationId: input.organizationId, userId: input.actor.userId, ...command });
    if (prior) return { id: prior.invitation_id, status: "revoked", revision: prior.invitation_revision, replayed: true };
    const row = await readInvitation(tx, input.organizationId, input.invitationId, true);
    validateVersion(row, input.revision);
    // Revoking a pending invitation remains possible for expired/inactive orgs;
    // it only removes possible access and never revokes an existing membership.
    await tx.execute(sql`update zaltyko.organization_member_invitations set status='revoked',revoked_by_member_id=${input.actor.memberId}::uuid,
      revoked_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp()
      where organization_id=${input.organizationId}::uuid and id=${input.invitationId}::uuid`);
    const updated = await readInvitation(tx, input.organizationId, input.invitationId);
    await record(tx, { row: updated, userId: input.actor.userId, ...command });
    return { id: updated.id, status: "revoked", revision: updated.revision, replayed: false };
  });
}

async function tokenTarget(tx: Tx, token: string): Promise<{ id: string; organization_id: string }> {
  const result = await query<{ id: string; organization_id: string }>(tx, sql`select id::text,organization_id::text
    from zaltyko.organization_member_invitations where token_sha256=${digest(token)}`);
  const target = result.rows[0];
  if (!target) throw invalidInvitation();
  return target;
}

async function assertTokenStillMatches(tx: Tx, row: InvitationRow, token: string): Promise<void> {
  const result = await tx.execute(sql`select id from zaltyko.organization_member_invitations
    where organization_id=${row.organization_id}::uuid and id=${row.id}::uuid and token_sha256=${digest(token)}`);
  if (!result.rows.length) throw invalidInvitation();
}

function assertPendingIdentity(row: InvitationRow, email: string): void {
  if (row.normalized_email !== email || row.status !== "pending") throw invalidInvitation();
  if (row.expired) throw new OperationalError("INVALID_STATE_TRANSITION", "Esta invitación ha caducado. Solicita una nueva al Owner.", 410);
}

/** Read-only: no audit insert, receipt, token consumption, or membership write. */
export async function inspectCanonicalTeamInvitation(input: { userId: string; token: string }): Promise<TeamInvitationInspection> {
  teamTokenSchema.parse(input.token);
  return transaction(async tx => {
    const email = await confirmedEmail(tx, input.userId);
    const target = await tokenTarget(tx, input.token);
    const row = await readInvitation(tx, target.organization_id, target.id);
    await assertTokenStillMatches(tx, row, input.token);
    assertPendingIdentity(row, email);
    const org = await assertOperationalOrganization(tx, row.organization_id);
    await assertInviter(tx, row);
    return { organization: { id: org.id, name: org.name }, role: row.role, locations: await locationsFor(tx, row, true) };
  });
}

export async function acceptCanonicalTeamInvitation(input: { userId: string; token: string; idempotencyKey: string }): Promise<TeamInvitationAcceptance> {
  teamTokenSchema.parse(input.token);
  const key = digest(teamIdempotencyKeySchema.parse(input.idempotencyKey));
  return transaction(async tx => {
    const target = await tokenTarget(tx, input.token);
    await lockCommand(tx, target.organization_id, `${input.userId}:team:${key}`);
    const row = await readInvitation(tx, target.organization_id, target.id, true);
    await assertTokenStillMatches(tx, row, input.token);
    const email = await confirmedEmail(tx, input.userId);
    if (row.normalized_email !== email) throw invalidInvitation();
    const hash = fingerprint({ operation: "accept", organizationId: row.organization_id, invitationId: row.id });
    const prior = await priorReceipt(tx, { organizationId: row.organization_id, userId: input.userId, key, operation: "accept", hash });
    if (prior) {
      if (row.status !== "accepted" || row.accepted_by_user_id !== input.userId || prior.member_id !== row.accepted_member_id || !prior.member_id) throw invalidInvitation();
      // A historical receipt never reactivates access or asserts that a revoked
      // member is active. Replays must still describe the current canonical
      // membership and the exact originally accepted selected scopes.
      await assertOperationalOrganization(tx, row.organization_id);
      const member = await tx.execute(sql`select id from zaltyko.organization_members
        where organization_id=${row.organization_id}::uuid and id=${prior.member_id}::uuid
          and user_id=${input.userId}::uuid and role=${row.role} and status='active' and location_scope_mode='selected' for share`);
      if (member.rows.length !== 1) throw conflict("El acceso aceptado ha cambiado. Consulta al Owner.");
      const requested = await locationsFor(tx, row, true);
      const current = await query<TeamLocation>(tx, sql`select l.id::text,l.name from zaltyko.member_location_scopes s
        join zaltyko.locations l on l.organization_id=s.organization_id and l.id=s.location_id
        where s.organization_id=${row.organization_id}::uuid and s.member_id=${prior.member_id}::uuid and l.is_active
        order by l.id for share of l`);
      if (JSON.stringify(current.rows.map(item => item.id)) !== JSON.stringify(requested.map(item => item.id))) throw conflict("Las sedes del acceso aceptado han cambiado. Consulta al Owner.");
      return { membership: { id: prior.member_id, role: row.role, status: "active", locationScopeMode: "selected", locations: current.rows }, replayed: true };
    }
    assertPendingIdentity(row, email);
    await assertOperationalOrganization(tx, row.organization_id);
    await assertInviter(tx, row);
    const scopes = await locationsFor(tx, row, true);
    const existing = await tx.execute(sql`select id from zaltyko.organization_members
      where organization_id=${row.organization_id}::uuid and user_id=${input.userId}::uuid`);
    if (existing.rows.length) throw conflict("Esta identidad ya tiene una membresía en la organización.");
    const inserted = await query<{ id: string }>(tx, sql`insert into zaltyko.organization_members
      (organization_id,user_id,role,status,location_scope_mode) values
      (${row.organization_id}::uuid,${input.userId}::uuid,${row.role},'active','selected') returning id::text`);
    const memberId = inserted.rows[0]?.id;
    if (!memberId) throw unavailable();
    for (const location of scopes) await tx.execute(sql`insert into zaltyko.member_location_scopes
      (organization_id,member_id,location_id) values (${row.organization_id}::uuid,${memberId}::uuid,${location.id}::uuid)`);
    const consumed = await tx.execute(sql`update zaltyko.organization_member_invitations set status='accepted',accepted_by_user_id=${input.userId}::uuid,
      accepted_member_id=${memberId}::uuid,accepted_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp()
      where organization_id=${row.organization_id}::uuid and id=${row.id}::uuid and status='pending'
        and expires_at>clock_timestamp() returning id`);
    // An Auth/site lock can have waited past the TTL after the initial read.
    // Failing here rolls back the newly inserted member and every scope too.
    if (consumed.rows.length !== 1) throw new OperationalError("INVALID_STATE_TRANSITION", "Esta invitación ha caducado. Solicita una nueva al Owner.", 410);
    const updated = await readInvitation(tx, row.organization_id, row.id);
    await record(tx, { row: updated, userId: input.userId, key, operation: "accept", hash, memberId, locationIds: scopes.map(item => item.id) });
    return { membership: { id: memberId, role: row.role, status: "active", locationScopeMode: "selected", locations: scopes }, replayed: false };
  });
}
