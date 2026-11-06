import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { auditLog, locations } from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { assertOperationalAccess } from "@/modules/shared/infrastructure/operational-authorization";
import {
  appendAuditEntry,
  appendOutboxEvent,
  assertIdempotencyPayload,
  findOutboxEvent,
  lockCommand,
} from "@/modules/shared/infrastructure/transactional-records";

const normalizedGuid = z.guid().transform((value) => value.toLowerCase());
const archiveActorSchema = z
  .object({ userId: normalizedGuid, memberId: normalizedGuid })
  .strict();

const archiveInputSchema = z
  .object({
    userId: normalizedGuid,
    organizationId: normalizedGuid,
    locationId: normalizedGuid,
    athleteId: normalizedGuid,
    idempotencyKey: z.string().trim().min(8).max(180),
    actor: archiveActorSchema,
  })
  .strict();
const archiveReceiptPayloadSchema = z
  .object({
    resource: z.literal("athletes"),
    resourceId: normalizedGuid,
    athleteId: normalizedGuid,
    commandFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    isActive: z.literal(false),
    changed: z.boolean(),
  })
  .strict();

const archiveEventName = "saas.resource_archived";
const archiveRoles = ["owner", "admin"] as const;

type ArchiveInput = z.infer<typeof archiveInputSchema>;
type ArchiveCommand = z.input<typeof archiveInputSchema>;

export type ArchivedOwnerAthlete = {
  athleteId: string;
  isActive: false;
  replayed: boolean;
};

function commandFingerprint(input: ArchiveInput, personId: string): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        organizationId: input.organizationId,
        locationId: input.locationId,
        athleteId: input.athleteId,
        personId,
        actor: input.actor,
      })
    )
    .digest("hex");
}

async function lockAthlete(
  tx: TransactionClient,
  input: Pick<ArchiveInput, "organizationId" | "athleteId">
): Promise<{ athleteId: string; personId: string; isActive: boolean }> {
  const result = await tx.execute(sql`
    select athlete.id as athlete_id,
           athlete.person_id,
           athlete.is_active
    from zaltyko.athletes as athlete
    join zaltyko.people as person
      on person.organization_id = athlete.organization_id
     and person.id = athlete.person_id
    where athlete.organization_id = ${input.organizationId}::uuid
      and athlete.id = ${input.athleteId}::uuid
    for update of athlete, person
  `);
  const row = result.rows[0] as
    | { athlete_id: string; person_id: string; is_active: boolean }
    | undefined;

  if (!row) {
    throw new OperationalError("NOT_FOUND", "Gimnasta no encontrada", 404);
  }
  const athleteId = z.guid().safeParse(row.athlete_id);
  const personId = z.guid().safeParse(row.person_id);
  const isActive = z.boolean().safeParse(row.is_active);
  if (!athleteId.success || !personId.success || !isActive.success) {
    throw new OperationalError(
      "FEATURE_NOT_AVAILABLE",
      "No se pudo comprobar la identidad actual de la gimnasta",
      503
    );
  }

  return {
    athleteId: athleteId.data,
    personId: personId.data,
    isActive: isActive.data,
  };
}

function assertArchiveReceipt(
  prior: NonNullable<Awaited<ReturnType<typeof findOutboxEvent>>>,
  input: ArchiveInput,
  fingerprint: string
): void {
  const payload = archiveReceiptPayloadSchema.safeParse(prior.payload);
  if (
    prior.aggregateType !== "athletes" ||
    prior.aggregateId !== input.athleteId ||
    !payload.success
  ) {
    throw new OperationalError(
      "IDEMPOTENCY_CONFLICT",
      "La clave ya pertenece a otra operación o ficha",
      409
    );
  }

  assertIdempotencyPayload(payload.data, {
    resource: "athletes",
    resourceId: input.athleteId,
    athleteId: input.athleteId,
    commandFingerprint: fingerprint,
    isActive: false,
  });
}

/**
 * Archives one canonical athlete without consulting the SaaS operational-write
 * gate. This is a capacity-reducing Owner action: all ordinary operational
 * writes remain subject to their existing plan and billing guards.
 */
