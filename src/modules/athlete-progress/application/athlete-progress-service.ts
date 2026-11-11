import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  athleteObjectives,
  athleteObjectiveStatusHistory,
  athleteObservations,
  type AthleteObjectiveRow,
  type AthleteObservationRow,
} from "@/modules/athlete-progress/infrastructure/athlete-progress-schema";
import {
  athletes,
  enrollments,
  locations,
  memberLocationScopes,
  organizationMembers,
  people,
  sessions,
  staffProfiles,
  type OrganizationMember,
} from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import {
  athleteProgressQuerySchema,
  canChangeObjectiveStatus,
  canEditObservation,
  changeObjectiveStatusCommandSchema,
  createObjectiveCommandSchema,
  createObservationCommandSchema,
  isValidObjectiveTransition,
  localDateInTimeZone,
  OBJECTIVES_LIMIT,
  OBSERVATIONS_PAGE_SIZE,
  PROGRESS_ROLES,
  sessionObservationCommandSchema,
  updateObservationCommandSchema,
  type AthleteObjectiveView,
  type AthleteObservationView,
  type AthleteProgressView,
  type Apparatus,
  type Discipline,
  type ObjectiveStatus,
  type ObservationVisibility,
  type ProgressMemberRole,
  type ProgressWriteResult,
} from "@/modules/athlete-progress/domain/athlete-progress";
import { assertOrganizationOperationalWritable } from "@/modules/saas-billing/application/organization-usage";
import type { OperationalActor } from "@/modules/shared/application/actor";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { assertOperationalAccess } from "@/modules/shared/infrastructure/operational-authorization";
import { appendAuditEntry, lockCommand } from "@/modules/shared/infrastructure/transactional-records";

import { assertAthleteProgressStorageAvailable } from "./athlete-progress-storage";

/**
 * P2 #17 (primera parte): objetivos y observaciones por gimnasta.
 *
 * Toda la autorización ocurre aquí, en servidor y dentro de la transacción:
 * - assertOperationalAccess: miembro activo de la academia, rol permitido,
 *   sede dentro de su alcance y, en escrituras, plan fuera de solo lectura.
 * - la gimnasta debe ser de la academia y estar vinculada a la sede pedida.
 *   Para el entrenador el vínculo es el mismo que en Pasar lista: inscripción
 *   o pertenencia a grupo ABIERTA en esa sede. La dirección también ve
 *   gimnastas con historial en la sede.
 * - cada registro guarda la sede desde la que se creó; quien solo tiene
 *   algunas sedes ve únicamente los registros de esas sedes.
 * La app conecta como postgres con BYPASSRLS: RLS es solo defensa en
 * profundidad frente a clientes directos.
 */

type Access = {
  member: OrganizationMember;
  role: ProgressMemberRole;
  location: { id: string; timezone: string | null };
  /** null = todas las sedes de la academia. */
  visibleLocationIds: string[] | null;
};

type AthleteAccess = Access & {
  athlete: { id: string; name: string; isActive: boolean };
};

type ActorInput = { actor: OperationalActor };

const OPEN_ENROLLMENT_STATUSES = ["pending", "trial", "active", "paused"] as const;
const OPEN_GROUP_MEMBERSHIP_STATUSES = ["pending", "active", "paused"] as const;

function notFound(message = "Gimnasta no encontrada"): OperationalError {
  return new OperationalError("NOT_FOUND", message, 404);
}

