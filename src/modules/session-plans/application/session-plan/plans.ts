import { randomUUID } from "node:crypto";

import { and, asc, eq, inArray, notInArray } from "drizzle-orm";

import { db } from "@/db";
import type { TransactionClient } from "@/lib/db-transactions";
import {
  findInProgressObjectivesForPlanning,
  findObjectivesForPlanning,
  type PlanningObjective,
} from "@/modules/athlete-progress/application/athlete-progress-service";
import { assertOrganizationOperationalWritable } from "@/modules/saas-billing/application/organization-usage";
import {
  BLOCKS_MAX,
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
  type SessionPlanBlockRow,
  type SessionPlanRow,
} from "@/modules/session-plans/infrastructure/session-plan-schema";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { retryableDbConflictError } from "@/modules/shared/infrastructure/retryable-db-conflict";
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

/**
 * Guion de una sesión (P2 #17, segunda parte; en código, «session plan»). Uso
 * interno: entra por la fachada.
 *
 * Concurrencia: guardar el guion y marcar un bloque toman el mismo cerrojo por
 * sesión (lockCommand con planLockKey), así que una marca nunca se pierde ni
 * da un 404 falso por una edición simultánea. Además, editar actualiza los
 * bloques en su sitio (mismo id); la unicidad de posición es diferida.
 */

const now = () => new Date();
const OBJECTIVE_OPTIONS_LIMIT = 500;

export function planLockKey(sessionId: string): string {
  return `session-plan:${sessionId}`;
}

function invalidObjective(): OperationalError {
  // Mismo mensaje para un objetivo inexistente, de otra academia, de otra sede
  // no visible, que no está en curso o de una gimnasta que no está en la
  // sesión: no revela cuál.
  return new OperationalError(
    "INVALID_RELATION",
    "Algún objetivo no está en curso o no es de una gimnasta de esta sesión.",
    422
  );
}

function idempotencyConflict(): OperationalError {
  return new OperationalError(
    "IDEMPOTENCY_CONFLICT",
    "Esta petición ya se usó con otros datos. Recarga y vuelve a intentarlo.",
    409
  );
}

function alreadyHasPlan(): OperationalError {
  return new OperationalError("VERSION_CONFLICT", "Esta sesión ya tiene guion. Recarga para verlo y editarlo.", 409);
}

/**
 * Las restricciones únicas son la última barrera ante dos peticiones a la vez
 * (por ejemplo, el mismo clientRequestId en dos sesiones distintas). Se
 * responden como 409 claros, nunca como 500.
 */
