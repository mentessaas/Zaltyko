import { sql } from "drizzle-orm";

import { db } from "@/db";
import type { TransactionClient } from "@/lib/db-transactions";
import { isElementVisibleToAcademies } from "@/modules/element-library/domain/element-library";
import {
  saveElementNoteCommandSchema,
  type ElementNoteView,
  type SaveElementNoteResult,
} from "@/modules/element-library/domain/library-requests";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { appendAuditEntry, lockCommand } from "@/modules/shared/infrastructure/transactional-records";

import { authorizeLibraryMember, notFound, type ActorInput } from "./access";
import { iso, UUID_PATTERN } from "./values";

/**
 * Nota de la academia sobre un elemento (ADR-0029 §2): una por academia y
 * elemento, la escribe y la lee todo el equipo técnico (SKILL_ROLES), nunca
 * las familias. Uso interno: entra por la fachada.
 *
 * Concurrencia por revisión: `expectedRevision` es la revisión que se vio
 * (null si no había nota). La tabla no tiene `client_request_id`, así que la
 * repetición se reconoce por el estado: si la nota guardada ya tiene el texto
 * pedido y su revisión es la esperada o la siguiente (la que dejó esta misma
 * petición), responde 200 sin escribir (`replayed`). Borrar una nota que ya no
 * existe tampoco escribe. Cualquier otra diferencia de revisión es un 409.
 * `clientRequestId` solo queda en el registro de auditoría.
 */

type NoteRow = { id: string; note: string; revision: number; updated_at: Date | string };

function noteView(row: NoteRow): ElementNoteView {
  return { text: row.note, revision: Number(row.revision), updatedAt: iso(row.updated_at) };
}

function versionConflict(currentRevision: number | null): OperationalError {
  return new OperationalError(
    "VERSION_CONFLICT",
    "Otra persona ha cambiado esta nota. Recarga para ver la última versión.",
    409,
    { currentRevision }
  );
}

/** El elemento lo ve la academia (revisado, edición publicada, sin retirar); si no, 404. */
async function assertVisibleElement(tx: TransactionClient, elementId: string): Promise<void> {
  if (!UUID_PATTERN.test(elementId)) throw notFound("Elemento no encontrado");
  const result = await tx.execute(sql`
    select e.review_status, e.withdrawn_at, edition.status as edition_status
    from zaltyko.catalog_elements as e
    join zaltyko.catalog_element_editions as edition on edition.id = e.edition_id
    where e.id = ${elementId}::uuid
    limit 1
  `);
  const row = result.rows[0] as
    | { review_status: string; withdrawn_at: Date | string | null; edition_status: string }
    | undefined;
  if (
    !row ||
    !isElementVisibleToAcademies({ reviewStatus: row.review_status, withdrawnAt: row.withdrawn_at }, { status: row.edition_status })
  ) {
    throw notFound("Elemento no encontrado");
  }
}

export async function saveElementNote(
  input: ActorInput & { elementId: string; command: unknown }
): Promise<SaveElementNoteResult> {
  const command = saveElementNoteCommandSchema.parse(input.command);
  return db.transaction(async (tx) => {
    const access = await authorizeLibraryMember(tx, { ...command, actor: input.actor, intent: "write" });
    await assertVisibleElement(tx, input.elementId);
    // Serializa las escrituras de la misma nota (también la primera, que aún no tiene fila).
    await lockCommand(tx, command.organizationId, `element-note:${input.elementId}`);
    const existing = await tx.execute(sql`
      select id, note, revision, updated_at
      from zaltyko.academy_element_notes
      where organization_id = ${command.organizationId}::uuid
        and catalog_element_id = ${input.elementId}::uuid
      limit 1
      for update
    `);
    const row = existing.rows[0] as NoteRow | undefined;
    const expected = command.expectedRevision ?? 0;
    const memberId = access.member.id;
    const audit = (action: string, idempotencyKey: string, after: Record<string, unknown> | null) =>
      appendAuditEntry(tx, {
        organizationId: command.organizationId,
        locationId: command.locationId,
        actorUserId: input.actor.userId,
        action,
        targetType: "academy_element_note",
        targetId: input.elementId,
        idempotencyKey,
        after,
        metadata: { clientRequestId: command.clientRequestId },
      });

    // Borrar.
    if (command.note === null) {
      if (!row) return { note: null, replayed: true };
      const revision = Number(row.revision);
      if (expected !== revision) throw versionConflict(revision);
      await tx.execute(sql`
        delete from zaltyko.academy_element_notes
        where organization_id = ${command.organizationId}::uuid and id = ${row.id}::uuid
      `);
      await audit("element_note.deleted", `element-library:note:${row.id}:deleted`, null);
      return { note: null, replayed: false };
    }

    // Crear.
    if (!row) {
      if (command.expectedRevision !== null) throw versionConflict(null);
      const created = await tx.execute(sql`
        insert into zaltyko.academy_element_notes
          (organization_id, catalog_element_id, note, revision, created_by_member_id, updated_by_member_id)
        values (${command.organizationId}::uuid, ${input.elementId}::uuid, ${command.note}, 1,
          ${memberId}::uuid, ${memberId}::uuid)
        returning id, note, revision, updated_at
      `);
      const inserted = created.rows[0] as NoteRow;
      await audit("element_note.created", `element-library:note:${inserted.id}:1`, { revision: 1 });
      return { note: noteView(inserted), replayed: false };
    }

    // Actualizar.
    const revision = Number(row.revision);
    if (row.note === command.note && (expected === revision || expected === revision - 1)) {
      return { note: noteView(row), replayed: true };
    }
    if (expected !== revision) throw versionConflict(revision);
    const updated = await tx.execute(sql`
      update zaltyko.academy_element_notes
      set note = ${command.note}, revision = revision + 1, updated_by_member_id = ${memberId}::uuid, updated_at = now()
      where organization_id = ${command.organizationId}::uuid and id = ${row.id}::uuid and revision = ${revision}
      returning id, note, revision, updated_at
    `);
    const saved = updated.rows[0] as NoteRow | undefined;
    if (!saved) throw versionConflict(revision);
    await audit("element_note.updated", `element-library:note:${row.id}:${revision + 1}`, { revision: revision + 1 });
    return { note: noteView(saved), replayed: false };
  });
}
