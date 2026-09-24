import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  athletes,
  classEnrollments,
  classGroups,
  classWaitingList,
  classes,
  groupAthletes,
  guardianAthletes,
  guardians,
} from "@/db/schema";
import { createNotification } from "@/lib/notifications/notification-service";
import { withTransaction } from "@/lib/db-transactions";

/** Promueve una entrada con bloqueo transaccional por clase; es segura ante concurrencia. */
export async function promoteNextWaitingListEntry(
  classId: string,
  tenantId: string,
  entryId?: string,
) {
  const promoted = await withTransaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${classId}))`);
    const [classRow] = await tx
      .select({
        academyId: classes.academyId,
        capacity: classes.capacity,
        name: classes.name,
      })
      .from(classes)
      .where(and(eq(classes.id, classId), eq(classes.tenantId, tenantId)))
      .limit(1);
    if (!classRow || classRow.capacity == null) return null;
    const occupancyResult = await tx.execute(sql`
      select count(distinct athlete_id)::int as current from (
        select ga.athlete_id from ${classGroups} cg join ${groupAthletes} ga on ga.group_id = cg.group_id and ga.tenant_id = cg.tenant_id join ${athletes} a on a.id = ga.athlete_id and a.tenant_id = cg.tenant_id where cg.class_id = ${classId} and cg.tenant_id = ${tenantId} and a.academy_id = ${classRow.academyId} and a.deleted_at is null
        union select ga.athlete_id from ${groupAthletes} ga join ${athletes} a on a.id = ga.athlete_id and a.tenant_id = ga.tenant_id where ga.group_id = (select group_id from ${classes} where id = ${classId}) and ga.tenant_id = ${tenantId} and a.academy_id = ${classRow.academyId} and a.deleted_at is null
        union select a.id from ${athletes} a where a.group_id = (select group_id from ${classes} where id = ${classId}) and a.tenant_id = ${tenantId} and a.academy_id = ${classRow.academyId} and a.deleted_at is null
        union select ce.athlete_id from ${classEnrollments} ce join ${athletes} a on a.id = ce.athlete_id where ce.class_id = ${classId} and ce.tenant_id = ${tenantId} and ce.academy_id = ${classRow.academyId} and a.deleted_at is null
      ) effective
    `);
    const occupancy = occupancyResult.rows[0] as
      { current?: number } | undefined;
    if (Number(occupancy?.current ?? 0) >= classRow.capacity) return null;
    const [entry] = await tx
      .select({
        id: classWaitingList.id,
        athleteId: classWaitingList.athleteId,
      })
      .from(classWaitingList)
      .where(and(
        eq(classWaitingList.classId, classId),
        eq(classWaitingList.tenantId, tenantId),
        ...(entryId ? [eq(classWaitingList.id, entryId)] : []),
      ))
      .orderBy(asc(classWaitingList.position), asc(classWaitingList.addedAt))
      .limit(1);
    if (!entry) return null;
    const [enrollment] = await tx
      .insert(classEnrollments)
      .values({
        tenantId,
        academyId: classRow.academyId,
        classId,
        athleteId: entry.athleteId,
      })
      .onConflictDoNothing({
        target: [
          classEnrollments.tenantId,
          classEnrollments.classId,
          classEnrollments.athleteId,
        ],
      })
      .returning({ id: classEnrollments.id });
    if (!enrollment) return null;
    await tx
      .delete(classWaitingList)
      .where(
        and(
          eq(classWaitingList.id, entry.id),
          eq(classWaitingList.tenantId, tenantId)
        )
      );
    const recipients = await tx
      .select({ profileId: guardians.profileId, athleteName: athletes.name })
      .from(guardianAthletes)
      .innerJoin(guardians, eq(guardianAthletes.guardianId, guardians.id))
      .innerJoin(athletes, eq(guardianAthletes.athleteId, athletes.id))
      .where(
        and(
          eq(guardianAthletes.tenantId, tenantId),
          eq(guardianAthletes.athleteId, entry.athleteId),
          eq(guardians.tenantId, tenantId)
        )
      )
      .limit(500);
    return {
      enrollmentId: enrollment.id,
      athleteId: entry.athleteId,
      className: classRow.name || "la clase",
      recipients,
    };
  });
  if (!promoted) return null;
  for (const recipient of promoted.recipients)
    if (recipient.profileId)
      await createNotification({
        tenantId,
        userId: recipient.profileId,
        type: "waitlist_promoted",
        title: "Plaza disponible",
        message: `${recipient.athleteName || "El atleta"} ha sido inscrito en ${promoted.className}.`,
        data: {
          classId,
          athleteId: promoted.athleteId,
          enrollmentId: promoted.enrollmentId,
        },
      });
  return { enrollmentId: promoted.enrollmentId, athleteId: promoted.athleteId };
}