async function authorizeMember(
  tx: TransactionClient,
  input: { organizationId: string; locationId: string; actor: OperationalActor }
): Promise<Access> {
  await assertAthleteProgressStorageAvailable(tx);
  const member = await assertOperationalAccess(tx, {
    organizationId: input.organizationId,
    locationId: input.locationId,
    actor: input.actor,
    allowedRoles: PROGRESS_ROLES,
  });
  // assertOperationalAccess no comprueba que la sede exista para quien tiene
  // todas las sedes: una sede de otra academia responde como inexistente.
  const [location] = await tx
    .select({ id: locations.id, timezone: locations.timezone })
    .from(locations)
    .where(and(eq(locations.organizationId, input.organizationId), eq(locations.id, input.locationId)))
    .limit(1);
  if (!location) throw notFound("Sede no encontrada");

  let visibleLocationIds: string[] | null = null;
  if (member.locationScopeMode !== "all") {
    // unbounded-read-ok: las sedes asignadas a un miembro están acotadas por las sedes de su academia.
    const scoped = await tx
      .select({ locationId: memberLocationScopes.locationId })
      .from(memberLocationScopes)
      .where(
        and(
          eq(memberLocationScopes.organizationId, input.organizationId),
          eq(memberLocationScopes.memberId, member.id)
        )
      );
    visibleLocationIds = [...new Set(scoped.map((row) => row.locationId))].sort();
  }
  return {
    member,
    role: member.role as ProgressMemberRole,
    location,
    visibleLocationIds,
  };
}

async function isAthleteLinkedToLocation(
  tx: TransactionClient,
  input: { organizationId: string; athleteId: string; locationId: string; openOnly: boolean }
): Promise<boolean> {
  const enrollmentFilter = input.openOnly
    ? sql`and enrollment.status in (${sql.join(OPEN_ENROLLMENT_STATUSES.map((status) => sql`${status}`), sql`, `)})`
    : sql``;
  const membershipFilter = input.openOnly
    ? sql`and membership.status in (${sql.join(OPEN_GROUP_MEMBERSHIP_STATUSES.map((status) => sql`${status}`), sql`, `)})`
    : sql``;
  const attendanceLink = input.openOnly
    ? sql`false`
    : sql`exists (
        select 1 from zaltyko.attendance_records as attendance
        where attendance.organization_id = ${input.organizationId}::uuid
          and attendance.athlete_id = ${input.athleteId}::uuid
          and attendance.location_id = ${input.locationId}::uuid
      )`;
  const result = await tx.execute(sql`
    select (
      exists (
        select 1 from zaltyko.enrollments as enrollment
        where enrollment.organization_id = ${input.organizationId}::uuid
          and enrollment.athlete_id = ${input.athleteId}::uuid
          and enrollment.location_id = ${input.locationId}::uuid
          ${enrollmentFilter}
      )
      or exists (
        select 1
        from zaltyko.group_memberships as membership
        join zaltyko.groups as academy_group
          on academy_group.organization_id = membership.organization_id
         and academy_group.id = membership.group_id
        where membership.organization_id = ${input.organizationId}::uuid
          and membership.athlete_id = ${input.athleteId}::uuid
          and academy_group.location_id = ${input.locationId}::uuid
          ${membershipFilter}
      )
      or ${attendanceLink}
    ) as linked
  `);
  return (result.rows[0] as { linked?: unknown } | undefined)?.linked === true;
}

async function authorizeAthlete(
  tx: TransactionClient,
  access: Access,
  input: { organizationId: string; athleteId: string; intent: "read" | "write" }
): Promise<AthleteAccess> {
  const [athlete] = await tx
    .select({
      id: athletes.id,
      isActive: athletes.isActive,
      givenName: people.givenName,
      familyName: people.familyName,
    })
    .from(athletes)
    .innerJoin(people, and(eq(people.organizationId, athletes.organizationId), eq(people.id, athletes.personId)))
    .where(and(eq(athletes.organizationId, input.organizationId), eq(athletes.id, input.athleteId)))
    .limit(1);
  if (!athlete) throw notFound();
  const isCoach = access.role === "coach";
  // Una gimnasta archivada no existe para el entrenador; la dirección conserva
  // la lectura del historial, pero nadie puede escribir.
  if (!athlete.isActive && isCoach) throw notFound();
  if (!athlete.isActive && input.intent === "write") {
    throw new OperationalError(
      "INVALID_STATE_TRANSITION",
      "La gimnasta está archivada: sus objetivos y observaciones son de solo lectura.",
      409
    );
  }
  const linked = await isAthleteLinkedToLocation(tx, {
    organizationId: input.organizationId,
    athleteId: input.athleteId,
    locationId: access.location.id,
    openOnly: isCoach,
  });
  if (!linked) throw notFound("La gimnasta no está vinculada a esta sede");
  return {
    ...access,
    athlete: {
      id: athlete.id,
      name: `${athlete.givenName} ${athlete.familyName}`.trim(),
      isActive: athlete.isActive,
    },
  };
}

