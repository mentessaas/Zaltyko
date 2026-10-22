import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  athletes,
  classTemplates,
  enrollments,
  familyGuardians,
  familyMembers,
  programs,
  trials,
  waitlistEntries,
  waitlistOffers,
  type WaitlistEntry,
  type WaitlistOffer,
} from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import {
  createEnrollmentInTransaction,
  transitionEnrollmentInTransaction,
} from "@/modules/enrollments/application/enrollment-service";
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

const commandKeySchema = z.string().trim().min(8).max(150);
const privilegedRoles = ["owner", "manager", "admin"] as const;

const waitlistPreferencesSchema = z
  .object({
    weekdays: z.array(z.number().int().min(1).max(7)).max(7).default([]),
    timeBands: z
      .array(z.enum(["morning", "afternoon", "evening"]))
      .max(3)
      .default([]),
  })
  .strict();

const joinWaitlistSchema = z
  .object({
    organizationId: z.string().uuid(),
    locationId: z.string().uuid(),
    athleteId: z.string().uuid(),
    classTemplateId: z.string().uuid().nullable().optional(),
    programId: z.string().uuid().nullable().optional(),
    sourceTrialId: z.string().uuid().nullable().optional(),
    contactGuardianId: z.string().uuid().nullable().optional(),
    contactable: z.boolean().default(false),
    contactConsentStatus: z
      .enum(["unknown", "granted", "denied", "revoked"])
      .default("unknown"),
    contactConsentRecordedAt: z
      .string()
      .datetime({ offset: true })
      .nullable()
      .optional(),
    priority: z.number().int().min(0).max(1000).default(0),
    preferences: waitlistPreferencesSchema.default({
      weekdays: [],
      timeBands: [],
    }),
    idempotencyKey: commandKeySchema,
    actor: operationalActorSchema,
  })
  .superRefine((input, context) => {
    const targetCount =
      Number(Boolean(input.classTemplateId)) + Number(Boolean(input.programId));
    if (targetCount !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["classTemplateId"],
        message: "La entrada debe apuntar a una plantilla o a un programa",
      });
    }
    if (
      input.contactable &&
      (!input.contactGuardianId || input.contactConsentStatus !== "granted")
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contactable"],
        message: "Una entrada contactable requiere tutor y consentimiento",
      });
    }
    if (
      input.contactConsentStatus !== "unknown" &&
      (!input.contactGuardianId || !input.contactConsentRecordedAt)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contactConsentRecordedAt"],
        message: "El consentimiento registrado requiere tutor y fecha",
      });
    }
  });

const sendWaitlistOfferSchema = z.object({
  organizationId: z.string().uuid(),
  waitlistEntryId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  classTemplateId: z.string().uuid(),
  startsOn: z.string().date(),
  expiresAt: z.string().datetime({ offset: true }),
  idempotencyKey: commandKeySchema,
  actor: operationalActorSchema,
});

const acceptWaitlistOfferSchema = z.object({
  organizationId: z.string().uuid(),
  offerId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  idempotencyKey: commandKeySchema,
  actor: operationalActorSchema,
});

const expireWaitlistOfferSchema = acceptWaitlistOfferSchema;

export type JoinWaitlistCommand = z.input<typeof joinWaitlistSchema>;
export type SendWaitlistOfferCommand = z.infer<typeof sendWaitlistOfferSchema>;
export type AcceptWaitlistOfferCommand = z.infer<
  typeof acceptWaitlistOfferSchema
>;
export type ExpireWaitlistOfferCommand = z.infer<
  typeof expireWaitlistOfferSchema
>;

async function loadEntry(
  tx: TransactionClient,
  organizationId: string,
  entryId: string
): Promise<WaitlistEntry> {
  const [entry] = await tx
    .select()
    .from(waitlistEntries)
    .where(
      and(
        eq(waitlistEntries.organizationId, organizationId),
        eq(waitlistEntries.id, entryId)
      )
    )
    .limit(1);
  if (!entry) {
    throw new OperationalError(
      "NOT_FOUND",
      "Entrada de lista de espera no encontrada",
      404
    );
  }
  return entry;
}

async function loadOffer(
  tx: TransactionClient,
  organizationId: string,
  offerId: string
): Promise<WaitlistOffer> {
  const [offer] = await tx
    .select()
    .from(waitlistOffers)
    .where(
      and(
        eq(waitlistOffers.organizationId, organizationId),
        eq(waitlistOffers.id, offerId)
      )
    )
    .limit(1);
  if (!offer) {
    throw new OperationalError("NOT_FOUND", "Oferta no encontrada", 404);
  }
  return offer;
}

