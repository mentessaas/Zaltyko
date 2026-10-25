import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  classTemplates,
  classTemplateWeekdays,
  sessions,
  type Session,
} from "@/db/zaltyko-schema";
import { operationalActorSchema } from "@/modules/shared/application/actor";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { assertOperationalAccess } from "@/modules/shared/infrastructure/operational-authorization";
import {
  appendAuditEntry,
  appendOutboxEvent,
  assertIdempotencyPayload,
  findOutboxEvent,
  lockCommand,
} from "@/modules/shared/infrastructure/transactional-records";
import type { TransactionClient } from "@/lib/db-transactions";

const materializeSessionsSchema = z
  .object({
    organizationId: z.guid(),
    classTemplateId: z.guid(),
    startDate: z.string().date(),
    endDate: z.string().date(),
    idempotencyKey: z.string().trim().min(8).max(180),
    actor: operationalActorSchema,
  })
  .superRefine((input, context) => {
    const start = Date.parse(`${input.startDate}T00:00:00Z`);
    const end = Date.parse(`${input.endDate}T00:00:00Z`);
    const days = (end - start) / 86_400_000;
    if (end < start || days > 120) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "El rango debe ser válido y no superar 120 días",
      });
    }
  });

export type MaterializeSessionsCommand = z.infer<
  typeof materializeSessionsSchema
>;

async function loadSessionsByIds(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  organizationId: string,
  ids: string[]
): Promise<Session[]> {
  if (ids.length === 0) return [];
  return tx
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.organizationId, organizationId),
        inArray(sessions.id, ids)
      )
    )
    .orderBy(asc(sessions.startsAt))
    .limit(1000);
}

export async function materializeSessions(
  command: MaterializeSessionsCommand,
  transaction?: TransactionClient
): Promise<Session[]> {
  const run = async (tx: TransactionClient): Promise<Session[]> => {
    const input = materializeSessionsSchema.parse(command);
    const eventName = "sessions.materialized";

    await lockCommand(tx, input.organizationId, input.idempotencyKey);

    const [template] = await tx
      .select({
        id: classTemplates.id,
        locationId: classTemplates.locationId,
        status: classTemplates.status,
        effectiveFrom: classTemplates.effectiveFrom,
        effectiveTo: classTemplates.effectiveTo,
      })
      .from(classTemplates)
      .where(
        and(
          eq(classTemplates.organizationId, input.organizationId),
          eq(classTemplates.id, input.classTemplateId)
        )
      )
      .limit(1);

    if (!template || template.status !== "active") {
      throw new OperationalError(
        "NOT_FOUND",
        "Plantilla activa no encontrada",
        404
      );
    }

    await assertOperationalAccess(tx, {
      organizationId: input.organizationId,
      locationId: template.locationId,
      actor: input.actor,
      allowedRoles: ["owner", "manager", "admin"],
    });

    const priorEvent = await findOutboxEvent(tx, {
      organizationId: input.organizationId,
      eventName,
      idempotencyKey: input.idempotencyKey,
    });
    if (priorEvent) {
      assertIdempotencyPayload(priorEvent.payload, {
        classTemplateId: input.classTemplateId,
        startDate: input.startDate,
        endDate: input.endDate,
      });
    }
    const priorIds = priorEvent?.payload.sessionIds;
    if (
      Array.isArray(priorIds) &&
      priorIds.every((id) => typeof id === "string")
    ) {
      return loadSessionsByIds(tx, input.organizationId, priorIds);
    }

    const [schedule] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(classTemplateWeekdays)
      .where(
        and(
          eq(classTemplateWeekdays.organizationId, input.organizationId),
          eq(classTemplateWeekdays.classTemplateId, input.classTemplateId)
        )
      );
    if (Number(schedule?.count ?? 0) === 0) {
      throw new OperationalError(
        "NO_SCHEDULE",
        "La plantilla no tiene horario semanal",
        409
      );
    }

    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${input.organizationId}:sessions:${input.classTemplateId}`}, 0))`
    );

    await tx.execute(sql`
      insert into zaltyko.sessions (
        id,
        organization_id,
        location_id,
        class_template_id,
        space_id,
        status,
        starts_at,
        ends_at
      )
      select
        gen_random_uuid(),
        template.organization_id,
        template.location_id,
        template.id,
        template.default_space_id,
        'scheduled'::zaltyko.session_status,
        (day.local_date + weekday.starts_at_local) at time zone location.timezone,
        (day.local_date + weekday.ends_at_local) at time zone location.timezone
      from zaltyko.class_templates template
      join zaltyko.locations location
        on location.organization_id = template.organization_id
       and location.id = template.location_id
      join zaltyko.class_template_weekdays weekday
        on weekday.organization_id = template.organization_id
       and weekday.class_template_id = template.id
      cross join lateral (
        select generated_day::date as local_date
        from generate_series(
          ${input.startDate}::date,
          ${input.endDate}::date,
          interval '1 day'
        ) generated_day
      ) day
      where template.organization_id = ${input.organizationId}::uuid
        and template.id = ${input.classTemplateId}::uuid
        and extract(isodow from day.local_date)::int = weekday.iso_weekday
        and day.local_date >= greatest(template.effective_from, ${input.startDate}::date)
        and day.local_date <= least(
          coalesce(template.effective_to, ${input.endDate}::date),
          ${input.endDate}::date
        )
      on conflict (organization_id, class_template_id, starts_at) do nothing
    `);

    const sessionIdsResult = await tx.execute(sql`
      select session.id
      from zaltyko.sessions session
      join zaltyko.locations location
        on location.organization_id = session.organization_id
       and location.id = session.location_id
      where session.organization_id = ${input.organizationId}::uuid
        and session.class_template_id = ${input.classTemplateId}::uuid
        and (session.starts_at at time zone location.timezone)::date
          between ${input.startDate}::date and ${input.endDate}::date
      order by session.starts_at
    `);
    const sessionIds = sessionIdsResult.rows.map((row) => String(row.id));

    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId: template.locationId,
      eventName,
      aggregateType: "class_template",
      aggregateId: input.classTemplateId,
      idempotencyKey: input.idempotencyKey,
      payload: {
        classTemplateId: input.classTemplateId,
        startDate: input.startDate,
        endDate: input.endDate,
        sessionIds,
        sessionCount: sessionIds.length,
      },
    });

    await appendAuditEntry(tx, {
      organizationId: input.organizationId,
      locationId: template.locationId,
      actorUserId: input.actor.userId,
      action: eventName,
      targetType: "class_template",
      targetId: input.classTemplateId,
      idempotencyKey: input.idempotencyKey,
      after: {
        startDate: input.startDate,
        endDate: input.endDate,
        sessionCount: sessionIds.length,
      },
    });

    return loadSessionsByIds(tx, input.organizationId, sessionIds);
  };

  return transaction ? run(transaction) : db.transaction(run);
}
