import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import { auditLog } from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { appendAuditEntry, lockCommand } from "@/modules/shared/infrastructure/transactional-records";
import {
  checkLevelPass,
  evaluateSkillsCommandSchema,
  localDateInTimeZone,
  passLevelCommandSchema,
  passLevelRefusalMessages,
  type ElementStatus,
  type EvaluationResult,
  type WriteResult,
} from "@/modules/skill-levels/domain/skill-levels";
import {
  athleteLevelPasses,
  athleteSkillProgress,
  skillElements,
  skillLevels,
} from "@/modules/skill-levels/infrastructure/skill-levels-schema";

import {
  authorizeAthlete,
  authorizeMember,
  idempotencyConflict,
  notFound,
  type ActorInput,
} from "./access";
import { loadTemplateLevels, loadTemplateRow } from "./templates";

/**
 * Evaluar elementos y registrar el paso de nivel. Uso interno: entra por la
 * fachada. Cada operación abre su propia transacción y vuelve a autorizarlo
 * todo: miembro, rol, sede, gimnasta y plan.
 */

function archivedTemplate(): OperationalError {
  return new OperationalError(
    "INVALID_STATE_TRANSITION",
    "La plantilla está archivada: restáurala para seguir evaluando.",
    409
  );
}

/** La fecha de un logro no puede ser futura (en la zona horaria de la sede). */
function resolveDate(requested: string | null | undefined, today: string): string {
  const value = requested ?? today;
  if (value > today) {
    throw new OperationalError("INVALID_DATE_RANGE", "La fecha no puede ser posterior a hoy.", 422);
  }
  return value;
}

export async function evaluateSkills(input: ActorInput & { command: unknown }): Promise<EvaluationResult> {
  const command = evaluateSkillsCommandSchema.parse(input.command);
  return db.transaction(async (tx) => {
    const memberAccess = await authorizeMember(tx, { ...command, actor: input.actor, intent: "write" });
    await lockCommand(tx, command.organizationId, `skill-eval:${command.clientRequestId}`);

    // Repetir la misma petición no vuelve a escribir.
    const auditKey = `skill-levels:evaluated:${command.clientRequestId}`;
    const [prior] = await tx
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(and(eq(auditLog.organizationId, command.organizationId), eq(auditLog.idempotencyKey, auditKey)))
      .limit(1);
    if (prior) return { id: command.clientRequestId, revision: 1, replayed: true, changed: 0, unchanged: 0 };

    const template = await loadTemplateRow(tx, command.organizationId, command.templateId);
    if (template.archivedAt) throw archivedTemplate();

    const today = localDateInTimeZone(new Date(), memberAccess.location.timezone);
    const achievedOn = command.status === "achieved" ? resolveDate(command.achievedOn, today) : null;

    // Los elementos son activos y de esa plantilla.
    // unbounded-read-ok: acotada por los ids recibidos (como mucho 40 elementos).
    const elements = await tx
      .select({ id: skillElements.id })
      .from(skillElements)
      .where(
        and(
          eq(skillElements.organizationId, command.organizationId),
          eq(skillElements.templateId, template.id),
          inArray(skillElements.id, command.elementIds),
          isNull(skillElements.archivedAt)
        )
      );
    if (elements.length !== command.elementIds.length) {
      throw notFound("Algún elemento no existe en esta plantilla");
    }

    // Cada gimnasta se autoriza como en su ficha (vínculo con la sede, no archivada).
    for (const athleteId of command.athleteIds) {
      await authorizeAthlete(tx, memberAccess, {
        organizationId: command.organizationId,
        athleteId,
        intent: "write",
      });
    }

    // unbounded-read-ok: acotada por los ids recibidos (60 gimnastas x 40 elementos como mucho).
    const existingRows = await tx
      .select()
      .from(athleteSkillProgress)
      .where(
        and(
          eq(athleteSkillProgress.organizationId, command.organizationId),
          inArray(athleteSkillProgress.athleteId, command.athleteIds),
          inArray(athleteSkillProgress.elementId, command.elementIds)
        )
      );
    const existing = new Map(existingRows.map((row) => [`${row.athleteId}:${row.elementId}`, row] as const));

    const now = new Date();
    const memberId = memberAccess.member.id;
    const toInsert: Array<typeof athleteSkillProgress.$inferInsert> = [];
    let changed = 0;
    let unchanged = 0;
    for (const athleteId of command.athleteIds) {
      for (const elementId of command.elementIds) {
        const row = existing.get(`${athleteId}:${elementId}`);
        const status: ElementStatus = command.status;
        if (!row) {
          // Marcar «no iniciado» algo que no existe no escribe nada.
          if (status === "not_started") {
            unchanged += 1;
            continue;
          }
          toInsert.push({
            organizationId: command.organizationId,
            athleteId,
            templateId: template.id,
            elementId,
            locationId: command.locationId,
            status,
            achievedOn,
            evaluatedByMemberId: memberId,
            evaluatedAt: now,
          });
          changed += 1;
          continue;
        }
        // Conservar quién y cuándo lo consiguió si el estado no cambia.
        const sameStatus = row.status === status;
        const sameDate = status !== "achieved" || row.achievedOn === achievedOn || command.achievedOn == null;
        if (sameStatus && sameDate) {
          unchanged += 1;
          continue;
        }
        await tx
          .update(athleteSkillProgress)
          .set({
            status,
            achievedOn: status === "achieved" ? (achievedOn ?? row.achievedOn) : null,
            locationId: command.locationId,
            evaluatedByMemberId: memberId,
            evaluatedAt: now,
            revision: row.revision + 1,
            updatedAt: now,
          })
          .where(
            and(
              eq(athleteSkillProgress.organizationId, command.organizationId),
              eq(athleteSkillProgress.id, row.id),
              eq(athleteSkillProgress.revision, row.revision)
            )
          );
        changed += 1;
      }
    }
    if (toInsert.length > 0) await tx.insert(athleteSkillProgress).values(toInsert);

    await appendAuditEntry(tx, {
      organizationId: command.organizationId,
      locationId: command.locationId,
      actorUserId: input.actor.userId,
      action: "skill_progress.evaluated",
      targetType: "skill_template",
      targetId: template.id,
      idempotencyKey: auditKey,
      after: { status: command.status },
      metadata: {
        athletes: command.athleteIds.length,
        elements: command.elementIds.length,
        changed,
        unchanged,
      },
    });
    return { id: command.clientRequestId, revision: 1, replayed: false, changed, unchanged };
  });
}