async function loadEntryFromEvent(
  tx: TransactionClient,
  input: {
    organizationId: string;
    eventName: string;
    idempotencyKey: string;
    expectedPayload: Record<string, string | number | boolean | null>;
  }
): Promise<WaitlistEntry | null> {
  const event = await findOutboxEvent(tx, input);
  if (event) {
    assertIdempotencyPayload(event.payload, input.expectedPayload);
  }
  const entryId = event?.payload.waitlistEntryId;
  if (typeof entryId !== "string") return null;
  return loadEntry(tx, input.organizationId, entryId);
}

async function loadOfferFromEvent(
  tx: TransactionClient,
  input: {
    organizationId: string;
    eventName: string;
    idempotencyKey: string;
    expectedPayload: Record<string, string | number | boolean | null>;
  }
): Promise<WaitlistOffer | null> {
  const event = await findOutboxEvent(tx, input);
  if (event) {
    assertIdempotencyPayload(event.payload, input.expectedPayload);
  }
  const offerId = event?.payload.offerId;
  if (typeof offerId !== "string") return null;
  return loadOffer(tx, input.organizationId, offerId);
}

async function locationBusinessDate(
  tx: TransactionClient,
  organizationId: string,
  locationId: string
): Promise<string> {
  const result = await tx.execute(sql`
    select (current_timestamp at time zone location.timezone)::date::text as local_date
    from zaltyko.locations location
    where location.organization_id = ${organizationId}::uuid
      and location.id = ${locationId}::uuid
  `);
  const localDate = result.rows[0]?.local_date;
  if (typeof localDate !== "string") {
    throw new OperationalError("NOT_FOUND", "Sede no encontrada", 404);
  }
  return localDate;
}

async function assertGuardianCanContactAthlete(
  tx: TransactionClient,
  input: {
    organizationId: string;
    athleteId: string;
    guardianId: string;
  }
): Promise<void> {
  const [relationship] = await tx
    .select({ id: familyGuardians.id })
    .from(familyMembers)
    .innerJoin(
      familyGuardians,
      and(
        eq(familyGuardians.organizationId, familyMembers.organizationId),
        eq(familyGuardians.familyId, familyMembers.familyId),
        eq(familyGuardians.guardianId, input.guardianId),
        eq(familyGuardians.isActive, true)
      )
    )
    .where(
      and(
        eq(familyMembers.organizationId, input.organizationId),
        eq(familyMembers.athleteId, input.athleteId),
        isNull(familyMembers.endsOn)
      )
    )
    .limit(1);
  if (!relationship) {
    throw new OperationalError(
      "INVALID_RELATION",
      "El tutor de contacto no está vinculado al atleta",
      409
    );
  }
}

