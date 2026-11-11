import { sql } from "drizzle-orm";

import type { DatabaseClient, TransactionClient } from "@/lib/db-transactions";
import {
  addedStaffProfileIds,
  classCoachesQuerySchema,
  coachDisplayName,
  normalizeStaffProfileIds,
  removedStaffProfileIds,
  sameStaffSet,
  setClassCoachesCommandSchema,
  sortCoaches,
  type ClassCoachesQuery,
  type ClassCoachesView,
  type ClassCoachesWriteResult,
  type SetClassCoachesCommand,
} from "@/modules/coach-assignment/domain/coach-assignment";
import type { OperationalActor } from "@/modules/shared/application/actor";
import { appendAuditEntry } from "@/modules/shared/infrastructure/transactional-records";
import { sqlUuidArray } from "@/modules/owner-dashboard/application/sql-uuid-array";
import { SESSION_HORIZON_TARGET_DAYS } from "@/modules/scheduling/domain/session-horizon";

import {
  assertAdditionsEligible,
  assertClassManagerAccess,
  assertManagerMembership,
  loadClassTemplate,
  staleAssignment,
} from "./access";
import { classTitularIds, coachesByIds, eligibleCoaches } from "./queries";
import { assignmentIdempotencyKey, findPriorAssignment, lockAssignmentRequest } from "./replay";
import { assertCoachAssignmentStorageAvailable } from "./storage";
import { inAssignmentTransaction, lockTemplateSessions } from "./transactions";

export const CLASS_COACHES_SET_ACTION = "class_template.coaches_set";

async function classView(
  tx: TransactionClient,
  input: { organizationId: string; classTemplateId: string; locationId: string }
): Promise<ClassCoachesView> {
  const titularIds = await classTitularIds(tx, input.organizationId, input.classTemplateId);
  // En serie: una transacción usa una sola conexión.
  const titulars = await coachesByIds(tx, input.organizationId, titularIds);
  const eligible = await eligibleCoaches(tx, { organizationId: input.organizationId, locationId: input.locationId });
  return {
    classTemplateId: input.classTemplateId,
    locationId: input.locationId,
    titulars,
    eligible,
    canWrite: true,
  };
}

export async function getClassCoaches(input: {
  actor: OperationalActor;
  classTemplateId: string;
  query: ClassCoachesQuery;
}): Promise<ClassCoachesView> {
  const query = classCoachesQuerySchema.parse(input.query);
  return inAssignmentTransaction(async (tx) => {
    await assertCoachAssignmentStorageAvailable(tx);
    await assertManagerMembership(tx, { organizationId: query.organizationId, actor: input.actor });
    const template = await loadClassTemplate(tx, {
      organizationId: query.organizationId,
      classTemplateId: input.classTemplateId,
      locationId: query.locationId,
    });
    await assertClassManagerAccess(tx, {
      organizationId: query.organizationId,
      locationId: template.locationId,
      actor: input.actor,
    });
    return classView(tx, {
      organizationId: query.organizationId,
      classTemplateId: template.id,
      locationId: template.locationId,
    });
  });
}

/**
 * Pasa a las nuevas titulares las sesiones futuras programadas de la clase que
 * no tienen sustitución. Las pasadas, canceladas o sustituidas no cambian.
 *
 * Primero bloquea todas las sesiones futuras programadas de la clase y solo
 * después, en otra sentencia (otra instantánea), lee sus marcas de
 * sustitución: una sustitución que termina mientras se espera el bloqueo ya se
 * ve y no se pisa. Además la sustitución toma el mismo cerrojo de plantilla
 * que este cambio (ver transactions.ts).
 *
 * Una sesión sustituida cuya lista coincide ya con las nuevas titulares deja
 * de estar en sustitución.
 */