async function loadPassContext(
  tx: TransactionClient,
  input: { organizationId: string; athleteId: string; templateId: string }
) {
  const levels = await loadTemplateLevels(tx, input.organizationId, input.templateId);
  // unbounded-read-ok: una plantilla admite como mucho 300 elementos activos (dominio).
  const progressRows = await tx
    .select({ elementId: athleteSkillProgress.elementId, status: athleteSkillProgress.status })
    .from(athleteSkillProgress)
    .where(
      and(
        eq(athleteSkillProgress.organizationId, input.organizationId),
        eq(athleteSkillProgress.athleteId, input.athleteId),
        eq(athleteSkillProgress.templateId, input.templateId)
      )
    );
  // unbounded-read-ok: como mucho un paso por nivel (20 niveles activos).
  const passRows = await tx
    .select({ levelId: athleteLevelPasses.levelId })
    .from(athleteLevelPasses)
    .where(
      and(
        eq(athleteLevelPasses.organizationId, input.organizationId),
        eq(athleteLevelPasses.athleteId, input.athleteId),
        eq(athleteLevelPasses.templateId, input.templateId)
      )
    );
  return {
    levels,
    progress: new Map(progressRows.map((row) => [row.elementId, row.status as ElementStatus] as const)),
    passedLevelIds: passRows.map((row) => row.levelId),
  };
}

export async function passSkillLevel(
  input: ActorInput & { athleteId: string; command: unknown }
): Promise<WriteResult> {
  const command = passLevelCommandSchema.parse(input.command);
  return db.transaction(async (tx) => {
    const memberAccess = await authorizeMember(tx, { ...command, actor: input.actor, intent: "write" });
    const access = await authorizeAthlete(tx, memberAccess, {
      organizationId: command.organizationId,
      athleteId: input.athleteId,
      intent: "write",
    });
    await lockCommand(tx, command.organizationId, `skill-pass:${command.clientRequestId}`);

    const [prior] = await tx
      .select()
      .from(athleteLevelPasses)
      .where(
        and(
          eq(athleteLevelPasses.organizationId, command.organizationId),
          eq(athleteLevelPasses.clientRequestId, command.clientRequestId)
        )
      )
      .limit(1);
    if (prior) {
      if (
        prior.athleteId !== input.athleteId ||
        prior.templateId !== command.templateId ||
        prior.levelId !== command.levelId
      ) {
        throw idempotencyConflict();
      }
      return { id: prior.id, revision: 1, replayed: true };
    }

    const template = await loadTemplateRow(tx, command.organizationId, command.templateId);
    if (template.archivedAt) throw archivedTemplate();
    const context = await loadPassContext(tx, {
      organizationId: command.organizationId,
      athleteId: input.athleteId,
      templateId: template.id,
    });
    const check = checkLevelPass({
      levels: context.levels.map((level) => ({
        id: level.id,
        position: level.position,
        elements: level.elements.map((element) => ({ id: element.id, required: element.required })),
      })),
      progress: context.progress,
      passedLevelIds: context.passedLevelIds,
      levelId: command.levelId,
    });
    if (!check.ok) {
      throw new OperationalError("INVALID_STATE_TRANSITION", passLevelRefusalMessages[check.reason], 409, {
        reason: check.reason,
      });
    }

    const today = localDateInTimeZone(new Date(), memberAccess.location.timezone);
    const passedOn = resolveDate(command.passedOn, today);
    const [level] = await tx
      .select({ id: skillLevels.id })
      .from(skillLevels)
      .where(
        and(
          eq(skillLevels.organizationId, command.organizationId),
          eq(skillLevels.templateId, template.id),
          eq(skillLevels.id, command.levelId)
        )
      )
      .limit(1);
    if (!level) throw notFound("Nivel no encontrado");

    const [created] = await tx
      .insert(athleteLevelPasses)
      .values({
        organizationId: command.organizationId,
        athleteId: input.athleteId,
        templateId: template.id,
        levelId: level.id,
        locationId: command.locationId,
        clientRequestId: command.clientRequestId,
        passedOn,
        passedByMemberId: access.member.id,
      })
      .returning({ id: athleteLevelPasses.id });
    if (!created) throw new OperationalError("FEATURE_NOT_AVAILABLE", "No se pudo registrar el paso de nivel", 503);
    await appendAuditEntry(tx, {
      organizationId: command.organizationId,
      locationId: command.locationId,
      actorUserId: input.actor.userId,
      action: "skill_level.passed",
      targetType: "athlete_level_pass",
      targetId: created.id,
      idempotencyKey: `skill-levels:level-passed:${command.clientRequestId}`,
      after: { templateId: template.id, levelId: level.id, passedOn },
      metadata: { athleteId: input.athleteId },
    });
    return { id: created.id, revision: 1, replayed: false };
  });
}
