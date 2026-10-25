import { createHash } from "node:crypto";
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

const idSchema = z.guid();
const commandKeySchema = z.string().trim().min(8).max(180);
const profileNameSchema = z
  .string()
  .max(500)
  .refine((value) => value.trim().length > 0)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value));
export function normalizeOwnerGuardianProfileName(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/gu, " ");
}

const nextNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value))
  .transform(normalizeOwnerGuardianProfileName);
const exactVersionSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u)
  .refine((value) => Number.isFinite(Date.parse(value)));

const profileScopeSchema = z
  .object({
    organizationId: idSchema,
    locationId: idSchema,
    guardianId: idSchema,
    actor: operationalActorSchema,
  })
  .strict();

const updateGuardianProfileSchema = profileScopeSchema
  .extend({
    expectedGivenName: profileNameSchema,
    expectedFamilyName: profileNameSchema,
    expectedUpdatedAt: exactVersionSchema,
    givenName: nextNameSchema,
    familyName: nextNameSchema,
    idempotencyKey: commandKeySchema,
  })
  .strict();

const privilegedRoles = ["owner", "admin", "manager"] as const;
const profileEventName = "guardian.profile_updated";

export type GetOwnerGuardianProfileInput = z.input<typeof profileScopeSchema>;
export type UpdateOwnerGuardianProfileInput = z.input<
  typeof updateGuardianProfileSchema
>;

export type OwnerGuardianProfile = {
  guardianId: string;
  givenName: string;
  familyName: string;
  updatedAt: string;
};

export type UpdatedOwnerGuardianProfile = OwnerGuardianProfile & {
  replayed: boolean;
};

type ParsedProfileScope = z.infer<typeof profileScopeSchema>;
type ParsedProfileUpdate = z.infer<typeof updateGuardianProfileSchema>;
type ProfileRow = {
  guardian_id: string;
  person_id: string;
  given_name: string;
  family_name: string;
  updated_at: string;
};

function commandFingerprint(input: ParsedProfileUpdate): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        organizationId: input.organizationId,
        locationId: input.locationId,
        guardianId: input.guardianId,
        actorUserId: input.actor.userId,
        actorMemberId: input.actor.memberId,
        expectedGivenName: input.expectedGivenName,
        expectedFamilyName: input.expectedFamilyName,
        expectedUpdatedAt: input.expectedUpdatedAt,
        givenName: input.givenName,
        familyName: input.familyName,
      })
    )
    .digest("hex");
}

function notFound(): OperationalError {
  return new OperationalError(
    "NOT_FOUND",
    "El tutor no está activo o no está vinculado a esta sede.",
    404
  );
}

async function assertOwnerGuardianProfileAccess(
  tx: TransactionClient,
  input: ParsedProfileScope,
  intent?: "write"
): Promise<void> {
  const member = await assertOperationalAccess(tx, {
    organizationId: input.organizationId,
    locationId: input.locationId,
    actor: input.actor,
    allowedRoles: privilegedRoles,
    ...(intent ? { intent } : {}),
  });
  // A guardian's person record is shared by every family and academy site.
  // Names are global to that identity, so a selected-site manager cannot read
  // or mutate them through a narrower scope.
  if (member.locationScopeMode !== "all") {
    throw new OperationalError(
      "LOCATION_SCOPE_DENIED",
      "Para gestionar el perfil compartido de un tutor necesitas acceso a todas las sedes de la academia.",
      403
    );
  }
}

/**
 * The anchor query returns a profile only when this guardian is active, linked
 * to an active family with an active athlete, and that athlete is operationally
 * attached to the requested active location today. All joins remain within the
 * requested organization; EXISTS avoids duplicate rows for shared families.
 */