async function propagateToFutureSessions(
  tx: TransactionClient,
  input: { organizationId: string; classTemplateId: string; staffProfileIds: string[] }
): Promise<{ updatedSessionCount: number; clearedSubstitutionCount: number }> {
  // Tope explícito: ninguna sesión se genera más allá de
  // max(hoy, inicio de la clase) + SESSION_HORIZON_TARGET_DAYS (creación de la
  // clase y job de horizonte), así que no se bloquea nada por encima.
  const locked = await tx.execute(sql`
    select session.id::text as id
    from zaltyko.sessions session
    join zaltyko.class_templates template
      on template.organization_id = session.organization_id
     and template.id = session.class_template_id
    where session.organization_id = ${input.organizationId}::uuid
      and session.class_template_id = ${input.classTemplateId}::uuid
      and session.status = 'scheduled'
      and session.starts_at > now()
      and session.starts_at <= greatest(now(), template.effective_from::timestamptz)
        + make_interval(days => ${SESSION_HORIZON_TARGET_DAYS}::int)
    order by session.id
    for update of session
  `);
  const lockedIds = (locked.rows as Array<{ id: string }>).map((row) => row.id);
  if (lockedIds.length === 0) return { updatedSessionCount: 0, clearedSubstitutionCount: 0 };

  const markers = await tx.execute(sql`
    select session_id::text as id
    from zaltyko.session_staff_overrides
    where organization_id = ${input.organizationId}::uuid
      and session_id = any(${sqlUuidArray(lockedIds)})
  `);
  const substituted = new Set((markers.rows as Array<{ id: string }>).map((row) => row.id));
  const sessionIds = lockedIds.filter((id) => !substituted.has(id));

  if (sessionIds.length > 0) {
    await tx.execute(sql`
      delete from zaltyko.session_staff
      where organization_id = ${input.organizationId}::uuid
        and session_id = any(${sqlUuidArray(sessionIds)})
        and assignment_role = 'coach'
    `);
    if (input.staffProfileIds.length > 0) {
      await tx.execute(sql`
        insert into zaltyko.session_staff (organization_id, session_id, staff_profile_id, assignment_role)
        select ${input.organizationId}::uuid, session_id, staff_profile_id, 'coach'
        from unnest(${sqlUuidArray(sessionIds)}) as session_id
        cross join unnest(${sqlUuidArray(input.staffProfileIds)}) as staff_profile_id
        on conflict (organization_id, session_id, staff_profile_id) do update set assignment_role = 'coach'
      `);
    }
  }

  let clearedSubstitutionCount = 0;
  if (substituted.size > 0) {
    const cleared = await tx.execute(sql`
      delete from zaltyko.session_staff_overrides marker
      where marker.organization_id = ${input.organizationId}::uuid
        and marker.session_id = any(${sqlUuidArray([...substituted])})
        and coalesce((
          select array_agg(assignment.staff_profile_id order by assignment.staff_profile_id)
          from zaltyko.session_staff assignment
          where assignment.organization_id = marker.organization_id
            and assignment.session_id = marker.session_id
            and assignment.assignment_role = 'coach'
        ), array[]::uuid[]) = ${sqlUuidArray(input.staffProfileIds)}::uuid[]
      returning marker.session_id
    `);
    clearedSubstitutionCount = cleared.rows.length;
  }
  return { updatedSessionCount: sessionIds.length, clearedSubstitutionCount };
}