function uniqueViolation(error: unknown): OperationalError | null {
  const failure = error as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  const cause = failure?.cause ?? failure;
  if (cause?.code !== "23505") return null;
  if (cause.constraint === "session_plans_session_uq") return alreadyHasPlan();
  if (cause.constraint === "session_plans_request_uq") return idempotencyConflict();
  // Cualquier otra unicidad (por ejemplo, la posición diferida de los bloques
  // al confirmar) es una escritura concurrente: se reintenta, no es idempotencia.
  return retryableDbConflictError("Otra persona estaba guardando a la vez. Recarga y vuelve a intentarlo.");
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

async function loadBlocks(tx: TransactionClient, organizationId: string, planId: string): Promise<SessionPlanBlockRow[]> {
  return tx
    .select()
    .from(sessionPlanBlocks)
    .where(and(eq(sessionPlanBlocks.organizationId, organizationId), eq(sessionPlanBlocks.planId, planId)))
    .orderBy(asc(sessionPlanBlocks.position))
    .limit(BLOCKS_MAX);
}

/** Todos los vínculos del guion, también los de sedes que quien lee no ve. */
async function loadLinkedObjectives(
  tx: TransactionClient,
  organizationId: string,
  planId: string
): Promise<PlanningObjective[]> {
  // unbounded-read-ok: los vínculos de un guion están limitados por la validación de escritura.
  const links = await tx
    .select({ objectiveId: sessionPlanObjectives.objectiveId })
    .from(sessionPlanObjectives)
    .where(and(eq(sessionPlanObjectives.organizationId, organizationId), eq(sessionPlanObjectives.planId, planId)));
  return findObjectivesForPlanning(tx, { organizationId, objectiveIds: links.map((link) => link.objectiveId) });
}

function toObjectiveView(objective: PlanningObjective, participants: Map<string, string>): SessionPlanObjectiveView {
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

async function readPlanView(
  tx: TransactionClient,
  access: Access,
  input: { organizationId: string; plan: SessionPlanRow; participants: Map<string, string> }
): Promise<SessionPlanView> {
  const blocks = await loadBlocks(tx, input.organizationId, input.plan.id);
  const objectives = await loadLinkedObjectives(tx, input.organizationId, input.plan.id);
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
    // Un objetivo de una sede que esta persona no ve no se muestra; al guardar,
    // el servidor lo conserva (resolveObjectiveLinks).
    objectives: objectives
      .filter((objective) => isVisible(access, objective.locationId))
      .map((objective) => toObjectiveView(objective, input.participants))
      .sort(byAthleteThenTitle),
    updatedAt: new Date(input.plan.updatedAt).toISOString(),
  };
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

    // Opciones: objetivos en curso de las gimnastas de la sesión, visibles,
    // más los ya vinculados que esta persona ve.
    const inProgress = await findInProgressObjectivesForPlanning(tx, {
      organizationId: query.organizationId,
      athleteIds: [...participants.keys()],
      limit: OBJECTIVE_OPTIONS_LIMIT,
    });
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
  blocks: Array<TemplateBlock & { id: string | null }>;
  fromTemplateRevision: number | null;
};

function manualContent(command: SaveSessionPlanCommand): PlanContent {
  return {
    focus: command.focus ?? null,
    note: command.note ?? null,
    blocks: command.blocks.map((block) => ({
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

async function contentFor(
  tx: TransactionClient,
  access: Access,
  input: { organizationId: string; session: PlannedSession; command: SaveSessionPlanCommand }
): Promise<PlanContent> {
  if (input.command.source !== "template") return manualContent(input.command);
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
  if (!template) throw notFound("Esta clase no tiene modelo");
  // Copia: cambiar el modelo después no toca este guion.
  return {
    focus: template.focus,
    note: template.note,
    blocks: parseStoredTemplateBlocks(template.blocks).map((block) => ({ ...block, id: null })),
    fromTemplateRevision: template.revision,
  };
}

/**
 * ¿La petición repetida pide exactamente lo que ya está guardado? Compara foco,
 * nota, bloques en orden (un bloque sin id coincide con el que se creó para
 * él) y los vínculos que quien guarda ve.
 */
async function storedMatches(
  tx: TransactionClient,
  access: Access,
  input: { organizationId: string; plan: SessionPlanRow; command: SaveSessionPlanCommand }
): Promise<boolean> {
  if (input.command.source === "template") return true;
  const content = manualContent(input.command);
  if (input.plan.focus !== content.focus || input.plan.note !== content.note) return false;
  const blocks = await loadBlocks(tx, input.organizationId, input.plan.id);
  if (blocks.length !== content.blocks.length) return false;
  const sameBlocks = blocks.every((stored, index) => {
    const wanted = content.blocks[index]!;
    return (
      (wanted.id === null || wanted.id === stored.id) &&
      stored.kind === wanted.kind &&
      stored.discipline === wanted.discipline &&
      stored.apparatus === wanted.apparatus &&
      stored.content === wanted.content &&
      stored.durationMinutes === wanted.durationMinutes
    );
  });
  if (!sameBlocks) return false;
  const visible = (await loadLinkedObjectives(tx, input.organizationId, input.plan.id))
    .filter((objective) => isVisible(access, objective.locationId))
    .map((objective) => objective.id)
    .sort();
  return JSON.stringify(visible) === JSON.stringify([...input.command.objectiveIds].sort());
}

/**
 * Vínculos finales del guion:
 * - los vínculos existentes que quien guarda no ve (otra sede) se conservan
 *   siempre: no puede quitar lo que no ve;
 * - los existentes que sigue pidiendo se conservan aunque la gimnasta ya no
 *   participe o el objetivo ya no esté en curso;
 * - solo los NUEVOS se validan: objetivo de la academia, en curso, de una
 *   gimnasta que participa en la sesión y de una sede que quien guarda ve.
 */
async function resolveObjectiveLinks(
  tx: TransactionClient,
  access: Access,
  input: {
    organizationId: string;
    session: PlannedSession;
    requested: readonly string[];
    existing: PlanningObjective[];
  }
): Promise<PlanningObjective[]> {
  const existingById = new Map(input.existing.map((objective) => [objective.id, objective]));
  const final = new Map<string, PlanningObjective>();
  for (const objective of input.existing) {
    if (!isVisible(access, objective.locationId)) final.set(objective.id, objective);
  }
  const newIds: string[] = [];
  for (const id of input.requested) {
    const kept = existingById.get(id);
    if (kept) final.set(id, kept);
    else newIds.push(id);
  }
  if (newIds.length > 0) {
    const rows = await findObjectivesForPlanning(tx, { organizationId: input.organizationId, objectiveIds: newIds });
    if (rows.length !== newIds.length) throw invalidObjective();
    const participants = await sessionParticipants(tx, {
      organizationId: input.organizationId,
      locationId: access.location.id,
      session: input.session,
    });
    for (const row of rows) {
      if (row.status !== "in_progress" || !participants.has(row.athleteId) || !isVisible(access, row.locationId)) {
        throw invalidObjective();
      }
      final.set(row.id, row);
    }
  }
  return [...final.values()];
}

/**
 * Bloques en su sitio: los conservados se actualizan por id (su marca de hecho
 * no se toca), los quitados se borran y los nuevos se insertan. La unicidad de
 * posición es diferida, así que el orden de estas sentencias no importa.
 */
async function writeBlocks(
  tx: TransactionClient,
  input: { organizationId: string; planId: string; blocks: PlanContent["blocks"]; previousIds: Set<string> }
): Promise<void> {
  const keptIds = input.blocks.map((block) => block.id).filter((id): id is string => Boolean(id));
  const removed = [...input.previousIds].filter((id) => !keptIds.includes(id));
  if (removed.length > 0) {
    await tx
      .delete(sessionPlanBlocks)
      .where(
        and(
          eq(sessionPlanBlocks.organizationId, input.organizationId),
          eq(sessionPlanBlocks.planId, input.planId),
          inArray(sessionPlanBlocks.id, removed)
        )
      );
  }
  const inserts: Array<typeof sessionPlanBlocks.$inferInsert> = [];
  for (const [index, block] of input.blocks.entries()) {
    const values = {
      position: index + 1,
      kind: block.kind,
      discipline: block.discipline,
      apparatus: block.apparatus,
      content: block.content,
      durationMinutes: block.durationMinutes,
    };
    if (block.id) {
      await tx
        .update(sessionPlanBlocks)
        .set(values)
        .where(
          and(
            eq(sessionPlanBlocks.organizationId, input.organizationId),
            eq(sessionPlanBlocks.planId, input.planId),
            eq(sessionPlanBlocks.id, block.id)
          )
        );
    } else {
      inserts.push({ organizationId: input.organizationId, planId: input.planId, ...values });
    }
  }
  if (inserts.length > 0) await tx.insert(sessionPlanBlocks).values(inserts);
}

async function writeObjectives(
  tx: TransactionClient,
  input: { organizationId: string; planId: string; objectives: PlanningObjective[]; previousIds: Set<string> }
): Promise<void> {
  const finalIds = input.objectives.map((objective) => objective.id);
  await tx
    .delete(sessionPlanObjectives)
    .where(
      and(
        eq(sessionPlanObjectives.organizationId, input.organizationId),
        eq(sessionPlanObjectives.planId, input.planId),
        ...(finalIds.length > 0 ? [notInArray(sessionPlanObjectives.objectiveId, finalIds)] : [])
      )
    );
  const added = input.objectives.filter((objective) => !input.previousIds.has(objective.id));
  if (added.length === 0) return;
  await tx.insert(sessionPlanObjectives).values(
    added.map((objective) => ({
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
  try {
    return await db.transaction(async (tx) => {
      const access = await authorizeMember(tx, { ...command, actor: input.actor, allowedRoles: SESSION_PLAN_ROLES });
      const session = await loadSession(tx, access, { organizationId, sessionId: input.sessionId });
      // Un solo escritor por sesión: alta, ediciones y marcas se serializan.
      await lockCommand(tx, organizationId, planLockKey(session.id));
      const existing = await loadPlan(tx, { organizationId, sessionId: session.id, forUpdate: true });

      if (command.expectedRevision === null) {
        if (existing) {
          // Reintento del mismo alta: devuelve lo ya creado.
          if (existing.clientRequestId === command.clientRequestId) {
            if (!(await storedMatches(tx, access, { organizationId, plan: existing, command }))) throw idempotencyConflict();
            return { id: existing.id, revision: existing.revision, replayed: true };
          }
          throw alreadyHasPlan();
        }
        const [reused] = await tx
          .select({ id: sessionPlans.id })
          .from(sessionPlans)
          .where(and(eq(sessionPlans.organizationId, organizationId), eq(sessionPlans.clientRequestId, command.clientRequestId)))
          .limit(1);
        if (reused) throw idempotencyConflict();
      } else {
        if (!existing) throw notFound("Esta sesión todavía no tiene guion");
        // Reintento de una edición ya guardada: misma petición y mismo contenido.
        if (
          existing.lastRequestId === command.clientRequestId &&
          existing.revision === command.expectedRevision + 1
        ) {
          if (!(await storedMatches(tx, access, { organizationId, plan: existing, command }))) throw idempotencyConflict();
          return { id: existing.id, revision: existing.revision, replayed: true };
        }
        if (existing.revision !== command.expectedRevision) throw staleRevision();
      }

      await assertOrganizationOperationalWritable(tx, organizationId);
      assertSessionEditable(session);
      const content = await contentFor(tx, access, { organizationId, session, command });
      const memberId = access.member.id;

      if (!existing) {
        const objectives = await resolveObjectiveLinks(tx, access, {
          organizationId,
          session,
          requested: command.objectiveIds,
          existing: [],
        });
        const [created] = await tx
          .insert(sessionPlans)
          .values({
            organizationId,
            locationId: access.location.id,
            sessionId: session.id,
            clientRequestId: command.clientRequestId,
            lastRequestId: command.clientRequestId,
            focus: content.focus,
            note: content.note,
            fromTemplateRevision: content.fromTemplateRevision,
            createdByMemberId: memberId,
            updatedByMemberId: memberId,
          })
          .returning({ id: sessionPlans.id, revision: sessionPlans.revision });
        if (!created) throw new OperationalError("FEATURE_NOT_AVAILABLE", "No se pudo guardar el guion", 503);
        await writeBlocks(tx, { organizationId, planId: created.id, blocks: content.blocks, previousIds: new Set() });
        await writeObjectives(tx, { organizationId, planId: created.id, objectives, previousIds: new Set() });
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

      const previousBlocks = await loadBlocks(tx, organizationId, existing.id);
      const previousIds = new Set(previousBlocks.map((block) => block.id));
      if (content.blocks.some((block) => block.id && !previousIds.has(block.id))) {
        throw new OperationalError("INVALID_RELATION", "Algún bloque no es de este guion.", 422);
      }
      const existingObjectives = await loadLinkedObjectives(tx, organizationId, existing.id);
      const objectives = await resolveObjectiveLinks(tx, access, {
        organizationId,
        session,
        requested: command.objectiveIds,
        existing: existingObjectives,
      });
      await writeBlocks(tx, { organizationId, planId: existing.id, blocks: content.blocks, previousIds });
      await writeObjectives(tx, {
        organizationId,
        planId: existing.id,
        objectives,
        previousIds: new Set(existingObjectives.map((objective) => objective.id)),
      });
      const revision = existing.revision + 1;
      await tx
        .update(sessionPlans)
        .set({
          focus: content.focus,
          note: content.note,
          revision,
          lastRequestId: command.clientRequestId,
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
  } catch (error) {
    throw uniqueViolation(error) ?? error;
  }
}

/**
 * Marca o desmarca un bloque como hecho. Toma el cerrojo del guion antes de
 * leer, así que espera a cualquier edición en curso y nunca la pisa.
 * Idempotente: pedir el estado que ya tiene no cambia nada (ni la hora ni
 * quién lo marcó). No cambia la revisión del guion.
 */
export async function markSessionPlanBlock(
  input: ActorInput & { sessionId: string; blockId: string; command: unknown }
): Promise<BlockMarkResult> {
  const command = markBlockCommandSchema.parse(input.command);
  const organizationId = command.organizationId;
  return db.transaction(async (tx) => {
    const access = await authorizeMember(tx, { ...command, actor: input.actor, allowedRoles: SESSION_PLAN_ROLES });
    const session = await loadSession(tx, access, { organizationId, sessionId: input.sessionId });
    await lockCommand(tx, organizationId, planLockKey(session.id));
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
          ? "La sesión está cancelada: su guion es de solo lectura."
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
