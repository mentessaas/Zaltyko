import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { athletes, people } from "@/db/zaltyko-schema";
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
const personNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value))
  .transform((value) => value.normalize("NFC").replace(/\s+/gu, " "));
const expectedPersonNameSchema = z
  .string()
  .min(1)
  .max(100)
  .refine((value) => value.trim().length > 0)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value));

const profileScopeSchema = z
  .object({
    organizationId: z.guid(),
    locationId: z.guid(),
    athleteId: z.guid(),
    actor: operationalActorSchema,
  })
  .strict();

const updateProfileSchema = profileScopeSchema
  .extend({
    // Expected values are snapshots returned by GET. Preserve their exact
    // stored representation so optimistic concurrency also works for legacy
    // rows that predate NFC/whitespace normalization.
    expectedGivenName: expectedPersonNameSchema,
    expectedFamilyName: expectedPersonNameSchema,
    givenName: personNameSchema,
    familyName: personNameSchema,
    idempotencyKey: commandKeySchema,
  })
  .strict();

const privilegedRoles = ["owner", "manager", "admin"] as const;
const profileEventName = "athlete.profile_updated";

export type GetOwnerAthleteProfileInput = z.input<typeof profileScopeSchema>;
export type UpdateOwnerAthleteProfileInput = z.input<
  typeof updateProfileSchema
>;

export type OwnerAthleteProfile = {
  athleteId: string;
  givenName: string;
  familyName: string;
};

export type UpdatedOwnerAthleteProfile = OwnerAthleteProfile & {
  replayed: boolean;
};

type ParsedProfileScope = z.infer<typeof profileScopeSchema>;
type ParsedProfileUpdate = z.infer<typeof updateProfileSchema>;
type ProfileRow = OwnerAthleteProfile & {
  personId: string;
  isActive: boolean;
};

type AffectedProfileScope = {
  locationIds: string[];
  hasGuardianIdentity: boolean;
  hasStaffIdentity: boolean;
};

function commandFingerprint(input: ParsedProfileUpdate): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        organizationId: input.organizationId,
        locationId: input.locationId,
        athleteId: input.athleteId,
        actor: input.actor,
        expectedGivenName: input.expectedGivenName,
        expectedFamilyName: input.expectedFamilyName,
        givenName: input.givenName,
        familyName: input.familyName,
      })
    )
    .digest("hex");
}

async function lockAthleteProfile(
  tx: TransactionClient,
  input: Pick<ParsedProfileScope, "organizationId" | "athleteId">
): Promise<void> {
  const result = await tx.execute(sql`
    select athlete.id
    from zaltyko.athletes as athlete
    join zaltyko.people as person
      on person.organization_id = athlete.organization_id
     and person.id = athlete.person_id
    where athlete.organization_id = ${input.organizationId}::uuid
      and athlete.id = ${input.athleteId}::uuid
    for update of athlete, person
  `);
  if (result.rows.length === 0) {
    throw new OperationalError("NOT_FOUND", "Gimnasta no encontrada", 404);
  }
}

async function loadAthleteProfile(
  tx: TransactionClient,
  input: Pick<ParsedProfileScope, "organizationId" | "athleteId">
): Promise<ProfileRow> {
  const [profile] = await tx
    .select({
      athleteId: athletes.id,
      personId: athletes.personId,
      isActive: athletes.isActive,
      givenName: people.givenName,
      familyName: people.familyName,
    })
    .from(athletes)
    .innerJoin(
      people,
      and(
        eq(people.organizationId, athletes.organizationId),
        eq(people.id, athletes.personId)
      )
    )
    .where(
      and(
        eq(athletes.organizationId, input.organizationId),
        eq(athletes.id, input.athleteId)
      )
    )
    .limit(1);

  if (!profile || !profile.isActive) {
    throw new OperationalError("NOT_FOUND", "Gimnasta no encontrada", 404);
  }
  return profile;
}

/**
 * A person row is shared by every canonical role in an organization. Resolve
 * all locations that can display this name before authorizing a profile read
 * or write. Family siblings are included because one guardian identity can be
 * attached to athletes at different sites; staff identities require org-wide
 * scope below because staff_profiles has no location column.
 */
