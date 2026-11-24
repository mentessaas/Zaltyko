import { randomUUID } from "node:crypto";

import { and, asc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import type { TransactionClient } from "@/lib/db-transactions";
// Directo y no desde la fachada de la biblioteca: lecturas sin autorización
// propia que se hacen dentro de la transacción ya autorizada de niveles.
import { findLinkableCatalogElement, getCatalogLinkView } from "@/modules/element-library/application/catalog-reads";
import { catalogElementEditions, catalogElements } from "@/modules/element-library/infrastructure/element-library-schema";
import { elementLibraryUnavailable, isElementLibraryAvailable } from "@/modules/element-library/application/storage";
import { CATALOG_DISCIPLINES } from "@/modules/element-library/domain/element-library";
import { assertOrganizationOperationalWritable } from "@/modules/saas-billing/application/organization-usage";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { appendAuditEntry, lockCommand } from "@/modules/shared/infrastructure/transactional-records";
import {
  apparatusBelongsToDiscipline,
  canManageTemplates,
  CATALOG_LINK_MISMATCH_MESSAGE,
  createTemplateCommandSchema,
  ELEMENT_NAME_MAX,
  saveTemplateCommandSchema,
  templateQuerySchema,
  templatesQuerySchema,
  type SkillApparatus,
  type SkillDiscipline,
  type SkillTemplateSummary,
  type SkillTemplatesListView,
  type SkillTemplateView,
  type TemplateCatalogLink,
  type TemplateLevelView,
  type TemplateSource,
  type WriteResult,
  isFederationLevelTemplatesFlagOn,
} from "@/modules/skill-levels/domain/skill-levels";
import { findStarterTemplate, starterTemplateSummaries } from "@/modules/skill-levels/domain/starter-templates";
import { federationTemplateSummaries, findFederationTemplate } from "@/modules/skill-levels/domain/federation-templates";
import {
  skillElementBaseColumns,
  skillElements,
  skillElementsBaseInsert,
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
import type { InstalledSkillLevelsShape } from "./storage";

/** Plantillas de niveles de la academia. Uso interno: entra por la fachada. */

/** Tope de plantillas activas por academia: acota las listas y los selectores. */
export const MAX_ACTIVE_TEMPLATES = 40;

function federationRequirementName(fact: string): string {
  if (fact.length <= ELEMENT_NAME_MAX) return fact;
  const shortened = fact.slice(0, ELEMENT_NAME_MAX - 1);
  const boundary = shortened.lastIndexOf(" ");
  return `${shortened.slice(0, boundary > 60 ? boundary : shortened.length)}…`;
}

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
  // Columnas explícitas: leen igual con o sin la columna de enlace a la biblioteca.
  // unbounded-read-ok: ver arriba; los archivados se excluyen aquí.
  const elementRows = await tx
    .select(skillElementBaseColumns)
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

/**
 * Enlaces con la biblioteca de los elementos activos de una plantilla: id del
 * elemento → id del elemento de la biblioteca. Solo con la forma
 * «with_catalog_links»; con la «base» la columna no existe y no se nombra.
 */
async function loadCatalogElementIds(
  tx: TransactionClient,
  organizationId: string,
  templateId: string
): Promise<Map<string, string>> {
  // unbounded-read-ok: una plantilla admite como mucho 300 elementos activos (dominio).
  const rows = await tx
    .select({ id: skillElements.id, catalogElementId: skillElements.catalogElementId })
    .from(skillElements)
    .where(
      and(
        eq(skillElements.organizationId, organizationId),
        eq(skillElements.templateId, templateId),
        isNull(skillElements.archivedAt),
        isNotNull(skillElements.catalogElementId)
      )
    );
  const links = new Map<string, string>();
  for (const row of rows) if (row.catalogElementId) links.set(row.id, row.catalogElementId);
  return links;
}

async function resolveFederationElementIds(
  tx: TransactionClient,
  template: NonNullable<ReturnType<typeof findFederationTemplate>>
): Promise<Map<string, string>> {
  const keys = [...new Set(template.levels.flatMap((level) =>
    level.requirements.flatMap((requirement) => requirement.elementKey ? [requirement.elementKey] : [])
  ))];
  if (keys.length === 0 || !(await isElementLibraryAvailable(tx))) return new Map();
  const rows = await tx
    .select({ elementKey: catalogElements.elementKey, id: catalogElements.id })
    .from(catalogElements)
    .innerJoin(catalogElementEditions, eq(catalogElementEditions.id, catalogElements.editionId))
    .where(and(
      inArray(catalogElements.elementKey, keys),
      eq(catalogElements.discipline, template.discipline),
      eq(catalogElements.reviewStatus, "reviewed"),
      isNull(catalogElements.withdrawnAt),
      eq(catalogElementEditions.status, "published")
    ));
  return new Map(rows.map((row) => [row.elementKey, row.id]));
}

/**
 * Añade su enlace con la biblioteca solo a los elementos enlazados. Un
 * elemento sin enlace se devuelve tal cual, sin la clave `catalogLink`: así la
 * vista es idéntica a la de antes de la biblioteca y se puede reenviar al
 * guardar (el esquema del elemento es estricto). El elemento retirado o de una
 * edición anterior se sigue viendo con su aviso.
 */
async function attachCatalogLinks(
  tx: TransactionClient,
  input: { organizationId: string; templateId: string; shape: InstalledSkillLevelsShape; levels: TemplateLevelView[] }
): Promise<TemplateLevelView[]> {
  const ids =
    input.shape === "with_catalog_links"
      ? await loadCatalogElementIds(tx, input.organizationId, input.templateId)
      : new Map<string, string>();
  const views = ids.size > 0 ? await getCatalogLinkView(tx, [...ids.values()]) : null;
  return input.levels.map((level) => ({
    ...level,
    elements: level.elements.map((element) => {
      const catalogId = ids.get(element.id);
      if (!catalogId) return element;
      const view = views?.get(catalogId);
      // La clave foránea impide que desaparezca; si aun así faltara, se avisa como retirado.
      const catalogLink: TemplateCatalogLink = view
        ? {
            id: catalogId,
            name: view.name,
            status: view.status,
            replacementId: view.replacementId,
            apparatusMismatch: view.apparatus !== element.apparatus,
          }
        : { id: catalogId, name: element.name, status: "withdrawn", replacementId: null, apparatusMismatch: false };
      return { ...element, catalogLink };
    }),
  }));
}

function isCatalogDiscipline(discipline: SkillDiscipline): boolean {
  return (CATALOG_DISCIPLINES as readonly string[]).includes(discipline);
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
    sourceLabel: row.description?.startsWith("Fuente: RFEG,") ? row.description.split("\n")[0] : null,
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
      federationTemplates: isFederationLevelTemplatesFlagOn() ? federationTemplateSummaries() : [],
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
    const levels = await attachCatalogLinks(tx, {
      organizationId: query.organizationId,
      templateId: row.id,
      shape: access.storageShape,
      levels: await loadTemplateLevels(tx, query.organizationId, row.id),
    });
    return {
      ...summary(row, {
        levelCount: levels.length,
        elementCount: levels.reduce((sum, level) => sum + level.elements.length, 0),
      }),
      levels,
      canEdit: canManageTemplates(access.role),
      // Sin la bandera de la biblioteca no consulta nada más.
      libraryAvailable: isCatalogDiscipline(row.discipline as SkillDiscipline) && (await isElementLibraryAvailable(tx)),
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
    /** Solo al copiar con la forma «with_catalog_links». */
    catalogElementId?: string | null;
  }>;
}>;

async function insertStructure(
  tx: TransactionClient,
  input: { organizationId: string; templateId: string; levels: StructureInput; withCatalogLinks: boolean }
): Promise<void> {
  const levelRows: Array<typeof skillLevels.$inferInsert> = [];
  const elementRows: Array<typeof skillElementsBaseInsert.$inferInsert> = [];
  const catalogElementIds: Array<string | null> = [];
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
      catalogElementIds.push(element.catalogElementId ?? null);
    });
  });
  if (levelRows.length > 0) await tx.insert(skillLevels).values(levelRows);
  if (elementRows.length === 0) return;
  // Solo la copia de una plantilla con enlaces nombra la columna; lo demás, como siempre.
  if (input.withCatalogLinks && catalogElementIds.some((id) => id !== null)) {
    await tx
      .insert(skillElements)
      .values(elementRows.map((element, index) => ({ ...element, catalogElementId: catalogElementIds[index] ?? null })));
  } else {
    // Sin la columna de enlace: el INSERT vale con o sin ella (queda nula).
    await tx.insert(skillElementsBaseInsert).values(elementRows);
  }
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
            : command.source === "federation"
              ? findFederationTemplate(command.federationTemplateKey)?.discipline === prior.discipline &&
                prior.description?.startsWith("Fuente: RFEG,") === true &&
                (!command.name || prior.name === command.name)
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
    } else if (command.source === "federation") {
      if (!isFederationLevelTemplatesFlagOn()) throw notFound("Plantilla de federación no encontrada");
      const federationTemplate = findFederationTemplate(command.federationTemplateKey);
      if (!federationTemplate) throw notFound("Plantilla de federación no encontrada");
      discipline = federationTemplate.discipline;
      name = command.name ?? federationTemplate.name;
      description = `Fuente: RFEG, ${federationTemplate.sourceTitle}. Edición rfeg-2026. Consultado el ${federationTemplate.sourceCheckedOn}. El documento oficial es la referencia válida.`;
      const catalogIds = access.storageShape === "with_catalog_links"
        ? await resolveFederationElementIds(tx, federationTemplate)
        : new Map<string, string>();
      levels = federationTemplate.levels.map((level) => ({
        name: level.name,
        description: null,
        elements: level.requirements.map((requirement) => ({
          name: federationRequirementName(requirement.fact),
          apparatus: requirement.apparatus,
          description: `Fuente: RFEG, ${federationTemplate.sourceTitle}, pág. ${requirement.page}. Aparato RFEG: ${requirement.sourceApparatus}. ${requirement.fact}`,
          required: true,
          catalogElementId: requirement.elementKey ? catalogIds.get(requirement.elementKey) ?? null : null,
        })),
      }));
    } else {
      const source = await loadTemplateRow(tx, command.organizationId, command.templateId);
      if (source.archivedAt) throw notFound("Plantilla no encontrada");
      discipline = source.discipline as SkillDiscipline;
      name = command.name;
      description = source.description;
      const sourceLevels = await loadTemplateLevels(tx, command.organizationId, source.id);
      // La copia conserva los enlaces con la biblioteca tal cual, sin volver a
      // comprobar que sigan visibles (ADR-0029 §3.1).
      const links =
        access.storageShape === "with_catalog_links"
          ? await loadCatalogElementIds(tx, command.organizationId, source.id)
          : new Map<string, string>();
      levels = sourceLevels.map((level) => ({
        name: level.name,
        description: level.description,
        elements: level.elements.map((element) => ({
          name: element.name,
          apparatus: element.apparatus,
          description: element.description,
          required: element.required,
          catalogElementId: links.get(element.id) ?? null,
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
    await insertStructure(tx, {
      organizationId: command.organizationId,
      templateId: created.id,
      levels,
      withCatalogLinks: access.storageShape === "with_catalog_links",
    });
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

function catalogLinkMismatch(): OperationalError {
  return new OperationalError("INVALID_RELATION", CATALOG_LINK_MISMATCH_MESSAGE, 400);
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
    // Enlaces con la biblioteca (ADR-0029 §3.1): solo con la biblioteca activa
    // (banderas, tablas y forma «with_catalog_links»). Sin ella, pedir un enlace
    // es 503 y `null` o la ausencia del campo no tocan nada.
    const elementsIn = command.levels.flatMap((level) => level.elements);
    const libraryOn = access.storageShape === "with_catalog_links" && (await isElementLibraryAvailable(tx));
    if (!libraryOn && elementsIn.some((element) => typeof element.catalogElementId === "string")) {
      throw elementLibraryUnavailable();
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
      .select(skillElementBaseColumns)
      .from(skillElements)
      .where(and(eq(skillElements.organizationId, command.organizationId), eq(skillElements.templateId, row.id)));
    const storedLinks = libraryOn
      ? await loadCatalogElementIds(tx, command.organizationId, row.id)
      : new Map<string, string>();
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

    if (libraryOn) {
      const storedApparatus = new Map(existingElements.map((element) => [element.id, element.apparatus] as const));
      const checked = new Map<string, boolean>();
      for (const element of elementsIn) {
        const apparatus = element.apparatus ?? null;
        const stored = element.id ? storedLinks.get(element.id) : undefined;
        const sameApparatus = element.id ? storedApparatus.get(element.id) === apparatus : false;
        if (element.catalogElementId === undefined) {
          // Se conserva el enlace guardado, pero no con otro aparato.
          if (stored && !sameApparatus) throw catalogLinkMismatch();
          continue;
        }
        if (element.catalogElementId === null) continue;
        // Volver a mandar el mismo enlace sin cambiar de aparato no se comprueba
        // de nuevo: así se puede guardar un elemento que ya no está en la biblioteca.
        if (stored === element.catalogElementId && sameApparatus) continue;
        if (!apparatus) throw catalogLinkMismatch();
        const key = `${element.catalogElementId}:${apparatus}`;
        let linkable = checked.get(key);
        if (linkable === undefined) {
          linkable =
            (await findLinkableCatalogElement(tx, element.catalogElementId, { discipline, apparatus })) !== null;
          checked.set(key, linkable);
        }
        if (!linkable) throw catalogLinkMismatch();
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
        // La columna de enlace solo se nombra con la biblioteca activa y si el campo llega.
        const link =
          libraryOn && element.catalogElementId !== undefined ? { catalogElementId: element.catalogElementId } : null;
        if (element.id) {
          await tx
            .update(skillElements)
            .set(link ? { ...values, ...link } : values)
            .where(and(eq(skillElements.organizationId, command.organizationId), eq(skillElements.id, element.id)));
        } else if (link) {
          await tx.insert(skillElements).values({
            id: randomUUID(),
            organizationId: command.organizationId,
            templateId: row.id,
            ...values,
            catalogElementId: link.catalogElementId,
          });
        } else {
          await tx.insert(skillElementsBaseInsert).values({
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
