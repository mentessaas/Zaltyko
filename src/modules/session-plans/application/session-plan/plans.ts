import { randomUUID } from "node:crypto";

import { and, asc, eq, inArray, isNotNull, notInArray } from "drizzle-orm";

import { db } from "@/db";
import type { TransactionClient } from "@/lib/db-transactions";
import {
  findInProgressObjectivesForPlanning,
  findObjectivesForPlanning,
  type PlanningObjective,
} from "@/modules/athlete-progress/application/athlete-progress-service";
// Directo y no desde la fachada de la biblioteca: lecturas sin autorización
// propia que se hacen dentro de la transacción ya autorizada del guion.
import { findLinkableCatalogElement, getCatalogLinkView } from "@/modules/element-library/application/catalog-reads";
import { elementLibraryUnavailable, isElementLibraryAvailable } from "@/modules/element-library/application/storage";
import { assertOrganizationOperationalWritable } from "@/modules/saas-billing/application/organization-usage";
import {
  BLOCK_CATALOG_LINK_MISMATCH_MESSAGE,
  BLOCK_CATALOG_LINK_NEEDS_APPARATUS_MESSAGE,
  blockCatalogTarget,
  BLOCKS_MAX,
  canManageClassPlanTemplate,
  canMarkBlocks,
  markBlockCommandSchema,
  parseStoredTemplateBlocks,
  saveSessionPlanCommandSchema,
  sessionPlanQuerySchema,
  SESSION_PLAN_ROLES,
  type BlockCatalogLink,
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
  sessionPlanBlockBaseColumns,
  sessionPlanBlocks,
  sessionPlanBlocksBaseInsert,
  sessionPlanObjectives,
  sessionPlans,
  type SessionPlanBlockBaseRow,
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

/** Columnas explícitas: leen igual con o sin la columna de enlace a la biblioteca. */
async function loadBlocks(
  tx: TransactionClient,
  organizationId: string,
  planId: string
): Promise<SessionPlanBlockBaseRow[]> {
  return tx
    .select(sessionPlanBlockBaseColumns)
    .from(sessionPlanBlocks)
    .where(and(eq(sessionPlanBlocks.organizationId, organizationId), eq(sessionPlanBlocks.planId, planId)))
    .orderBy(asc(sessionPlanBlocks.position))
    .limit(BLOCKS_MAX);
}

/**
 * Enlaces con la biblioteca de los bloques de un guion: id del bloque → id del
 * elemento. Solo con la forma «with_catalog_links»; con la «base» la columna
 * no existe y no se nombra.
 */
async function loadBlockLinks(
  tx: TransactionClient,
  access: Access,
  input: { organizationId: string; planId: string }
): Promise<Map<string, string>> {
  const links = new Map<string, string>();
  if (access.storageShape !== "with_catalog_links") return links;
  const rows = await tx
    .select({ id: sessionPlanBlocks.id, catalogElementId: sessionPlanBlocks.catalogElementId })
    .from(sessionPlanBlocks)
    .where(
      and(
        eq(sessionPlanBlocks.organizationId, input.organizationId),
        eq(sessionPlanBlocks.planId, input.planId),
        isNotNull(sessionPlanBlocks.catalogElementId)
      )
    )
    .limit(BLOCKS_MAX);
  for (const row of rows) if (row.catalogElementId) links.set(row.id, row.catalogElementId);
  return links;
}

/**
 * La biblioteca está activa para los bloques: banderas, tablas de la
 * biblioteca y forma «with_catalog_links». Con las banderas apagadas no
 * consulta nada más.
 */
export async function isBlockLibraryOn(tx: TransactionClient, access: Access): Promise<boolean> {
  return access.storageShape === "with_catalog_links" && (await isElementLibraryAvailable(tx));
}

export function catalogLinkNeedsApparatus(): OperationalError {
  return new OperationalError("INVALID_RELATION", BLOCK_CATALOG_LINK_NEEDS_APPARATUS_MESSAGE, 400);
}

export function catalogLinkMismatch(): OperationalError {
  return new OperationalError("INVALID_RELATION", BLOCK_CATALOG_LINK_MISMATCH_MESSAGE, 400);
}

/**
 * ¿Lo ve la academia y es de esa disciplina y aparato? `checked` guarda las
 * respuestas de la misma petición: cada elemento y aparato, una consulta.
 */
export async function isLinkable(
  tx: TransactionClient,
  checked: Map<string, boolean>,
  catalogElementId: string,
  target: { discipline: string; apparatus: string }
): Promise<boolean> {
  const key = `${catalogElementId}:${target.discipline}:${target.apparatus}`;
  let linkable = checked.get(key);
  if (linkable === undefined) {
    linkable = (await findLinkableCatalogElement(tx, catalogElementId, target)) !== null;
    checked.set(key, linkable);
  }
  return linkable;
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
  const links = await loadBlockLinks(tx, access, { organizationId: input.organizationId, planId: input.plan.id });
  const linkViews = links.size > 0 ? await getCatalogLinkView(tx, [...links.values()]) : null;
  const catalogLinkOf = (blockId: string): BlockCatalogLink | null => {
    const catalogId = links.get(blockId);
    if (!catalogId) return null;
    const view = linkViews?.get(catalogId);
    // La clave foránea impide que desaparezca; si aun así faltara, se avisa como retirado.
    return view
      ? { id: catalogId, name: view.name, status: view.status, replacementId: view.replacementId }
      : { id: catalogId, name: "Elemento de la biblioteca", status: "withdrawn", replacementId: null };
  };
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
      catalogLink: catalogLinkOf(block.id),
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
      // Sin las banderas de la biblioteca no consulta nada más.
      libraryAvailable: await isBlockLibraryOn(tx, access),
    };
  });
}

