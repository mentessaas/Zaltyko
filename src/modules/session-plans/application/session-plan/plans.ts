import { randomUUID } from "node:crypto";

import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import type { TransactionClient } from "@/lib/db-transactions";
import { athleteObjectives } from "@/modules/athlete-progress/infrastructure/athlete-progress-schema";
import { assertOrganizationOperationalWritable } from "@/modules/saas-billing/application/organization-usage";
import {
  canManageClassPlanTemplate,
  canMarkBlocks,
  markBlockCommandSchema,
  parseStoredTemplateBlocks,
  saveSessionPlanCommandSchema,
  sessionPlanQuerySchema,
  SESSION_PLAN_ROLES,
  type BlockMarkResult,
  type SaveSessionPlanCommand,
  type SessionPlanObjectiveView,
  type SessionPlanPageView,
  type SessionPlanView,
  type SessionPlanWriteResult,
  type TemplateBlock,
} from "@/modules/session-plans/domain/session-plan";
import {
  classPlanTemplates,
  sessionPlanBlocks,
  sessionPlanObjectives,
  sessionPlans,
  type SessionPlanRow,
} from "@/modules/session-plans/infrastructure/session-plan-schema";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { appendAuditEntry, lockCommand } from "@/modules/shared/infrastructure/transactional-records";

import {
  assertSessionEditable,
  authorizeMember,
  isVisible,
  loadSession,
  notFound,
  sessionParticipants,
  staleRevision,
  type Access,
  type ActorInput,
  type PlannedSession,
} from "./access";

/** Plan de una sesión (P2 #17, segunda parte). Uso interno: entra por la fachada. */

const now = () => new Date();

function invalidObjective(): OperationalError {
  // Mismo mensaje para un objetivo inexistente, de otra academia, de otra sede
  // no visible o de una gimnasta que no está en la sesión: no revela cuál.
  return new OperationalError(
    "INVALID_RELATION",
    "Algún objetivo no es de una gimnasta de esta sesión.",
    422
  );
}

async function loadPlan(
  tx: TransactionClient,
  input: { organizationId: string; sessionId: string; forUpdate: boolean }
): Promise<SessionPlanRow | null> {
  const query = tx
    .select()
    .from(sessionPlans)
    .where(and(eq(sessionPlans.organizationId, input.organizationId), eq(sessionPlans.sessionId, input.sessionId)))
    .limit(1);
  const [row] = input.forUpdate ? await query.for("update") : await query;
  return row ?? null;
}

type ObjectiveRow = { id: string; athleteId: string; title: string; status: string; locationId: string };

async function loadObjectives(
  tx: TransactionClient,
  organizationId: string,
  ids: readonly string[]
): Promise<ObjectiveRow[]> {
  if (ids.length === 0) return [];
  return tx
    .select({
      id: athleteObjectives.id,
      athleteId: athleteObjectives.athleteId,
      title: athleteObjectives.title,
      status: athleteObjectives.status,
      locationId: athleteObjectives.locationId,
    })
    .from(athleteObjectives)
    .where(and(eq(athleteObjectives.organizationId, organizationId), inArray(athleteObjectives.id, [...ids])))
    .limit(ids.length);
}

/**
 * Un objetivo se vincula solo si es de una gimnasta que participa en la sesión
 * y quien edita ve la sede desde la que se creó.
 */
async function validatedObjectives(
  tx: TransactionClient,
  access: Access,
  input: { organizationId: string; session: PlannedSession; objectiveIds: readonly string[] }
): Promise<ObjectiveRow[]> {
  if (input.objectiveIds.length === 0) return [];
  const rows = await loadObjectives(tx, input.organizationId, input.objectiveIds);
  if (rows.length !== input.objectiveIds.length) throw invalidObjective();
  const participants = await sessionParticipants(tx, {
    organizationId: input.organizationId,
    locationId: access.location.id,
    session: input.session,
  });
  for (const row of rows) {
    if (!participants.has(row.athleteId) || !isVisible(access, row.locationId)) throw invalidObjective();
  }
  return rows;
}