export async function joinWaitlist(
  command: JoinWaitlistCommand
): Promise<WaitlistEntry> {
  const input = joinWaitlistSchema.parse(command);
  const eventName = "waitlist.joined";

  return db.transaction(async (tx) => {
    await lockCommand(tx, input.organizationId, input.idempotencyKey);
    const prior = await loadEntryFromEvent(tx, {
      organizationId: input.organizationId,
      eventName,
      idempotencyKey: input.idempotencyKey,
      expectedPayload: {
        athleteId: input.athleteId,
        classTemplateId: input.classTemplateId ?? null,
        programId: input.programId ?? null,
        sourceTrialId: input.sourceTrialId ?? null,
        contactable: input.contactable,
        consentStatus: input.contactConsentStatus,
        priority: input.priority,
      },
    });
    if (prior) {
      await assertOperationalAccess(tx, {
        organizationId: input.organizationId,
        locationId: prior.locationId,
        actor: input.actor,
        intent: "write",
        allowedRoles: privilegedRoles,
      });
      return prior;
    }

    await assertOperationalAccess(tx, {
      organizationId: input.organizationId,
      locationId: input.locationId,
      actor: input.actor,
      intent: "write",
      allowedRoles: privilegedRoles,
    });
    const [athlete] = await tx
      .select({ id: athletes.id })
      .from(athletes)
      .where(
        and(
          eq(athletes.organizationId, input.organizationId),
          eq(athletes.id, input.athleteId),
          eq(athletes.isActive, true)
        )
      )
      .limit(1);
    if (!athlete) {
      throw new OperationalError(
        "NOT_FOUND",
        "Atleta activo no encontrado",
        404
      );
    }

    if (input.classTemplateId) {
      const [template] = await tx
        .select({ id: classTemplates.id })
        .from(classTemplates)
        .where(
          and(
            eq(classTemplates.organizationId, input.organizationId),
            eq(classTemplates.locationId, input.locationId),
            eq(classTemplates.id, input.classTemplateId),
            eq(classTemplates.status, "active")
          )
        )
        .limit(1);
      if (!template) {
        throw new OperationalError(
          "NOT_FOUND",
          "Plantilla activa no encontrada en la sede",
          404
        );
      }
    }
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
          "NOT_FOUND",
          "Programa activo no encontrado",
          404
        );
      }
    }
    if (input.contactGuardianId) {
      await assertGuardianCanContactAthlete(tx, {
        organizationId: input.organizationId,
        athleteId: input.athleteId,
        guardianId: input.contactGuardianId,
      });
    }
    if (
      input.contactConsentRecordedAt &&
      new Date(input.contactConsentRecordedAt).getTime() > Date.now()
    ) {
      throw new OperationalError(
        "INVALID_DATE_RANGE",
        "El consentimiento de contacto no puede ser futuro",
        409
      );
    }
    if (input.sourceTrialId) {
      const [sourceTrial] = await tx
        .select({ id: trials.id })
        .from(trials)
        .where(
          and(
            eq(trials.organizationId, input.organizationId),
            eq(trials.locationId, input.locationId),
            eq(trials.id, input.sourceTrialId),
            eq(trials.athleteId, input.athleteId),
            eq(trials.status, "completed")
          )
        )
        .limit(1);
      if (!sourceTrial) {
        throw new OperationalError(
          "INVALID_RELATION",
          "El trial origen no está completado para este atleta y sede",
          409
        );
      }
    }

    const targetId = input.classTemplateId ?? input.programId;
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${input.organizationId}:waitlist:${input.locationId}:${input.athleteId}:${targetId}`}, 0))`
    );
    const duplicateConditions = [
      eq(waitlistEntries.organizationId, input.organizationId),
      eq(waitlistEntries.locationId, input.locationId),
      eq(waitlistEntries.athleteId, input.athleteId),
      inArray(waitlistEntries.status, ["waiting", "offered"]),
      input.classTemplateId
        ? eq(waitlistEntries.classTemplateId, input.classTemplateId)
        : eq(waitlistEntries.programId, input.programId as string),
    ];
    const [duplicate] = await tx
      .select({ id: waitlistEntries.id })
      .from(waitlistEntries)
      .where(and(...duplicateConditions))
      .limit(1);
    if (duplicate) {
      throw new OperationalError(
        "DUPLICATE_OPEN_WAITLIST",
        "El atleta ya tiene una entrada abierta para esta demanda",
        409
      );
    }

    const [entry] = await tx
      .insert(waitlistEntries)
      .values({
        organizationId: input.organizationId,
        locationId: input.locationId,
        athleteId: input.athleteId,
        classTemplateId: input.classTemplateId ?? null,
        programId: input.programId ?? null,
        sourceTrialId: input.sourceTrialId ?? null,
        contactGuardianId: input.contactGuardianId ?? null,
        contactable: input.contactable,
        contactConsentStatus: input.contactConsentStatus,
        contactConsentRecordedAt: input.contactConsentRecordedAt
          ? new Date(input.contactConsentRecordedAt)
          : null,
        priority: input.priority,
        preferences: input.preferences,
        status: "waiting",
      })
      .returning();

    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId: entry.locationId,
      eventName,
      aggregateType: "waitlist_entry",
      aggregateId: entry.id,
      idempotencyKey: input.idempotencyKey,
      payload: {
        waitlistEntryId: entry.id,
        athleteId: entry.athleteId,
        classTemplateId: entry.classTemplateId,
        programId: entry.programId,
        sourceTrialId: entry.sourceTrialId,
        contactable: entry.contactable,
        consentStatus: entry.contactConsentStatus,
        priority: entry.priority,
        status: entry.status,
      },
    });
    await appendAuditEntry(tx, {
      organizationId: input.organizationId,
      locationId: entry.locationId,
      actorUserId: input.actor.userId,
      action: eventName,
      targetType: "waitlist_entry",
      targetId: entry.id,
      idempotencyKey: input.idempotencyKey,
      after: {
        status: entry.status,
        classTemplateId: entry.classTemplateId,
        programId: entry.programId,
        contactable: entry.contactable,
        consentStatus: entry.contactConsentStatus,
        priority: entry.priority,
      },
    });

    return entry;
  });
}

