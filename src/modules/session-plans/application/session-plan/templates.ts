import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import type { TransactionClient } from "@/lib/db-transactions";
import { assertOrganizationOperationalWritable } from "@/modules/saas-billing/application/organization-usage";
import {
  classPlanTemplateQuerySchema,
  CLASS_TEMPLATE_PLAN_ROLES,
  normalizeTemplateBlock,
  parseStoredTemplateBlocks,
  saveClassPlanTemplateCommandSchema,
  type ClassPlanTemplateView,
  type SessionPlanWriteResult,
  type TemplateBlock,
} from "@/modules/session-plans/domain/session-plan";
import {
  classPlanTemplates,
  type ClassPlanTemplateRow,
} from "@/modules/session-plans/infrastructure/session-plan-schema";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { appendAuditEntry, lockCommand } from "@/modules/shared/infrastructure/transactional-records";

import { authorizeMember, loadClassAtLocation, notFound, staleRevision, type Access, type ActorInput } from "./access";

/**
 * Plantilla de plan por clase (P2 #17, segunda parte). Uso interno: entra por
 * la fachada. Solo la dirección, administración y coordinación (Decide Elvis).
 * Se copia al crear el plan de una sesión; cambiarla no toca planes ya creados.
 */

async function loadTemplate(
  tx: TransactionClient,
  access: Access,
  input: { organizationId: string; classTemplateId: string; forUpdate: boolean }
): Promise<ClassPlanTemplateRow | null> {
  const query = tx
    .select()
    .from(classPlanTemplates)
    .where(
      and(
        eq(classPlanTemplates.organizationId, input.organizationId),
        eq(classPlanTemplates.locationId, access.location.id),
        eq(classPlanTemplates.classTemplateId, input.classTemplateId)
      )
    )
    .limit(1);
  const [row] = input.forUpdate ? await query.for("update") : await query;
  return row ?? null;
}

function toView(classTemplateId: string, row: ClassPlanTemplateRow | null): ClassPlanTemplateView {
  return {
    classTemplateId,
    template: row
      ? {
          id: row.id,
          revision: row.revision,
          focus: row.focus,
          note: row.note,
          blocks: parseStoredTemplateBlocks(row.blocks),
          updatedAt: new Date(row.updatedAt).toISOString(),
        }
      : null,
  };
}

export async function getClassPlanTemplate(
  input: ActorInput & { classTemplateId: string; query: unknown }
): Promise<ClassPlanTemplateView> {
  const query = classPlanTemplateQuerySchema.parse(input.query);
  return db.transaction(async (tx) => {
    const access = await authorizeMember(tx, {
      ...query,
      actor: input.actor,
      allowedRoles: CLASS_TEMPLATE_PLAN_ROLES,
    });
    const classRow = await loadClassAtLocation(tx, access, {
      organizationId: query.organizationId,
      classTemplateId: input.classTemplateId,
    });
    return toView(
      classRow.id,
      await loadTemplate(tx, access, {
        organizationId: query.organizationId,
        classTemplateId: classRow.id,
        forUpdate: false,
      })
    );
  });
}

function sameContent(
  row: ClassPlanTemplateRow,
  content: { focus: string | null; note: string | null; blocks: TemplateBlock[] }
): boolean {
  return (
    row.focus === content.focus &&
    row.note === content.note &&
    JSON.stringify(parseStoredTemplateBlocks(row.blocks)) === JSON.stringify(content.blocks)
  );
}

export async function saveClassPlanTemplate(
  input: ActorInput & { classTemplateId: string; command: unknown }
): Promise<SessionPlanWriteResult> {
  const command = saveClassPlanTemplateCommandSchema.parse(input.command);
  const organizationId = command.organizationId;
  const content = {
    focus: command.focus ?? null,
    note: command.note ?? null,
    blocks: command.blocks.map(normalizeTemplateBlock),
  };
  return db.transaction(async (tx) => {
    const access = await authorizeMember(tx, {
      ...command,
      actor: input.actor,
      allowedRoles: CLASS_TEMPLATE_PLAN_ROLES,
    });
    const classRow = await loadClassAtLocation(tx, access, {
      organizationId,
      classTemplateId: input.classTemplateId,
    });
    await lockCommand(tx, organizationId, `class-plan-template:${classRow.id}`);
    const existing = await loadTemplate(tx, access, {
      organizationId,
      classTemplateId: classRow.id,
      forUpdate: true,
    });

    if (command.expectedRevision === null) {
      if (existing) {
        // Reintento del mismo alta: mismo contenido, misma respuesta.
        if (existing.revision === 1 && sameContent(existing, content)) {
          return { id: existing.id, revision: existing.revision, replayed: true };
        }
        throw new OperationalError(
          "VERSION_CONFLICT",
          "Esta clase ya tiene modelo. Recarga para verlo y editarlo.",
          409
        );
      }
    } else {
      if (!existing) throw notFound("Esta clase todavía no tiene modelo");
      if (existing.revision !== command.expectedRevision) throw staleRevision();
    }

    await assertOrganizationOperationalWritable(tx, organizationId);
    const memberId = access.member.id;
    if (!existing) {
      const [created] = await tx
        .insert(classPlanTemplates)
        .values({
          organizationId,
          locationId: access.location.id,
          classTemplateId: classRow.id,
          focus: content.focus,
          note: content.note,
          blocks: content.blocks,
          updatedByMemberId: memberId,
        })
        .returning({ id: classPlanTemplates.id, revision: classPlanTemplates.revision });
      if (!created) throw new OperationalError("FEATURE_NOT_AVAILABLE", "No se pudo guardar el modelo de la clase", 503);
      await appendAuditEntry(tx, {
        organizationId,
        locationId: access.location.id,
        actorUserId: input.actor.userId,
        action: "class_plan_template.created",
        targetType: "class_plan_template",
        targetId: created.id,
        idempotencyKey: `class-plan-template:${created.id}:1`,
        after: { revision: 1, blocks: content.blocks.length },
        metadata: { classTemplateId: classRow.id },
      });
      return { id: created.id, revision: created.revision, replayed: false };
    }

    const revision = existing.revision + 1;
    await tx
      .update(classPlanTemplates)
      .set({
        focus: content.focus,
        note: content.note,
        blocks: content.blocks,
        revision,
        updatedByMemberId: memberId,
        updatedAt: new Date(),
      })
      .where(and(eq(classPlanTemplates.organizationId, organizationId), eq(classPlanTemplates.id, existing.id)));
    await appendAuditEntry(tx, {
      organizationId,
      locationId: access.location.id,
      actorUserId: input.actor.userId,
      action: "class_plan_template.updated",
      targetType: "class_plan_template",
      targetId: existing.id,
      idempotencyKey: `class-plan-template:${existing.id}:${revision}`,
      before: { revision: existing.revision },
      after: { revision, blocks: content.blocks.length },
      metadata: { classTemplateId: classRow.id },
    });
    return { id: existing.id, revision, replayed: false };
  });
}