/**
 * `catalogElementId`: ausente conserva el enlace guardado del bloque, `null`
 * lo quita y un uuid lo pone (ADR-0029 §3.2). Solo se escribe con la
 * biblioteca activa.
 */
type PlanBlock = Omit<TemplateBlock, "catalogElementId"> & { id: string | null; catalogElementId?: string | null };

type PlanContent = {
  focus: string | null;
  note: string | null;
  blocks: PlanBlock[];
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
      ...(block.catalogElementId !== undefined ? { catalogElementId: block.catalogElementId } : {}),
    })),
    fromTemplateRevision: null,
  };
}

/**
 * Enlace de un bloque copiado del modelo de la clase: se conserva solo si el
 * elemento sigue visible y es de su disciplina y aparato (ADR-0029 §3.3); si
 * no, o sin la biblioteca activa, el bloque se copia sin enlace.
 */
async function copiedLink(
  tx: TransactionClient,
  block: TemplateBlock,
  input: { libraryOn: boolean; checked: Map<string, boolean> }
): Promise<string | null> {
  if (!input.libraryOn || !block.catalogElementId) return null;
  const target = blockCatalogTarget(block);
  if (!target) return null;
  return (await isLinkable(tx, input.checked, block.catalogElementId, target)) ? block.catalogElementId : null;
}

async function contentFor(
  tx: TransactionClient,
  access: Access,
  input: { organizationId: string; session: PlannedSession; command: SaveSessionPlanCommand; libraryOn: boolean }
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
  const checked = new Map<string, boolean>();
  const blocks: PlanBlock[] = [];
  for (const stored of parseStoredTemplateBlocks(template.blocks)) {
    blocks.push({
      id: null,
      kind: stored.kind,
      discipline: stored.discipline,
      apparatus: stored.apparatus,
      content: stored.content,
      durationMinutes: stored.durationMinutes,
      catalogElementId: await copiedLink(tx, stored, { libraryOn: input.libraryOn, checked }),
    });
  }
  return {
    focus: template.focus,
    note: template.note,
    blocks,
    fromTemplateRevision: template.revision,
  };
}

