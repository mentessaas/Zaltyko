import { createHash } from "node:crypto";

import {
  and,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lte,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  athletes,
  auditLog,
  families,
  familyGuardians,
  familyMembers,
  familyPayers,
  groupMemberships,
  groups,
  guardians,
  locations,
  memberLocationScopes,
  outboxEvents,
  people,
  type Family,
} from "@/db/zaltyko-schema";
import { enrollments } from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
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

const commandKeySchema = z.string().trim().min(8).max(180);
const OWNER_FAMILY_REPLAY_SCOPE_LOCATION_LIMIT = 100;
const OWNER_FAMILY_OPTIONS_LIMIT = 1000;
const OWNER_FAMILY_OPTIONS_QUERY_LIMIT = OWNER_FAMILY_OPTIONS_LIMIT + 1;
const associationSchema = z
  .object({
    organizationId: z.guid(),
    locationId: z.guid(),
    familyId: z.guid().optional(),
    athleteIds: z.array(z.guid()).min(1).max(50),
    effectiveFrom: z.string().date(),
    payer: z
      .object({
        familyPayerId: z.guid().optional(),
        givenName: z.string().trim().min(1).max(100).optional(),
        familyName: z.string().trim().min(1).max(100).optional(),
        relationship: z
          .enum(["parent", "legal_guardian", "foster_guardian", "other"])
          .optional(),
        confirmPrimaryPayerChange: z.boolean().optional(),
      })
      .strict(),
    idempotencyKey: commandKeySchema,
    actor: operationalActorSchema,
  })
  .strict();

export type OwnerFamilyAssociationCommand = z.infer<typeof associationSchema>;

function fingerprint(input: OwnerFamilyAssociationCommand): string {
  const normalized = {
    organizationId: input.organizationId,
    locationId: input.locationId,
    familyId: input.familyId ?? null,
    athleteIds: uniqueIds(input.athleteIds),
    effectiveFrom: input.effectiveFrom,
    familyPayerId: input.payer.familyPayerId ?? null,
    givenName: input.payer.givenName ?? null,
    familyName: input.payer.familyName ?? null,
    relationship: input.payer.relationship ?? null,
  };
  // Keep the original byte-for-byte input shape for legacy/false requests.
  // A positive confirmation is new command intent and must not replay as the
  // earlier, unconfirmed request under the same idempotency key.
  const payload = input.payer.confirmPrimaryPayerChange === true
    ? { ...normalized, confirmPrimaryPayerChange: true }
    : normalized;
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)].sort();
}

async function lockAthletes(
  tx: TransactionClient,
  organizationId: string,
  athleteIds: string[]
): Promise<void> {
  const ids = uniqueIds(athleteIds);
  if (!ids.length) return;
  await tx.execute(sql`
    select id from zaltyko.athletes
    where organization_id = ${organizationId}::uuid
      and id in (${sql.join(
        ids.map((id) => sql`${id}::uuid`),
        sql`, `
      )})
    order by id for update
  `);
}