export async function setClassCoaches(input: {
  actor: OperationalActor;
  classTemplateId: string;
  command: SetClassCoachesCommand;
}): Promise<ClassCoachesWriteResult> {
  const command = setClassCoachesCommandSchema.parse(input.command);
  const target = normalizeStaffProfileIds(command.staffProfileIds);
  const expected = normalizeStaffProfileIds(command.expectedStaffProfileIds);

  return inAssignmentTransaction(async (tx) => {
    await assertCoachAssignmentStorageAvailable(tx);
    await assertManagerMembership(tx, { organizationId: command.organizationId, actor: input.actor });
    const template = await loadClassTemplate(tx, {
      organizationId: command.organizationId,
      classTemplateId: input.classTemplateId,
      locationId: command.locationId,
    });
    const scope = { organizationId: command.organizationId, classTemplateId: template.id, locationId: template.locationId };

    await lockAssignmentRequest(tx, command.organizationId, command.clientRequestId);
    const replayed = await findPriorAssignment(tx, {
      organizationId: command.organizationId,
      clientRequestId: command.clientRequestId,
      targetType: "class_template",
      targetId: template.id,
      staffProfileIds: target,
    });
    if (replayed) {
      // Un reintento se puede leer aunque el plan haya pasado a solo lectura.
      await assertClassManagerAccess(tx, { organizationId: command.organizationId, locationId: template.locationId, actor: input.actor });
      return { ...(await classView(tx, scope)), updatedSessionCount: 0, clearedSubstitutionCount: 0, replayed: true };
    }

    const manager = await assertClassManagerAccess(tx, {
      organizationId: command.organizationId,
      locationId: template.locationId,
      actor: input.actor,
      intent: "write",
    });

    await lockTemplateSessions(tx, command.organizationId, template.id);
    const current = await classTitularIds(tx, command.organizationId, template.id);
    if (!sameStaffSet(current, expected)) throw staleAssignment();
    if (sameStaffSet(current, target)) {
      return { ...(await classView(tx, scope)), updatedSessionCount: 0, clearedSubstitutionCount: 0, replayed: false };
    }
    await assertAdditionsEligible(tx, {
      organizationId: command.organizationId,
      locationId: template.locationId,
      current,
      target,
    });

    const removed = removedStaffProfileIds(current, target);
    const added = addedStaffProfileIds(current, target);
    if (removed.length > 0) {
      await tx.execute(sql`
        delete from zaltyko.class_template_staff
        where organization_id = ${command.organizationId}::uuid
          and class_template_id = ${template.id}::uuid
          and staff_profile_id = any(${sqlUuidArray(removed)})
      `);
    }
    if (added.length > 0) {
      await tx.execute(sql`
        insert into zaltyko.class_template_staff
          (organization_id, class_template_id, staff_profile_id, assigned_by_member_id)
        select ${command.organizationId}::uuid, ${template.id}::uuid, staff_profile_id, ${manager.memberId}::uuid
        from unnest(${sqlUuidArray(added)}) as staff_profile_id
      `);
    }

    const { updatedSessionCount, clearedSubstitutionCount } = await propagateToFutureSessions(tx, {
      organizationId: command.organizationId,
      classTemplateId: template.id,
      staffProfileIds: target,
    });

    await appendAuditEntry(tx, {
      organizationId: command.organizationId,
      locationId: template.locationId,
      actorUserId: input.actor.userId,
      action: CLASS_COACHES_SET_ACTION,
      targetType: "class_template",
      targetId: template.id,
      idempotencyKey: assignmentIdempotencyKey(command.clientRequestId),
      before: { staffProfileIds: current },
      after: { staffProfileIds: target, updatedSessionCount, clearedSubstitutionCount },
      metadata: { memberId: manager.memberId },
    });

    return { ...(await classView(tx, scope)), updatedSessionCount, clearedSubstitutionCount, replayed: false };
  });
}

/** Titulares de varias clases para pintar la lista de Clases (solo lectura). */
export async function getClassTitularsByClass(
  client: DatabaseClient,
  input: { organizationId: string; classTemplateIds: readonly string[] }
): Promise<Record<string, Array<{ staffProfileId: string; name: string }>>> {
  const ids = normalizeStaffProfileIds(input.classTemplateIds);
  if (ids.length === 0) return {};
  const result = await client.execute(sql`
    select assignment.class_template_id::text as class_template_id,
      staff.id::text as staff_profile_id,
      person.given_name, person.family_name, person.preferred_name
    from zaltyko.class_template_staff assignment
    join zaltyko.staff_profiles staff
      on staff.organization_id = assignment.organization_id
     and staff.id = assignment.staff_profile_id
    join zaltyko.people person
      on person.organization_id = staff.organization_id
     and person.id = staff.person_id
    where assignment.organization_id = ${input.organizationId}::uuid
      and assignment.class_template_id = any(${sqlUuidArray(ids)})
    order by person.family_name, person.given_name, staff.id
  `);
  const byClass: Record<string, Array<{ staffProfileId: string; name: string }>> = {};
  for (const row of result.rows as Array<{
    class_template_id: string;
    staff_profile_id: string;
    given_name: string;
    family_name: string;
    preferred_name: string | null;
  }>) {
    const list = (byClass[row.class_template_id] ??= []);
    list.push({
      staffProfileId: row.staff_profile_id,
      name: coachDisplayName({ givenName: row.given_name, familyName: row.family_name, preferredName: row.preferred_name }),
    });
  }
  for (const classTemplateId of Object.keys(byClass)) byClass[classTemplateId] = sortCoaches(byClass[classTemplateId]!);
  return byClass;
}