/**
 * Comprueba los enlaces pedidos de un guion manual (ADR-0029 §3.2), antes de
 * escribir nada. Solo con la biblioteca activa: sin ella, un uuid ya se ha
 * respondido con 503 y `null` o la ausencia no tocan la columna.
 * - ausente: se conserva el enlace guardado, pero no si el bloque cambia de
 *   disciplina o de aparato;
 * - `null`: se quita;
 * - el mismo enlace sin cambiar de disciplina ni de aparato no se comprueba de
 *   nuevo (así se guarda un bloque cuyo elemento ya no está en la biblioteca);
 * - otro uuid: disciplina y aparato del bloque, y elemento visible de ese aparato.
 */
async function assertBlockLinks(
  tx: TransactionClient,
  input: { blocks: PlanBlock[]; previous: SessionPlanBlockBaseRow[]; links: Map<string, string> }
): Promise<void> {
  const previousById = new Map(input.previous.map((block) => [block.id, block] as const));
  const checked = new Map<string, boolean>();
  for (const block of input.blocks) {
    const previous = block.id ? previousById.get(block.id) : undefined;
    const stored = block.id ? input.links.get(block.id) : undefined;
    const sameTarget =
      previous !== undefined && previous.discipline === block.discipline && previous.apparatus === block.apparatus;
    if (block.catalogElementId === undefined) {
      if (stored && !sameTarget) throw catalogLinkMismatch();
      continue;
    }
    if (block.catalogElementId === null) continue;
    if (stored === block.catalogElementId && sameTarget) continue;
    const target = blockCatalogTarget(block);
    if (!target) throw catalogLinkNeedsApparatus();
    if (!(await isLinkable(tx, checked, block.catalogElementId, target))) throw catalogLinkMismatch();
  }
}

/**
 * ¿La petición repetida pide exactamente lo que ya está guardado? Compara foco,
 * nota, bloques en orden (un bloque sin id coincide con el que se creó para
 * él) y los vínculos que quien guarda ve.
 */
