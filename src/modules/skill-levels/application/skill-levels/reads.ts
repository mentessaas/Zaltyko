import { and, asc, eq, inArray, isNull, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { organizations } from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import { resolveFamilyPortalAccess } from "@/modules/family-portal/application/family-portal-access";
import { familyCanViewAthlete } from "@/modules/family-portal/application/family-portal-sql";
import { requireVisibleFamilyAthlete } from "@/modules/family-portal/domain/family-portal-access";
import {
  athleteSkillsQuerySchema,
  buildTemplateProgress,
  computeTrackState,
  rosterQuerySchema,
  sessionRosterQuerySchema,
  templateQuerySchema,
  type AthleteSkillsView,
  type DiplomaView,
  type ElementStatus,
  type FamilySkillsView,
  type LevelPassView,
  type ProgressEntry,
  type RosterAthleteView,
  type SkillApparatus,
  type SkillDiscipline,
  type SkillRosterView,
  type TemplateProgressView,
} from "@/modules/skill-levels/domain/skill-levels";
import {
  athleteLevelPasses,
  athleteSkillProgress,
  skillElements,
  skillLevels,
  skillTemplates,
  type SkillTemplateRow,
} from "@/modules/skill-levels/infrastructure/skill-levels-schema";

import {
  authorizeAthlete,
  authorizeMember,
  loadGroupRoster,
  loadSessionRoster,
  memberNames,
  notFound,
  type ActorInput,
} from "./access";
import { isSkillLevelsAvailableForPage } from "./storage";
import { isOrganizationWritable, loadTemplateLevels, loadTemplateRow, loadTemplateSummaries } from "./templates";

/** Lecturas de progreso: ficha, grupo, sesión, diploma y familias. Uso interno: entra por la fachada. */

/** Topes de lectura: una gimnasta tiene como mucho unas centenas de marcas y de pasos. */
const MAX_PROGRESS_ROWS = 800;
const MAX_PASS_ROWS = 200;
const MAX_TEMPLATES_PER_ATHLETE = 40;

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

type Guard = (organizationRef: AnyPgColumn, athleteRef: AnyPgColumn) => SQL;

/**
 * Plantillas con progreso o pasos de nivel de una gimnasta (más la pedida).
 * Con `guard` cada consulta repite la comprobación de familias en SQL.
 */
async function readAthleteTemplates(
  tx: TransactionClient,
  input: {
    organizationId: string;
    athleteId: string;
    requestedTemplateId?: string | null;
    includeNames: boolean;
    guard?: Guard;
  }
): Promise<TemplateProgressView[]> {
  const progressConditions: SQL[] = [
    eq(athleteSkillProgress.organizationId, input.organizationId),
    eq(athleteSkillProgress.athleteId, input.athleteId),
  ];
  const passConditions: SQL[] = [
    eq(athleteLevelPasses.organizationId, input.organizationId),
    eq(athleteLevelPasses.athleteId, input.athleteId),
  ];
  if (input.guard) {
    progressConditions.push(input.guard(athleteSkillProgress.organizationId, athleteSkillProgress.athleteId));
    passConditions.push(input.guard(athleteLevelPasses.organizationId, athleteLevelPasses.athleteId));
  }
  const progressRows = await tx
    .select()
    .from(athleteSkillProgress)
    .where(and(...progressConditions))
    .orderBy(asc(athleteSkillProgress.id))
    .limit(MAX_PROGRESS_ROWS);
  const passRows = await tx
    .select({
      id: athleteLevelPasses.id,
      templateId: athleteLevelPasses.templateId,
      levelId: athleteLevelPasses.levelId,
      passedOn: athleteLevelPasses.passedOn,
      passedByMemberId: athleteLevelPasses.passedByMemberId,
      levelName: skillLevels.name,
      levelPosition: skillLevels.position,
    })
    .from(athleteLevelPasses)
    .innerJoin(
      skillLevels,
      and(
        eq(skillLevels.organizationId, athleteLevelPasses.organizationId),
        eq(skillLevels.templateId, athleteLevelPasses.templateId),
        eq(skillLevels.id, athleteLevelPasses.levelId)
      )
    )
    .where(and(...passConditions))
    .orderBy(asc(skillLevels.position), asc(athleteLevelPasses.id))
    .limit(MAX_PASS_ROWS);

  const templateIds = [
    ...new Set([
      ...progressRows.map((row) => row.templateId),
      ...passRows.map((row) => row.templateId),
      ...(input.requestedTemplateId ? [input.requestedTemplateId] : []),
    ]),
  ].slice(0, MAX_TEMPLATES_PER_ATHLETE);
  if (templateIds.length === 0) return [];

  // unbounded-read-ok: acotada por los ids de plantilla ya limitados (MAX_TEMPLATES_PER_ATHLETE).
  const templateRows = await tx
    .select()
    .from(skillTemplates)
    .where(and(eq(skillTemplates.organizationId, input.organizationId), inArray(skillTemplates.id, templateIds)))
    .orderBy(asc(skillTemplates.discipline), asc(skillTemplates.name), asc(skillTemplates.id));

  const names = input.includeNames
    ? await memberNames(tx, input.organizationId, [
        ...progressRows.flatMap((row) => (row.evaluatedByMemberId ? [row.evaluatedByMemberId] : [])),
        ...passRows.flatMap((row) => (row.passedByMemberId ? [row.passedByMemberId] : [])),
      ])
    : new Map<string, string>();

  const result: TemplateProgressView[] = [];
  for (const template of templateRows) {
    const levels = await loadTemplateLevels(tx, input.organizationId, template.id);
    const progress = new Map<string, ProgressEntry>();
    for (const row of progressRows) {
      if (row.templateId !== template.id) continue;
      progress.set(row.elementId, {
        status: row.status as ElementStatus,
        achievedOn: row.achievedOn,
        // Sin autoría (la persona ya no está en la academia): sin nombre.
        evaluatedByName:
          input.includeNames && row.evaluatedByMemberId ? (names.get(row.evaluatedByMemberId) ?? "Equipo") : null,
        evaluatedAt: input.includeNames ? iso(row.evaluatedAt) : null,
      });
    }
    const passes: LevelPassView[] = passRows
      .filter((row) => row.templateId === template.id)
      .map((row) => ({
        id: row.id,
        levelId: row.levelId,
        levelName: row.levelName,
        levelPosition: row.levelPosition,
        passedOn: row.passedOn,
        passedByName:
          input.includeNames && row.passedByMemberId ? (names.get(row.passedByMemberId) ?? "Equipo") : null,
      }));
    result.push(
      buildTemplateProgress({
        template: templateView(template),
        levels,
        progress,
        passes,
      })
    );
  }
  return result;
}

function templateView(row: SkillTemplateRow): TemplateProgressView["template"] {
  return {
    id: row.id,
    name: row.name,
    discipline: row.discipline as SkillDiscipline,
    description: row.description,
    archived: row.archivedAt !== null,
  };
}

/* ------------------------------------------------------------------------ */
/* Ficha de la gimnasta                                                      */
/* ------------------------------------------------------------------------ */

export async function getAthleteSkills(
  input: ActorInput & { athleteId: string; query: unknown }
): Promise<AthleteSkillsView> {
  const query = athleteSkillsQuerySchema.parse(input.query);
  return db.transaction(async (tx) => {
    const memberAccess = await authorizeMember(tx, { ...query, actor: input.actor });
    const access = await authorizeAthlete(tx, memberAccess, {
      organizationId: query.organizationId,
      athleteId: input.athleteId,
      intent: "read",
    });
    if (query.templateId) {
      // Una plantilla de otra academia responde como inexistente.
      await loadTemplateRow(tx, query.organizationId, query.templateId);
    }
    const templates = await readAthleteTemplates(tx, {
      organizationId: query.organizationId,
      athleteId: input.athleteId,
      requestedTemplateId: query.templateId ?? null,
      includeNames: true,
    });
    const readOnly = !(await isOrganizationWritable(tx, query.organizationId));
    return {
      athlete: { id: access.athlete.id, name: access.athlete.name, archived: !access.athlete.isActive },
      canWrite: access.athlete.isActive,
      readOnly,
      templates,
      availableTemplates: await loadTemplateSummaries(tx, {
        organizationId: query.organizationId,
        includeArchived: false,
      }),
    };
  });
}

/* ------------------------------------------------------------------------ */
/* Grupo y sesión                                                            */
/* ------------------------------------------------------------------------ */

async function buildRosterView(
  tx: TransactionClient,
  input: {
    organizationId: string;
    templateId: string;
    label: string;
    athletes: Array<{ id: string; name: string }>;
    truncated: boolean;
  }
): Promise<SkillRosterView> {
  const template = await loadTemplateRow(tx, input.organizationId, input.templateId);
  const levels = await loadTemplateLevels(tx, input.organizationId, template.id);
  const athleteIds = input.athletes.map((athlete) => athlete.id);
  const statusesByAthlete = new Map<string, Map<string, ElementStatus>>();
  const passedByAthlete = new Map<string, string[]>();
  if (athleteIds.length > 0) {
    // unbounded-read-ok: acotada por los ids de la lista (como mucho 80 gimnastas) y una plantilla (300 elementos).
    const progressRows = await tx
      .select({
        athleteId: athleteSkillProgress.athleteId,
        elementId: athleteSkillProgress.elementId,
        status: athleteSkillProgress.status,
      })
      .from(athleteSkillProgress)
      .where(
        and(
          eq(athleteSkillProgress.organizationId, input.organizationId),
          eq(athleteSkillProgress.templateId, template.id),
          inArray(athleteSkillProgress.athleteId, athleteIds)
        )
      );
    for (const row of progressRows) {
      const map = statusesByAthlete.get(row.athleteId) ?? new Map<string, ElementStatus>();
      map.set(row.elementId, row.status as ElementStatus);
      statusesByAthlete.set(row.athleteId, map);
    }
    // unbounded-read-ok: acotada por los ids de la lista y los niveles de una plantilla.
    const passRows = await tx
      .select({ athleteId: athleteLevelPasses.athleteId, levelId: athleteLevelPasses.levelId })
      .from(athleteLevelPasses)
      .where(
        and(
          eq(athleteLevelPasses.organizationId, input.organizationId),
          eq(athleteLevelPasses.templateId, template.id),
          inArray(athleteLevelPasses.athleteId, athleteIds)
        )
      );
    for (const row of passRows) {
      passedByAthlete.set(row.athleteId, [...(passedByAthlete.get(row.athleteId) ?? []), row.levelId]);
    }
  }
  const calcLevels = levels.map((level) => ({
    id: level.id,
    position: level.position,
    elements: level.elements.map((element) => ({ id: element.id, required: element.required })),
  }));
  const athletes: RosterAthleteView[] = input.athletes.map((athlete) => {
    const statuses = statusesByAthlete.get(athlete.id) ?? new Map<string, ElementStatus>();
    const passed = passedByAthlete.get(athlete.id) ?? [];
    const track = computeTrackState({ levels: calcLevels, progress: statuses, passedLevelIds: passed });
    return {
      id: athlete.id,
      name: athlete.name,
      statuses: Object.fromEntries(statuses),
      currentLevelId: track.currentLevelId,
      readyToPass: track.readyToPass,
      finished: track.finished,
      overallPercent: track.overallPercent,
      passedLevelIds: track.passedLevelIds,
    };
  });
  return {
    label: input.label,
    template: {
      id: template.id,
      name: template.name,
      discipline: template.discipline as SkillDiscipline,
      archived: template.archivedAt !== null,
      levels,
    },
    athletes,
    truncated: input.truncated,
    canWrite: true,
    readOnly: !(await isOrganizationWritable(tx, input.organizationId)),
    availableTemplates: await loadTemplateSummaries(tx, { organizationId: input.organizationId, includeArchived: false }),
  };
}

export async function getGroupSkillRoster(
  input: ActorInput & { groupId: string; query: unknown }
): Promise<SkillRosterView> {
  const query = rosterQuerySchema.parse(input.query);
  return db.transaction(async (tx) => {
    const access = await authorizeMember(tx, { ...query, actor: input.actor });
    const roster = await loadGroupRoster(tx, access, { organizationId: query.organizationId, groupId: input.groupId });
    return buildRosterView(tx, { organizationId: query.organizationId, templateId: query.templateId, ...roster });
  });
}

export async function getSessionSkillRoster(
  input: ActorInput & { sessionId: string; query: unknown }
): Promise<SkillRosterView> {
  const query = sessionRosterQuerySchema.parse(input.query);
  return db.transaction(async (tx) => {
    const access = await authorizeMember(tx, { ...query, actor: input.actor });
    const roster = await loadSessionRoster(tx, access, {
      organizationId: query.organizationId,
      sessionId: input.sessionId,
    });
    return buildRosterView(tx, { organizationId: query.organizationId, templateId: query.templateId, ...roster });
  });
}

/* ------------------------------------------------------------------------ */
/* Diploma                                                                   */
/* ------------------------------------------------------------------------ */

/** Datos del diploma de un paso de nivel. El llamador ya autorizó el acceso a la gimnasta. */
async function readDiploma(
  tx: TransactionClient,
  input: { organizationId: string; athleteId: string; athleteName: string; passId: string; guard?: Guard }
): Promise<DiplomaView | null> {
  const conditions: SQL[] = [
    eq(athleteLevelPasses.organizationId, input.organizationId),
    eq(athleteLevelPasses.athleteId, input.athleteId),
    eq(athleteLevelPasses.id, input.passId),
  ];
  if (input.guard) conditions.push(input.guard(athleteLevelPasses.organizationId, athleteLevelPasses.athleteId));
  const [pass] = await tx
    .select({
      id: athleteLevelPasses.id,
      templateId: athleteLevelPasses.templateId,
      levelId: athleteLevelPasses.levelId,
      passedOn: athleteLevelPasses.passedOn,
      levelName: skillLevels.name,
      levelPosition: skillLevels.position,
      templateName: skillTemplates.name,
      discipline: skillTemplates.discipline,
    })
    .from(athleteLevelPasses)
    .innerJoin(
      skillLevels,
      and(
        eq(skillLevels.organizationId, athleteLevelPasses.organizationId),
        eq(skillLevels.templateId, athleteLevelPasses.templateId),
        eq(skillLevels.id, athleteLevelPasses.levelId)
      )
    )
    .innerJoin(
      skillTemplates,
      and(
        eq(skillTemplates.organizationId, athleteLevelPasses.organizationId),
        eq(skillTemplates.id, athleteLevelPasses.templateId)
      )
    )
    .where(and(...conditions))
    .limit(1);
  if (!pass) return null;
  const [organization] = await tx
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, input.organizationId))
    .limit(1);
  // unbounded-read-ok: como mucho 40 elementos por nivel (dominio).
  const achieved = await tx
    .select({ name: skillElements.name, apparatus: skillElements.apparatus, position: skillElements.position })
    .from(skillElements)
    .innerJoin(
      athleteSkillProgress,
      and(
        eq(athleteSkillProgress.organizationId, skillElements.organizationId),
        eq(athleteSkillProgress.elementId, skillElements.id),
        eq(athleteSkillProgress.athleteId, input.athleteId),
        eq(athleteSkillProgress.status, "achieved")
      )
    )
    .where(
      and(
        eq(skillElements.organizationId, input.organizationId),
        eq(skillElements.templateId, pass.templateId),
        eq(skillElements.levelId, pass.levelId),
        eq(skillElements.isRequired, true),
        isNull(skillElements.archivedAt)
      )
    )
    .orderBy(asc(skillElements.position), asc(skillElements.id));
  return {
    passId: pass.id,
    athleteName: input.athleteName,
    academyName: organization?.name ?? "",
    templateName: pass.templateName,
    discipline: pass.discipline as SkillDiscipline,
    levelName: pass.levelName,
    levelPosition: pass.levelPosition,
    passedOn: pass.passedOn,
    achievements: achieved.map((row) => ({ name: row.name, apparatus: row.apparatus as SkillApparatus | null })),
  };
}