async function loadAffectedProfileScope(
  tx: TransactionClient,
  input: Pick<ParsedProfileScope, "organizationId" | "athleteId"> & {
    personId: string;
  }
): Promise<AffectedProfileScope> {
  const result = await tx.execute(sql`
    with related_athletes as (
      select ${input.athleteId}::uuid as athlete_id
      union
      select family_member.athlete_id
      from zaltyko.guardians as guardian
      join zaltyko.family_guardians as family_guardian
        on family_guardian.organization_id = guardian.organization_id
       and family_guardian.guardian_id = guardian.id
      join zaltyko.family_members as family_member
        on family_member.organization_id = family_guardian.organization_id
       and family_member.family_id = family_guardian.family_id
      where guardian.organization_id = ${input.organizationId}::uuid
        and guardian.person_id = ${input.personId}::uuid
    ),
    affected_locations as (
      select academy_group.location_id
      from zaltyko.group_memberships as membership
      join zaltyko.groups as academy_group
        on academy_group.organization_id = membership.organization_id
       and academy_group.id = membership.group_id
      join related_athletes
        on related_athletes.athlete_id = membership.athlete_id
      where membership.organization_id = ${input.organizationId}::uuid
      union
      select enrollment.location_id
      from zaltyko.enrollments as enrollment
      join related_athletes
        on related_athletes.athlete_id = enrollment.athlete_id
      where enrollment.organization_id = ${input.organizationId}::uuid
      union
      select attendance.location_id
      from zaltyko.attendance_records as attendance
      join related_athletes
        on related_athletes.athlete_id = attendance.athlete_id
      where attendance.organization_id = ${input.organizationId}::uuid
      union
      select trial.location_id
      from zaltyko.trials as trial
      join related_athletes
        on related_athletes.athlete_id = trial.athlete_id
      where trial.organization_id = ${input.organizationId}::uuid
      union
      select waitlist.location_id
      from zaltyko.waitlist_entries as waitlist
      join related_athletes
        on related_athletes.athlete_id = waitlist.athlete_id
      where waitlist.organization_id = ${input.organizationId}::uuid
    )
    select
      coalesce(
        array_agg(distinct affected_locations.location_id order by affected_locations.location_id),
        array[]::uuid[]
      ) as location_ids,
      exists (
        select 1
        from zaltyko.guardians as guardian
        where guardian.organization_id = ${input.organizationId}::uuid
          and guardian.person_id = ${input.personId}::uuid
      ) as has_guardian_identity,
      exists (
        select 1
        from zaltyko.staff_profiles as staff_profile
        where staff_profile.organization_id = ${input.organizationId}::uuid
          and staff_profile.person_id = ${input.personId}::uuid
      ) as has_staff_identity
    from affected_locations
  `);

  const row = result.rows[0];
  const rawLocationIds = row?.location_ids;
  const parsedLocationIds = z.array(z.guid()).safeParse(rawLocationIds);
  const guardianIdentity = z.boolean().safeParse(row?.has_guardian_identity);
  const staffIdentity = z.boolean().safeParse(row?.has_staff_identity);
  if (
    !parsedLocationIds.success ||
    !guardianIdentity.success ||
    !staffIdentity.success
  ) {
    throw new OperationalError(
      "FEATURE_NOT_AVAILABLE",
      "No se pudieron comprobar las sedes relacionadas con la ficha",
      503
    );
  }

  return {
    locationIds: [...new Set(parsedLocationIds.data)].sort(),
    hasGuardianIdentity: guardianIdentity.data,
    hasStaffIdentity: staffIdentity.data,
  };
}

async function assertProfileScopeAccess(
  tx: TransactionClient,
  input: ParsedProfileScope,
  scope: AffectedProfileScope,
  intent?: "write"
): Promise<void> {
  if (!scope.locationIds.length || !scope.locationIds.includes(input.locationId)) {
    throw new OperationalError(
      "NOT_FOUND",
      "La gimnasta no está vinculada a esta sede",
      404
    );
  }

  let memberLocationScopeMode: string | undefined;
  for (const locationId of scope.locationIds) {
    const member = await assertOperationalAccess(tx, {
      organizationId: input.organizationId,
      locationId,
      actor: input.actor,
      allowedRoles: privilegedRoles,
      ...(intent ? { intent } : {}),
    });
    memberLocationScopeMode = member.locationScopeMode;
  }

  if (
    intent &&
    (scope.hasGuardianIdentity || scope.hasStaffIdentity) &&
    memberLocationScopeMode !== "all"
  ) {
    throw new OperationalError(
      "LOCATION_SCOPE_DENIED",
      "Esta identidad se comparte con otras funciones de la academia; solo un miembro con acceso a todas las sedes puede modificarla",
      403
    );
  }
}

export async function getOwnerAthleteProfile(
  input: GetOwnerAthleteProfileInput
): Promise<OwnerAthleteProfile> {
  const parsed = profileScopeSchema.parse(input);
  return db.transaction(async (tx) => {
    const profile = await loadAthleteProfile(tx, parsed);
    const affectedScope = await loadAffectedProfileScope(tx, {
      organizationId: parsed.organizationId,
      athleteId: parsed.athleteId,
      personId: profile.personId,
    });
    await assertProfileScopeAccess(tx, parsed, affectedScope);
    return {
      athleteId: profile.athleteId,
      givenName: profile.givenName,
      familyName: profile.familyName,
    };
  });
}