async function storedMatches(
  tx: TransactionClient,
  access: Access,
  input: { organizationId: string; plan: SessionPlanRow; command: SaveSessionPlanCommand; libraryOn: boolean }
): Promise<boolean> {
  if (input.command.source === "template") return true;
  const content = manualContent(input.command);
  if (input.plan.focus !== content.focus || input.plan.note !== content.note) return false;
  const blocks = await loadBlocks(tx, input.organizationId, input.plan.id);
  if (blocks.length !== content.blocks.length) return false;
  // El enlace solo cuenta si la petición lo trae y la biblioteca está activa
  // (sin ella, `null` no toca la columna).
  const links = input.libraryOn
    ? await loadBlockLinks(tx, access, { organizationId: input.organizationId, planId: input.plan.id })
    : new Map<string, string>();
  const sameBlocks = blocks.every((stored, index) => {
    const wanted = content.blocks[index]!;
    return (
      (wanted.id === null || wanted.id === stored.id) &&
      stored.kind === wanted.kind &&
      stored.discipline === wanted.discipline &&
      stored.apparatus === wanted.apparatus &&
      stored.content === wanted.content &&
      stored.durationMinutes === wanted.durationMinutes &&
      (!input.libraryOn ||
        wanted.catalogElementId === undefined ||
        (links.get(stored.id) ?? null) === wanted.catalogElementId)
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
  input: {
    organizationId: string;
    planId: string;
    blocks: PlanContent["blocks"];
    previousIds: Set<string>;
    /** Biblioteca activa: solo entonces se nombra la columna de enlace. */
    libraryOn: boolean;
  }
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
  const inserts: Array<typeof sessionPlanBlocksBaseInsert.$inferInsert> = [];
  const insertLinks: Array<string | null> = [];
  for (const [index, block] of input.blocks.entries()) {
    const values = {
      position: index + 1,
      kind: block.kind,
      discipline: block.discipline,
      apparatus: block.apparatus,
      content: block.content,
      durationMinutes: block.durationMinutes,
    };
    // La columna de enlace solo se nombra con la biblioteca activa y si el campo llega.
    const link =
      input.libraryOn && block.catalogElementId !== undefined ? { catalogElementId: block.catalogElementId } : null;
    if (block.id) {
      await tx
        .update(sessionPlanBlocks)
        .set(link ? { ...values, ...link } : values)
        .where(
          and(
            eq(sessionPlanBlocks.organizationId, input.organizationId),
            eq(sessionPlanBlocks.planId, input.planId),
            eq(sessionPlanBlocks.id, block.id)
          )
        );
    } else {
      inserts.push({ organizationId: input.organizationId, planId: input.planId, ...values });
      insertLinks.push(link?.catalogElementId ?? null);
    }
  }
  if (inserts.length === 0) return;
  if (input.libraryOn && insertLinks.some((id) => id !== null)) {
    await tx
      .insert(sessionPlanBlocks)
      .values(inserts.map((block, index) => ({ ...block, catalogElementId: insertLinks[index] ?? null })));
  } else {
    // Sin la columna de enlace: el INSERT vale con o sin ella (queda nula).
    await tx.insert(sessionPlanBlocksBaseInsert).values(inserts);
  }
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
      // Enlaces con la biblioteca (ADR-0029 §3.2): solo con la biblioteca activa
      // (banderas, tablas y forma «with_catalog_links»). Sin ella, pedir un
      // enlace es 503 sin escribir nada, y `null` o la ausencia no tocan nada.
      const libraryOn = await isBlockLibraryOn(tx, access);
      if (
        !libraryOn &&
        command.source === "manual" &&
        command.blocks.some((block) => typeof block.catalogElementId === "string")
      ) {
        throw elementLibraryUnavailable();
      }
      const existing = await loadPlan(tx, { organizationId, sessionId: session.id, forUpdate: true });

      if (command.expectedRevision === null) {
        if (existing) {
          // Reintento del mismo alta: devuelve lo ya creado.
          if (existing.clientRequestId === command.clientRequestId) {
            if (!(await storedMatches(tx, access, { organizationId, plan: existing, command, libraryOn }))) {
              throw idempotencyConflict();
            }
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
          if (!(await storedMatches(tx, access, { organizationId, plan: existing, command, libraryOn }))) {
            throw idempotencyConflict();
          }
          return { id: existing.id, revision: existing.revision, replayed: true };
        }
        if (existing.revision !== command.expectedRevision) throw staleRevision();
      }

      await assertOrganizationOperationalWritable(tx, organizationId);
      assertSessionEditable(session);
      const content = await contentFor(tx, access, { organizationId, session, command, libraryOn });
      const memberId = access.member.id;

      if (!existing) {
        if (libraryOn && command.source === "manual") {
          await assertBlockLinks(tx, { blocks: content.blocks, previous: [], links: new Map() });
        }
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
        await writeBlocks(tx, {
          organizationId,
          planId: created.id,
          blocks: content.blocks,
          previousIds: new Set(),
          libraryOn,
        });
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
      if (libraryOn) {
        const links = await loadBlockLinks(tx, access, { organizationId, planId: existing.id });
        await assertBlockLinks(tx, { blocks: content.blocks, previous: previousBlocks, links });
      }
      const existingObjectives = await loadLinkedObjectives(tx, organizationId, existing.id);
      const objectives = await resolveObjectiveLinks(tx, access, {
        organizationId,
        session,
        requested: command.objectiveIds,
        existing: existingObjectives,
      });
      await writeBlocks(tx, { organizationId, planId: existing.id, blocks: content.blocks, previousIds, libraryOn });
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