export async function getLevelPassDiploma(
  input: ActorInput & { athleteId: string; passId: string; query: unknown }
): Promise<DiplomaView> {
  const query = templateQuerySchema.parse(input.query);
  return db.transaction(async (tx) => {
    const memberAccess = await authorizeMember(tx, { ...query, actor: input.actor });
    const access = await authorizeAthlete(tx, memberAccess, {
      organizationId: query.organizationId,
      athleteId: input.athleteId,
      intent: "read",
    });
    const diploma = await readDiploma(tx, {
      organizationId: query.organizationId,
      athleteId: input.athleteId,
      athleteName: access.athlete.name,
      passId: input.passId,
    });
    if (!diploma) throw notFound("Diploma no encontrado");
    return diploma;
  });
}

/* ------------------------------------------------------------------------ */
/* Familias (solo lectura)                                                   */
/* ------------------------------------------------------------------------ */

const familyGuard =
  (userId: string, now: Date): Guard =>
  (organizationRef, athleteRef) =>
    familyCanViewAthlete({ userId, now, organizationRef, athleteRef });

/**
 * Progreso de una gimnasta para sus tutores. Devuelve null cuando la función
 * no está disponible (bandera apagada o sin candidato SQL): /familia no
 * muestra entonces ninguna sección. La gimnasta debe ser visible para la
 * cuenta (la misma comprobación que el resto de /familia, repetida en cada
 * consulta). No incluye nombres del equipo.
 */