async function loadActiveGuardianProfile(
  tx: TransactionClient,
  input: ParsedProfileScope
): Promise<ProfileRow> {
  const result = await tx.execute(sql`
    select
      guardian.id as guardian_id,
      person.id as person_id,
      person.given_name,
      person.family_name,
      to_char(person.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as updated_at
    from zaltyko.guardians as guardian
    join zaltyko.people as person
      on person.organization_id = guardian.organization_id
     and person.id = guardian.person_id
    join zaltyko.locations as anchor
      on anchor.organization_id = guardian.organization_id
     and anchor.id = ${input.locationId}::uuid
     and anchor.is_active = true
    where guardian.organization_id = ${input.organizationId}::uuid
      and guardian.id = ${input.guardianId}::uuid
      and guardian.is_active = true
      and exists (
        select 1
        from zaltyko.family_guardians as family_guardian
        join zaltyko.families as family
          on family.organization_id = family_guardian.organization_id
         and family.id = family_guardian.family_id
         and family.is_active = true
        join zaltyko.family_members as family_member
          on family_member.organization_id = family_guardian.organization_id
         and family_member.family_id = family.id
        join zaltyko.athletes as athlete
          on athlete.organization_id = family_member.organization_id
         and athlete.id = family_member.athlete_id
         and athlete.is_active = true
        where family_guardian.organization_id = guardian.organization_id
          and family_guardian.guardian_id = guardian.id
          and family_guardian.is_active = true
          and family_member.starts_on <= (now() at time zone anchor.timezone)::date
          and (
            family_member.ends_on is null
            or family_member.ends_on >= (now() at time zone anchor.timezone)::date
          )
          and (
            exists (
              select 1
              from zaltyko.enrollments as enrollment
              where enrollment.organization_id = guardian.organization_id
                and enrollment.athlete_id = athlete.id
                and enrollment.location_id = anchor.id
                and enrollment.status in ('pending', 'active')
                and enrollment.starts_on <= (now() at time zone anchor.timezone)::date
                and (
                  enrollment.ends_on is null
                  or enrollment.ends_on >= (now() at time zone anchor.timezone)::date
                )
            )
            or exists (
              select 1
              from zaltyko.group_memberships as membership
              join zaltyko.groups as academy_group
                on academy_group.organization_id = membership.organization_id
               and academy_group.id = membership.group_id
               and academy_group.location_id = anchor.id
               and academy_group.status = 'active'
              where membership.organization_id = guardian.organization_id
                and membership.athlete_id = athlete.id
                and membership.status = 'active'
                and membership.starts_on <= (now() at time zone anchor.timezone)::date
                and (
                  membership.ends_on is null
                  or membership.ends_on >= (now() at time zone anchor.timezone)::date
                )
            )
          )
      )
    limit 1
  `);

  const row = result.rows[0] as unknown as ProfileRow | undefined;
  if (
    !row ||
    typeof row.guardian_id !== "string" ||
    typeof row.person_id !== "string" ||
    typeof row.given_name !== "string" ||
    typeof row.family_name !== "string" ||
    typeof row.updated_at !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u.test(row.updated_at)
  ) {
    throw notFound();
  }
  return row;
}

async function lockGuardianAndPerson(
  tx: TransactionClient,
  input: ParsedProfileScope
): Promise<void> {
  const guardian = await tx.execute(sql`
    select guardian.person_id
    from zaltyko.guardians as guardian
    where guardian.organization_id = ${input.organizationId}::uuid
      and guardian.id = ${input.guardianId}::uuid
      and guardian.is_active = true
    for update of guardian
  `);
  const personId = guardian.rows[0]?.person_id;
  if (typeof personId !== "string") throw notFound();

  const person = await tx.execute(sql`
    select person.id
    from zaltyko.people as person
    where person.organization_id = ${input.organizationId}::uuid
      and person.id = ${personId}::uuid
    for update of person
  `);
  if (person.rows.length !== 1) throw notFound();
}

function toProfile(row: ProfileRow): OwnerGuardianProfile {
  return {
    guardianId: row.guardian_id,
    givenName: row.given_name,
    familyName: row.family_name,
    updatedAt: row.updated_at,
  };
}

function versionConflict(): OperationalError {
  return new OperationalError(
    "VERSION_CONFLICT",
    "El perfil cambió desde la última lectura. Recarga los datos antes de guardar.",
    409
  );
}

export async function getOwnerGuardianProfile(
  input: GetOwnerGuardianProfileInput
): Promise<OwnerGuardianProfile> {
  const parsed = profileScopeSchema.parse(input);
  return db.transaction(async (tx) => {
    await assertOwnerGuardianProfileAccess(tx, parsed);
    return toProfile(await loadActiveGuardianProfile(tx, parsed));
  });
}