function isVisible(access: Access, locationId: string): boolean {
  return access.visibleLocationIds === null || access.visibleLocationIds.includes(locationId);
}

function visibleFilter(access: Access, column: typeof athleteObjectives.locationId | typeof athleteObservations.locationId): SQL | undefined {
  if (access.visibleLocationIds === null) return undefined;
  if (access.visibleLocationIds.length === 0) return sql`false`;
  return inArray(column, access.visibleLocationIds);
}

const roleFallbackNames: Record<string, string> = {
  owner: "Dirección de la academia",
  admin: "Administración",
  manager: "Coordinación",
  coach: "Entrenador/a",
};

async function memberNames(
  tx: TransactionClient,
  organizationId: string,
  memberIds: string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(memberIds)];
  const names = new Map<string, string>();
  if (unique.length === 0) return names;
  // unbounded-read-ok: acotada por los ids de miembro recibidos (autores de como mucho 100 objetivos y 50 observaciones).
  const rows = await tx
    .select({
      memberId: organizationMembers.id,
      role: organizationMembers.role,
      givenName: people.givenName,
      familyName: people.familyName,
    })
    .from(organizationMembers)
    .leftJoin(
      staffProfiles,
      and(
        eq(staffProfiles.organizationId, organizationMembers.organizationId),
        eq(staffProfiles.memberId, organizationMembers.id)
      )
    )
    .leftJoin(people, and(eq(people.organizationId, staffProfiles.organizationId), eq(people.id, staffProfiles.personId)))
    .where(and(eq(organizationMembers.organizationId, organizationId), inArray(organizationMembers.id, unique)));
  for (const row of rows) {
    const name = row.givenName ? `${row.givenName} ${row.familyName ?? ""}`.trim() : null;
    if (name || !names.has(row.memberId)) {
      names.set(row.memberId, name ?? roleFallbackNames[row.role] ?? "Equipo");
    }
  }
  return names;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/* ------------------------------------------------------------------------ */
/* Lectura                                                                   */
/* ------------------------------------------------------------------------ */

