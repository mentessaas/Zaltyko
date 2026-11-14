import { randomUUID } from "node:crypto";

import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import type { TransactionClient } from "@/lib/db-transactions";
import { assertOrganizationOperationalWritable } from "@/modules/saas-billing/application/organization-usage";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { appendAuditEntry, lockCommand } from "@/modules/shared/infrastructure/transactional-records";
import {
  apparatusBelongsToDiscipline,
  canManageTemplates,
  createTemplateCommandSchema,
  saveTemplateCommandSchema,
  templateQuerySchema,
  templatesQuerySchema,
  type SkillApparatus,
  type SkillDiscipline,
  type SkillTemplateSummary,
  type SkillTemplatesListView,
  type SkillTemplateView,
  type TemplateLevelView,
  type TemplateSource,
  type WriteResult,
} from "@/modules/skill-levels/domain/skill-levels";
import { findStarterTemplate, starterTemplateSummaries } from "@/modules/skill-levels/domain/starter-templates";
import {
  skillElements,
  skillLevels,
  skillTemplates,
  type SkillTemplateRow,
} from "@/modules/skill-levels/infrastructure/skill-levels-schema";

import {
  assertCanManageTemplates,
  authorizeMember,
  idempotencyConflict,
  notFound,
  type Access,
  type ActorInput,
} from "./access";

/** Plantillas de niveles de la academia. Uso interno: entra por la fachada. */

/** Tope de plantillas activas por academia: acota las listas y los selectores. */
export const MAX_ACTIVE_TEMPLATES = 40;

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/** El plan en solo lectura se consulta, pero no se escribe. */
export async function isOrganizationWritable(tx: TransactionClient, organizationId: string): Promise<boolean> {
  try {
    await assertOrganizationOperationalWritable(tx, organizationId);
    return true;
  } catch (error) {
    if (error instanceof OperationalError && error.code === "PLAN_OVER_CAPACITY") return false;
    throw error;
  }
}

/* ------------------------------------------------------------------------ */
/* Lectura                                                                   */
/* ------------------------------------------------------------------------ */

export async function loadTemplateRow(
  tx: TransactionClient,
  organizationId: string,
  templateId: string,
  options: { lock?: boolean } = {}
): Promise<SkillTemplateRow> {
  const query = tx
    .select()
    .from(skillTemplates)
    .where(and(eq(skillTemplates.organizationId, organizationId), eq(skillTemplates.id, templateId)))
    .limit(1);
  const [row] = options.lock ? await query.for("update") : await query;
  if (!row) throw notFound("Plantilla no encontrada");
  return row;
}

/** Niveles y elementos activos de una plantilla, en orden. */
export async function loadTemplateLevels(
  tx: TransactionClient,
  organizationId: string,
  templateId: string
): Promise<TemplateLevelView[]> {
  // unbounded-read-ok: una plantilla admite como mucho 20 niveles y 300 elementos activos (dominio).
  const levelRows = await tx
    .select()
    .from(skillLevels)
    .where(
      and(
        eq(skillLevels.organizationId, organizationId),
        eq(skillLevels.templateId, templateId),
        isNull(skillLevels.archivedAt)
      )
    )
    .orderBy(asc(skillLevels.position), asc(skillLevels.id));
  // unbounded-read-ok: ver arriba; los archivados se excluyen aquí.
  const elementRows = await tx
    .select()
    .from(skillElements)
    .where(
      and(
        eq(skillElements.organizationId, organizationId),
        eq(skillElements.templateId, templateId),
        isNull(skillElements.archivedAt)
      )
    )
    .orderBy(asc(skillElements.position), asc(skillElements.id));
  return levelRows.map((level) => ({
    id: level.id,
    position: level.position,
    name: level.name,
    description: level.description,
    elements: elementRows
      .filter((element) => element.levelId === level.id)
      .map((element) => ({
        id: element.id,
        name: element.name,
        apparatus: element.apparatus as SkillApparatus | null,
        description: element.description,
        required: element.isRequired,
      })),
  }));
}

function summary(
  row: SkillTemplateRow,
  counts: { levelCount: number; elementCount: number }
): SkillTemplateSummary {
  return {
    id: row.id,
    name: row.name,
    discipline: row.discipline as SkillDiscipline,
    description: row.description,
    source: row.source as TemplateSource,
    starterKey: row.starterKey,
    archived: row.archivedAt !== null,
    revision: row.revision,
    levelCount: counts.levelCount,
    elementCount: counts.elementCount,
    updatedAt: iso(row.updatedAt),
  };
}