export async function updateOwnerAthleteProfile(
  command: UpdateOwnerAthleteProfileInput
): Promise<UpdatedOwnerAthleteProfile> {
  const input = updateProfileSchema.parse(command);
  const fingerprint = commandFingerprint(input);

  return db.transaction(async (tx) => {
    await lockCommand(tx, input.organizationId, input.idempotencyKey);
    await lockAthleteProfile(tx, input);

    const current = await loadAthleteProfile(tx, input);
    const affectedScope = await loadAffectedProfileScope(tx, {
      organizationId: input.organizationId,
      athleteId: input.athleteId,
      personId: current.personId,
    });

    // First authorize the full read scope. This lets an exact retry recover
    // safely while the organization is read-only, without granting a write.
    await assertProfileScopeAccess(tx, input, affectedScope);

    const prior = await findOutboxEvent(tx, {
      organizationId: input.organizationId,
      eventName: profileEventName,
      idempotencyKey: input.idempotencyKey,
    });
    if (prior) {
      if (prior.aggregateId !== input.athleteId) {
        throw new OperationalError(
          "IDEMPOTENCY_CONFLICT",
          "La clave ya pertenece a otra ficha",
          409
        );
      }
      assertIdempotencyPayload(prior.payload, {
        athleteId: input.athleteId,
        personId: current.personId,
        commandFingerprint: fingerprint,
      });
      return {
        athleteId: current.athleteId,
        givenName: current.givenName,
        familyName: current.familyName,
        replayed: true,
      };
    }

    if (
      current.givenName !== input.expectedGivenName ||
      current.familyName !== input.expectedFamilyName
    ) {
      throw new OperationalError(
        "VERSION_CONFLICT",
        "La ficha cambió desde la última lectura. Recarga los datos antes de guardar.",
        409
      );
    }

    const changedFields = [
      ...(current.givenName === input.givenName ? [] : ["givenName"]),
      ...(current.familyName === input.familyName ? [] : ["familyName"]),
    ];
    if (!changedFields.length) {
      throw new OperationalError(
        "INVALID_RELATION",
        "Indica un cambio en el nombre o los apellidos",
        422
      );
    }

    await assertProfileScopeAccess(tx, input, affectedScope, "write");

    const updatedAt = new Date();
    const [updatedPerson] = await tx
      .update(people)
      .set({
        givenName: input.givenName,
        familyName: input.familyName,
        updatedAt,
      })
      .where(
        and(
          eq(people.organizationId, input.organizationId),
          eq(people.id, current.personId),
          eq(people.givenName, input.expectedGivenName),
          eq(people.familyName, input.expectedFamilyName)
        )
      )
      .returning({ id: people.id });
    if (!updatedPerson) {
      throw new OperationalError(
        "VERSION_CONFLICT",
        "La ficha cambió durante la operación. Recarga los datos antes de guardar.",
        409
      );
    }

    const [updatedAthlete] = await tx
      .update(athletes)
      .set({ updatedAt })
      .where(
        and(
          eq(athletes.organizationId, input.organizationId),
          eq(athletes.id, input.athleteId),
          eq(athletes.personId, current.personId),
          eq(athletes.isActive, true)
        )
      )
      .returning({ id: athletes.id });
    if (!updatedAthlete) {
      throw new OperationalError(
        "VERSION_CONFLICT",
        "La ficha cambió durante la operación. Recarga los datos antes de guardar.",
        409
      );
    }

    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId: input.locationId,
      eventName: profileEventName,
      aggregateType: "athlete",
      aggregateId: input.athleteId,
      idempotencyKey: input.idempotencyKey,
      payload: {
        athleteId: input.athleteId,
        personId: current.personId,
        commandFingerprint: fingerprint,
        changedFields,
      },
    });
    await appendAuditEntry(tx, {
      organizationId: input.organizationId,
      locationId: input.locationId,
      actorUserId: input.actor.userId,
      action: profileEventName,
      targetType: "athlete",
      targetId: input.athleteId,
      idempotencyKey: input.idempotencyKey,
      before: { changedFields },
      after: { changedFields, updated: true },
      metadata: { commandFingerprint: fingerprint },
    });

    return {
      athleteId: input.athleteId,
      givenName: input.givenName,
      familyName: input.familyName,
      replayed: false,
    };
  });
}