export async function getAthleteProgress(
  input: ActorInput & { athleteId: string; query: unknown }
): Promise<AthleteProgressView> {
  const query = athleteProgressQuerySchema.parse(input.query);
  return db.transaction(async (tx) => {
    const access = await authorizeAthlete(
      tx,
      await authorizeMember(tx, { ...query, actor: input.actor }),
      { organizationId: query.organizationId, athleteId: input.athleteId, intent: "read" }
    );

    const objectiveConditions = [
      eq(athleteObjectives.organizationId, query.organizationId),
      eq(athleteObjectives.athleteId, input.athleteId),
      visibleFilter(access, athleteObjectives.locationId),
      query.objectiveStatus ? eq(athleteObjectives.status, query.objectiveStatus) : undefined,
    ].filter((condition): condition is SQL => Boolean(condition));
    const objectiveRows = await tx
      .select()
      .from(athleteObjectives)
      .where(and(...objectiveConditions))
      .orderBy(desc(athleteObjectives.createdAt), desc(athleteObjectives.id))
      .limit(OBJECTIVES_LIMIT);

    // unbounded-read-ok: historial de como mucho OBJECTIVES_LIMIT objetivos ya leídos.
    const historyRows = objectiveRows.length
      ? await tx
          .select()
          .from(athleteObjectiveStatusHistory)
          .where(
            and(
              eq(athleteObjectiveStatusHistory.organizationId, query.organizationId),
              inArray(
                athleteObjectiveStatusHistory.objectiveId,
                objectiveRows.map((row) => row.id)
              )
            )
          )
          .orderBy(asc(athleteObjectiveStatusHistory.objectiveId), asc(athleteObjectiveStatusHistory.revision))
      : [];

    const observationConditions = [
      eq(athleteObservations.organizationId, query.organizationId),
      eq(athleteObservations.athleteId, input.athleteId),
      visibleFilter(access, athleteObservations.locationId),
    ].filter((condition): condition is SQL => Boolean(condition));
    const observationRows = await tx
      .select()
      .from(athleteObservations)
      .where(and(...observationConditions))
      .orderBy(desc(athleteObservations.observedOn), desc(athleteObservations.createdAt), desc(athleteObservations.id))
      .limit(OBSERVATIONS_PAGE_SIZE);

    const names = await memberNames(tx, query.organizationId, [
      ...objectiveRows.flatMap((row) => [row.createdByMemberId]),
      ...historyRows.map((row) => row.changedByMemberId),
      ...observationRows.map((row) => row.authorMemberId),
    ]);
    const nameOf = (memberId: string) => names.get(memberId) ?? "Equipo";
    const writable = access.athlete.isActive;

    const objectives: AthleteObjectiveView[] = objectiveRows.map((row) => ({
      id: row.id,
      title: row.title,
      discipline: row.discipline as Discipline | null,
      apparatus: row.apparatus as Apparatus | null,
      targetDate: row.targetDate,
      status: row.status as ObjectiveStatus,
      revision: row.revision,
      createdByName: nameOf(row.createdByMemberId),
      createdAt: iso(row.createdAt),
      statusChangedAt: iso(row.statusChangedAt),
      canChangeStatus:
        writable &&
        canChangeObjectiveStatus({
          role: access.role,
          memberId: access.member.id,
          createdByMemberId: row.createdByMemberId,
        }),
      history: historyRows
        .filter((entry) => entry.objectiveId === row.id)
        .map((entry) => ({
          revision: entry.revision,
          fromStatus: entry.fromStatus as ObjectiveStatus | null,
          toStatus: entry.toStatus as ObjectiveStatus,
          changedByName: nameOf(entry.changedByMemberId),
          changedAt: iso(entry.changedAt),
        })),
    }));

    const observations: AthleteObservationView[] = observationRows.map((row) => ({
      id: row.id,
      body: row.body,
      visibility: row.visibility as ObservationVisibility,
      observedOn: row.observedOn,
      sessionId: row.sessionId,
      objectiveId: row.objectiveId,
      authorName: nameOf(row.authorMemberId),
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
      revision: row.revision,
      canEdit:
        writable &&
        canEditObservation({
          role: access.role,
          memberId: access.member.id,
          authorMemberId: row.authorMemberId,
        }),
    }));

    return {
      athlete: { id: access.athlete.id, name: access.athlete.name, archived: !access.athlete.isActive },
      objectives,
      observations,
      canWrite: writable,
    };
  });
}

/* ------------------------------------------------------------------------ */
/* Objetivos                                                                 */
/* ------------------------------------------------------------------------ */

function sameObjectiveRequest(
  row: AthleteObjectiveRow,
  input: {
    athleteId: string;
    locationId: string;
    title: string;
    discipline: string | null;
    apparatus: string | null;
    targetDate: string | null;
  }
): boolean {
  return (
    row.athleteId === input.athleteId &&
    row.locationId === input.locationId &&
    row.title === input.title &&
    row.discipline === input.discipline &&
    row.apparatus === input.apparatus &&
    row.targetDate === input.targetDate
  );
}

function idempotencyConflict(): OperationalError {
  return new OperationalError(
    "IDEMPOTENCY_CONFLICT",
    "Esta petición ya se usó con otros datos. Recarga y vuelve a intentarlo.",
    409
  );
}

