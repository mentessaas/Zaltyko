import { createHash } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  classTemplates,
  classTemplateWeekdays,
  locations,
  programs,
} from "@/db/zaltyko-schema";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { operationalActorSchema } from "@/modules/shared/application/actor";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { assertOperationalAccess } from "@/modules/shared/infrastructure/operational-authorization";
import { assertOrganizationResourceCapacity } from "@/modules/saas-billing/application/organization-usage";
import { MAX_CLASS_CAPACITY } from "@/modules/scheduling/domain/class-capacity";
import {
  appendAuditEntry,
  appendOutboxEvent,
  assertIdempotencyPayload,
  findOutboxEvent,
  lockCommand,
} from "@/modules/shared/infrastructure/transactional-records";
import { materializeSessions } from "@/modules/scheduling/application/session-service";

const scheduleSlotSchema = z
  .object({
    isoWeekday: z.number().int().min(1).max(7),
    startsAtLocal: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    endsAtLocal: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .refine((slot) => slot.endsAtLocal > slot.startsAtLocal, {
    path: ["endsAtLocal"],
    message: "La hora de fin debe ser posterior a la de inicio.",
  });

const createScheduledClassSchema = z
  .object({
    organizationId: z.guid(),
    locationId: z.guid(),
    programId: z.guid().nullable(),
    name: z.string().trim().min(2).max(120),
    capacity: z.number().int().positive().max(MAX_CLASS_CAPACITY),
    effectiveFrom: z.string().date(),
    effectiveTo: z.string().date().nullable(),
    schedule: z.array(scheduleSlotSchema).min(1).max(14),
    idempotencyKey: z.string().trim().min(8).max(180),
    actor: operationalActorSchema,
  })
  .superRefine((input, context) => {
    if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["effectiveTo"],
        message: "La fecha de fin debe ser posterior al inicio.",
      });
    }

    const overlaps = input.schedule.some((slot, index) =>
      input.schedule
        .slice(index + 1)
        .some(
          (next) =>
            slot.isoWeekday === next.isoWeekday &&
            slot.startsAtLocal < next.endsAtLocal &&
            next.startsAtLocal < slot.endsAtLocal
        )
    );
    if (overlaps) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["schedule"],
        message: "No superpongas horarios del mismo día.",
      });
    }
  });

export type CreateScheduledClassCommand = z.infer<
  typeof createScheduledClassSchema
>;

const classCreatedEvent = "class_template.created";
const generationHorizonDays = 120;
const ownerRoles = ["owner", "admin", "manager"] as const;

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function normalizeSchedule(schedule: CreateScheduledClassCommand["schedule"]) {
  return [...schedule].sort(
    (left, right) =>
      left.isoWeekday - right.isoWeekday ||
      left.startsAtLocal.localeCompare(right.startsAtLocal)
  );
}

function resolveGeneratedThrough(input: CreateScheduledClassCommand): string {
  const horizon = addDays(input.effectiveFrom, generationHorizonDays - 1);
  return input.effectiveTo && input.effectiveTo < horizon
    ? input.effectiveTo
    : horizon;
}

