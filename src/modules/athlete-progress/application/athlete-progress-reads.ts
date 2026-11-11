import { and, asc, desc, eq, inArray, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { organizationMembers, people, staffProfiles } from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import {
  athleteProgressQuerySchema,
  canChangeObjectiveStatus,
  canEditObservation,
  OBJECTIVES_LIMIT,
  OBSERVATIONS_PAGE_SIZE,
  sessionAthleteProgressQuerySchema,
  type Apparatus,
  type AthleteObjectiveView,
  type AthleteObservationView,
  type AthleteProgressView,
  type Discipline,
  type ObjectiveStatus,
  type ObservationVisibility,
} from "@/modules/athlete-progress/domain/athlete-progress";
import {
  athleteObjectives,
  athleteObjectiveStatusHistory,
  athleteObservations,
} from "@/modules/athlete-progress/infrastructure/athlete-progress-schema";

import {
  athleteOfSessionEnrollment,
  authorizeAthlete,
  authorizeMember,
  loadSessionAtLocation,
  visibleFilter,
  type ActorInput,
  type AthleteAccess,
} from "./athlete-progress-access";

/** Lecturas de objetivos y observaciones (P2 #17). Uso interno: entra por la fachada. */

/** Nombres visibles por rol cuando el miembro no tiene ficha de equipo (glosario). */
const roleFallbackNames: Record<string, string> = {
  owner: "Dirección de la academia",
  admin: "Administración",
  manager: "Coordinador/a",
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
  // unbounded-read-ok: acotada por los ids recibidos (autores de como mucho OBJECTIVES_LIMIT objetivos y OBSERVATIONS_PAGE_SIZE observaciones).
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

async function readProgress(
  tx: TransactionClient,
  access: AthleteAccess,
  input: { organizationId: string; objectiveStatus: ObjectiveStatus | null | undefined }
): Promise<AthleteProgressView> {
  const athleteId = access.athlete.id;
  const objectiveConditions = [
    eq(athleteObjectives.organizationId, input.organizationId),
    eq(athleteObjectives.athleteId, athleteId),
    visibleFilter(access, athleteObjectives.locationId),
    input.objectiveStatus ? eq(athleteObjectives.status, input.objectiveStatus) : undefined,
  ].filter((condition): condition is SQL => Boolean(condition));
  // Se pide uno más del límite para saber si hay más.
  const objectiveRowsPlusOne = await tx
    .select()
    .from(athleteObjectives)
    .where(and(...objectiveConditions))
    .orderBy(desc(athleteObjectives.createdAt), desc(athleteObjectives.id))
    .limit(OBJECTIVES_LIMIT + 1);
  const objectiveRows = objectiveRowsPlusOne.slice(0, OBJECTIVES_LIMIT);

  // unbounded-read-ok: historial de como mucho OBJECTIVES_LIMIT objetivos ya leídos.
  const historyRows = objectiveRows.length
    ? await tx
        .select()
        .from(athleteObjectiveStatusHistory)
        .where(
          and(
            eq(athleteObjectiveStatusHistory.organizationId, input.organizationId),
            inArray(
              athleteObjectiveStatusHistory.objectiveId,
              objectiveRows.map((row) => row.id)
            )
          )
        )
        .orderBy(asc(athleteObjectiveStatusHistory.objectiveId), asc(athleteObjectiveStatusHistory.revision))
    : [];

  const observationConditions = [
    eq(athleteObservations.organizationId, input.organizationId),
    eq(athleteObservations.athleteId, athleteId),
    visibleFilter(access, athleteObservations.locationId),
  ].filter((condition): condition is SQL => Boolean(condition));
  const observationRowsPlusOne = await tx
    .select()
    .from(athleteObservations)
    .where(and(...observationConditions))
    .orderBy(desc(athleteObservations.observedOn), desc(athleteObservations.createdAt), desc(athleteObservations.id))
    .limit(OBSERVATIONS_PAGE_SIZE + 1);
  const observationRows = observationRowsPlusOne.slice(0, OBSERVATIONS_PAGE_SIZE);

  const names = await memberNames(tx, input.organizationId, [
    ...objectiveRows.map((row) => row.createdByMemberId),
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
    moreObjectives: objectiveRowsPlusOne.length > OBJECTIVES_LIMIT,
    moreObservations: observationRowsPlusOne.length > OBSERVATIONS_PAGE_SIZE,
    canWrite: writable,
  };
}

export async function getAthleteProgress(
  input: ActorInput & { athleteId: string; query: unknown }
): Promise<AthleteProgressView> {
  const query = athleteProgressQuerySchema.parse(input.query);
  return db.transaction(async (tx) => {
    const access = await authorizeAthlete(tx, await authorizeMember(tx, { ...query, actor: input.actor }), {
      organizationId: query.organizationId,
      athleteId: input.athleteId,
      intent: "read",
    });
    return readProgress(tx, access, query);
  });
}

/**
 * Lectura desde Pasar lista: la gimnasta sale de su inscripción en la clase
 * de esa sesión (de la sede pedida), nunca de la petición.
 */
export async function getSessionAthleteProgress(
  input: ActorInput & { sessionId: string; query: unknown }
): Promise<AthleteProgressView> {
  const query = sessionAthleteProgressQuerySchema.parse(input.query);
  return db.transaction(async (tx) => {
    const memberAccess = await authorizeMember(tx, { ...query, actor: input.actor });
    const session = await loadSessionAtLocation(tx, memberAccess, {
      organizationId: query.organizationId,
      sessionId: input.sessionId,
    });
    const athleteId = await athleteOfSessionEnrollment(tx, memberAccess, {
      organizationId: query.organizationId,
      enrollmentId: query.enrollmentId,
      session,
    });
    const access = await authorizeAthlete(tx, memberAccess, {
      organizationId: query.organizationId,
      athleteId,
      intent: "read",
    });
    return readProgress(tx, access, query);
  });
}