export async function createAthleteObjective(
  input: ActorInput & { athleteId: string; command: unknown }
): Promise<ProgressWriteResult> {
  const command = createObjectiveCommandSchema.parse(input.command);
  const values = {
    athleteId: input.athleteId,
    locationId: command.locationId,
    title: command.title,
    discipline: command.discipline ?? null,
    apparatus: command.apparatus ?? null,
    targetDate: command.targetDate ?? null,
  };
  return db.transaction(async (tx) => {
    const access = await authorizeAthlete(
      tx,
      await authorizeMember(tx, { ...command, actor: input.actor }),
      { organizationId: command.organizationId, athleteId: input.athleteId, intent: "write" }
    );
    await lockCommand(tx, command.organizationId, `athlete-progress:${command.clientRequestId}`);
    const [prior] = await tx
      .select()
      .from(athleteObjectives)
      .where(
        and(
          eq(athleteObjectives.organizationId, command.organizationId),
          eq(athleteObjectives.clientRequestId, command.clientRequestId)
        )
      )
      .limit(1);
    if (prior) {
      if (!sameObjectiveRequest(prior, values) || !isVisible(access, prior.locationId)) throw idempotencyConflict();
      return { id: prior.id, revision: prior.revision, replayed: true };
    }

    await assertOrganizationOperationalWritable(tx, command.organizationId);
    const memberId = access.member.id;
    const [created] = await tx
      .insert(athleteObjectives)
      .values({
        organizationId: command.organizationId,
        ...values,
        clientRequestId: command.clientRequestId,
        status: "in_progress",
        createdByMemberId: memberId,
        statusChangedByMemberId: memberId,
      })
      .returning({ id: athleteObjectives.id, revision: athleteObjectives.revision });
    if (!created) throw new OperationalError("FEATURE_NOT_AVAILABLE", "No se pudo guardar el objetivo", 503);
    await tx.insert(athleteObjectiveStatusHistory).values({
      organizationId: command.organizationId,
      objectiveId: created.id,
      revision: 1,
      fromStatus: null,
      toStatus: "in_progress",
      changedByMemberId: memberId,
    });
    await appendAuditEntry(tx, {
      organizationId: command.organizationId,
      locationId: command.locationId,
      actorUserId: input.actor.userId,
      action: "athlete_objective.created",
      targetType: "athlete_objective",
      targetId: created.id,
      idempotencyKey: `athlete-progress:objective-created:${command.clientRequestId}`,
      after: { status: "in_progress", revision: 1 },
      metadata: { athleteId: input.athleteId },
    });
    return { id: created.id, revision: created.revision, replayed: false };
  });
}

async function lockObjective(
  tx: TransactionClient,
  input: { organizationId: string; athleteId: string; objectiveId: string }
): Promise<AthleteObjectiveRow | null> {
  const [row] = await tx
    .select()
    .from(athleteObjectives)
    .where(
      and(
        eq(athleteObjectives.organizationId, input.organizationId),
        eq(athleteObjectives.athleteId, input.athleteId),
        eq(athleteObjectives.id, input.objectiveId)
      )
    )
    .limit(1)
    .for("update");
  return row ?? null;
}

