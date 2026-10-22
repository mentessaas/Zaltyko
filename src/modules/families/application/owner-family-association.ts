import { createHash } from "node:crypto";

import { and, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  athletes,
  families,
  familyGuardians,
  familyMembers,
  familyPayers,
  guardians,
  locations,
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
const associationSchema = z
  .object({
    organizationId: z.string().uuid(),
    locationId: z.string().uuid(),
    familyId: z.string().uuid().optional(),
    athleteIds: z.array(z.string().uuid()).min(1).max(50),
    effectiveFrom: z.string().date(),
    payer: z
      .object({
        familyPayerId: z.string().uuid().optional(),
        givenName: z.string().trim().min(1).max(100).optional(),
        familyName: z.string().trim().min(1).max(100).optional(),
        relationship: z
          .enum(["parent", "legal_guardian", "foster_guardian", "other"])
          .optional(),
      })
      .strict(),
    idempotencyKey: commandKeySchema,
    actor: operationalActorSchema,
  })
  .strict();

export type OwnerFamilyAssociationCommand = z.infer<typeof associationSchema>;

function fingerprint(input: OwnerFamilyAssociationCommand): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        organizationId: input.organizationId,
        locationId: input.locationId,
        familyId: input.familyId ?? null,
        athleteIds: uniqueIds(input.athleteIds),
        effectiveFrom: input.effectiveFrom,
        familyPayerId: input.payer.familyPayerId ?? null,
        givenName: input.payer.givenName ?? null,
        familyName: input.payer.familyName ?? null,
        relationship: input.payer.relationship ?? null,
      })
    )
    .digest("hex");
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
  const rows = await tx
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
  const found = new Set(rows.map((row) => row.athleteId));
  if (input.athleteIds.some((id) => !found.has(id))) {
    throw new OperationalError(
      "NOT_FOUND",
      "Cada gimnasta debe estar activa y tener una inscripción pendiente o activa en la sede.",
      404
    );
  }
}

async function linkAthletesToFamily(
  tx: TransactionClient,
  input: OwnerFamilyAssociationCommand,
  familyId: string
): Promise<void> {
  for (const athleteId of input.athleteIds) {
    const [existing] = await tx
      .select()
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.organizationId, input.organizationId),
          eq(familyMembers.familyId, familyId),
          eq(familyMembers.athleteId, athleteId),
          isNull(familyMembers.endsOn)
        )
      )
      .limit(1);
    if (existing) {
      if (existing.startsOn > input.effectiveFrom) {
        throw new OperationalError(
          "FAMILY_MEMBERSHIP_DATE_CONFLICT",
          "La fecha efectiva es anterior a una relación familiar existente.",
          409
        );
      }
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
    const familyId = priorEvent.payload.resolvedFamilyId;
    const familyPayerId = priorEvent.payload.familyPayerId;
    if (typeof familyId !== "string" || typeof familyPayerId !== "string") {
      throw new OperationalError(
        "IDEMPOTENCY_CONFLICT",
        "La asociación previa no está disponible.",
        409
      );
    }
    await assertOperationalAccess(tx, {
      organizationId: input.organizationId,
      locationId: input.locationId,
      actor: input.actor,
      intent: "write",
      allowedRoles: ["owner", "admin", "manager"],
    });
    const [family] = await tx
      .select()
      .from(families)
      .where(
        and(
          eq(families.organizationId, input.organizationId),
          eq(families.id, familyId)
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
          eq(familyPayers.id, familyPayerId)
        )
      )
      .limit(1);
    if (!priorPayer) {
      throw new OperationalError("NOT_FOUND", "Responsable no encontrado", 404);
    }
    return {
      family,
      familyPayerId,
      guardianId: priorPayer.guardianId,
      replayed: true,
    };
  }

  await assertOperationalAccess(tx, {
    organizationId: input.organizationId,
    locationId: input.locationId,
    actor: input.actor,
    intent: "write",
    allowedRoles: ["owner", "admin", "manager"],
  });
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
    const [createdFamily] = await tx
      .insert(families)
      .values({ organizationId: input.organizationId })
      .returning();
    family = createdFamily;
  }

  await linkAthletesToFamily(tx, input, family.id);

  let guardianId: string;
  if (input.payer.familyPayerId) {
    const [selectedPayer] = await tx
      .select({ guardianId: familyPayers.guardianId })
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
    if (!selectedPayer) {
      throw new OperationalError(
        "FAMILY_PAYER_INVALID",
        "El responsable elegido no está activo en esta familia.",
        422
      );
    }
    guardianId = selectedPayer.guardianId;
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
    const memberRows = await tx
      .select({
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
      .limit(1000);
    const familyIds = [...new Set(memberRows.map((row) => row.familyId))];
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
          .limit(1000)
      : [];

    const membersByFamily = new Map<
      string,
      Map<string, { athleteId: string; athleteName: string | null }>
    >();
    for (const row of memberRows) {
      const members = membersByFamily.get(row.familyId) ?? new Map();
      members.set(row.athleteId, {
        athleteId: row.athleteId,
        athleteName: row.athleteName,
      });
      membersByFamily.set(row.familyId, members);
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