export async function sendWaitlistOffer(
  command: SendWaitlistOfferCommand
): Promise<{ entry: WaitlistEntry; offer: WaitlistOffer }> {
  const input = sendWaitlistOfferSchema.parse(command);
  const eventName = "waitlist.offer_sent";

  return db.transaction(async (tx) => {
    await lockCommand(tx, input.organizationId, input.idempotencyKey);
    const priorOffer = await loadOfferFromEvent(tx, {
      organizationId: input.organizationId,
      eventName,
      idempotencyKey: input.idempotencyKey,
      expectedPayload: {
        waitlistEntryId: input.waitlistEntryId,
        classTemplateId: input.classTemplateId,
        startsOn: input.startsOn,
        expiresAt: new Date(input.expiresAt).toISOString(),
      },
    });
    if (priorOffer) {
      const entry = await loadEntry(
        tx,
        input.organizationId,
        priorOffer.waitlistEntryId
      );
      await assertOperationalAccess(tx, {
        organizationId: input.organizationId,
        locationId: entry.locationId,
        actor: input.actor,
        intent: "write",
        allowedRoles: privilegedRoles,
      });
      return { entry, offer: priorOffer };
    }

    await tx.execute(
      sql`select id from zaltyko.waitlist_entries where organization_id = ${input.organizationId}::uuid and id = ${input.waitlistEntryId}::uuid for update`
    );
    const current = await loadEntry(
      tx,
      input.organizationId,
      input.waitlistEntryId
    );
    await assertOperationalAccess(tx, {
      organizationId: input.organizationId,
      locationId: current.locationId,
      actor: input.actor,
      intent: "write",
      allowedRoles: privilegedRoles,
    });
    if (current.version !== input.expectedVersion) {
      throw new OperationalError(
        "VERSION_CONFLICT",
        "La entrada cambió desde la última lectura",
        409
      );
    }
    if (current.status !== "waiting") {
      throw new OperationalError(
        "INVALID_STATE_TRANSITION",
        "Solo una entrada en espera puede recibir oferta",
        409
      );
    }
    if (!current.contactable || current.contactConsentStatus !== "granted") {
      throw new OperationalError(
        "FORBIDDEN",
        "La entrada no tiene permiso de contacto",
        403
      );
    }
    if (new Date(input.expiresAt).getTime() <= Date.now()) {
      throw new OperationalError(
        "INVALID_DATE_RANGE",
        "La oferta debe expirar en el futuro",
        409
      );
    }
    const localDate = await locationBusinessDate(
      tx,
      input.organizationId,
      current.locationId
    );
    if (input.startsOn < localDate) {
      throw new OperationalError(
        "INVALID_DATE_RANGE",
        "La plaza ofrecida no puede comenzar en el pasado",
        409
      );
    }

    const [targetTemplate] = await tx
      .select({
        id: classTemplates.id,
        programId: classTemplates.programId,
      })
      .from(classTemplates)
      .where(
        and(
          eq(classTemplates.organizationId, input.organizationId),
          eq(classTemplates.locationId, current.locationId),
          eq(classTemplates.id, input.classTemplateId),
          eq(classTemplates.status, "active")
        )
      )
      .limit(1);
    if (!targetTemplate) {
      throw new OperationalError(
        "NOT_FOUND",
        "Plantilla destino activa no encontrada",
        404
      );
    }
    if (
      (current.classTemplateId &&
        current.classTemplateId !== targetTemplate.id) ||
      (current.programId && current.programId !== targetTemplate.programId)
    ) {
      throw new OperationalError(
        "INVALID_RELATION",
        "La plantilla ofrecida no coincide con la demanda",
        409
      );
    }

    const enrollment = await createEnrollmentInTransaction(tx, {
      organizationId: input.organizationId,
      locationId: current.locationId,
      athleteId: current.athleteId,
      classTemplateId: targetTemplate.id,
      status: "pending",
      startsOn: input.startsOn,
      source: "waitlist",
      sourceEntityId: current.id,
      idempotencyKey: `${input.idempotencyKey}:enrollment`,
      actor: input.actor,
    });

    const sentAt = new Date();
    const [offer] = await tx
      .insert(waitlistOffers)
      .values({
        organizationId: input.organizationId,
        locationId: current.locationId,
        waitlistEntryId: current.id,
        classTemplateId: targetTemplate.id,
        reservedEnrollmentId: enrollment.id,
        status: "pending",
        sentAt,
        expiresAt: new Date(input.expiresAt),
        idempotencyKey: input.idempotencyKey,
      })
      .returning();
    const [entry] = await tx
      .update(waitlistEntries)
      .set({
        status: "offered",
        version: sql`${waitlistEntries.version} + 1`,
        updatedAt: sentAt,
      })
      .where(
        and(
          eq(waitlistEntries.organizationId, input.organizationId),
          eq(waitlistEntries.id, current.id),
          eq(waitlistEntries.version, input.expectedVersion)
        )
      )
      .returning();
    if (!entry) {
      throw new OperationalError(
        "VERSION_CONFLICT",
        "La entrada cambió durante la oferta",
        409
      );
    }

    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId: entry.locationId,
      eventName,
      aggregateType: "waitlist_entry",
      aggregateId: entry.id,
      idempotencyKey: input.idempotencyKey,
      payload: {
        waitlistEntryId: entry.id,
        offerId: offer.id,
        enrollmentId: enrollment.id,
        classTemplateId: offer.classTemplateId,
        startsOn: enrollment.startsOn,
        expiresAt: offer.expiresAt.toISOString(),
        status: entry.status,
      },
    });
    await appendAuditEntry(tx, {
      organizationId: input.organizationId,
      locationId: entry.locationId,
      actorUserId: input.actor.userId,
      action: eventName,
      targetType: "waitlist_offer",
      targetId: offer.id,
      idempotencyKey: input.idempotencyKey,
      before: { entryStatus: current.status, entryVersion: current.version },
      after: {
        entryStatus: entry.status,
        entryVersion: entry.version,
        offerStatus: offer.status,
        enrollmentId: enrollment.id,
      },
    });

    return { entry, offer };
  });
}

