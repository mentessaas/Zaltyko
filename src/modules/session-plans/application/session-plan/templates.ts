import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import type { TransactionClient } from "@/lib/db-transactions";
import { elementLibraryUnavailable } from "@/modules/element-library/application/storage";
import { assertOrganizationOperationalWritable } from "@/modules/saas-billing/application/organization-usage";
import {
  blockCatalogTarget,
  classPlanTemplateQuerySchema,
  CLASS_TEMPLATE_PLAN_ROLES,
  normalizeTemplateBlock,
  parseStoredTemplateBlocks,
  saveClassPlanTemplateCommandSchema,
  type ClassPlanTemplateView,
  type SaveClassPlanTemplateCommand,
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
import { catalogLinkMismatch, catalogLinkNeedsApparatus, isBlockLibraryOn, isLinkable } from "./plans";

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

/** Compara también el enlace de cada bloque con la biblioteca: va dentro del jsonb. */
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

/**
 * Bloques del modelo con su enlace a la biblioteca (ADR-0029 §3.3). El modelo
 * se reescribe entero y sus bloques no tienen id:
 * - ausente (y, sin la biblioteca activa, también `null`): se conserva el
 *   enlace del bloque guardado en la misma posición si tiene la misma
 *   disciplina y el mismo aparato; si no, el bloque queda sin enlace;
 * - `null` con la biblioteca activa: sin enlace;
 * - un uuid que el modelo ya tenía en un bloque de la misma disciplina y
 *   aparato se conserva sin comprobarlo de nuevo (aunque ya no esté en la
 *   biblioteca); cualquier otro exige disciplina y aparato y un elemento
 *   visible de ese aparato.
 * Sin la biblioteca activa, un uuid ya se respondió con 503.
 */
async function resolveTemplateBlocks(
  tx: TransactionClient,
  input: { blocks: SaveClassPlanTemplateCommand["blocks"]; stored: TemplateBlock[]; libraryOn: boolean }
): Promise<TemplateBlock[]> {
  const targetKey = (link: string, block: { discipline?: string | null; apparatus?: string | null }) =>
    `${link}:${block.discipline ?? ""}:${block.apparatus ?? ""}`;
  const kept = new Set(
    input.stored.flatMap((block) => (block.catalogElementId ? [targetKey(block.catalogElementId, block)] : []))
  );
  const checked = new Map<string, boolean>();
  const resolved: TemplateBlock[] = [];
  for (const [index, block] of input.blocks.entries()) {
    const normalized = normalizeTemplateBlock({ ...block, catalogElementId: null });
    let link: string | null = null;
    if (block.catalogElementId === undefined || (block.catalogElementId === null && !input.libraryOn)) {
      const previous = input.stored[index];
      if (
        previous?.catalogElementId &&
        previous.discipline === normalized.discipline &&
        previous.apparatus === normalized.apparatus
      ) {
        link = previous.catalogElementId;
      }
    } else if (block.catalogElementId !== null) {
      link = block.catalogElementId;
      if (!kept.has(targetKey(link, normalized))) {
        const target = blockCatalogTarget(normalized);
        if (!target) throw catalogLinkNeedsApparatus();
        if (!(await isLinkable(tx, checked, link, target))) throw catalogLinkMismatch();
      }
    }
    resolved.push(normalizeTemplateBlock({ ...block, catalogElementId: link }));
  }
  return resolved;
}

export async function saveClassPlanTemplate(
  input: ActorInput & { classTemplateId: string; command: unknown }
): Promise<SessionPlanWriteResult> {
  const command = saveClassPlanTemplateCommandSchema.parse(input.command);
  const organizationId = command.organizationId;
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
    // Enlaces con la biblioteca: solo con la biblioteca activa. Sin ella, pedir
    // un enlace es 503 sin escribir nada.
    const libraryOn = await isBlockLibraryOn(tx, access);
    if (!libraryOn && command.blocks.some((block) => typeof block.catalogElementId === "string")) {
      throw elementLibraryUnavailable();
    }
    const content = {
      focus: command.focus ?? null,
      note: command.note ?? null,
      blocks: await resolveTemplateBlocks(tx, {
        blocks: command.blocks,
        stored: existing ? parseStoredTemplateBlocks(existing.blocks) : [],
        libraryOn,
      }),
    };

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