export async function changeAthleteObjectiveStatus(
  input: ActorInput & { athleteId: string; objectiveId: string; command: unknown }
): Promise<ProgressWriteResult> {
  const command = changeObjectiveStatusCommandSchema.parse(input.command);
  return db.transaction(async (tx) => {
    const access = await authorizeAthlete(
      tx,
      await authorizeMember(tx, { ...command, actor: input.actor }),
      { organizationId: command.organizationId, athleteId: input.athleteId, intent: "write" }
    );
    const row = await lockObjective(tx, {
      organizationId: command.organizationId,
      athleteId: input.athleteId,
      objectiveId: input.objectiveId,
    });
    if (!row || !isVisible(access, row.locationId)) throw notFound("Objetivo no encontrado");
    if (
      !canChangeObjectiveStatus({
        role: access.role,
        memberId: access.member.id,
        createdByMemberId: row.createdByMemberId,
      })
    ) {
      throw new OperationalError(
        "FORBIDDEN",
        "Solo quien creó el objetivo o la dirección pueden cambiar su estado.",
        403
      );
    }
    if (row.revision !== command.expectedRevision) {
      throw new OperationalError(
        "VERSION_CONFLICT",
        "Otra persona ha cambiado este objetivo. Recarga para ver su estado actual.",
        409,
        { currentRevision: row.revision }
      );
    }
    const from = row.status as ObjectiveStatus;
    if (!isValidObjectiveTransition(from, command.status)) {
      throw new OperationalError("INVALID_STATE_TRANSITION", "El objetivo ya tiene ese estado.", 409);
    }

    await assertOrganizationOperationalWritable(tx, command.organizationId);
    const revision = row.revision + 1;
    const now = new Date();
    const updated = await tx
      .update(athleteObjectives)
      .set({
        status: command.status,
        revision,
        statusChangedByMemberId: access.member.id,
        statusChangedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(athleteObjectives.organizationId, command.organizationId),
          eq(athleteObjectives.id, row.id),
          eq(athleteObjectives.revision, row.revision)
        )
      )
      .returning({ id: athleteObjectives.id });
    if (updated.length !== 1) {
      throw new OperationalError("VERSION_CONFLICT", "El objetivo ha cambiado. Recarga e inténtalo de nuevo.", 409);
    }
    await tx.insert(athleteObjectiveStatusHistory).values({
      organizationId: command.organizationId,
      objectiveId: row.id,
      revision,
      fromStatus: from,
      toStatus: command.status,
      changedByMemberId: access.member.id,
      changedAt: now,
    });
    await appendAuditEntry(tx, {
      organizationId: command.organizationId,
      locationId: command.locationId,
      actorUserId: input.actor.userId,
      action: "athlete_objective.status_changed",
      targetType: "athlete_objective",
      targetId: row.id,
      idempotencyKey: `athlete-progress:objective-status:${row.id}:${revision}`,
      before: { status: from, revision: row.revision },
      after: { status: command.status, revision },
      metadata: { athleteId: input.athleteId },
    });
    return { id: row.id, revision, replayed: false };
  });
}

/* ------------------------------------------------------------------------ */
/* Observaciones                                                             */
/* ------------------------------------------------------------------------ */

type ObservationDraft = {
  organizationId: string;
  locationId: string;
  athleteId: string;
  clientRequestId: string;
  body: string;
  visibility: ObservationVisibility;
  observedOn: string | null;
  sessionId: string | null;
  objectiveId: string | null;
};

function sameObservationRequest(row: AthleteObservationRow, draft: ObservationDraft): boolean {
  return (
    row.athleteId === draft.athleteId &&
    row.locationId === draft.locationId &&
    row.body === draft.body &&
    row.visibility === draft.visibility &&
    row.sessionId === draft.sessionId &&
    row.objectiveId === draft.objectiveId &&
    (draft.observedOn === null || row.observedOn === draft.observedOn)
  );
}

async function sessionDate(
  tx: TransactionClient,
  access: Access,
  input: { organizationId: string; sessionId: string }
): Promise<{ id: string; classTemplateId: string; observedOn: string }> {
  const [session] = await tx
    .select({ id: sessions.id, classTemplateId: sessions.classTemplateId, startsAt: sessions.startsAt })
    .from(sessions)
    .where(
      and(
        eq(sessions.organizationId, input.organizationId),
        eq(sessions.locationId, access.location.id),
        eq(sessions.id, input.sessionId)
      )
    )
    .limit(1);
  if (!session) throw notFound("Sesión no encontrada");
  return {
    id: session.id,
    classTemplateId: session.classTemplateId,
    observedOn: localDateInTimeZone(new Date(session.startsAt), access.location.timezone),
  };
}