export async function acceptWaitlistOffer(
  command: AcceptWaitlistOfferCommand
): Promise<{ entry: WaitlistEntry; offer: WaitlistOffer }> {
  const input = acceptWaitlistOfferSchema.parse(command);
  const eventName = "waitlist.converted";

  return db.transaction(async (tx) => {
    await lockCommand(tx, input.organizationId, input.idempotencyKey);
    const priorOffer = await loadOfferFromEvent(tx, {
      organizationId: input.organizationId,
      eventName,
      idempotencyKey: input.idempotencyKey,
      expectedPayload: { offerId: input.offerId },
    });
    if (priorOffer) {
      const entry = await loadEntry(
        tx,
        input.organizationId,
        priorOffer.waitlistEntryId
      );
      await assertOperationalAccess(tx, {
        organizationId: input.organizationId,
        locationId: entry.locationId,
        actor: input.actor,
        intent: "write",
        allowedRoles: privilegedRoles,
      });
      return { entry, offer: priorOffer };
    }

    await tx.execute(
      sql`select id from zaltyko.waitlist_offers where organization_id = ${input.organizationId}::uuid and id = ${input.offerId}::uuid for update`
    );
    const currentOffer = await loadOffer(
      tx,
      input.organizationId,
      input.offerId
    );
    await tx.execute(
      sql`select id from zaltyko.waitlist_entries where organization_id = ${input.organizationId}::uuid and id = ${currentOffer.waitlistEntryId}::uuid for update`
    );
    const currentEntry = await loadEntry(
      tx,
      input.organizationId,
      currentOffer.waitlistEntryId
    );
    await assertOperationalAccess(tx, {
      organizationId: input.organizationId,
      locationId: currentOffer.locationId,
      actor: input.actor,
      intent: "write",
      allowedRoles: privilegedRoles,
    });
    if (currentOffer.version !== input.expectedVersion) {
      throw new OperationalError(
        "VERSION_CONFLICT",
        "La oferta cambió desde la última lectura",
        409
      );
    }
    if (
      currentOffer.status !== "pending" ||
      currentEntry.status !== "offered"
    ) {
      throw new OperationalError(
        "INVALID_STATE_TRANSITION",
        "La oferta ya no está pendiente",
        409
      );
    }
    if (currentOffer.expiresAt.getTime() <= Date.now()) {
      throw new OperationalError(
        "INVALID_STATE_TRANSITION",
        "La oferta ha expirado",
        409
      );
    }

    const [reservedEnrollment] = await tx
      .select()
      .from(enrollments)
      .where(
        and(
          eq(enrollments.organizationId, input.organizationId),
          eq(enrollments.id, currentOffer.reservedEnrollmentId)
        )
      )
      .limit(1);
    if (!reservedEnrollment) {
      throw new OperationalError(
        "NOT_FOUND",
        "Reserva de inscripción no encontrada",
        404
      );
    }
    const enrollment = await transitionEnrollmentInTransaction(tx, {
      organizationId: input.organizationId,
      enrollmentId: reservedEnrollment.id,
      expectedVersion: reservedEnrollment.version,
      toStatus: "active",
      effectiveOn: reservedEnrollment.startsOn,
      reasonCode: "waitlist_offer_accepted",
      idempotencyKey: `${input.idempotencyKey}:enrollment`,
      actor: input.actor,
    });

    const respondedAt = new Date();
    const [offer] = await tx
      .update(waitlistOffers)
      .set({
        status: "accepted",
        respondedAt,
        version: sql`${waitlistOffers.version} + 1`,
        updatedAt: respondedAt,
      })
      .where(
        and(
          eq(waitlistOffers.organizationId, input.organizationId),
          eq(waitlistOffers.id, currentOffer.id),
          eq(waitlistOffers.version, input.expectedVersion)
        )
      )
      .returning();
    if (!offer) {
      throw new OperationalError(
        "VERSION_CONFLICT",
        "La oferta cambió durante la aceptación",
        409
      );
    }
    const [entry] = await tx
      .update(waitlistEntries)
      .set({
        status: "converted",
        convertedEnrollmentId: enrollment.id,
        version: sql`${waitlistEntries.version} + 1`,
        updatedAt: respondedAt,
      })
      .where(
        and(
          eq(waitlistEntries.organizationId, input.organizationId),
          eq(waitlistEntries.id, currentEntry.id),
          eq(waitlistEntries.status, "offered")
        )
      )
      .returning();
    if (!entry) {
      throw new OperationalError(
        "VERSION_CONFLICT",
        "La entrada cambió durante la aceptación",
        409
      );
    }

    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId: entry.locationId,
      eventName,
      aggregateType: "waitlist_entry",
      aggregateId: entry.id,
      idempotencyKey: input.idempotencyKey,
      payload: {
        waitlistEntryId: entry.id,
        offerId: offer.id,
        enrollmentId: enrollment.id,
        classTemplateId: enrollment.classTemplateId,
        status: entry.status,
      },
    });
    await appendAuditEntry(tx, {
      organizationId: input.organizationId,
      locationId: entry.locationId,
      actorUserId: input.actor.userId,
      action: eventName,
      targetType: "waitlist_offer",
      targetId: offer.id,
      idempotencyKey: input.idempotencyKey,
      before: {
        offerStatus: currentOffer.status,
        entryStatus: currentEntry.status,
      },
      after: {
        offerStatus: offer.status,
        entryStatus: entry.status,
        enrollmentId: enrollment.id,
      },
    });

    return { entry, offer };
  });
}