async function readPlanView(
  tx: TransactionClient,
  access: Access,
  input: { organizationId: string; plan: SessionPlanRow; participants: Map<string, string> }
): Promise<SessionPlanView> {
  const blocks = await tx
    .select()
    .from(sessionPlanBlocks)
    .where(
      and(eq(sessionPlanBlocks.organizationId, input.organizationId), eq(sessionPlanBlocks.planId, input.plan.id))
    )
    .orderBy(asc(sessionPlanBlocks.position))
    .limit(20);
  // unbounded-read-ok: los vínculos de un plan están limitados a PLAN_OBJECTIVES_MAX por la validación de escritura.
  const links = await tx
    .select({ objectiveId: sessionPlanObjectives.objectiveId })
    .from(sessionPlanObjectives)
    .where(
      and(
        eq(sessionPlanObjectives.organizationId, input.organizationId),
        eq(sessionPlanObjectives.planId, input.plan.id)
      )
    );
  const objectives = await loadObjectives(
    tx,
    input.organizationId,
    links.map((link) => link.objectiveId)
  );
  return {
    id: input.plan.id,
    revision: input.plan.revision,
    focus: input.plan.focus,
    note: input.plan.note,
    fromTemplateRevision: input.plan.fromTemplateRevision,
    blocks: blocks.map((block) => ({
      id: block.id,
      position: block.position,
      kind: block.kind as TemplateBlock["kind"],
      discipline: block.discipline as TemplateBlock["discipline"],
      apparatus: block.apparatus as TemplateBlock["apparatus"],
      content: block.content,
      durationMinutes: block.durationMinutes,
      done: block.doneAt !== null,
      doneAt: block.doneAt ? new Date(block.doneAt).toISOString() : null,
    })),
    // Un objetivo de una sede que esta persona no ve no se muestra.
    objectives: objectives
      .filter((objective) => isVisible(access, objective.locationId))
      .map((objective) => toObjectiveView(objective, input.participants))
      .sort(byAthleteThenTitle),
    updatedAt: new Date(input.plan.updatedAt).toISOString(),
  };
}

function toObjectiveView(objective: ObjectiveRow, participants: Map<string, string>): SessionPlanObjectiveView {
  return {
    objectiveId: objective.id,
    athleteId: objective.athleteId,
    // Una gimnasta que ya no está en la sesión conserva el vínculo, sin nombre.
    athleteName: participants.get(objective.athleteId) ?? "Gimnasta fuera de la sesión",
    title: objective.title,
    status: objective.status,
  };
}

function byAthleteThenTitle(left: SessionPlanObjectiveView, right: SessionPlanObjectiveView): number {
  return left.athleteName.localeCompare(right.athleteName, "es") || left.title.localeCompare(right.title, "es");
}