export async function archiveOwnerAthleteInTransaction(
  tx: TransactionClient,
  command: ArchiveCommand
): Promise<ArchivedOwnerAthlete> {
  const input = archiveInputSchema.parse(command);
  if (input.actor.userId !== input.userId) {
    throw new OperationalError(
      "FORBIDDEN",
      "La identidad de la sesión no coincide con el miembro activo",
      403
    );
  }

  // lockCommand locks the organization row before taking the command advisory
  // lock. The athlete/person row lock below is therefore always last.
  await lockCommand(tx, input.organizationId, input.idempotencyKey);

  const [location] = await tx
    .select({ id: locations.id })
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
      "La sede no está activa en esta academia",
      403
    );
  }

  const member = await assertOperationalAccess(tx, {
    organizationId: input.organizationId,
    locationId: input.locationId,
    actor: input.actor,
    allowedRoles: archiveRoles,
  });
  if (member.locationScopeMode !== "all") {
    throw new OperationalError(
      "LOCATION_SCOPE_DENIED",
      "Archivar una ficha requiere acceso a todas las sedes de la academia",
      403
    );
  }

  // Verify the current athlete/person identity before resolving a receipt. A
  // stale replay must never reveal or acknowledge a different aggregate.
  const current = await lockAthlete(tx, input);
  const fingerprint = commandFingerprint(input, current.personId);
  const prior = await findOutboxEvent(tx, {
    organizationId: input.organizationId,
    eventName: archiveEventName,
    idempotencyKey: input.idempotencyKey,
  });
  if (prior) {
    assertArchiveReceipt(prior, input, fingerprint);
    if (current.isActive) {
      throw new OperationalError(
        "IDEMPOTENCY_CONFLICT",
        "La ficha cambió después de archivarse; la clave no se puede reutilizar",
        409
      );
    }
    return { athleteId: current.athleteId, isActive: false, replayed: true };
  }

  // Audit keys are unique per organization across commands, not only per
  // event. Detect collisions before mutating so the caller gets a stable 409.
  const [priorAudit] = await tx
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.organizationId, input.organizationId),
        eq(auditLog.idempotencyKey, input.idempotencyKey)
      )
    )
    .limit(1);
  if (priorAudit) {
    throw new OperationalError(
      "IDEMPOTENCY_CONFLICT",
      "La clave ya se utilizó en otra operación",
      409
    );
  }

  let changed = false;
  if (current.isActive) {
    await tx.execute(sql`
      with candidates as materialized (
        select membership.id,
               membership.status,
               greatest(
                 membership.starts_on,
                 least(
                   coalesce(
                     membership.ends_on,
                     (current_timestamp at time zone location.timezone)::date
                   ),
                   (current_timestamp at time zone location.timezone)::date
                 )
               ) as ends_on
        from zaltyko.group_memberships as membership
        join zaltyko.groups as academy_group
          on academy_group.organization_id = membership.organization_id
         and academy_group.id = membership.group_id
        join zaltyko.locations as location
          on location.organization_id = academy_group.organization_id
         and location.id = academy_group.location_id
        where membership.organization_id = ${input.organizationId}::uuid
          and membership.athlete_id = ${input.athleteId}::uuid
          and membership.status in ('pending', 'active', 'paused')
        for update of membership
      ), changed as (
        update zaltyko.group_memberships as membership
        set status = 'ended', ends_on = candidates.ends_on,
            updated_at = current_timestamp
        from candidates
        where membership.organization_id = ${input.organizationId}::uuid
          and membership.id = candidates.id
        returning membership.id
      )
      insert into zaltyko.group_membership_history (
        organization_id, membership_id, from_status, to_status, reason_code,
        changed_by_member_id, idempotency_key, effective_on
      )
      select ${input.organizationId}::uuid, candidates.id, candidates.status,
             'ended', 'academy_request', ${member.id}::uuid,
             md5(${input.idempotencyKey} || candidates.id::text),
             candidates.ends_on
      from candidates join changed on changed.id = candidates.id
    `);

    await tx.execute(sql`
      with candidates as materialized (
        select enrollment.id,
               enrollment.status,
               greatest(
                 enrollment.starts_on,
                 least(
                   coalesce(
                     enrollment.ends_on,
                     (current_timestamp at time zone location.timezone)::date
                   ),
                   (current_timestamp at time zone location.timezone)::date
                 )
               ) as ends_on
        from zaltyko.enrollments as enrollment
        join zaltyko.locations as location
          on location.organization_id = enrollment.organization_id
         and location.id = enrollment.location_id
        where enrollment.organization_id = ${input.organizationId}::uuid
          and enrollment.athlete_id = ${input.athleteId}::uuid
          and enrollment.status in ('pending', 'trial', 'active', 'paused')
        for update of enrollment
      ), changed as (
        update zaltyko.enrollments as enrollment
        set status = 'cancelled', ends_on = candidates.ends_on,
            version = enrollment.version + 1, updated_at = current_timestamp
        from candidates
        where enrollment.organization_id = ${input.organizationId}::uuid
          and enrollment.id = candidates.id
        returning enrollment.id
      )
      insert into zaltyko.enrollment_status_history (
        organization_id, enrollment_id, from_status, to_status, reason_code,
        changed_by_member_id, idempotency_key, effective_on
      )
      select ${input.organizationId}::uuid, candidates.id, candidates.status,
             'cancelled', 'academy_request', ${member.id}::uuid,
             md5(${input.idempotencyKey} || candidates.id::text),
             candidates.ends_on
      from candidates join changed on changed.id = candidates.id
    `);

    const archived = await tx.execute(sql`
      update zaltyko.athletes
      set is_active = false, updated_at = current_timestamp
      where organization_id = ${input.organizationId}::uuid
        and id = ${input.athleteId}::uuid
        and person_id = ${current.personId}::uuid
        and is_active = true
      returning id
    `);
    if (!archived.rows[0]) {
      throw new OperationalError(
        "VERSION_CONFLICT",
        "La ficha cambió durante el archivo. Recarga antes de continuar.",
        409
      );
    }
    changed = true;
  }

  const payload = {
    resource: "athletes",
    resourceId: input.athleteId,
    athleteId: input.athleteId,
    commandFingerprint: fingerprint,
    isActive: false,
    changed,
  };

  await appendOutboxEvent(tx, {
    organizationId: input.organizationId,
    locationId: null,
    eventName: archiveEventName,
    aggregateType: "athletes",
    aggregateId: input.athleteId,
    idempotencyKey: input.idempotencyKey,
    payload,
  });
  await appendAuditEntry(tx, {
    organizationId: input.organizationId,
    locationId: input.locationId,
    actorUserId: input.userId,
    action: archiveEventName,
    targetType: "athletes",
    targetId: input.athleteId,
    idempotencyKey: input.idempotencyKey,
    before: { isActive: current.isActive },
    after: { isActive: false, changed },
    metadata: { commandFingerprint: fingerprint, reason: "owner_request" },
  });

  return { athleteId: current.athleteId, isActive: false, replayed: false };
}

export async function archiveOwnerAthlete(
  command: ArchiveCommand
): Promise<ArchivedOwnerAthlete> {
  return db.transaction((tx) => archiveOwnerAthleteInTransaction(tx, command));
}