export async function createScheduledClass(
  command: CreateScheduledClassCommand
) {
  const input = createScheduledClassSchema.parse(command);
  const schedule = normalizeSchedule(input.schedule);
  const scheduleFingerprint = createHash("sha256")
    .update(JSON.stringify(schedule))
    .digest("hex");
  const generatedThrough = resolveGeneratedThrough(input);

  return db.transaction(async (tx) => {
    await lockCommand(tx, input.organizationId, input.idempotencyKey);

    const prior = await findOutboxEvent(tx, {
      organizationId: input.organizationId,
      eventName: classCreatedEvent,
      idempotencyKey: input.idempotencyKey,
    });
    if (prior) {
      assertIdempotencyPayload(prior.payload, {
        locationId: input.locationId,
        programId: input.programId,
        capacity: input.capacity,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo,
        scheduleFingerprint,
      });
      const classTemplateId = prior.payload.classTemplateId;
      if (typeof classTemplateId !== "string") {
        throw new OperationalError(
          "IDEMPOTENCY_CONFLICT",
          "La clave no contiene la clase recurrente esperada",
          409
        );
      }

      const [classTemplate] = await tx
        .select()
        .from(classTemplates)
        .where(
          and(
            eq(classTemplates.organizationId, input.organizationId),
            eq(classTemplates.id, classTemplateId)
          )
        )
        .limit(1);
      if (!classTemplate) {
        throw new OperationalError("NOT_FOUND", "Clase no encontrada", 404);
      }
      if (classTemplate.name !== input.name) {
        throw new OperationalError(
          "IDEMPOTENCY_CONFLICT",
          "La clave ya se usó con otro nombre de clase",
          409
        );
      }
      await assertOperationalAccess(tx, {
        organizationId: input.organizationId,
        locationId: classTemplate.locationId,
        actor: input.actor,
        allowedRoles: ownerRoles,
      });

      return {
        classTemplate,
        sessionCount: Number(prior.payload.sessionCount ?? 0),
        generatedThrough:
          typeof prior.payload.generatedThrough === "string"
            ? prior.payload.generatedThrough
            : generatedThrough,
      };
    }

    const [location] = await tx
      .select({ id: locations.id, timezone: locations.timezone })
      .from(locations)
      .where(
        and(
          eq(locations.organizationId, input.organizationId),
          eq(locations.id, input.locationId),
          eq(locations.isActive, true)
        )
      )
      .limit(1);
    if (!location) {
      throw new OperationalError(
        "LOCATION_SCOPE_DENIED",
        "La sede no está disponible en esta academia",
        404
      );
    }
    const todayAtLocation = new Intl.DateTimeFormat("sv-SE", {
      timeZone: location.timezone,
    }).format(new Date());
    if (input.effectiveFrom < todayAtLocation) {
      throw new OperationalError(
        "INVALID_RELATION",
        "La fecha de inicio no puede estar en el pasado",
        422
      );
    }

    await assertOperationalAccess(tx, {
      organizationId: input.organizationId,
      locationId: input.locationId,
      actor: input.actor,
      intent: "write",
      allowedRoles: ownerRoles,
    });

    if (input.programId) {
      const [program] = await tx
        .select({ id: programs.id })
        .from(programs)
        .where(
          and(
            eq(programs.organizationId, input.organizationId),
            eq(programs.id, input.programId),
            eq(programs.status, "active")
          )
        )
        .limit(1);
      if (!program) {
        throw new OperationalError(
          "INVALID_RELATION",
          "Selecciona una actividad activa de esta academia",
          422
        );
      }
    }

    await assertOrganizationResourceCapacity(tx, input.organizationId, "classes");
    const [classTemplate] = await tx
      .insert(classTemplates)
      .values({
        organizationId: input.organizationId,
        locationId: input.locationId,
        programId: input.programId,
        name: input.name,
        capacity: input.capacity,
        status: "active",
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo,
      })
      .returning();

    await tx.insert(classTemplateWeekdays).values(
      schedule.map((slot) => ({
        organizationId: input.organizationId,
        classTemplateId: classTemplate.id,
        isoWeekday: slot.isoWeekday,
        startsAtLocal: slot.startsAtLocal,
        endsAtLocal: slot.endsAtLocal,
      }))
    );

    const sessions = await materializeSessions(
      {
        organizationId: input.organizationId,
        classTemplateId: classTemplate.id,
        startDate: input.effectiveFrom,
        endDate: generatedThrough,
        idempotencyKey: `${input.idempotencyKey}:sessions`,
        actor: input.actor,
      },
      tx
    );

    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId: input.locationId,
      eventName: classCreatedEvent,
      aggregateType: "class_template",
      aggregateId: classTemplate.id,
      idempotencyKey: input.idempotencyKey,
      payload: {
        classTemplateId: classTemplate.id,
        locationId: input.locationId,
        programId: input.programId,
        capacity: input.capacity,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo,
        scheduleFingerprint,
        generatedThrough,
        sessionCount: sessions.length,
      },
    });

    await appendAuditEntry(tx, {
      organizationId: input.organizationId,
      locationId: input.locationId,
      actorUserId: input.actor.userId,
      action: classCreatedEvent,
      targetType: "class_template",
      targetId: classTemplate.id,
      idempotencyKey: input.idempotencyKey,
      after: {
        programId: input.programId,
        capacity: input.capacity,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo,
        scheduleSlotCount: schedule.length,
        sessionCount: sessions.length,
      },
    });

    return { classTemplate, sessionCount: sessions.length, generatedThrough };
  });
}