export async function getSessionPlan(
  input: ActorInput & { sessionId: string; query: unknown }
): Promise<SessionPlanPageView> {
  const query = sessionPlanQuerySchema.parse(input.query);
  return db.transaction(async (tx) => {
    const access = await authorizeMember(tx, { ...query, actor: input.actor, allowedRoles: SESSION_PLAN_ROLES });
    const session = await loadSession(tx, access, { organizationId: query.organizationId, sessionId: input.sessionId });
    const participants = await sessionParticipants(tx, {
      organizationId: query.organizationId,
      locationId: access.location.id,
      session,
    });
    const plan = await loadPlan(tx, { organizationId: query.organizationId, sessionId: session.id, forUpdate: false });
    const planView = plan ? await readPlanView(tx, access, { organizationId: query.organizationId, plan, participants }) : null;

    const [template] = await tx
      .select({ revision: classPlanTemplates.revision })
      .from(classPlanTemplates)
      .where(
        and(
          eq(classPlanTemplates.organizationId, query.organizationId),
          eq(classPlanTemplates.locationId, access.location.id),
          eq(classPlanTemplates.classTemplateId, session.classTemplateId)
        )
      )
      .limit(1);

    // Opciones: objetivos en curso de las gimnastas de la sesión, visibles.
    const athleteIds = [...participants.keys()];
    const inProgress =
      athleteIds.length === 0
        ? []
        : await tx
            .select({
              id: athleteObjectives.id,
              athleteId: athleteObjectives.athleteId,
              title: athleteObjectives.title,
              status: athleteObjectives.status,
              locationId: athleteObjectives.locationId,
            })
            .from(athleteObjectives)
            .where(
              and(
                eq(athleteObjectives.organizationId, query.organizationId),
                inArray(athleteObjectives.athleteId, athleteIds),
                eq(athleteObjectives.status, "in_progress")
              )
            )
            .limit(500);
    const options = new Map<string, SessionPlanObjectiveView>();
    for (const objective of inProgress) {
      if (isVisible(access, objective.locationId)) options.set(objective.id, toObjectiveView(objective, participants));
    }
    for (const linked of planView?.objectives ?? []) options.set(linked.objectiveId, linked);

    const current = now();
    return {
      session: {
        id: session.id,
        classTemplateId: session.classTemplateId,
        startsAt: session.startsAt.toISOString(),
        started: session.startsAt.getTime() <= current.getTime(),
        cancelled: session.status === "cancelled",
        canMarkBlocks: canMarkBlocks(session, current),
      },
      plan: planView,
      template: { exists: Boolean(template), revision: template?.revision ?? null },
      canManageTemplate: canManageClassPlanTemplate(access.role),
      objectiveOptions: [...options.values()].sort(byAthleteThenTitle),
    };
  });
}

type PlanContent = {
  focus: string | null;
  note: string | null;
  blocks: Array<TemplateBlock & { id?: string | null }>;
  fromTemplateRevision: number | null;
};

async function contentFor(
  tx: TransactionClient,
  access: Access,
  input: { organizationId: string; session: PlannedSession; command: SaveSessionPlanCommand }
): Promise<PlanContent> {
  if (input.command.source === "template") {
    const [template] = await tx
      .select()
      .from(classPlanTemplates)
      .where(
        and(
          eq(classPlanTemplates.organizationId, input.organizationId),
          eq(classPlanTemplates.locationId, access.location.id),
          eq(classPlanTemplates.classTemplateId, input.session.classTemplateId)
        )
      )
      .limit(1);
    if (!template) throw notFound("Esta clase no tiene plantilla de plan");
    // Copia: cambiar la plantilla después no toca este plan.
    return {
      focus: template.focus,
      note: template.note,
      blocks: parseStoredTemplateBlocks(template.blocks),
      fromTemplateRevision: template.revision,
    };
  }
  return {
    focus: input.command.focus ?? null,
    note: input.command.note ?? null,
    blocks: input.command.blocks.map((block) => ({
      id: block.id ?? null,
      kind: block.kind,
      discipline: block.discipline ?? null,
      apparatus: block.apparatus ?? null,
      content: block.content,
      durationMinutes: block.durationMinutes ?? null,
    })),
    fromTemplateRevision: null,
  };
}

async function writeBlocks(
  tx: TransactionClient,
  input: {
    organizationId: string;
    planId: string;
    blocks: PlanContent["blocks"];
    previous: Map<string, { doneAt: Date | null; doneByMemberId: string | null }>;
  }
): Promise<void> {
  await tx
    .delete(sessionPlanBlocks)
    .where(and(eq(sessionPlanBlocks.organizationId, input.organizationId), eq(sessionPlanBlocks.planId, input.planId)));
  if (input.blocks.length === 0) return;
  await tx.insert(sessionPlanBlocks).values(
    input.blocks.map((block, index) => {
      // Un bloque que se conserva mantiene su identificador y su marca de hecho.
      const kept = block.id ? input.previous.get(block.id) : undefined;
      return {
        ...(kept && block.id ? { id: block.id } : {}),
        organizationId: input.organizationId,
        planId: input.planId,
        position: index + 1,
        kind: block.kind,
        discipline: block.discipline,
        apparatus: block.apparatus,
        content: block.content,
        durationMinutes: block.durationMinutes,
        doneAt: kept?.doneAt ?? null,
        doneByMemberId: kept?.doneByMemberId ?? null,
      };
    })
  );
}