/** Resumen de las plantillas de la academia con sus recuentos de niveles y elementos. */
export async function loadTemplateSummaries(
  tx: TransactionClient,
  input: { organizationId: string; includeArchived: boolean; onlyIds?: string[] }
): Promise<SkillTemplateSummary[]> {
  const conditions = [eq(skillTemplates.organizationId, input.organizationId)];
  if (!input.includeArchived) conditions.push(isNull(skillTemplates.archivedAt));
  if (input.onlyIds) conditions.push(inArray(skillTemplates.id, input.onlyIds));
  // unbounded-read-ok: MAX_ACTIVE_TEMPLATES activas por academia; las archivadas solo se piden a propósito y se limitan.
  const rows = await tx
    .select()
    .from(skillTemplates)
    .where(and(...conditions))
    .orderBy(asc(skillTemplates.discipline), asc(skillTemplates.name), asc(skillTemplates.id))
    .limit(MAX_ACTIVE_TEMPLATES * 3);
  const ids = rows.map((row) => row.id);
  const levelCounts = new Map<string, number>();
  const elementCounts = new Map<string, number>();
  if (ids.length > 0) {
    // unbounded-read-ok: agrupa por plantilla, como mucho una fila por plantilla leída.
    const levelAgg = await tx
      .select({ templateId: skillLevels.templateId, total: sql<number>`count(*)::int` })
      .from(skillLevels)
      .where(
        and(
          eq(skillLevels.organizationId, input.organizationId),
          inArray(skillLevels.templateId, ids),
          isNull(skillLevels.archivedAt)
        )
      )
      .groupBy(skillLevels.templateId);
    for (const entry of levelAgg) levelCounts.set(entry.templateId, Number(entry.total));
    // unbounded-read-ok: agrupa por plantilla, como mucho una fila por plantilla leída.
    const elementAgg = await tx
      .select({ templateId: skillElements.templateId, total: sql<number>`count(*)::int` })
      .from(skillElements)
      .where(
        and(
          eq(skillElements.organizationId, input.organizationId),
          inArray(skillElements.templateId, ids),
          isNull(skillElements.archivedAt)
        )
      )
      .groupBy(skillElements.templateId);
    for (const entry of elementAgg) elementCounts.set(entry.templateId, Number(entry.total));
  }
  return rows.map((row) =>
    summary(row, { levelCount: levelCounts.get(row.id) ?? 0, elementCount: elementCounts.get(row.id) ?? 0 })
  );
}

export async function listSkillTemplates(input: ActorInput & { query: unknown }): Promise<SkillTemplatesListView> {
  const query = templatesQuerySchema.parse(input.query);
  return db.transaction(async (tx) => {
    const access = await authorizeMember(tx, { ...query, actor: input.actor });
    return {
      templates: await loadTemplateSummaries(tx, {
        organizationId: query.organizationId,
        includeArchived: query.includeArchived === "true",
      }),
      starters: starterTemplateSummaries(),
      canManage: canManageTemplates(access.role),
      readOnly: !(await isOrganizationWritable(tx, query.organizationId)),
    };
  });
}

export async function getSkillTemplate(
  input: ActorInput & { templateId: string; query: unknown }
): Promise<SkillTemplateView> {
  const query = templateQuerySchema.parse(input.query);
  return db.transaction(async (tx) => {
    const access = await authorizeMember(tx, { ...query, actor: input.actor });
    const row = await loadTemplateRow(tx, query.organizationId, input.templateId);
    const levels = await loadTemplateLevels(tx, query.organizationId, row.id);
    return {
      ...summary(row, {
        levelCount: levels.length,
        elementCount: levels.reduce((sum, level) => sum + level.elements.length, 0),
      }),
      levels,
      canEdit: canManageTemplates(access.role),
    };
  });
}

/* ------------------------------------------------------------------------ */
/* Alta                                                                      */
/* ------------------------------------------------------------------------ */

type StructureInput = Array<{
  name: string;
  description: string | null;
  elements: Array<{
    name: string;
    apparatus: SkillApparatus | null;
    description: string | null;
    required: boolean;
  }>;
}>;

