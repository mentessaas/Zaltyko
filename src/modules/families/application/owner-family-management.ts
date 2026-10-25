import { sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
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

const personNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value))
  .transform((value) => value.normalize("NFC").replace(/\s+/gu, " "));

const updatePayerProfileSchema = z
  .object({
    organizationId: z.string().uuid(),
    locationId: z.string().uuid(),
    familyPayerId: z.string().uuid(),
    expectedProfileVersion: z.string().datetime({ precision: 6 }),
    givenName: personNameSchema,
    familyName: personNameSchema,
    idempotencyKey: z.string().trim().min(8).max(180),
    actor: operationalActorSchema,
  })
  .strict();

export type UpdateOwnerFamilyPayerProfileCommand = z.infer<
  typeof updatePayerProfileSchema
>;

type PayerProfile = {
  familyPayerId: string;
  familyId: string;
  guardianId: string;
  personId: string;
  givenName: string;
  familyName: string;
  profileVersion: string;
};

async function loadCurrentPayerProfile(
  tx: TransactionClient,
  input: UpdateOwnerFamilyPayerProfileCommand
): Promise<PayerProfile> {
  await assertOperationalAccess(tx, {
    organizationId: input.organizationId,
    locationId: input.locationId,
    actor: input.actor,
    allowedRoles: ["owner", "admin"],
  });

  const locationResult = await tx.execute(sql`
    select timezone
    from zaltyko.locations
    where organization_id = ${input.organizationId}::uuid
      and id = ${input.locationId}::uuid
      and is_active
    limit 1
  `);
  const location = locationResult.rows[0] as { timezone: string } | undefined;
  if (!location?.timezone) {
    throw new OperationalError("NOT_FOUND", "Sede no encontrada", 404);
  }

  const localDate = new Intl.DateTimeFormat("sv-SE", {
    timeZone: location.timezone,
  }).format(new Date());
  const result = await tx.execute(sql`
    select
      payer.id::text as family_payer_id,
      payer.family_id::text as family_id,
      guardian.id::text as guardian_id,
      person.id::text as person_id,
      person.given_name,
      person.family_name,
      to_char(
        person.updated_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ) as profile_version
    from zaltyko.family_payers payer
    join zaltyko.families family
      on family.organization_id = payer.organization_id
     and family.id = payer.family_id
     and family.is_active
    join zaltyko.family_guardians family_guardian
      on family_guardian.organization_id = payer.organization_id
     and family_guardian.family_id = payer.family_id
     and family_guardian.guardian_id = payer.guardian_id
     and family_guardian.is_active
    join zaltyko.guardians guardian
      on guardian.organization_id = payer.organization_id
     and guardian.id = payer.guardian_id
     and guardian.is_active
    join zaltyko.people person
      on person.organization_id = guardian.organization_id
     and person.id = guardian.person_id
    where payer.organization_id = ${input.organizationId}::uuid
      and payer.id = ${input.familyPayerId}::uuid
      and payer.starts_on <= ${localDate}::date
      and (payer.ends_on is null or payer.ends_on >= ${localDate}::date)
      and exists (
        select 1
        from zaltyko.family_members family_member
        join zaltyko.athletes athlete
          on athlete.organization_id = family_member.organization_id
         and athlete.id = family_member.athlete_id
         and athlete.is_active
        join zaltyko.enrollments enrollment
          on enrollment.organization_id = athlete.organization_id
         and enrollment.athlete_id = athlete.id
         and enrollment.location_id = ${input.locationId}::uuid
         and enrollment.status in ('pending', 'active')
        where family_member.organization_id = payer.organization_id
          and family_member.family_id = payer.family_id
          and family_member.starts_on <= ${localDate}::date
          and (family_member.ends_on is null or family_member.ends_on >= ${localDate}::date)
      )
    limit 1
    for update of payer, guardian, person
  `);
  const row = result.rows[0] as
    | {
        family_payer_id: string;
        family_id: string;
        guardian_id: string;
        person_id: string;
        given_name: string;
        family_name: string;
        profile_version: string;
      }
    | undefined;
  if (!row) {
    throw new OperationalError(
      "NOT_FOUND",
      "No se encontró un responsable activo de esta familia en la sede",
      404
    );
  }

  return {
    familyPayerId: row.family_payer_id,
    familyId: row.family_id,
    guardianId: row.guardian_id,
    personId: row.person_id,
    givenName: row.given_name,
    familyName: row.family_name,
    profileVersion: row.profile_version,
  };
}