export async function updateOwnerGuardianProfile(
  command: UpdateOwnerGuardianProfileInput
): Promise<UpdatedOwnerGuardianProfile> {
  const parsedResult = updateGuardianProfileSchema.safeParse(command);
  if (!parsedResult.success) {
    throw new OperationalError(
      "INVALID_RELATION",
      "El nombre o los apellidos del tutor no son válidos.",
      422
    );
  }
  const input = parsedResult.data;
  if (
    input.givenName === input.expectedGivenName &&
    input.familyName === input.expectedFamilyName
  ) {
    throw new OperationalError(
      "INVALID_RELATION",
      "Indica un cambio en el nombre o los apellidos.",
      422
    );
  }
  const fingerprint = commandFingerprint(input);
  const scope: ParsedProfileScope = {
    organizationId: input.organizationId,
    locationId: input.locationId,
    guardianId: input.guardianId,
    actor: input.actor,
  };

  return db.transaction(async (tx) => {
    // lockCommand takes the organization row and then the idempotency key.
    // Guardian and shared person rows follow in that order.
    await lockCommand(tx, input.organizationId, input.idempotencyKey);
    await assertOwnerGuardianProfileAccess(tx, scope);
    await lockGuardianAndPerson(tx, scope);
    const current = await loadActiveGuardianProfile(tx, scope);
    const currentDto = toProfile(current);

    // A replay may be read while the organization has since entered read-only,
    // but only after the caller's current role, all-site scope and live family
    // anchor have been revalidated above.
    const prior = await findOutboxEvent(tx, {
      organizationId: input.organizationId,
      eventName: profileEventName,
      idempotencyKey: input.idempotencyKey,
    });
    if (prior) {
      if (prior.aggregateId !== input.guardianId) {
        throw new OperationalError(
          "IDEMPOTENCY_CONFLICT",
          "La clave ya pertenece a otro perfil de tutor.",
          409
        );
      }
      assertIdempotencyPayload(prior.payload, {
        actorUserId: input.actor.userId,
        actorMemberId: input.actor.memberId,
        commandFingerprint: fingerprint,
      });
      return { ...currentDto, replayed: true };
    }

    if (
      current.given_name !== input.expectedGivenName ||
      current.family_name !== input.expectedFamilyName ||
      current.updated_at !== input.expectedUpdatedAt
    ) {
      throw versionConflict();
    }

    await assertOwnerGuardianProfileAccess(tx, scope, "write");
    const updated = await tx.execute(sql`
      update zaltyko.people as person
      set given_name = ${input.givenName},
          family_name = ${input.familyName},
          updated_at = greatest(clock_timestamp(), person.updated_at + interval '1 microsecond')
      where person.organization_id = ${input.organizationId}::uuid
        and person.id = ${current.person_id}::uuid
        and person.given_name = ${input.expectedGivenName}
        and person.family_name = ${input.expectedFamilyName}
        and person.updated_at = ${input.expectedUpdatedAt}::timestamptz
      returning
        person.id,
        person.given_name,
        person.family_name,
        to_char(person.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as updated_at
    `);
    const after = updated.rows[0] as unknown as {
      id?: unknown;
      given_name?: unknown;
      family_name?: unknown;
      updated_at?: unknown;
    } | undefined;
    if (
      !after ||
      typeof after.id !== "string" ||
      after.id !== current.person_id ||
      typeof after.given_name !== "string" ||
      typeof after.family_name !== "string" ||
      typeof after.updated_at !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u.test(after.updated_at)
    ) {
      throw versionConflict();
    }

    const changedFields = [
      ...(input.givenName === current.given_name ? [] : ["givenName"]),
      ...(input.familyName === current.family_name ? [] : ["familyName"]),
    ];
    const occurredAt = new Date();
    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId: input.locationId,
      eventName: profileEventName,
      aggregateType: "guardian",
      aggregateId: input.guardianId,
      idempotencyKey: input.idempotencyKey,
      occurredAt,
      payload: {
        actorUserId: input.actor.userId,
        actorMemberId: input.actor.memberId,
        commandFingerprint: fingerprint,
        changedFields,
      },
    });
    await appendAuditEntry(tx, {
      organizationId: input.organizationId,
      locationId: input.locationId,
      actorUserId: input.actor.userId,
      action: profileEventName,
      targetType: "guardian",
      targetId: input.guardianId,
      idempotencyKey: input.idempotencyKey,
      before: { changedFields },
      after: { changedFields, updated: true },
      metadata: { commandFingerprint: fingerprint },
    });

    return {
      guardianId: input.guardianId,
      givenName: after.given_name,
      familyName: after.family_name,
      updatedAt: after.updated_at,
      replayed: false,
    };
  });
}
