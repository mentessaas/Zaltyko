import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import type { TransactionClient } from "@/lib/db-transactions";
import {
  canEditObservation,
  createObservationCommandSchema,
  localDateInTimeZone,
  sessionObservationCommandSchema,
  updateObservationCommandSchema,
  type ObservationVisibility,
  type ProgressWriteResult,
} from "@/modules/athlete-progress/domain/athlete-progress";
import {
  athleteObjectives,
  athleteObservations,
  type AthleteObservationRow,
} from "@/modules/athlete-progress/infrastructure/athlete-progress-schema";
import { assertOrganizationOperationalWritable } from "@/modules/saas-billing/application/organization-usage";
import type { OperationalActor } from "@/modules/shared/application/actor";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { appendAuditEntry, lockCommand } from "@/modules/shared/infrastructure/transactional-records";

import {
  assertAthleteInSession,
  athleteOfSessionEnrollment,
  authorizeAthlete,
  authorizeMember,
  idempotencyConflict,
  isVisible,
  loadSessionAtLocation,
  notFound,
  type ActorInput,
  type AthleteAccess,
} from "./athlete-progress-access";

/** Observaciones por gimnasta (P2 #17). Uso interno: entra por la fachada. */

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

function futureDate(message: string): OperationalError {
  return new OperationalError("INVALID_DATE_RANGE", message, 422);
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
  if (draft.observedOn && draft.observedOn > today) {
    throw futureDate("La fecha de la observación no puede ser futura.");
  }
  let observedOn = draft.observedOn ?? today;
  if (draft.sessionId) {
    // La sesión es de esta sede, ya ha ocurrido respecto a la fecha de la
    // observación (o a hoy) y la gimnasta participaba en ella.
    const session = await loadSessionAtLocation(tx, access, {
      organizationId: draft.organizationId,
      sessionId: draft.sessionId,
    });
    if (session.sessionDate > (draft.observedOn ?? today)) {
      throw futureDate("La sesión es posterior a la fecha de la observación.");
    }
    await assertAthleteInSession(tx, {
      organizationId: draft.organizationId,
      locationId: access.location.id,
      athleteId: draft.athleteId,
      session,
    });
    observedOn = draft.observedOn ?? session.sessionDate;
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
    const access = await authorizeAthlete(tx, await authorizeMember(tx, { ...command, actor: input.actor }), {
      organizationId: command.organizationId,
      athleteId: input.athleteId,
      intent: "write",
    });
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
    const session = await loadSessionAtLocation(tx, memberAccess, {
      organizationId: command.organizationId,
      sessionId: input.sessionId,
    });
    const athleteId = await athleteOfSessionEnrollment(tx, memberAccess, {
      organizationId: command.organizationId,
      enrollmentId: command.enrollmentId,
      session,
    });
    const access = await authorizeAthlete(tx, memberAccess, {
      organizationId: command.organizationId,
      athleteId,
      intent: "write",
    });
    const result = await insertObservation(tx, access, input.actor, {
      organizationId: command.organizationId,
      locationId: command.locationId,
      athleteId,
      clientRequestId: command.clientRequestId,
      body: command.body,
      visibility: command.visibility,
      observedOn: null,
      sessionId: session.id,
      objectiveId: null,
    });
    return { ...result, athleteId };
  });
}

export async function updateAthleteObservation(
  input: ActorInput & { athleteId: string; observationId: string; command: unknown }
): Promise<ProgressWriteResult> {
  const command = updateObservationCommandSchema.parse(input.command);
  return db.transaction(async (tx) => {
    const access = await authorizeAthlete(tx, await authorizeMember(tx, { ...command, actor: input.actor }), {
      organizationId: command.organizationId,
      athleteId: input.athleteId,
      intent: "write",
    });
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
    if (!canEditObservation({ role: access.role, memberId: access.member.id, authorMemberId: row.authorMemberId })) {
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
