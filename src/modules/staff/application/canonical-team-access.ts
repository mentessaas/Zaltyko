import { createHash, randomBytes } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import type { TransactionClient } from "@/lib/db-transactions";
import type { OperationalActor } from "@/modules/shared/application/actor";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { appendAuditEntry, assertIdempotencyPayload, lockCommand } from "@/modules/shared/infrastructure/transactional-records";
import {
  canManageTeamInvitation, createTeamInvitationSchema, teamIdempotencyKeySchema, teamInvitableRoles,
  teamInvitationDelivery, teamInvitationIdSchema, teamInvitationTarget, teamInviterAuthorityFor,
  teamOrganizationSchema, teamTokenSchema, TEAM_VERIFIED_EMAIL_OAUTH_PROVIDERS,
  type TeamAccess, type TeamInvitation, type TeamInvitationAcceptance,
  type TeamInvitationInspection, type TeamInvitationResult, type TeamInvitationRevokeResult,
  type TeamInvitationTarget, type TeamInviterAuthority, type TeamLocation, type TeamMemberRole, type TeamMemberStatus,
} from "@/modules/staff/domain/team-access-contract";
import { assertOrganizationOperationalWritable, getOrganizationUsage } from "@/modules/saas-billing/application/organization-usage";
import { assertCanonicalTeamAccessSchema } from "@/modules/staff/application/canonical-team-access-schema";