async function verifyAthletesAtLocation(
  tx: TransactionClient,
  input: OwnerFamilyAssociationCommand
): Promise<void> {
  const enrollmentRows = await tx
    .selectDistinct({ athleteId: athletes.id })
    .from(athletes)
    .innerJoin(
      enrollments,
      and(
        eq(enrollments.organizationId, athletes.organizationId),
        eq(enrollments.athleteId, athletes.id),
        eq(enrollments.locationId, input.locationId),
        inArray(enrollments.status, ["pending", "active"])
      )
    )
    .where(
      and(
        eq(athletes.organizationId, input.organizationId),
        inArray(athletes.id, input.athleteIds),
        eq(athletes.isActive, true)
      )
    )
    .limit(uniqueIds(input.athleteIds).length);

  const found = new Set(enrollmentRows.map((row) => row.athleteId));
  const missingFromEnrollment = input.athleteIds.filter(
    (athleteId) => !found.has(athleteId)
  );
  if (missingFromEnrollment.length > 0) {
    const groupMembershipRows = await tx
      .selectDistinct({ athleteId: athletes.id })
      .from(athletes)
      .innerJoin(
        groupMemberships,
        and(
          eq(groupMemberships.organizationId, athletes.organizationId),
          eq(groupMemberships.athleteId, athletes.id),
          eq(groupMemberships.status, "active"),
          lte(groupMemberships.startsOn, input.effectiveFrom),
          or(
            isNull(groupMemberships.endsOn),
            gte(groupMemberships.endsOn, input.effectiveFrom)
          )
        )
      )
      .innerJoin(
        groups,
        and(
          eq(groups.organizationId, groupMemberships.organizationId),
          eq(groups.id, groupMemberships.groupId),
          eq(groups.locationId, input.locationId),
          eq(groups.status, "active")
        )
      )
      .where(
        and(
          eq(athletes.organizationId, input.organizationId),
          inArray(athletes.id, missingFromEnrollment),
          eq(athletes.isActive, true)
        )
      )
      .limit(missingFromEnrollment.length);
    for (const row of groupMembershipRows) found.add(row.athleteId);
  }

  if (input.athleteIds.some((id) => !found.has(id))) {
    throw new OperationalError(
      "NOT_FOUND",
      "Cada gimnasta debe estar activa y tener una inscripción pendiente o activa, o pertenecer a un grupo activo de la sede en la fecha efectiva.",
      404
    );
  }
}

async function assertOwnerFamilyAccess(
  tx: TransactionClient,
  input: OwnerFamilyAssociationCommand,
  intent?: "write"
): Promise<void> {
  const member = await assertOperationalAccess(tx, {
    organizationId: input.organizationId,
    locationId: input.locationId,
    actor: input.actor,
    ...(intent ? { intent } : {}),
    allowedRoles: ["owner", "admin", "manager"],
  });

  // An existing family and its primary payer are organization-wide resources:
  // changing them from one selected site could affect other locations.
  if (input.familyId && member.locationScopeMode !== "all") {
    throw new OperationalError(
      "LOCATION_SCOPE_DENIED",
      "Para modificar una familia compartida necesitas acceso a todas las sedes de la academia.",
      403
    );
  }
}