async function insertStructure(
  tx: TransactionClient,
  input: { organizationId: string; templateId: string; levels: StructureInput }
): Promise<void> {
  const levelRows: Array<typeof skillLevels.$inferInsert> = [];
  const elementRows: Array<typeof skillElements.$inferInsert> = [];
  input.levels.forEach((level, levelIndex) => {
    const levelId = randomUUID();
    levelRows.push({
      id: levelId,
      organizationId: input.organizationId,
      templateId: input.templateId,
      position: levelIndex + 1,
      name: level.name,
      description: level.description,
    });
    level.elements.forEach((element, elementIndex) => {
      elementRows.push({
        id: randomUUID(),
        organizationId: input.organizationId,
        templateId: input.templateId,
        levelId,
        position: elementIndex + 1,
        apparatus: element.apparatus,
        name: element.name,
        description: element.description,
        isRequired: element.required,
      });
    });
  });
  if (levelRows.length > 0) await tx.insert(skillLevels).values(levelRows);
  if (elementRows.length > 0) await tx.insert(skillElements).values(elementRows);
}

async function assertNameFree(
  tx: TransactionClient,
  input: { organizationId: string; discipline: SkillDiscipline; name: string; exceptTemplateId?: string }
): Promise<void> {
  const conditions = [
    eq(skillTemplates.organizationId, input.organizationId),
    eq(skillTemplates.discipline, input.discipline),
    isNull(skillTemplates.archivedAt),
    sql`lower(${skillTemplates.name}) = lower(${input.name})`,
  ];
  if (input.exceptTemplateId) conditions.push(ne(skillTemplates.id, input.exceptTemplateId));
  const [existing] = await tx
    .select({ id: skillTemplates.id })
    .from(skillTemplates)
    .where(and(...conditions))
    .limit(1);
  if (existing) {
    throw new OperationalError(
      "INVALID_RELATION",
      "Ya tienes una plantilla con ese nombre en esta disciplina. Elige otro nombre.",
      422
    );
  }
}

async function assertTemplateCapacity(tx: TransactionClient, organizationId: string): Promise<void> {
  // unbounded-read-ok: agregado count(*) de una sola fila.
  const [row] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(skillTemplates)
    .where(and(eq(skillTemplates.organizationId, organizationId), isNull(skillTemplates.archivedAt)));
  if (Number(row?.total ?? 0) >= MAX_ACTIVE_TEMPLATES) {
    throw new OperationalError(
      "INVALID_RELATION",
      `Una academia puede tener como mucho ${MAX_ACTIVE_TEMPLATES} plantillas activas. Archiva alguna antes de crear otra.`,
      422
    );
  }
}