type Tx = TransactionClient;
type InvitationRow = {
  id: string; organization_id: string; normalized_email: string;
  role: "manager" | "coach"; status: "pending" | "accepted" | "revoked";
  invited_by_member_id: string; expires_at: Date | string; revision: number;
  expired: boolean; accepted_by_user_id: string | null; accepted_member_id: string | null;
  staff_profile_id: string | null; invitee_given_name: string | null; invitee_family_name: string | null;
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
/**
 * One generic answer for every unusable link: unknown, used, revoked, expired,
 * another account, or a stale inviter. Nobody can tell which case applied.
 */
const invalidInvitation = () => new OperationalError("NOT_FOUND", "Este enlace de invitación no es válido para tu cuenta. Puede haber caducado, haberse usado o haberse sustituido: pide uno nuevo a la dirección de la academia.", 404);
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

/**
 * For pages: whether the team-access entries are shown. The flag must be on and
 * the reviewed candidate installed exactly; any failure hides the entries.
 */
export async function isCanonicalTeamAccessAvailable(): Promise<boolean> {
  if (process.env.ZALTYKO_TEAM_ACCESS_ENABLED !== "true") return false;
  try {
    await db.transaction(async tx => { await assertCanonicalTeamAccessSchema(tx); });
    return true;
  } catch {
    return false;
  }
}

let availabilityCache: { value: boolean; expiresAt: number } | null = null;

/** Same check for every /owner page (navigation), cached briefly per server process. */
export async function isCanonicalTeamAccessAvailableCached(ttlMs = 30_000): Promise<boolean> {
  if (process.env.ZALTYKO_TEAM_ACCESS_ENABLED !== "true") return false;
  const now = Date.now();
  if (availabilityCache && availabilityCache.expiresAt > now) return availabilityCache.value;
  const value = await isCanonicalTeamAccessAvailable();
  availabilityCache = { value, expiresAt: now + ttlMs };
  return value;
}

async function transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  assertTeamAccessEnabled();
  try {
    return await db.transaction(async tx => {
      await assertCanonicalTeamAccessSchema(tx);
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

async function memberAuthority(tx: Tx, input: { organizationId: string; memberId: string; userId?: string }, lock: boolean): Promise<TeamInviterAuthority | null> {
  const member = await query<{ role: string; location_scope_mode: string }>(tx, sql`select role::text,location_scope_mode::text
    from zaltyko.organization_members
    where organization_id=${input.organizationId}::uuid and id=${input.memberId}::uuid
      ${input.userId ? sql`and user_id=${input.userId}::uuid` : sql``} and status='active'
    ${lock ? sql`for share` : sql``}`);
  const row = member.rows[0];
  if (!row) return null;
  const scoped = row.location_scope_mode === "all" ? { rows: [] as Array<{ id: string }> } : await query<{ id: string }>(tx, sql`
    select s.location_id::text as id from zaltyko.member_location_scopes s
    join zaltyko.locations l on l.organization_id=s.organization_id and l.id=s.location_id and l.is_active
    where s.organization_id=${input.organizationId}::uuid and s.member_id=${input.memberId}::uuid order by s.location_id`);
  return teamInviterAuthorityFor({ role: row.role, locationScopeMode: row.location_scope_mode }, scoped.rows.map(item => item.id));
}

/** Owner/admin with every site, or a manager (coaches only, own sites). */
async function assertManager(tx: Tx, input: OwnerInput, lock = false): Promise<TeamInviterAuthority> {
  const authority = await memberAuthority(tx, { organizationId: input.organizationId, memberId: input.actor.memberId, userId: input.actor.userId }, lock);
  if (!authority) throw new OperationalError("FORBIDDEN", "Solo la dirección, la administración o la coordinación activas pueden gestionar las invitaciones del equipo.", 403);
  return authority;
}

function assertCanManage(authority: TeamInviterAuthority, invitation: { role: "manager" | "coach"; locationIds: string[]; existingProfile?: boolean }): void {
  if (!canManageTeamInvitation(authority, invitation)) {
    throw new OperationalError("FORBIDDEN", authority.role === "manager"
      ? "La coordinación solo puede invitar a entrenadoras o entrenadores de sus sedes y con una ficha nueva; vincular una ficha existente corresponde a la dirección o la administración."
      : "No puedes gestionar esta invitación.", 403);
  }
}

/** The current inviter must still be allowed to grant exactly this access. */
async function assertInviter(tx: Tx, row: InvitationRow, locationIds: string[]): Promise<void> {
  const authority = await memberAuthority(tx, { organizationId: row.organization_id, memberId: row.invited_by_member_id }, true);
  if (!authority || !canManageTeamInvitation(authority, { role: row.role, locationIds, existingProfile: row.staff_profile_id !== null })) throw invalidInvitation();
}

async function assertPlanWritable(tx: Tx, organizationId: string, forInvitee = false): Promise<void> {
  try {
    await assertOrganizationOperationalWritable(tx, organizationId);
  } catch (error) {
    if (forInvitee && error instanceof OperationalError && error.code === "PLAN_OVER_CAPACITY") {
      // The invitee does not need the academy's plan details.
      throw conflict("La academia no puede incorporar a nadie al equipo ahora mismo. Consulta a la dirección de la academia.");
    }
    throw error;
  }
}

/**
 * An existing team profile can be the target of one pending invitation at a
 * time, must be active and not linked to an account yet. The row lock keeps a
 * concurrent acceptance or invitation from linking it twice.
 */
async function assertLinkableProfile(tx: Tx, organizationId: string, staffProfileId: string, exceptInvitationId: string | null): Promise<void> {
  const profile = await query<{ is_active: boolean; member_id: string | null }>(tx, sql`select is_active,member_id::text
    from zaltyko.staff_profiles where organization_id=${organizationId}::uuid and id=${staffProfileId}::uuid for update`);
  const row = profile.rows[0];
  if (!row) throw new OperationalError("INVALID_RELATION", "Elige una ficha del equipo de esta academia.", 400);
  if (!row.is_active || row.member_id !== null) throw conflict("La ficha elegida está archivada o ya tiene una cuenta vinculada.");
  const pending = await tx.execute(sql`select id from zaltyko.organization_member_invitations
    where organization_id=${organizationId}::uuid and staff_profile_id=${staffProfileId}::uuid and status='pending'
      ${exceptInvitationId ? sql`and id<>${exceptInvitationId}::uuid` : sql``}`);
  if (pending.rows.length) throw conflict("Ya hay una invitación pendiente para esta ficha. Reemítela o revócala.");
}

async function invitationLocationIds(tx: Tx, row: InvitationRow): Promise<string[]> {
  const result = await query<{ id: string }>(tx, sql`select location_id::text as id from zaltyko.organization_member_invitation_scopes
    where organization_id=${row.organization_id}::uuid and invitation_id=${row.id}::uuid order by location_id`);
  return result.rows.map(item => item.id);
}

async function confirmedEmail(tx: Tx, userId: string): Promise<string> {
  // Auth-owned identity, never a body/session metadata email. The row lock keeps
  // an email/confirmation change from racing acceptance in this transaction.
  const result = await query<{ email: string }>(tx, sql`select lower(btrim(email)) as email from auth.users
    where id=${userId}::uuid and email_confirmed_at is not null and email is not null
      and btrim(email)<>'' for share`);
  const email = result.rows[0]?.email;
  if (!email) throw invalidInvitation();
  // email_confirmed_at alone is not proof: OAuth sign-ins and auto-confirm can
  // set it without the inbox being verified. Require an identity for exactly
  // this email that is either the email/password provider (verified through
  // Supabase's mandatory confirmation, see the activation checklist) or an
  // allow-listed OAuth provider that states email_verified=true.
  const providers = sql.join(TEAM_VERIFIED_EMAIL_OAUTH_PROVIDERS.map(provider => sql`${provider}`), sql`,`);
  const verified = await query<{ ok: boolean }>(tx, sql`select exists (
      select 1 from auth.identities i
      where i.user_id=${userId}::uuid and lower(btrim(i.identity_data->>'email'))=${email}
        and (i.provider='email'
          or (i.provider in (${providers}) and lower(coalesce(i.identity_data->>'email_verified','false'))='true'))
    ) as ok`);
  if (verified.rows[0]?.ok !== true) throw invalidInvitation();
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
    accepted_by_user_id::text,accepted_member_id::text,staff_profile_id::text,invitee_given_name,invitee_family_name
    from zaltyko.organization_member_invitations
    where organization_id=${organizationId}::uuid and id=${id}::uuid ${lock ? sql`for update` : sql``}`);
  const row = result.rows[0];
  if (!row) throw new OperationalError("NOT_FOUND", "Invitación no encontrada", 404);
  if (!["manager", "coach"].includes(row.role) || !["pending", "accepted", "revoked"].includes(row.status)
    || !Number.isSafeInteger(row.revision) || row.revision < 1 || !Number.isFinite(new Date(row.expires_at).getTime())) throw unavailable();
  return row;
}

async function profileName(tx: Tx, organizationId: string, staffProfileId: string): Promise<string> {
  const result = await query<{ name: string }>(tx, sql`select btrim(p.given_name||' '||p.family_name) as name
    from zaltyko.staff_profiles s join zaltyko.people p on p.organization_id=s.organization_id and p.id=s.person_id
    where s.organization_id=${organizationId}::uuid and s.id=${staffProfileId}::uuid`);
  return result.rows[0]?.name ?? "Ficha del equipo";
}

async function invitationPerson(tx: Tx, row: InvitationRow): Promise<TeamInvitation["person"]> {
  if (row.staff_profile_id) return { kind: "existing", staffProfileId: row.staff_profile_id, name: await profileName(tx, row.organization_id, row.staff_profile_id) };
  return { kind: "new", staffProfileId: null, name: `${row.invitee_given_name ?? ""} ${row.invitee_family_name ?? ""}`.trim() };
}

async function invitationDto(tx: Tx, row: InvitationRow, receipt?: Receipt): Promise<TeamInvitation> {
  const status = receipt?.invitation_status ?? row.status;
  const expiresAt = iso(receipt?.invitation_expires_at ?? row.expires_at);
  return { id: row.id, email: row.normalized_email, role: row.role, status,
    expired: status === "pending" && new Date(expiresAt).getTime() <= Date.now(), expiresAt,
    revision: receipt?.invitation_revision ?? row.revision, requestedLocations: await locationsFor(tx, row),
    person: await invitationPerson(tx, row) };
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

async function record(tx: Tx, input: { row: InvitationRow; userId: string; key: string; operation: string; hash: string; memberId?: string; locationIds?: string[]; staffProfileId?: string }): Promise<void> {
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
      ...(input.memberId ? { memberId: input.memberId } : {}) }, metadata: { locationIds: input.locationIds ?? [],
      ...(input.staffProfileId ? { staffProfileId: input.staffProfileId } : {}) } });
}

function ownerCommand(input: CommandInput, operation: string, command: Record<string, unknown>) {
  teamOrganizationSchema.parse({ organizationId: input.organizationId });
  const key = digest(teamIdempotencyKeySchema.parse(input.idempotencyKey));
  return { key, operation, hash: fingerprint({ operation, organizationId: input.organizationId, ...command }) };
}

async function lockOwnerCommand(tx: Tx, input: CommandInput, key: string): Promise<TeamInviterAuthority> {
  // Consistent order with every canonical writer: command, member, invitation,
  // organization (plan), scopes, profile. Authorization is repeated after the
  // command lock.
  await lockCommand(tx, input.organizationId, `${input.actor.userId}:team:${key}`);
  return assertManager(tx, input, true);
}

export async function listCanonicalTeamAccess(input: OwnerInput): Promise<TeamAccess> {
  teamOrganizationSchema.parse({ organizationId: input.organizationId });
  return transaction(async tx => {
    const authority = await assertManager(tx, input);
    const org = await organization(tx, input.organizationId);
    const allActive = await query<TeamLocation>(tx, sql`select id::text,name from zaltyko.locations
      where organization_id=${input.organizationId}::uuid and is_active order by id`);
    const manageable = (ids: string[]) => authority.locationIds === null || ids.every(id => authority.locationIds!.includes(id));
    const activeLocations = allActive.rows.filter(location => manageable([location.id]));
    // unbounded-read-ok: invitations of one academy, narrowed below to what this viewer may manage.
    const invitations = await query<{ id: string }>(tx, sql`select id::text from zaltyko.organization_member_invitations
      where organization_id=${input.organizationId}::uuid order by created_at,id`);
    const memberRows = await query<{ id: string; role: TeamMemberRole; status: TeamMemberStatus; location_scope_mode: "all" | "selected"; staff_profile_id: string | null; staff_name: string | null }>(tx, sql`
      select m.id::text,m.role::text,m.status::text,m.location_scope_mode::text,
        profile.id::text as staff_profile_id,profile.name as staff_name
      from zaltyko.organization_members m
      left join lateral (
        select s.id,btrim(p.given_name||' '||p.family_name) as name from zaltyko.staff_profiles s
        join zaltyko.people p on p.organization_id=s.organization_id and p.id=s.person_id
        where s.organization_id=m.organization_id and s.member_id=m.id order by s.created_at,s.id limit 1
      ) profile on true
      where m.organization_id=${input.organizationId}::uuid order by m.created_at,m.id`);
    const members: TeamAccess["members"] = [];
    for (const member of memberRows.rows) {
      let effectiveLocations: TeamLocation[] = [];
      if (member.status === "active" && ["active", "trial"].includes(org.status)) {
        if (member.location_scope_mode === "all") effectiveLocations = allActive.rows;
        else {
          const scopes = await query<TeamLocation>(tx, sql`select l.id::text,l.name from zaltyko.member_location_scopes s
            join zaltyko.locations l on l.organization_id=s.organization_id and l.id=s.location_id
            where s.organization_id=${input.organizationId}::uuid and s.member_id=${member.id}::uuid and l.is_active order by l.id`);
          effectiveLocations = scopes.rows;
        }
      }
      // A manager sees only the coaches working entirely inside their sites.
      if (authority.role === "manager" && (member.role !== "coach" || effectiveLocations.length === 0 || !manageable(effectiveLocations.map(location => location.id)))) continue;
      members.push({ id: member.id, role: member.role, status: member.status, locationScopeMode: member.location_scope_mode, effectiveLocations,
        staffProfile: member.staff_profile_id ? { id: member.staff_profile_id, name: member.staff_name ?? "Ficha del equipo" } : null });
    }
    const invitationDtos: TeamInvitation[] = [];
    for (const { id } of invitations.rows) {
      const row = await readInvitation(tx, input.organizationId, id);
      if (!canManageTeamInvitation(authority, { role: row.role, locationIds: await invitationLocationIds(tx, row), existingProfile: row.staff_profile_id !== null })) continue;
      invitationDtos.push(await invitationDto(tx, row));
    }
    // unbounded-read-ok: active team profiles of one academy, for the invitation form.
    // A manager never sees nor links existing profiles (they carry no site).
    const linkable = authority.role === "manager" ? { rows: [] as Array<{ id: string; name: string }> } : await query<{ id: string; name: string }>(tx, sql`select s.id::text,btrim(p.given_name||' '||p.family_name) as name
      from zaltyko.staff_profiles s join zaltyko.people p on p.organization_id=s.organization_id and p.id=s.person_id
      where s.organization_id=${input.organizationId}::uuid and s.is_active and s.member_id is null
        and not exists (select 1 from zaltyko.organization_member_invitations i
          where i.organization_id=s.organization_id and i.staff_profile_id=s.id and i.status='pending')
      order by p.family_name,p.given_name,s.id`);
    return { organization: { id: org.id, name: org.name }, viewer: { role: authority.role, invitableRoles: teamInvitableRoles(authority) },
      activeLocations, linkableStaffProfiles: linkable.rows, invitations: invitationDtos, members };
  });
}

function targetFingerprint(target: TeamInvitationTarget) {
  return target.kind === "existing" ? { staffProfileId: target.staffProfileId } : { givenName: target.givenName, familyName: target.familyName };
}

export async function createCanonicalTeamInvitation(input: CommandInput & { email: string; role: "manager" | "coach"; locationIds: string[]; staffProfileId?: string | null; givenName?: string | null; familyName?: string | null }): Promise<TeamInvitationResult> {
  const parsed = createTeamInvitationSchema.parse({ organizationId: input.organizationId, email: input.email, role: input.role, locationIds: input.locationIds,
    staffProfileId: input.staffProfileId, givenName: input.givenName, familyName: input.familyName });
  const target = teamInvitationTarget(parsed);
  const command = ownerCommand(input, "invite", { email: parsed.email, role: parsed.role, locationIds: parsed.locationIds, ...targetFingerprint(target) });
  return transaction(async tx => {
    const authority = await lockOwnerCommand(tx, input, command.key);
    const prior = await priorReceipt(tx, { organizationId: input.organizationId, userId: input.actor.userId, ...command });
    if (prior) return { invitation: await invitationDto(tx, await readInvitation(tx, input.organizationId, prior.invitation_id), prior), token: null, replayed: true, delivery: teamInvitationDelivery() };
    assertCanManage(authority, { role: parsed.role, locationIds: parsed.locationIds, existingProfile: target.kind === "existing" });
    await assertOperationalOrganization(tx, input.organizationId);
    await assertPlanWritable(tx, input.organizationId);
    await explicitLocations(tx, input.organizationId, parsed.locationIds);
    if (target.kind === "existing") await assertLinkableProfile(tx, input.organizationId, target.staffProfileId, null);
    const duplicate = await tx.execute(sql`select id from zaltyko.organization_member_invitations
      where organization_id=${input.organizationId}::uuid and normalized_email=${parsed.email} and status='pending'`);
    if (duplicate.rows.length) throw conflict("Ya existe una invitación pendiente para este correo. Reemítela de forma explícita.");
    const token = randomBytes(32).toString("base64url");
    const inserted = await query<{ id: string }>(tx, sql`insert into zaltyko.organization_member_invitations
      (organization_id,normalized_email,role,invited_by_member_id,token_sha256,expires_at,staff_profile_id,invitee_given_name,invitee_family_name)
      values (${input.organizationId}::uuid,${parsed.email},${parsed.role},${input.actor.memberId}::uuid,${digest(token)},clock_timestamp()+interval '7 days',
        ${target.kind === "existing" ? target.staffProfileId : null}::uuid,${target.kind === "new" ? target.givenName : null},${target.kind === "new" ? target.familyName : null}) returning id::text`);
    const id = inserted.rows[0]?.id;
    if (!id) throw unavailable();
    for (const locationId of parsed.locationIds) await tx.execute(sql`insert into zaltyko.organization_member_invitation_scopes
      (organization_id,invitation_id,location_id) values (${input.organizationId}::uuid,${id}::uuid,${locationId}::uuid)`);
    const row = await readInvitation(tx, input.organizationId, id);
    await record(tx, { row, userId: input.actor.userId, ...command, locationIds: parsed.locationIds,
      ...(target.kind === "existing" ? { staffProfileId: target.staffProfileId } : {}) });
    return { invitation: await invitationDto(tx, row), token, replayed: false, delivery: teamInvitationDelivery() };
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
    const authority = await lockOwnerCommand(tx, input, command.key);
    const prior = await priorReceipt(tx, { organizationId: input.organizationId, userId: input.actor.userId, ...command });
    if (prior) return { invitation: await invitationDto(tx, await readInvitation(tx, input.organizationId, prior.invitation_id), prior), token: null, replayed: true, delivery: teamInvitationDelivery() };
    const row = await readInvitation(tx, input.organizationId, input.invitationId, true);
    assertCanManage(authority, { role: row.role, locationIds: await invitationLocationIds(tx, row), existingProfile: row.staff_profile_id !== null });
    validateVersion(row, input.revision);
    await assertOperationalOrganization(tx, input.organizationId);
    await assertPlanWritable(tx, input.organizationId);
    const scopes = await locationsFor(tx, row, true);
    if (row.staff_profile_id) await assertLinkableProfile(tx, input.organizationId, row.staff_profile_id, row.id);
    const token = randomBytes(32).toString("base64url");
    await tx.execute(sql`update zaltyko.organization_member_invitations set token_sha256=${digest(token)},
      invited_by_member_id=${input.actor.memberId}::uuid,expires_at=clock_timestamp()+interval '7 days',revision=revision+1,updated_at=clock_timestamp()
      where organization_id=${input.organizationId}::uuid and id=${input.invitationId}::uuid`);
    const updated = await readInvitation(tx, input.organizationId, input.invitationId);
    await record(tx, { row: updated, userId: input.actor.userId, ...command, locationIds: scopes.map(item => item.id) });
    return { invitation: await invitationDto(tx, updated), token, replayed: false, delivery: teamInvitationDelivery() };
  });
}

export async function revokeCanonicalTeamInvitation(input: InvitationCommandInput): Promise<TeamInvitationRevokeResult> {
  teamInvitationIdSchema.parse(input.invitationId);
  if (!Number.isSafeInteger(input.revision) || input.revision < 1) throw new OperationalError("INVALID_RELATION", "Revisión inválida", 400);
  const command = ownerCommand(input, "revoke", { invitationId: input.invitationId, revision: input.revision });
  return transaction(async tx => {
    const authority = await lockOwnerCommand(tx, input, command.key);
    const prior = await priorReceipt(tx, { organizationId: input.organizationId, userId: input.actor.userId, ...command });
    if (prior) return { id: prior.invitation_id, status: "revoked", revision: prior.invitation_revision, replayed: true };
    const row = await readInvitation(tx, input.organizationId, input.invitationId, true);
    assertCanManage(authority, { role: row.role, locationIds: await invitationLocationIds(tx, row), existingProfile: row.staff_profile_id !== null });
    validateVersion(row, input.revision);
    // Revoking a pending invitation remains possible for expired/inactive orgs
    // and in plan read-only mode: it only removes possible access and never
    // revokes an existing membership.
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

/** Same generic answer for another account, a used/revoked link or an expired one. */
function assertPendingIdentity(row: InvitationRow, email: string): void {
  if (row.normalized_email !== email || row.status !== "pending" || row.expired) throw invalidInvitation();
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
    const locations = await locationsFor(tx, row, true);
    await assertInviter(tx, row, locations.map(location => location.id));
    // Read-only plan check, so the page can warn before the person accepts.
    const usage = await getOrganizationUsage(tx, row.organization_id);
    return { organization: { id: org.id, name: org.name }, role: row.role, locations, joinable: !usage.readOnly };
  });
}

/**
 * Links the accepted member to its team profile: the existing profile the
 * invitation names (still active and unlinked), or a new person + profile with
 * the names the academy gave. Profiles are never matched by email: they carry
 * none, and a name match could link the wrong person.
 */
async function linkTeamProfile(tx: Tx, row: InvitationRow, memberId: string): Promise<string> {
  if (row.staff_profile_id) {
    const profile = await query<{ is_active: boolean; member_id: string | null }>(tx, sql`select is_active,member_id::text
      from zaltyko.staff_profiles where organization_id=${row.organization_id}::uuid and id=${row.staff_profile_id}::uuid for update`);
    const current = profile.rows[0];
    if (!current || !current.is_active || current.member_id !== null) {
      throw conflict("La ficha del equipo de esta invitación ha cambiado. Pide a la dirección de la academia que la reemita.");
    }
    await tx.execute(sql`update zaltyko.staff_profiles set member_id=${memberId}::uuid,updated_at=clock_timestamp()
      where organization_id=${row.organization_id}::uuid and id=${row.staff_profile_id}::uuid`);
    return row.staff_profile_id;
  }
  if (!row.invitee_given_name || !row.invitee_family_name) throw unavailable();
  const person = await query<{ id: string }>(tx, sql`insert into zaltyko.people (organization_id,given_name,family_name)
    values (${row.organization_id}::uuid,${row.invitee_given_name},${row.invitee_family_name}) returning id::text`);
  const personId = person.rows[0]?.id;
  if (!personId) throw unavailable();
  const profile = await query<{ id: string }>(tx, sql`insert into zaltyko.staff_profiles (organization_id,person_id,member_id,is_active)
    values (${row.organization_id}::uuid,${personId}::uuid,${memberId}::uuid,true) returning id::text`);
  const profileId = profile.rows[0]?.id;
  if (!profileId) throw unavailable();
  return profileId;
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
      if (member.rows.length !== 1) throw conflict("El acceso aceptado ha cambiado. Consulta a la dirección de la academia.");
      const requested = await locationsFor(tx, row, true);
      const current = await query<TeamLocation>(tx, sql`select l.id::text,l.name from zaltyko.member_location_scopes s
        join zaltyko.locations l on l.organization_id=s.organization_id and l.id=s.location_id
        where s.organization_id=${row.organization_id}::uuid and s.member_id=${prior.member_id}::uuid and l.is_active
        order by l.id for share of l`);
      if (JSON.stringify(current.rows.map(item => item.id)) !== JSON.stringify(requested.map(item => item.id))) throw conflict("Las sedes del acceso aceptado han cambiado. Consulta a la dirección de la academia.");
      const linked = await query<{ id: string }>(tx, sql`select id::text from zaltyko.staff_profiles
        where organization_id=${row.organization_id}::uuid and member_id=${prior.member_id}::uuid order by created_at,id limit 1`);
      const staffProfileId = linked.rows[0]?.id;
      if (!staffProfileId) throw conflict("La ficha del equipo vinculada ha cambiado. Consulta a la dirección de la academia.");
      return { membership: { id: prior.member_id, role: row.role, status: "active", locationScopeMode: "selected", locations: current.rows, staffProfileId }, replayed: true };
    }
    assertPendingIdentity(row, email);
    await assertOperationalOrganization(tx, row.organization_id);
    await assertPlanWritable(tx, row.organization_id, true);
    const scopes = await locationsFor(tx, row, true);
    await assertInviter(tx, row, scopes.map(item => item.id));
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
    const staffProfileId = await linkTeamProfile(tx, row, memberId);
    const consumed = await tx.execute(sql`update zaltyko.organization_member_invitations set status='accepted',accepted_by_user_id=${input.userId}::uuid,
      accepted_member_id=${memberId}::uuid,accepted_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp()
      where organization_id=${row.organization_id}::uuid and id=${row.id}::uuid and status='pending'
        and expires_at>clock_timestamp() returning id`);
    // An Auth/site lock can have waited past the TTL after the initial read.
    // Failing here rolls back the member, scopes and profile link too.
    if (consumed.rows.length !== 1) throw invalidInvitation();
    const updated = await readInvitation(tx, row.organization_id, row.id);
    await record(tx, { row: updated, userId: input.userId, key, operation: "accept", hash, memberId, locationIds: scopes.map(item => item.id), staffProfileId });
    return { membership: { id: memberId, role: row.role, status: "active", locationScopeMode: "selected", locations: scopes, staffProfileId }, replayed: false };
  });
}