async function writeObjectives(
  tx: TransactionClient,
  input: { organizationId: string; planId: string; objectives: ObjectiveRow[] }
): Promise<void> {
  await tx
    .delete(sessionPlanObjectives)
    .where(
      and(eq(sessionPlanObjectives.organizationId, input.organizationId), eq(sessionPlanObjectives.planId, input.planId))
    );
  if (input.objectives.length === 0) return;
  await tx.insert(sessionPlanObjectives).values(
    input.objectives.map((objective) => ({
      organizationId: input.organizationId,
      planId: input.planId,
      athleteId: objective.athleteId,
      objectiveId: objective.id,
    }))
  );
}

export async function saveSessionPlan(
  input: ActorInput & { sessionId: string; command: unknown }
): Promise<SessionPlanWriteResult> {
  const command = saveSessionPlanCommandSchema.parse(input.command);
  const organizationId = command.organizationId;
  return db.transaction(async (tx) => {
    const access = await authorizeMember(tx, { ...command, actor: input.actor, allowedRoles: SESSION_PLAN_ROLES });
    const session = await loadSession(tx, access, { organizationId, sessionId: input.sessionId });
    // Un solo escritor por sesión: el alta y las ediciones se serializan.
    await lockCommand(tx, organizationId, `session-plan:${session.id}`);
    const existing = await loadPlan(tx, { organizationId, sessionId: session.id, forUpdate: true });

    if (command.expectedRevision === null) {
      if (existing) {
        // Reintento de la misma petición de alta: devuelve lo ya creado.
        if (existing.clientRequestId === command.clientRequestId) {
          return { id: existing.id, revision: existing.revision, replayed: true };
        }
        throw new OperationalError(
          "VERSION_CONFLICT",
          "Esta sesión ya tiene plan. Recarga para verlo y editarlo.",
          409
        );
      }
    } else {
      if (!existing) throw notFound("Esta sesión todavía no tiene plan");
      if (existing.revision !== command.expectedRevision) throw staleRevision();
    }

    await assertOrganizationOperationalWritable(tx, organizationId);
    assertSessionEditable(session);
    const content = await contentFor(tx, access, { organizationId, session, command });
    const objectives = await validatedObjectives(tx, access, {
      organizationId,
      session,
      objectiveIds: command.objectiveIds,
    });
    const memberId = access.member.id;

    if (!existing) {
      const [created] = await tx
        .insert(sessionPlans)
        .values({
          organizationId,
          locationId: access.location.id,
          sessionId: session.id,
          clientRequestId: command.clientRequestId,
          focus: content.focus,
          note: content.note,
          fromTemplateRevision: content.fromTemplateRevision,
          createdByMemberId: memberId,
          updatedByMemberId: memberId,
        })
        .returning({ id: sessionPlans.id, revision: sessionPlans.revision });
      if (!created) throw new OperationalError("FEATURE_NOT_AVAILABLE", "No se pudo guardar el plan", 503);
      await writeBlocks(tx, { organizationId, planId: created.id, blocks: content.blocks, previous: new Map() });
      await writeObjectives(tx, { organizationId, planId: created.id, objectives });
      await appendAuditEntry(tx, {
        organizationId,
        locationId: access.location.id,
        actorUserId: input.actor.userId,
        action: "session_plan.created",
        targetType: "session_plan",
        targetId: created.id,
        idempotencyKey: `session-plan:created:${command.clientRequestId}`,
        after: { revision: 1, blocks: content.blocks.length, objectives: objectives.length },
        metadata: { sessionId: session.id, fromTemplateRevision: content.fromTemplateRevision },
      });
      return { id: created.id, revision: created.revision, replayed: false };
    }

    // unbounded-read-ok: los bloques de un plan están limitados a 20 por CHECK.
    const previousBlocks = await tx
      .select({
        id: sessionPlanBlocks.id,
        doneAt: sessionPlanBlocks.doneAt,
        doneByMemberId: sessionPlanBlocks.doneByMemberId,
      })
      .from(sessionPlanBlocks)
      .where(and(eq(sessionPlanBlocks.organizationId, organizationId), eq(sessionPlanBlocks.planId, existing.id)));
    const previous = new Map(previousBlocks.map((block) => [block.id, block]));
    if (content.blocks.some((block) => block.id && !previous.has(block.id))) {
      throw new OperationalError("INVALID_RELATION", "Algún bloque no es de este plan.", 422);
    }
    await writeBlocks(tx, { organizationId, planId: existing.id, blocks: content.blocks, previous });
    await writeObjectives(tx, { organizationId, planId: existing.id, objectives });
    const revision = existing.revision + 1;
    await tx
      .update(sessionPlans)
      .set({
        focus: content.focus,
        note: content.note,
        revision,
        updatedByMemberId: memberId,
        updatedAt: now(),
      })
      .where(and(eq(sessionPlans.organizationId, organizationId), eq(sessionPlans.id, existing.id)));
    await appendAuditEntry(tx, {
      organizationId,
      locationId: access.location.id,
      actorUserId: input.actor.userId,
      action: "session_plan.updated",
      targetType: "session_plan",
      targetId: existing.id,
      idempotencyKey: `session-plan:updated:${existing.id}:${revision}`,
      before: { revision: existing.revision },
      after: { revision, blocks: content.blocks.length, objectives: objectives.length },
      metadata: { sessionId: session.id },
    });
    return { id: existing.id, revision, replayed: false };
  });
}