export async function getFamilySkills(input: {
  userId: string;
  athleteId: string;
  now?: Date;
}): Promise<FamilySkillsView | null> {
  if (!(await isSkillLevelsAvailableForPage(db))) return null;
  const now = input.now ?? new Date();
  const access = await resolveFamilyPortalAccess({ userId: input.userId, now });
  const visible = requireVisibleFamilyAthlete(access, input.athleteId);
  return db.transaction(async (tx) => ({
    athleteName: visible.athlete.displayName,
    academyName: visible.academy.organizationName,
    templates: await readAthleteTemplates(tx, {
      organizationId: visible.academy.organizationId,
      athleteId: visible.athlete.athleteId,
      includeNames: false,
      guard: familyGuard(input.userId, now),
    }),
  }));
}

/** Diploma de un paso de nivel para sus tutores. null si no está disponible o no existe. */
export async function getFamilyDiploma(input: {
  userId: string;
  athleteId: string;
  passId: string;
  now?: Date;
}): Promise<DiplomaView | null> {
  if (!(await isSkillLevelsAvailableForPage(db))) return null;
  const now = input.now ?? new Date();
  const access = await resolveFamilyPortalAccess({ userId: input.userId, now });
  const visible = requireVisibleFamilyAthlete(access, input.athleteId);
  return db.transaction((tx) =>
    readDiploma(tx, {
      organizationId: visible.academy.organizationId,
      athleteId: visible.athlete.athleteId,
      athleteName: visible.athlete.displayName,
      passId: input.passId,
      guard: familyGuard(input.userId, now),
    })
  );
}