async function insertObservation(
  tx: TransactionClient,
  access: AthleteAccess,
  actor: OperationalActor,
  draft: ObservationDraft
): Promise<ProgressWriteResult> {
  await lockCommand(tx, draft.organizationId, `athlete-progress:${draft.clientRequestId}`);
  const [prior] = await tx
    .select()
    .from(athleteObservations)
    .where(
      and(
        eq(athleteObservations.organizationId, draft.organizationId),
        eq(athleteObservations.clientRequestId, draft.clientRequestId)
      )
    )
    .limit(1);
  if (prior) {
    if (!sameObservationRequest(prior, draft) || !isVisible(access, prior.locationId)) throw idempotencyConflict();
    return { id: prior.id, revision: prior.revision, replayed: true };
  }

  const today = localDateInTimeZone(new Date(), access.location.timezone);
  let observedOn = draft.observedOn ?? today;
  if (draft.sessionId) {
    const session = await sessionDate(tx, access, {
      organizationId: draft.organizationId,
      sessionId: draft.sessionId,
    });
    observedOn = draft.observedOn ?? session.observedOn;
  }
  if (observedOn > today) {
    throw new OperationalError(
      "INVALID_DATE_RANGE",
      "La fecha de la observación no puede ser futura.",
      422
    );
  }
  if (draft.objectiveId) {
    const [objective] = await tx
      .select({ id: athleteObjectives.id, locationId: athleteObjectives.locationId })
      .from(athleteObjectives)
      .where(
        and(
          eq(athleteObjectives.organizationId, draft.organizationId),
          eq(athleteObjectives.athleteId, draft.athleteId),
          eq(athleteObjectives.id, draft.objectiveId)
        )
      )
      .limit(1);
    if (!objective || !isVisible(access, objective.locationId)) throw notFound("Objetivo no encontrado");
  }

  await assertOrganizationOperationalWritable(tx, draft.organizationId);
  const [created] = await tx
    .insert(athleteObservations)
    .values({
      organizationId: draft.organizationId,
      athleteId: draft.athleteId,
      locationId: draft.locationId,
      clientRequestId: draft.clientRequestId,
      body: draft.body,
      visibility: draft.visibility,
      observedOn,
      sessionId: draft.sessionId,
      objectiveId: draft.objectiveId,
      authorMemberId: access.member.id,
      updatedByMemberId: access.member.id,
    })
    .returning({ id: athleteObservations.id, revision: athleteObservations.revision });
  if (!created) throw new OperationalError("FEATURE_NOT_AVAILABLE", "No se pudo guardar la observación", 503);
  await appendAuditEntry(tx, {
    organizationId: draft.organizationId,
    locationId: draft.locationId,
    actorUserId: actor.userId,
    action: "athlete_observation.created",
    targetType: "athlete_observation",
    targetId: created.id,
    idempotencyKey: `athlete-progress:observation-created:${draft.clientRequestId}`,
    // Nunca el texto: puede describir a una menor.
    after: { visibility: draft.visibility, revision: 1 },
    metadata: { athleteId: draft.athleteId, sessionId: draft.sessionId, objectiveId: draft.objectiveId },
  });
  return { id: created.id, revision: created.revision, replayed: false };
}

export async function createAthleteObservation(
  input: ActorInput & { athleteId: string; command: unknown }
): Promise<ProgressWriteResult> {
  const command = createObservationCommandSchema.parse(input.command);
  return db.transaction(async (tx) => {
    const access = await authorizeAthlete(
      tx,
      await authorizeMember(tx, { ...command, actor: input.actor }),
      { organizationId: command.organizationId, athleteId: input.athleteId, intent: "write" }
    );
    return insertObservation(tx, access, input.actor, {
      organizationId: command.organizationId,
      locationId: command.locationId,
      athleteId: input.athleteId,
      clientRequestId: command.clientRequestId,
      body: command.body,
      visibility: command.visibility,
      observedOn: command.observedOn ?? null,
      sessionId: command.sessionId ?? null,
      objectiveId: command.objectiveId ?? null,
    });
  });
}

/**
 * Acceso rápido desde Pasar lista: la sesión debe ser de la sede pedida y la
 * inscripción, de la clase de esa sesión. La gimnasta sale de la inscripción,
 * nunca del cuerpo de la petición.
 */