/**
 * Marca o desmarca un bloque como hecho. Idempotente: pedir el estado que ya
 * tiene no cambia nada (ni la hora ni quién lo marcó). No cambia la revisión
 * del plan, así que no choca con quien lo está editando.
 */
export async function markSessionPlanBlock(
  input: ActorInput & { sessionId: string; blockId: string; command: unknown }
): Promise<BlockMarkResult> {
  const command = markBlockCommandSchema.parse(input.command);
  const organizationId = command.organizationId;
  return db.transaction(async (tx) => {
    const access = await authorizeMember(tx, { ...command, actor: input.actor, allowedRoles: SESSION_PLAN_ROLES });
    const session = await loadSession(tx, access, { organizationId, sessionId: input.sessionId });
    const plan = await loadPlan(tx, { organizationId, sessionId: session.id, forUpdate: false });
    if (!plan) throw notFound("Bloque no encontrado");
    const [block] = await tx
      .select({ id: sessionPlanBlocks.id, doneAt: sessionPlanBlocks.doneAt })
      .from(sessionPlanBlocks)
      .where(
        and(
          eq(sessionPlanBlocks.organizationId, organizationId),
          eq(sessionPlanBlocks.planId, plan.id),
          eq(sessionPlanBlocks.id, input.blockId)
        )
      )
      .limit(1)
      .for("update");
    if (!block) throw notFound("Bloque no encontrado");
    if ((block.doneAt !== null) === command.done) return { id: block.id, done: command.done, replayed: true };

    await assertOrganizationOperationalWritable(tx, organizationId);
    if (!canMarkBlocks(session, now())) {
      throw new OperationalError(
        "INVALID_STATE_TRANSITION",
        session.status === "cancelled"
          ? "La sesión está cancelada: su plan es de solo lectura."
          : "Podrás marcar los bloques cuando empiece la sesión.",
        409
      );
    }
    await tx
      .update(sessionPlanBlocks)
      .set(command.done ? { doneAt: now(), doneByMemberId: access.member.id } : { doneAt: null, doneByMemberId: null })
      .where(and(eq(sessionPlanBlocks.organizationId, organizationId), eq(sessionPlanBlocks.id, block.id)));
    await appendAuditEntry(tx, {
      organizationId,
      locationId: access.location.id,
      actorUserId: input.actor.userId,
      action: command.done ? "session_plan_block.done" : "session_plan_block.undone",
      targetType: "session_plan_block",
      targetId: block.id,
      idempotencyKey: `session-plan-block:${block.id}:${randomUUID()}`,
      after: { done: command.done },
      metadata: { sessionId: session.id, planId: plan.id },
    });
    return { id: block.id, done: command.done, replayed: false };
  });
}