async function assertOwnerFamilyReplayAccess(
  tx: TransactionClient,
  input: OwnerFamilyAssociationCommand,
  resolvedFamilyId: string,
  priorActorMemberId: unknown
): Promise<void> {
  const member = await assertOperationalAccess(tx, {
    organizationId: input.organizationId,
    locationId: input.locationId,
    actor: input.actor,
    allowedRoles: ["owner", "admin", "manager"],
  });
  const [receipt] = await tx
    .select({
      actorUserId: auditLog.actorUserId,
      locationId: auditLog.locationId,
      targetId: auditLog.targetId,
    })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.organizationId, input.organizationId),
        eq(auditLog.action, "family.owner_associated"),
        eq(auditLog.targetType, "family"),
        eq(auditLog.targetId, resolvedFamilyId),
        eq(auditLog.idempotencyKey, input.idempotencyKey)
      )
    )
    .limit(1);
  if (
    !receipt ||
    receipt.actorUserId !== input.actor.userId ||
    receipt.locationId !== input.locationId ||
    (priorActorMemberId !== undefined &&
      priorActorMemberId !== input.actor.memberId)
  ) {
    throw new OperationalError(
      "LOCATION_SCOPE_DENIED",
      "No se puede recuperar esta operación desde el alcance actual.",
      403
    );
  }

  if (input.familyId && member.locationScopeMode !== "all") {
    throw new OperationalError(
      "LOCATION_SCOPE_DENIED",
      "Para recuperar una asociación de familia compartida necesitas acceso a todas las sedes de la academia.",
      403
    );
  }
  if (member.locationScopeMode === "all") return;

  const authorizedLocations = await tx
    .select({ locationId: memberLocationScopes.locationId })
    .from(memberLocationScopes)
    .where(
      and(
        eq(memberLocationScopes.organizationId, input.organizationId),
        eq(memberLocationScopes.memberId, member.id)
      )
    )
    .limit(OWNER_FAMILY_REPLAY_SCOPE_LOCATION_LIMIT + 1);
  if (
    authorizedLocations.length > OWNER_FAMILY_REPLAY_SCOPE_LOCATION_LIMIT ||
    !authorizedLocations.some((row) => row.locationId === input.locationId)
  ) {
    throw new OperationalError(
      "LOCATION_SCOPE_DENIED",
      "No se puede comprobar el alcance de sedes de esta familia.",
      403
    );
  }
  const authorizedLocationIds = new Set(
    authorizedLocations.map((row) => row.locationId)
  );
  const [outsideHistoricalAssociation] = await tx
    .select({ id: outboxEvents.id })
    .from(outboxEvents)
    .where(
      and(
        eq(outboxEvents.organizationId, input.organizationId),
        eq(outboxEvents.eventName, "family.owner_associated"),
        eq(outboxEvents.aggregateType, "family"),
        eq(outboxEvents.aggregateId, resolvedFamilyId),
        or(
          isNull(outboxEvents.locationId),
          notInArray(outboxEvents.locationId, [...authorizedLocationIds])
        )
      )
    )
    .limit(1);
  const [outsideEnrollmentLocation] = await tx
    .select({ id: enrollments.id })
    .from(familyMembers)
    .innerJoin(
      enrollments,
      and(
        eq(enrollments.organizationId, familyMembers.organizationId),
        eq(enrollments.athleteId, familyMembers.athleteId)
      )
    )
    .where(
      and(
        eq(familyMembers.organizationId, input.organizationId),
        eq(familyMembers.familyId, resolvedFamilyId),
        inArray(enrollments.status, ["pending", "active"]),
        notInArray(enrollments.locationId, [...authorizedLocationIds])
      )
    )
    .limit(1);
  const [outsideGroupLocation] = await tx
    .select({ id: groupMemberships.id })
    .from(familyMembers)
    .innerJoin(
      groupMemberships,
      and(
        eq(groupMemberships.organizationId, familyMembers.organizationId),
        eq(groupMemberships.athleteId, familyMembers.athleteId),
        eq(groupMemberships.status, "active")
      )
    )
    .innerJoin(
      groups,
      and(
        eq(groups.organizationId, groupMemberships.organizationId),
        eq(groups.id, groupMemberships.groupId),
        eq(groups.status, "active")
      )
    )
    .where(
      and(
        eq(familyMembers.organizationId, input.organizationId),
        eq(familyMembers.familyId, resolvedFamilyId),
        notInArray(groups.locationId, [...authorizedLocationIds])
      )
    )
    .limit(1);
  if (
    outsideHistoricalAssociation ||
    outsideEnrollmentLocation ||
    outsideGroupLocation
  ) {
    throw new OperationalError(
      "LOCATION_SCOPE_DENIED",
      "La familia también está asociada a sedes fuera de tu alcance.",
      403
    );
  }
}

export function resolveFamilyMemberAssociation(
  rows: readonly { startsOn: string; endsOn: string | null }[],
  effectiveFrom: string
): "already-associated" | "date-conflict" | "create" {
  const overlappingRows = rows.filter(
    (row) => row.endsOn === null || row.endsOn >= effectiveFrom
  );
  if (overlappingRows.some((row) => row.startsOn > effectiveFrom)) {
    return "date-conflict";
  }
  if (overlappingRows.some((row) => row.startsOn <= effectiveFrom)) {
    return "already-associated";
  }
  return "create";
}

export function familyMemberOverlapPredicate(effectiveFrom: string) {
  return or(
    isNull(familyMembers.endsOn),
    gte(familyMembers.endsOn, effectiveFrom)
  )!;
}

export function familyMemberStartsAfterPredicate(effectiveFrom: string) {
  return gt(familyMembers.startsOn, effectiveFrom);
}

export function familyMemberStartsOnOrBeforePredicate(effectiveFrom: string) {
  return lte(familyMembers.startsOn, effectiveFrom);
}