export async function updateOwnerFamilyPayerProfile(
  command: UpdateOwnerFamilyPayerProfileCommand
): Promise<PayerProfile & { replayed: boolean }> {
  const input = updatePayerProfileSchema.parse(command);
  const eventName = "family.payer_profile_updated";

  return db.transaction(async (tx) => {
    await lockCommand(tx, input.organizationId, input.idempotencyKey);
    const current = await loadCurrentPayerProfile(tx, input);
    const expectedPayload = {
      familyPayerId: input.familyPayerId,
      locationId: input.locationId,
      expectedProfileVersion: input.expectedProfileVersion,
    };
    const prior = await findOutboxEvent(tx, {
      organizationId: input.organizationId,
      eventName,
      idempotencyKey: input.idempotencyKey,
    });

    if (prior) {
      assertIdempotencyPayload(prior.payload, expectedPayload);
      if (
        prior.aggregateId !== input.familyPayerId ||
        prior.payload.profileVersion !== current.profileVersion ||
        current.givenName !== input.givenName ||
        current.familyName !== input.familyName
      ) {
        throw new OperationalError(
          "IDEMPOTENCY_CONFLICT",
          "El responsable cambió después de la operación pendiente. Actualiza la familia antes de reintentar.",
          409
        );
      }
      return { ...current, replayed: true };
    }

    const [usedKey] = await tx.execute(sql`
      select id
      from zaltyko.outbox_events
      where organization_id = ${input.organizationId}::uuid
        and idempotency_key = ${input.idempotencyKey}
      limit 1
    `).then((result) => result.rows);
    if (usedKey) {
      throw new OperationalError(
        "IDEMPOTENCY_CONFLICT",
        "La clave de idempotencia ya pertenece a otra operación",
        409
      );
    }

    if (current.profileVersion !== input.expectedProfileVersion) {
      throw new OperationalError(
        "VERSION_CONFLICT",
        "Los datos del responsable cambiaron. Actualiza la familia y vuelve a intentarlo.",
        409
      );
    }

    await assertOperationalAccess(tx, {
      organizationId: input.organizationId,
      locationId: input.locationId,
      actor: input.actor,
      allowedRoles: ["owner", "admin"],
      intent: "write",
    });
    const updatedResult = await tx.execute(sql`
      update zaltyko.people
      set given_name = ${input.givenName},
          family_name = ${input.familyName},
          updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond')
      where organization_id = ${input.organizationId}::uuid
        and id = ${current.personId}::uuid
        and updated_at = ${input.expectedProfileVersion}::timestamptz
      returning to_char(
        updated_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ) as profile_version
    `);
    const profileVersion = updatedResult.rows[0]?.profile_version;
    if (typeof profileVersion !== "string") {
      throw new OperationalError(
        "VERSION_CONFLICT",
        "Los datos del responsable cambiaron. Actualiza la familia y vuelve a intentarlo.",
        409
      );
    }

    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId: input.locationId,
      eventName,
      aggregateType: "family_payer",
      aggregateId: input.familyPayerId,
      idempotencyKey: input.idempotencyKey,
      payload: {
        ...expectedPayload,
        profileVersion,
      },
    });
    await appendAuditEntry(tx, {
      organizationId: input.organizationId,
      locationId: input.locationId,
      actorUserId: input.actor.userId,
      action: eventName,
      targetType: "family_payer",
      targetId: input.familyPayerId,
      idempotencyKey: input.idempotencyKey,
      before: {
        guardianId: current.guardianId,
        profileVersion: current.profileVersion,
      },
      after: {
        guardianId: current.guardianId,
        profileVersion,
      },
    });

    return {
      ...current,
      givenName: input.givenName,
      familyName: input.familyName,
      profileVersion,
      replayed: false,
    };
  });
}