export async function createSkillTemplate(input: ActorInput & { command: unknown }): Promise<WriteResult> {
  const command = createTemplateCommandSchema.parse(input.command);
  return db.transaction(async (tx) => {
    const access = await authorizeMember(tx, { ...command, actor: input.actor, intent: "write" });
    assertCanManageTemplates(access);
    await lockCommand(tx, command.organizationId, `skill-template:${command.clientRequestId}`);
    const [prior] = await tx
      .select()
      .from(skillTemplates)
      .where(
        and(
          eq(skillTemplates.organizationId, command.organizationId),
          eq(skillTemplates.clientRequestId, command.clientRequestId)
        )
      )
      .limit(1);
    if (prior) {
      // Repetir con otros datos (otro origen, nombre, disciplina o ejemplo) es un conflicto.
      const same =
        prior.source === command.source &&
        (command.source === "blank"
          ? prior.discipline === command.discipline && prior.name === command.name
          : command.source === "starter"
            ? prior.starterKey === command.starterKey && (!command.name || prior.name === command.name)
            : prior.name === command.name);
      if (!same) throw idempotencyConflict();
      return { id: prior.id, revision: prior.revision, replayed: true };
    }

    let discipline: SkillDiscipline;
    let name: string;
    let description: string | null;
    let starterKey: string | null = null;
    let levels: StructureInput;
    if (command.source === "blank") {
      discipline = command.discipline;
      name = command.name;
      description = command.description ?? null;
      levels = [{ name: "Nivel 1", description: null, elements: [] }];
    } else if (command.source === "starter") {
      const starter = findStarterTemplate(command.starterKey);
      if (!starter) throw notFound("Plantilla de ejemplo no encontrada");
      discipline = starter.discipline;
      name = command.name ?? starter.name;
      description = starter.description;
      starterKey = starter.key;
      levels = starter.levels.map((level) => ({
        name: level.name,
        description: level.description ?? null,
        elements: level.elements.map((element) => ({
          name: element.name,
          apparatus: element.apparatus,
          description: null,
          required: element.required ?? true,
        })),
      }));
    } else {
      const source = await loadTemplateRow(tx, command.organizationId, command.templateId);
      if (source.archivedAt) throw notFound("Plantilla no encontrada");
      discipline = source.discipline as SkillDiscipline;
      name = command.name;
      description = source.description;
      const sourceLevels = await loadTemplateLevels(tx, command.organizationId, source.id);
      levels = sourceLevels.map((level) => ({
        name: level.name,
        description: level.description,
        elements: level.elements.map((element) => ({
          name: element.name,
          apparatus: element.apparatus,
          description: element.description,
          required: element.required,
        })),
      }));
    }

    await assertTemplateCapacity(tx, command.organizationId);
    await assertNameFree(tx, { organizationId: command.organizationId, discipline, name });

    const memberId = access.member.id;
    const [created] = await tx
      .insert(skillTemplates)
      .values({
        organizationId: command.organizationId,
        clientRequestId: command.clientRequestId,
        discipline,
        name,
        description,
        source: command.source,
        starterKey,
        createdByMemberId: memberId,
        updatedByMemberId: memberId,
      })
      .returning({ id: skillTemplates.id, revision: skillTemplates.revision });
    if (!created) throw new OperationalError("FEATURE_NOT_AVAILABLE", "No se pudo guardar la plantilla", 503);
    await insertStructure(tx, { organizationId: command.organizationId, templateId: created.id, levels });
    await appendAuditEntry(tx, {
      organizationId: command.organizationId,
      locationId: command.locationId,
      actorUserId: input.actor.userId,
      action: "skill_template.created",
      targetType: "skill_template",
      targetId: created.id,
      idempotencyKey: `skill-levels:template-created:${command.clientRequestId}`,
      after: { source: command.source, discipline, revision: 1 },
    });
    return { id: created.id, revision: created.revision, replayed: false };
  });
}

/* ------------------------------------------------------------------------ */
/* Edición                                                                   */
/* ------------------------------------------------------------------------ */

function invalidStructure(message: string): OperationalError {
  return new OperationalError("INVALID_RELATION", message, 422);
}