async function assertNoOverlappingOtherFamily(
  tx: TransactionClient,
  input: OwnerFamilyAssociationCommand,
  targetFamilyId: string | null
): Promise<void> {
  const targetFamilyPredicate = targetFamilyId
    ? notInArray(familyMembers.familyId, [targetFamilyId])
    : undefined;
  const [overlappingAssociation] = await tx
    .select({ id: familyMembers.id })
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.organizationId, input.organizationId),
        inArray(familyMembers.athleteId, uniqueIds(input.athleteIds)),
        familyMemberOverlapPredicate(input.effectiveFrom),
        targetFamilyPredicate
      )
    )
    .limit(1);

  if (overlappingAssociation) {
    throw new OperationalError(
      "FAMILY_MEMBERSHIP_DATE_CONFLICT",
      "La gimnasta ya tiene una asociación familiar que se solapa con la fecha efectiva.",
      409
    );
  }
}

async function linkAthletesToFamily(
  tx: TransactionClient,
  input: OwnerFamilyAssociationCommand,
  familyId: string
): Promise<void> {
  for (const athleteId of input.athleteIds) {
    const basePredicate = and(
      eq(familyMembers.organizationId, input.organizationId),
      eq(familyMembers.familyId, familyId),
      eq(familyMembers.athleteId, athleteId),
      familyMemberOverlapPredicate(input.effectiveFrom)
    );
    const [futureOverlap] = await tx
      .select({ startsOn: familyMembers.startsOn, endsOn: familyMembers.endsOn })
      .from(familyMembers)
      .where(and(basePredicate, familyMemberStartsAfterPredicate(input.effectiveFrom)))
      .limit(1);
    if (futureOverlap) {
      throw new OperationalError(
        "FAMILY_MEMBERSHIP_DATE_CONFLICT",
        "La fecha efectiva se solapa con una relación familiar existente.",
        409
      );
    }
    const [existingAssociation] = await tx
      .select({ startsOn: familyMembers.startsOn, endsOn: familyMembers.endsOn })
      .from(familyMembers)
      .where(and(basePredicate, familyMemberStartsOnOrBeforePredicate(input.effectiveFrom)))
      .limit(1);
    if (existingAssociation) {
      continue;
    }
    await tx.insert(familyMembers).values({
      organizationId: input.organizationId,
      familyId,
      athleteId,
      relationship: "other",
      startsOn: input.effectiveFrom,
    });
  }
}

