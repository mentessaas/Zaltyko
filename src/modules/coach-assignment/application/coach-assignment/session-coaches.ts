import { sql } from "drizzle-orm";

import type { TransactionClient } from "@/lib/db-transactions";
import {
  addedStaffProfileIds,
  isCoachAssignmentManager,
  isSubstitution,
  normalizeStaffProfileIds,
  removedStaffProfileIds,
  sameStaffSet,
  sessionCoachesQuerySchema,
  setSessionCoachesCommandSchema,
  type SessionCoachesQuery,
  type SessionCoachesView,
  type SessionCoachesWriteResult,
  type SetSessionCoachesCommand,
} from "@/modules/coach-assignment/domain/coach-assignment";
import { sqlUuidArray } from "@/modules/owner-dashboard/application/sql-uuid-array";
import type { OperationalActor } from "@/modules/shared/application/actor";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { appendAuditEntry } from "@/modules/shared/infrastructure/transactional-records";

import {
  assertAdditionsEligible,
  assertManagerAccess,
  assertSessionReader,
  loadSession,
  staleAssignment,
  type SessionRow,
} from "./access";
import {
  classTitularIds,
  coachesByIds,
  eligibleCoaches,
  memberDisplayName,
  sessionCoachIds,
  sessionOverride,
  staffProfileIdsOfMember,
} from "./queries";
import { assignmentIdempotencyKey, findPriorAssignment, lockAssignmentRequest } from "./replay";
import { assertCoachAssignmentStorageAvailable } from "./storage";
import { inAssignmentTransaction, lockTemplateSessions } from "./transactions";
import { coachWarnings, warningAudit } from "./warnings";

export const SESSION_COACHES_SET_ACTION = "session.coaches_set";

async function sessionView(
  tx: TransactionClient,
  input: { organizationId: string; session: SessionRow; viewerMemberId: string; manager: boolean }
): Promise<SessionCoachesView> {
  const { organizationId, session } = input;
  const coachIds = await sessionCoachIds(tx, organizationId, session.id);
  const titularIds = await classTitularIds(tx, organizationId, session.classTemplateId);
  const coaches = await coachesByIds(tx, organizationId, coachIds);
  const titulars = await coachesByIds(tx, organizationId, titularIds);
  const override = await sessionOverride(tx, organizationId, session.id);
  const viewerProfiles = new Set(await staffProfileIdsOfMember(tx, organizationId, input.viewerMemberId));
  return {
    sessionId: session.id,
    classTemplateId: session.classTemplateId,
    locationId: session.locationId,
    coaches,
    titulars,
    // El motivo solo lo ve la dirección: una entrenadora no ve por qué se
    // sustituyó a una compañera (decide Elvis si se amplía).
    substitution: override
      ? {
          reason: input.manager ? override.reason : null,
          changedAt: override.changedAt,
          changedByName: await memberDisplayName(tx, organizationId, override.changedByMemberId),
        }
      : null,
    eligible: input.manager
      ? await eligibleCoaches(tx, { organizationId, locationId: session.locationId })
      : null,
    canWrite: input.manager && session.status !== "cancelled",
    assignedToViewer: coachIds.some((id) => viewerProfiles.has(id)),
  };
}

export async function getSessionCoaches(input: {
  actor: OperationalActor;
  sessionId: string;
  query: SessionCoachesQuery;
}): Promise<SessionCoachesView> {
  const query = sessionCoachesQuerySchema.parse(input.query);
  return inAssignmentTransaction(async (tx) => {
    await assertCoachAssignmentStorageAvailable(tx);
    // El acceso va antes que la sesión: una entrenadora fuera de su sede no
    // distingue una sesión ajena de una inexistente.
    const reader = await assertSessionReader(tx, {
      organizationId: query.organizationId,
      locationId: query.locationId,
      actor: input.actor,
    });
    const session = await loadSession(tx, {
      organizationId: query.organizationId,
      sessionId: input.sessionId,
      locationId: query.locationId,
    });
    return sessionView(tx, {
      organizationId: query.organizationId,
      session,
      viewerMemberId: reader.memberId,
      manager: isCoachAssignmentManager(reader.role),
    });
  });
}

/**
 * Cambia o añade entrenadoras en una sesión concreta sin tocar la clase. Si la
 * lista final coincide con las titulares, la sesión deja de estar en
 * sustitución y vuelve a heredar de la clase.
 */