export async function expireWaitlistOffer(
  command: ExpireWaitlistOfferCommand
): Promise<{ entry: WaitlistEntry; offer: WaitlistOffer }> {
  const input = expireWaitlistOfferSchema.parse(command);
  const eventName = "waitlist.expired";

  return db.transaction(async (tx) => {
    await lockCommand(tx, input.organizationId, input.idempotencyKey);
    const priorOffer = await loadOfferFromEvent(tx, {
      organizationId: input.organizationId,
      eventName,
      idempotencyKey: input.idempotencyKey,
      expectedPayload: { offerId: input.offerId },
    });
    if (priorOffer) {
      const entry = await loadEntry(
        tx,
        input.organizationId,
        priorOffer.waitlistEntryId
      );
      await assertOperationalAccess(tx, {
        organizationId: input.organizationId,
        locationId: entry.locationId,
        actor: input.actor,
        intent: "write",
        allowedRoles: privilegedRoles,
      });
      return { entry, offer: priorOffer };
    }

    await tx.execute(
      sql`select id from zaltyko.waitlist_offers where organization_id = ${input.organizationId}::uuid and id = ${input.offerId}::uuid for update`
    );
    const currentOffer = await loadOffer(
      tx,
      input.organizationId,
      input.offerId
    );
    await tx.execute(
      sql`select id from zaltyko.waitlist_entries where organization_id = ${input.organizationId}::uuid and id = ${currentOffer.waitlistEntryId}::uuid for update`
    );
    const currentEntry = await loadEntry(
      tx,
      input.organizationId,
      currentOffer.waitlistEntryId
    );
    await assertOperationalAccess(tx, {
      organizationId: input.organizationId,
      locationId: currentOffer.locationId,
      actor: input.actor,
      intent: "write",
      allowedRoles: privilegedRoles,
    });
    if (currentOffer.status === "expired") {
      return { entry: currentEntry, offer: currentOffer };
    }
    if (currentOffer.version !== input.expectedVersion) {
      throw new OperationalError(
        "VERSION_CONFLICT",
        "La oferta cambió desde la última lectura",
        409
      );
    }
    if (currentOffer.status !== "pending") {
      throw new OperationalError(
        "INVALID_STATE_TRANSITION",
        "Solo una oferta pendiente puede expirar",
        409
      );
    }
    if (currentOffer.expiresAt.getTime() > Date.now()) {
      throw new OperationalError(
        "INVALID_DATE_RANGE",
        "La oferta todavía no ha expirado",
        409
      );
    }

    const [reservedEnrollment] = await tx
      .select()
      .from(enrollments)
      .where(
        and(
          eq(enrollments.organizationId, input.organizationId),
          eq(enrollments.id, currentOffer.reservedEnrollmentId)
        )
      )
      .limit(1);
    if (!reservedEnrollment) {
      throw new OperationalError(
        "NOT_FOUND",
        "Reserva de inscripción no encontrada",
        404
      );
    }
    await transitionEnrollmentInTransaction(tx, {
      organizationId: input.organizationId,
      enrollmentId: reservedEnrollment.id,
      expectedVersion: reservedEnrollment.version,
      toStatus: "cancelled",
      effectiveOn: reservedEnrollment.startsOn,
      reasonCode: "waitlist_offer_expired",
      idempotencyKey: `${input.idempotencyKey}:enrollment`,
      actor: input.actor,
    });

    const respondedAt = new Date();
    const [offer] = await tx
      .update(waitlistOffers)
      .set({
        status: "expired",
        respondedAt,
        version: sql`${waitlistOffers.version} + 1`,
        updatedAt: respondedAt,
      })
      .where(
        and(
          eq(waitlistOffers.organizationId, input.organizationId),
          eq(waitlistOffers.id, currentOffer.id),
          eq(waitlistOffers.version, input.expectedVersion)
        )
      )
      .returning();
    if (!offer) {
      throw new OperationalError(
        "VERSION_CONFLICT",
        "La oferta cambió durante la expiración",
        409
      );
    }
    const [entry] = await tx
      .update(waitlistEntries)
      .set({
        status: "waiting",
        version: sql`${waitlistEntries.version} + 1`,
        updatedAt: respondedAt,
      })
      .where(
        and(
          eq(waitlistEntries.organizationId, input.organizationId),
          eq(waitlistEntries.id, currentEntry.id),
          eq(waitlistEntries.status, "offered")
        )
      )
      .returning();
    if (!entry) {
      throw new OperationalError(
        "VERSION_CONFLICT",
        "La entrada cambió durante la expiración",
        409
      );
    }

    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId: entry.locationId,
      eventName,
      aggregateType: "waitlist_entry",
      aggregateId: entry.id,
      idempotencyKey: input.idempotencyKey,
      payload: {
        waitlistEntryId: entry.id,
        offerId: offer.id,
        enrollmentId: offer.reservedEnrollmentId,
        status: entry.status,
      },
    });
    await appendAuditEntry(tx, {
      organizationId: input.organizationId,
      locationId: entry.locationId,
      actorUserId: input.actor.userId,
      action: eventName,
      targetType: "waitlist_offer",
      targetId: offer.id,
      idempotencyKey: input.idempotencyKey,
      before: {
        offerStatus: currentOffer.status,
        entryStatus: currentEntry.status,
      },
      after: { offerStatus: offer.status, entryStatus: entry.status },
    });

    return { entry, offer };
  });
}
