import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import type { TransactionClient } from "@/lib/db-transactions";
import {
  canChangeObjectiveStatus,
  changeObjectiveStatusCommandSchema,
  createObjectiveCommandSchema,
  isValidObjectiveTransition,
  type ObjectiveStatus,
  type ProgressWriteResult,
} from "@/modules/athlete-progress/domain/athlete-progress";
import {
  athleteObjectives,
  athleteObjectiveStatusHistory,
  type AthleteObjectiveRow,
} from "@/modules/athlete-progress/infrastructure/athlete-progress-schema";
import { assertOrganizationOperationalWritable } from "@/modules/saas-billing/application/organization-usage";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { appendAuditEntry, lockCommand } from "@/modules/shared/infrastructure/transactional-records";

import {
  authorizeAthlete,
  authorizeMember,
  idempotencyConflict,
  isVisible,
  notFound,
  type ActorInput,
} from "./access";

/** Objetivos por gimnasta (P2 #17). Uso interno: entra por la fachada. */

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
    const access = await authorizeAthlete(tx, await authorizeMember(tx, { ...command, actor: input.actor }), {
      organizationId: command.organizationId,
      athleteId: input.athleteId,
      intent: "write",
    });
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
    const access = await authorizeAthlete(tx, await authorizeMember(tx, { ...command, actor: input.actor }), {
      organizationId: command.organizationId,
      athleteId: input.athleteId,
      intent: "write",
    });
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