export async function getOwnerClassesPageData(input: {
  userId: string;
  organizationId?: string;
  locationId?: string;
}) {
  const scope = await resolveOwnerScope(input);
  const accessibleLocationIds = scope.locations.map((location) => location.id);
  if (!accessibleLocationIds.length) {
    throw new OperationalError(
      "LOCATION_SCOPE_DENIED",
      "No hay sedes disponibles para gestionar clases",
      403
    );
  }
  const classLocationIds = input.locationId
    ? [input.locationId]
    : accessibleLocationIds;

  const [locationRows, programRows, templateRows] = await Promise.all([
    db
      .select({
        id: locations.id,
        name: locations.name,
        timezone: locations.timezone,
      })
      .from(locations)
      .where(
        and(
          eq(locations.organizationId, scope.organization.id),
          eq(locations.isActive, true),
          inArray(locations.id, accessibleLocationIds)
        )
      )
      .orderBy(asc(locations.name))
      .limit(100),
    db
      .select({
        id: programs.id,
        name: programs.name,
        kind: programs.kind,
      })
      .from(programs)
      .where(
        and(
          eq(programs.organizationId, scope.organization.id),
          eq(programs.status, "active")
        )
      )
      .orderBy(asc(programs.name))
      .limit(100),
    db
      .select({
        id: classTemplates.id,
        name: classTemplates.name,
        capacity: classTemplates.capacity,
        effectiveFrom: classTemplates.effectiveFrom,
        effectiveTo: classTemplates.effectiveTo,
        locationId: classTemplates.locationId,
        locationName: locations.name,
        programId: classTemplates.programId,
        programName: programs.name,
      })
      .from(classTemplates)
      .innerJoin(
        locations,
        and(
          eq(locations.organizationId, classTemplates.organizationId),
          eq(locations.id, classTemplates.locationId)
        )
      )
      .leftJoin(
        programs,
        and(
          eq(programs.organizationId, classTemplates.organizationId),
          eq(programs.id, classTemplates.programId)
        )
      )
      .where(
        and(
          eq(classTemplates.organizationId, scope.organization.id),
          eq(classTemplates.status, "active"),
          inArray(classTemplates.locationId, classLocationIds)
        )
      )
      .orderBy(asc(locations.name), asc(classTemplates.name))
      .limit(500),
  ]);

  const templateIds = templateRows.map((template) => template.id);
  const scheduleRows = templateIds.length
    ? await db
        .select({
          classTemplateId: classTemplateWeekdays.classTemplateId,
          isoWeekday: classTemplateWeekdays.isoWeekday,
          startsAtLocal: classTemplateWeekdays.startsAtLocal,
          endsAtLocal: classTemplateWeekdays.endsAtLocal,
        })
        .from(classTemplateWeekdays)
        .where(
          and(
            eq(classTemplateWeekdays.organizationId, scope.organization.id),
            inArray(classTemplateWeekdays.classTemplateId, templateIds)
          )
        )
        .orderBy(
          asc(classTemplateWeekdays.isoWeekday),
          asc(classTemplateWeekdays.startsAtLocal)
        )
        .limit(1000)
    : [];
  const schedulesByTemplate = new Map<string, typeof scheduleRows>();
  for (const row of scheduleRows) {
    const rows = schedulesByTemplate.get(row.classTemplateId) ?? [];
    rows.push(row);
    schedulesByTemplate.set(row.classTemplateId, rows);
  }

  const now = new Date();
  const localTodayByLocation = Object.fromEntries(
    locationRows.map((location) => [
      location.id,
      new Intl.DateTimeFormat("sv-SE", { timeZone: location.timezone }).format(
        now
      ),
    ])
  );

  return {
    organization: scope.organization,
    member: scope.member,
    locations: locationRows,
    programs: programRows,
    classes: templateRows.map((classTemplate) => ({
      ...classTemplate,
      schedule: schedulesByTemplate.get(classTemplate.id) ?? [],
    })),
    selectedLocationId:
      input.locationId ??
      scope.selectedLocationId ??
      locationRows[0]?.id ??
      null,
    localTodayByLocation,
  };
}