export async function associateOwnerFamilyInTransaction(
  tx: TransactionClient,
  command: OwnerFamilyAssociationCommand
): Promise<{
  family: Family;
  familyPayerId: string;
  guardianId: string;
  replayed: boolean;
}> {
  const input = associationSchema.parse(command);
  if (uniqueIds(input.athleteIds).length !== input.athleteIds.length) {
    throw new OperationalError(
      "INVALID_RELATION",
      "No repitas una gimnasta en la asociación.",
      422
    );
  }
  if (
    (!input.payer.familyPayerId &&
      (!input.payer.givenName ||
        !input.payer.familyName ||
        !input.payer.relationship)) ||
    (input.payer.familyPayerId &&
      (!input.familyId ||
        input.payer.givenName !== undefined ||
        input.payer.familyName !== undefined))
  ) {
    throw new OperationalError(
      "INVALID_RELATION",
      "Para crear un responsable indica nombre, apellidos y relación. Para reutilizarlo, selecciona una persona ya vinculada a esa familia.",
      422
    );
  }

  await lockCommand(tx, input.organizationId, input.idempotencyKey);
  const priorEvent = await findOutboxEvent(tx, {
    organizationId: input.organizationId,
    eventName: "family.owner_associated",
    idempotencyKey: input.idempotencyKey,
  });
  if (priorEvent) {
    assertIdempotencyPayload(priorEvent.payload, {
      commandFingerprint: fingerprint(input),
    });
    const familyId = z.string().uuid().safeParse(priorEvent.payload.resolvedFamilyId);
    const familyPayerId = z.string().uuid().safeParse(priorEvent.payload.familyPayerId);
    if (!familyId.success || !familyPayerId.success) {
      throw new OperationalError(
        "IDEMPOTENCY_CONFLICT",
        "La asociación previa no está disponible.",
        409
      );
    }
    await assertOwnerFamilyReplayAccess(
      tx,
      input,
      familyId.data,
      priorEvent.payload.actorMemberId
    );
    const [family] = await tx
      .select()
      .from(families)
      .where(
        and(
          eq(families.organizationId, input.organizationId),
          eq(families.id, familyId.data)
        )
      )
      .limit(1);
    if (!family) {
      throw new OperationalError("NOT_FOUND", "Familia no encontrada", 404);
    }
    const [priorPayer] = await tx
      .select({ guardianId: familyPayers.guardianId })
      .from(familyPayers)
      .where(
        and(
          eq(familyPayers.organizationId, input.organizationId),
          eq(familyPayers.familyId, family.id),
          eq(familyPayers.id, familyPayerId.data)
        )
      )
      .limit(1);
    if (!priorPayer) {
      throw new OperationalError("NOT_FOUND", "Responsable no encontrado", 404);
    }
    return {
      family,
      familyPayerId: familyPayerId.data,
      guardianId: priorPayer.guardianId,
      replayed: true,
    };
  }

  await assertOwnerFamilyAccess(tx, input, "write");
  if (input.familyId) {
    // Lock order shared with monthly invoicing: family, sorted athletes, enrollment rows.
    await lockCommand(
      tx,
      input.organizationId,
      `monthly-family-scope:${input.familyId}`
    );
    await tx.execute(sql`
      select id from zaltyko.families
      where organization_id = ${input.organizationId}::uuid
        and id = ${input.familyId}::uuid
      for update
    `);
  }
  await lockAthletes(tx, input.organizationId, input.athleteIds);
  await verifyAthletesAtLocation(tx, input);

  let family: Family;
  if (input.familyId) {
    const [existingFamily] = await tx
      .select()
      .from(families)
      .where(
        and(
          eq(families.organizationId, input.organizationId),
          eq(families.id, input.familyId),
          eq(families.isActive, true)
        )
      )
      .limit(1);
    if (!existingFamily) {
      throw new OperationalError("NOT_FOUND", "Familia no encontrada", 404);
    }
    family = existingFamily;
  } else {
    await assertNoOverlappingOtherFamily(tx, input, null);
    const [createdFamily] = await tx
      .insert(families)
      .values({ organizationId: input.organizationId })
      .returning();
    family = createdFamily;
  }
  if (input.familyId) {
    await assertNoOverlappingOtherFamily(tx, input, family.id);
  }

  let selectedPayer: { guardianId: string; isPrimary: boolean } | undefined;
  if (input.payer.familyPayerId) {
    const [activeSelectedPayer] = await tx
      .select({
        guardianId: familyPayers.guardianId,
        isPrimary: familyPayers.isPrimary,
      })
      .from(familyPayers)
      .innerJoin(
        familyGuardians,
        and(
          eq(familyGuardians.organizationId, familyPayers.organizationId),
          eq(familyGuardians.familyId, familyPayers.familyId),
          eq(familyGuardians.guardianId, familyPayers.guardianId),
          eq(familyGuardians.isActive, true)
        )
      )
      .innerJoin(
        guardians,
        and(
          eq(guardians.organizationId, familyPayers.organizationId),
          eq(guardians.id, familyPayers.guardianId),
          eq(guardians.isActive, true)
        )
      )
      .where(
        and(
          eq(familyPayers.organizationId, input.organizationId),
          eq(familyPayers.familyId, family.id),
          eq(familyPayers.id, input.payer.familyPayerId),
          lte(familyPayers.startsOn, input.effectiveFrom),
          or(
            isNull(familyPayers.endsOn),
            gte(familyPayers.endsOn, input.effectiveFrom)
          )
        )
      )
      .limit(1);
    if (!activeSelectedPayer) {
      throw new OperationalError(
        "FAMILY_PAYER_INVALID",
        "El responsable elegido no está activo en esta familia.",
        422
      );
    }
    selectedPayer = activeSelectedPayer;
    if (
      !selectedPayer.isPrimary &&
      input.payer.confirmPrimaryPayerChange !== true
    ) {
      throw new OperationalError(
        "PRIMARY_PAYER_CONFIRMATION_REQUIRED",
        "Confirma el cambio de responsable principal antes de continuar.",
        422,
        { field: "payer.confirmPrimaryPayerChange" }
      );
    }
  } else if (input.familyId) {
    const [currentPrimaryPayer] = await tx
      .select({ id: familyPayers.id })
      .from(familyPayers)
      .where(
        and(
          eq(familyPayers.organizationId, input.organizationId),
          eq(familyPayers.familyId, family.id),
          eq(familyPayers.isPrimary, true),
          isNull(familyPayers.endsOn)
        )
      )
      .limit(1);
    if (
      currentPrimaryPayer &&
      input.payer.confirmPrimaryPayerChange !== true
    ) {
      throw new OperationalError(
        "PRIMARY_PAYER_CONFIRMATION_REQUIRED",
        "Confirma el cambio de responsable principal antes de continuar.",
        422,
        { field: "payer.confirmPrimaryPayerChange" }
      );
    }
  }

  await linkAthletesToFamily(tx, input, family.id);

  let guardianId: string;
  if (input.payer.familyPayerId) {
    guardianId = selectedPayer!.guardianId;
  } else {
    const [person] = await tx
      .insert(people)
      .values({
        organizationId: input.organizationId,
        givenName: input.payer.givenName!,
        familyName: input.payer.familyName!,
      })
      .returning({ id: people.id });
    const [guardian] = await tx
      .insert(guardians)
      .values({ organizationId: input.organizationId, personId: person.id })
      .returning({ id: guardians.id });
    guardianId = guardian.id;
    await tx.insert(familyGuardians).values({
      organizationId: input.organizationId,
      familyId: family.id,
      guardianId,
      relationship: input.payer.relationship!,
      canViewAthletes: false,
      canManageEnrollments: false,
    });
  }

  const [existingPayer] = await tx
    .select()
    .from(familyPayers)
    .where(
      and(
        eq(familyPayers.organizationId, input.organizationId),
        eq(familyPayers.familyId, family.id),
        eq(familyPayers.guardianId, guardianId),
        isNull(familyPayers.endsOn)
      )
    )
    .limit(1);

  if (existingPayer && existingPayer.startsOn > input.effectiveFrom) {
    throw new OperationalError(
      "FAMILY_PAYER_DATE_CONFLICT",
      "La fecha efectiva es anterior a la asignación del responsable.",
      409
    );
  }

  await tx
    .update(familyPayers)
    .set({ isPrimary: false, updatedAt: new Date() })
    .where(
      and(
        eq(familyPayers.organizationId, input.organizationId),
        eq(familyPayers.familyId, family.id),
        eq(familyPayers.isPrimary, true),
        isNull(familyPayers.endsOn)
      )
    );

  if (existingPayer) {
    await tx
      .update(familyPayers)
      .set({ isPrimary: true, updatedAt: new Date() })
      .where(
        and(
          eq(familyPayers.organizationId, input.organizationId),
          eq(familyPayers.id, existingPayer.id)
        )
      );
  }

  const payer = existingPayer
    ? existingPayer
    : (
        await tx
          .insert(familyPayers)
          .values({
            organizationId: input.organizationId,
            familyId: family.id,
            guardianId,
            isPrimary: true,
            startsOn: input.effectiveFrom,
          })
          .returning()
      )[0];

  if (existingPayer && !existingPayer.isPrimary) {
    await tx
      .update(familyPayers)
      .set({ isPrimary: true, updatedAt: new Date() })
      .where(
        and(
          eq(familyPayers.organizationId, input.organizationId),
          eq(familyPayers.id, existingPayer.id)
        )
      );
  }

  await appendOutboxEvent(tx, {
    organizationId: input.organizationId,
    locationId: input.locationId,
    eventName: "family.owner_associated",
    aggregateType: "family",
    aggregateId: family.id,
    idempotencyKey: input.idempotencyKey,
    payload: {
      familyId: input.familyId ?? null,
      resolvedFamilyId: family.id,
      familyPayerId: payer.id,
      athleteIds: uniqueIds(input.athleteIds).join(","),
      effectiveFrom: input.effectiveFrom,
      actorMemberId: input.actor.memberId,
      commandFingerprint: fingerprint(input),
    },
  });
  await appendAuditEntry(tx, {
    organizationId: input.organizationId,
    locationId: input.locationId,
    actorUserId: input.actor.userId,
    action: "family.owner_associated",
    targetType: "family",
    targetId: family.id,
    idempotencyKey: input.idempotencyKey,
    after: {
      familyPayerId: payer.id,
      athleteIds: uniqueIds(input.athleteIds),
      effectiveFrom: input.effectiveFrom,
    },
  });
  return { family, familyPayerId: payer.id, guardianId, replayed: false };
}