export async function saveSkillTemplate(
  input: ActorInput & { templateId: string; command: unknown }
): Promise<WriteResult> {
  const command = saveTemplateCommandSchema.parse(input.command);
  return db.transaction(async (tx) => {
    const access: Access = await authorizeMember(tx, { ...command, actor: input.actor, intent: "write" });
    assertCanManageTemplates(access);
    await lockCommand(tx, command.organizationId, `skill-template-save:${input.templateId}`);
    const row = await loadTemplateRow(tx, command.organizationId, input.templateId, { lock: true });
    if (row.revision !== command.expectedRevision) {
      throw new OperationalError(
        "VERSION_CONFLICT",
        "Otra persona ha cambiado esta plantilla. Recarga para ver su estado actual.",
        409,
        { currentRevision: row.revision }
      );
    }
    const discipline = row.discipline as SkillDiscipline;
    for (const level of command.levels) {
      for (const element of level.elements) {
        if (!apparatusBelongsToDiscipline(discipline, element.apparatus ?? null)) {
          throw invalidStructure(`El aparato de «${element.name}» no corresponde a la disciplina de la plantilla.`);
        }
      }
    }
    if (!command.archived) {
      await assertNameFree(tx, {
        organizationId: command.organizationId,
        discipline,
        name: command.name,
        exceptTemplateId: row.id,
      });
      if (row.archivedAt) await assertTemplateCapacity(tx, command.organizationId);
    }

    // unbounded-read-ok: una plantilla admite como mucho 20 niveles y 300 elementos activos (dominio); los archivados se acumulan poco.
    const existingLevels = await tx
      .select()
      .from(skillLevels)
      .where(and(eq(skillLevels.organizationId, command.organizationId), eq(skillLevels.templateId, row.id)));
    // unbounded-read-ok: ver arriba.
    const existingElements = await tx
      .select()
      .from(skillElements)
      .where(and(eq(skillElements.organizationId, command.organizationId), eq(skillElements.templateId, row.id)));
    const activeLevelIds = new Set(existingLevels.filter((level) => !level.archivedAt).map((level) => level.id));
    const activeElementIds = new Set(
      existingElements.filter((element) => !element.archivedAt).map((element) => element.id)
    );

    const keptLevelIds = new Set<string>();
    const keptElementIds = new Set<string>();
    for (const level of command.levels) {
      if (level.id) {
        if (!activeLevelIds.has(level.id)) throw invalidStructure("Un nivel indicado no pertenece a esta plantilla.");
        keptLevelIds.add(level.id);
      }
      for (const element of level.elements) {
        if (element.id) {
          if (!activeElementIds.has(element.id)) {
            throw invalidStructure("Un elemento indicado no pertenece a esta plantilla.");
          }
          keptElementIds.add(element.id);
        }
      }
    }

    const now = new Date();
    // 1. Archiva lo que ya no está (los datos de progreso se conservan).
    const removedLevelIds = [...activeLevelIds].filter((id) => !keptLevelIds.has(id));
    const removedElementIds = [...activeElementIds].filter((id) => !keptElementIds.has(id));
    if (removedLevelIds.length > 0) {
      await tx
        .update(skillLevels)
        .set({ archivedAt: now, updatedAt: now })
        .where(and(eq(skillLevels.organizationId, command.organizationId), inArray(skillLevels.id, removedLevelIds)));
    }
    if (removedElementIds.length > 0) {
      await tx
        .update(skillElements)
        .set({ archivedAt: now, updatedAt: now })
        .where(
          and(eq(skillElements.organizationId, command.organizationId), inArray(skillElements.id, removedElementIds))
        );
    }

    // 2. Niveles: actualiza o crea, con su orden.
    const levelIds: string[] = [];
    for (const [levelIndex, level] of command.levels.entries()) {
      let levelId = level.id ?? null;
      if (levelId) {
        await tx
          .update(skillLevels)
          .set({ position: levelIndex + 1, name: level.name, description: level.description ?? null, updatedAt: now })
          .where(and(eq(skillLevels.organizationId, command.organizationId), eq(skillLevels.id, levelId)));
      } else {
        levelId = randomUUID();
        await tx.insert(skillLevels).values({
          id: levelId,
          organizationId: command.organizationId,
          templateId: row.id,
          position: levelIndex + 1,
          name: level.name,
          description: level.description ?? null,
        });
      }
      levelIds.push(levelId);
    }

    // 3. Elementos: actualiza (también entre niveles) o crea.
    for (const [levelIndex, level] of command.levels.entries()) {
      const levelId = levelIds[levelIndex]!;
      for (const [elementIndex, element] of level.elements.entries()) {
        const values = {
          levelId,
          position: elementIndex + 1,
          apparatus: element.apparatus ?? null,
          name: element.name,
          description: element.description ?? null,
          isRequired: element.required,
          updatedAt: now,
        };
        if (element.id) {
          await tx
            .update(skillElements)
            .set(values)
            .where(and(eq(skillElements.organizationId, command.organizationId), eq(skillElements.id, element.id)));
        } else {
          await tx.insert(skillElements).values({
            id: randomUUID(),
            organizationId: command.organizationId,
            templateId: row.id,
            ...values,
          });
        }
      }
    }

    const revision = row.revision + 1;
    const updated = await tx
      .update(skillTemplates)
      .set({
        name: command.name,
        description: command.description ?? null,
        archivedAt: command.archived ? (row.archivedAt ?? now) : null,
        revision,
        updatedByMemberId: access.member.id,
        updatedAt: now,
      })
      .where(
        and(
          eq(skillTemplates.organizationId, command.organizationId),
          eq(skillTemplates.id, row.id),
          eq(skillTemplates.revision, row.revision)
        )
      )
      .returning({ id: skillTemplates.id });
    if (updated.length !== 1) {
      throw new OperationalError("VERSION_CONFLICT", "La plantilla ha cambiado. Recarga e inténtalo de nuevo.", 409);
    }
    await appendAuditEntry(tx, {
      organizationId: command.organizationId,
      locationId: command.locationId,
      actorUserId: input.actor.userId,
      action: command.archived ? "skill_template.archived" : "skill_template.updated",
      targetType: "skill_template",
      targetId: row.id,
      idempotencyKey: `skill-levels:template-saved:${row.id}:${revision}`,
      before: { revision: row.revision },
      after: {
        revision,
        levels: command.levels.length,
        elements: command.levels.reduce((sum, level) => sum + level.elements.length, 0),
      },
    });
    return { id: row.id, revision, replayed: false };
  });
}