export async function createSessionObservation(
  input: ActorInput & { sessionId: string; command: unknown }
): Promise<ProgressWriteResult & { athleteId: string }> {
  const command = sessionObservationCommandSchema.parse(input.command);
  return db.transaction(async (tx) => {
    const memberAccess = await authorizeMember(tx, { ...command, actor: input.actor });
    const session = await sessionDate(tx, memberAccess, {
      organizationId: command.organizationId,
      sessionId: input.sessionId,
    });
    const [enrollment] = await tx
      .select({ athleteId: enrollments.athleteId })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.organizationId, command.organizationId),
          eq(enrollments.id, command.enrollmentId),
          eq(enrollments.locationId, memberAccess.location.id),
          eq(enrollments.classTemplateId, session.classTemplateId)
        )
      )
      .limit(1);
    if (!enrollment) throw notFound("Inscripción no encontrada en esta sesión");
    const access = await authorizeAthlete(tx, memberAccess, {
      organizationId: command.organizationId,
      athleteId: enrollment.athleteId,
      intent: "write",
    });
    const result = await insertObservation(tx, access, input.actor, {
      organizationId: command.organizationId,
      locationId: command.locationId,
      athleteId: enrollment.athleteId,
      clientRequestId: command.clientRequestId,
      body: command.body,
      visibility: command.visibility,
      observedOn: null,
      sessionId: session.id,
      objectiveId: null,
    });
    return { ...result, athleteId: enrollment.athleteId };
  });
}

export async function updateAthleteObservation(
  input: ActorInput & { athleteId: string; observationId: string; command: unknown }
): Promise<ProgressWriteResult> {
  const command = updateObservationCommandSchema.parse(input.command);
  return db.transaction(async (tx) => {
    const access = await authorizeAthlete(
      tx,
      await authorizeMember(tx, { ...command, actor: input.actor }),
      { organizationId: command.organizationId, athleteId: input.athleteId, intent: "write" }
    );
    const [row] = await tx
      .select()
      .from(athleteObservations)
      .where(
        and(
          eq(athleteObservations.organizationId, command.organizationId),
          eq(athleteObservations.athleteId, input.athleteId),
          eq(athleteObservations.id, input.observationId)
        )
      )
      .limit(1)
      .for("update");
    if (!row || !isVisible(access, row.locationId)) throw notFound("Observación no encontrada");
    if (
      !canEditObservation({ role: access.role, memberId: access.member.id, authorMemberId: row.authorMemberId })
    ) {
      throw new OperationalError(
        "FORBIDDEN",
        "Solo quien escribió la observación o la dirección pueden editarla.",
        403
      );
    }
    if (row.revision !== command.expectedRevision) {
      throw new OperationalError(
        "VERSION_CONFLICT",
        "Otra persona ha cambiado esta observación. Recarga para ver la versión actual.",
        409,
        { currentRevision: row.revision }
      );
    }

    await assertOrganizationOperationalWritable(tx, command.organizationId);
    const revision = row.revision + 1;
    const updated = await tx
      .update(athleteObservations)
      .set({
        body: command.body,
        visibility: command.visibility,
        revision,
        updatedByMemberId: access.member.id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(athleteObservations.organizationId, command.organizationId),
          eq(athleteObservations.id, row.id),
          eq(athleteObservations.revision, row.revision)
        )
      )
      .returning({ id: athleteObservations.id });
    if (updated.length !== 1) {
      throw new OperationalError("VERSION_CONFLICT", "La observación ha cambiado. Recarga e inténtalo de nuevo.", 409);
    }
    await appendAuditEntry(tx, {
      organizationId: command.organizationId,
      locationId: command.locationId,
      actorUserId: input.actor.userId,
      action: "athlete_observation.updated",
      targetType: "athlete_observation",
      targetId: row.id,
      idempotencyKey: `athlete-progress:observation-updated:${row.id}:${revision}`,
      before: { visibility: row.visibility, revision: row.revision },
      after: { visibility: command.visibility, revision },
      metadata: { athleteId: input.athleteId },
    });
    return { id: row.id, revision, replayed: false };
  });
}