export async function setSessionCoaches(input: {
  actor: OperationalActor;
  sessionId: string;
  command: SetSessionCoachesCommand;
}): Promise<SessionCoachesWriteResult> {
  const command = setSessionCoachesCommandSchema.parse(input.command);
  const target = normalizeStaffProfileIds(command.staffProfileIds);
  const expected = normalizeStaffProfileIds(command.expectedStaffProfileIds);
  const scope = { organizationId: command.organizationId, locationId: command.locationId };

  return inAssignmentTransaction(async (tx) => {
    await assertCoachAssignmentStorageAvailable(tx);
    // Primero el rol y la sede, sin escritura: quien no puede asignar recibe
    // 403 aunque la sesión no exista.
    await assertManagerAccess(tx, { ...scope, actor: input.actor });
    const found = await loadSession(tx, { ...scope, sessionId: input.sessionId });

    // Orden de cerrojos común (transactions.ts): petición, plantilla y sesión.
    await lockAssignmentRequest(tx, command.organizationId, command.clientRequestId);
    const replayed = await findPriorAssignment(tx, {
      organizationId: command.organizationId,
      clientRequestId: command.clientRequestId,
      targetType: "session",
      targetId: found.id,
      staffProfileIds: target,
    });
    if (replayed) {
      const session = await loadSession(tx, { ...scope, sessionId: found.id });
      const reader = await assertManagerAccess(tx, { ...scope, actor: input.actor });
      return {
        ...(await sessionView(tx, { organizationId: command.organizationId, session, viewerMemberId: reader.memberId, manager: true })),
        replayed: true,
        warnings: [],
      };
    }

    const manager = await assertManagerAccess(tx, { ...scope, actor: input.actor, intent: "write" });
    await lockTemplateSessions(tx, command.organizationId, found.classTemplateId);
    const session = await loadSession(tx, { ...scope, sessionId: found.id, forUpdate: true });
    if (session.status === "cancelled") {
      throw new OperationalError("INVALID_STATE_TRANSITION", "La sesión está cancelada.", 409);
    }

    const current = await sessionCoachIds(tx, command.organizationId, session.id);
    if (!sameStaffSet(current, expected)) throw staleAssignment();
    const titulars = await classTitularIds(tx, command.organizationId, session.classTemplateId);
    const priorOverride = await sessionOverride(tx, command.organizationId, session.id);
    const substitution = isSubstitution(target, titulars);
    const reason = substitution ? (command.reason ?? null) : null;
    const unchanged =
      sameStaffSet(current, target) &&
      Boolean(priorOverride) === substitution &&
      (priorOverride?.reason ?? null) === reason;
    if (unchanged) {
      return {
        ...(await sessionView(tx, { organizationId: command.organizationId, session, viewerMemberId: manager.memberId, manager: true })),
        replayed: false,
        warnings: [],
      };
    }

    await assertAdditionsEligible(tx, {
      organizationId: command.organizationId,
      locationId: session.locationId,
      current,
      target,
    });

    const removed = removedStaffProfileIds(current, target);
    const added = addedStaffProfileIds(current, target);
    if (removed.length > 0) {
      await tx.execute(sql`
        delete from zaltyko.session_staff
        where organization_id = ${command.organizationId}::uuid
          and session_id = ${session.id}::uuid
          and assignment_role = 'coach'
          and staff_profile_id = any(${sqlUuidArray(removed)})
      `);
    }
    if (added.length > 0) {
      await tx.execute(sql`
        insert into zaltyko.session_staff (organization_id, session_id, staff_profile_id, assignment_role)
        select ${command.organizationId}::uuid, ${session.id}::uuid, staff_profile_id, 'coach'
        from unnest(${sqlUuidArray(added)}) as staff_profile_id
        on conflict (organization_id, session_id, staff_profile_id) do update set assignment_role = 'coach'
      `);
    }

    if (substitution) {
      await tx.execute(sql`
        insert into zaltyko.session_staff_overrides (organization_id, session_id, reason, changed_by_member_id)
        values (${command.organizationId}::uuid, ${session.id}::uuid, ${reason}, ${manager.memberId}::uuid)
        on conflict (organization_id, session_id) do update
          set reason = excluded.reason,
              changed_by_member_id = excluded.changed_by_member_id,
              changed_at = now()
      `);
    } else {
      await tx.execute(sql`
        delete from zaltyko.session_staff_overrides
        where organization_id = ${command.organizationId}::uuid
          and session_id = ${session.id}::uuid
      `);
    }

    // O2: solo avisa. La sustitución ya está guardada.
    const warnings = await coachWarnings(tx, {
      organizationId: command.organizationId,
      staffProfileIds: target,
      sessionIds: [session.id],
    });

    await appendAuditEntry(tx, {
      organizationId: command.organizationId,
      locationId: session.locationId,
      actorUserId: input.actor.userId,
      action: SESSION_COACHES_SET_ACTION,
      targetType: "session",
      targetId: session.id,
      idempotencyKey: assignmentIdempotencyKey(command.clientRequestId),
      before: { staffProfileIds: current, substitution: Boolean(priorOverride), reason: priorOverride?.reason ?? null },
      after: { staffProfileIds: target, substitution, reason },
      metadata: { memberId: manager.memberId, classTemplateId: session.classTemplateId, ...warningAudit(warnings) },
    });

    return {
      ...(await sessionView(tx, { organizationId: command.organizationId, session, viewerMemberId: manager.memberId, manager: true })),
      replayed: false,
      warnings,
    };
  });
}