export async function associateOwnerFamily(
  command: OwnerFamilyAssociationCommand
) {
  return db.transaction((tx) => associateOwnerFamilyInTransaction(tx, command));
}

export async function getOwnerFamilyOptions(input: {
  organizationId: string;
  locationId: string;
  actor: z.infer<typeof operationalActorSchema>;
}) {
  return db.transaction(async (tx) => {
    await assertOperationalAccess(tx, {
      organizationId: input.organizationId,
      locationId: input.locationId,
      actor: input.actor,
      allowedRoles: ["owner", "admin", "manager"],
    });
    const [location] = await tx
      .select({ timezone: locations.timezone })
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
      throw new OperationalError("NOT_FOUND", "Sede no encontrada", 404);
    }
    const localDate = new Intl.DateTimeFormat("sv-SE", {
      timeZone: location.timezone,
    }).format(new Date());
    const enrollmentMemberRows = await tx
      .selectDistinct({
        familyId: families.id,
        athleteId: athletes.id,
        athleteName: sql<string>`nullif(btrim(concat_ws(' ', ${people.givenName}, ${people.familyName})), '')`,
      })
      .from(families)
      .innerJoin(
        familyMembers,
        and(
          eq(familyMembers.organizationId, families.organizationId),
          eq(familyMembers.familyId, families.id),
          sql`${familyMembers.startsOn} <= ${localDate}::date`,
          sql`(${familyMembers.endsOn} is null or ${familyMembers.endsOn} >= ${localDate}::date)`
        )
      )
      .innerJoin(
        athletes,
        and(
          eq(athletes.organizationId, familyMembers.organizationId),
          eq(athletes.id, familyMembers.athleteId),
          eq(athletes.isActive, true)
        )
      )
      .innerJoin(
        people,
        and(
          eq(people.organizationId, athletes.organizationId),
          eq(people.id, athletes.personId)
        )
      )
      .innerJoin(
        enrollments,
        and(
          eq(enrollments.organizationId, athletes.organizationId),
          eq(enrollments.athleteId, athletes.id),
          eq(enrollments.locationId, input.locationId),
          inArray(enrollments.status, ["pending", "active"])
        )
      )
      .where(
        and(
          eq(families.organizationId, input.organizationId),
          eq(families.isActive, true)
        )
      )
      .limit(OWNER_FAMILY_OPTIONS_QUERY_LIMIT);
    if (enrollmentMemberRows.length > OWNER_FAMILY_OPTIONS_LIMIT) {
      throw new OperationalError(
        "INVALID_RELATION",
        "La lista de familias supera el máximo de opciones que se pueden cargar en una sola consulta.",
        422
      );
    }
    const groupMemberRows = await tx
      .selectDistinct({
        familyId: families.id,
        athleteId: athletes.id,
        athleteName: sql<string>`nullif(btrim(concat_ws(' ', ${people.givenName}, ${people.familyName})), '')`,
      })
      .from(families)
      .innerJoin(
        familyMembers,
        and(
          eq(familyMembers.organizationId, families.organizationId),
          eq(familyMembers.familyId, families.id),
          sql`${familyMembers.startsOn} <= ${localDate}::date`,
          sql`(${familyMembers.endsOn} is null or ${familyMembers.endsOn} >= ${localDate}::date)`
        )
      )
      .innerJoin(
        athletes,
        and(
          eq(athletes.organizationId, familyMembers.organizationId),
          eq(athletes.id, familyMembers.athleteId),
          eq(athletes.isActive, true)
        )
      )
      .innerJoin(
        people,
        and(
          eq(people.organizationId, athletes.organizationId),
          eq(people.id, athletes.personId)
        )
      )
      .innerJoin(
        groupMemberships,
        and(
          eq(groupMemberships.organizationId, athletes.organizationId),
          eq(groupMemberships.athleteId, athletes.id),
          eq(groupMemberships.status, "active"),
          sql`${groupMemberships.startsOn} <= ${localDate}::date`,
          sql`(${groupMemberships.endsOn} is null or ${groupMemberships.endsOn} >= ${localDate}::date)`
        )
      )
      .innerJoin(
        groups,
        and(
          eq(groups.organizationId, groupMemberships.organizationId),
          eq(groups.id, groupMemberships.groupId),
          eq(groups.locationId, input.locationId),
          eq(groups.status, "active")
        )
      )
      .where(
        and(
          eq(families.organizationId, input.organizationId),
          eq(families.isActive, true)
        )
      )
      .limit(OWNER_FAMILY_OPTIONS_QUERY_LIMIT);
    if (groupMemberRows.length > OWNER_FAMILY_OPTIONS_LIMIT) {
      throw new OperationalError(
        "INVALID_RELATION",
        "La lista de familias supera el máximo de opciones que se pueden cargar en una sola consulta.",
        422
      );
    }
    const membersByFamily = new Map<
      string,
      Map<string, { athleteId: string; athleteName: string | null }>
    >();
    for (const row of [...enrollmentMemberRows, ...groupMemberRows]) {
      const members = membersByFamily.get(row.familyId) ?? new Map();
      members.set(row.athleteId, {
        athleteId: row.athleteId,
        athleteName: row.athleteName,
      });
      membersByFamily.set(row.familyId, members);
    }
    const memberCount = [...membersByFamily.values()].reduce(
      (count, members) => count + members.size,
      0
    );
    if (memberCount > OWNER_FAMILY_OPTIONS_LIMIT) {
      throw new OperationalError(
        "INVALID_RELATION",
        "La lista de familias supera el máximo de opciones que se pueden cargar en una sola consulta.",
        422
      );
    }
    const familyIds = [...membersByFamily.keys()];
    const payerRows = familyIds.length
      ? await tx
          .select({
            familyId: familyPayers.familyId,
            familyPayerId: familyPayers.id,
            isPrimary: familyPayers.isPrimary,
            displayName: sql<string>`nullif(btrim(concat_ws(' ', ${people.givenName}, ${people.familyName})), '')`,
          })
          .from(familyPayers)
          .innerJoin(
            familyGuardians,
            and(
              eq(familyGuardians.organizationId, familyPayers.organizationId),
              eq(familyGuardians.familyId, familyPayers.familyId),
              eq(familyGuardians.guardianId, familyPayers.guardianId),
              eq(familyGuardians.isActive, true)
            )
          )
          .innerJoin(
            guardians,
            and(
              eq(guardians.organizationId, familyPayers.organizationId),
              eq(guardians.id, familyPayers.guardianId),
              eq(guardians.isActive, true)
            )
          )
          .innerJoin(
            people,
            and(
              eq(people.organizationId, guardians.organizationId),
              eq(people.id, guardians.personId)
            )
          )
          .where(
            and(
              eq(familyPayers.organizationId, input.organizationId),
              inArray(familyPayers.familyId, familyIds),
              sql`${familyPayers.startsOn} <= ${localDate}::date`,
              sql`(${familyPayers.endsOn} is null or ${familyPayers.endsOn} >= ${localDate}::date)`
            )
          )
          .limit(OWNER_FAMILY_OPTIONS_QUERY_LIMIT)
      : [];
    if (payerRows.length > OWNER_FAMILY_OPTIONS_LIMIT) {
      throw new OperationalError(
        "INVALID_RELATION",
        "La lista de responsables supera el máximo de opciones que se pueden cargar en una sola consulta.",
        422
      );
    }
    const payersByFamily = new Map<string, typeof payerRows>();
    for (const row of payerRows) {
      const payers = payersByFamily.get(row.familyId) ?? [];
      payers.push(row);
      payersByFamily.set(row.familyId, payers);
    }
    return {
      families: familyIds.map((familyId) => ({
        familyId,
        athletes: [...(membersByFamily.get(familyId)?.values() ?? [])],
        payers: (payersByFamily.get(familyId) ?? []).map((payer) => ({
          familyPayerId: payer.familyPayerId,
          displayName: payer.displayName,
          isPrimary: payer.isPrimary,
        })),
      })),
    };
  });
}
