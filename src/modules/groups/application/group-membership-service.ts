import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  auditLog,
  athletes,
  groupMemberships,
  groupMembershipHistory,
  groups,
  locations,
  outboxEvents,
  people,
  type GroupMembership,
} from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import { operationalActorSchema } from "@/modules/shared/application/actor";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { resolveEffectiveOrganizationEntitlement } from "@/modules/saas-billing/application/entitlement-service";
import { assertOrganizationOperationalWritable } from "@/modules/saas-billing/application/organization-usage";
import { assertOrganizationAthleteCapacity } from "./organization-athlete-capacity";
import { assertOperationalAccess } from "@/modules/shared/infrastructure/operational-authorization";
import { matchesAthleteCreateAuditAfter } from "./athlete-create-audit-contract";
import { hasEligibleGroupLocationRelationship } from "./group-athlete-location-eligibility";
import {
  appendAuditEntry,
  appendOutboxEvent,
  assertIdempotencyPayload,
  findOutboxEvent,
  lockCommand,
  lockGroupCapacity,
} from "@/modules/shared/infrastructure/transactional-records";

const commandKeySchema = z.string().trim().min(8).max(180);
const openStatuses = ["pending", "active", "paused"] as const;
const openStatusSchema = z.enum(openStatuses);
const membershipReasonCodes = [
  "academy_request",
  "family_request",
  "athlete_request",
  "schedule_change",
  "temporary_pause",
  "other",
] as const;
type MembershipStatus = GroupMembership["status"];

const addMembershipSchema = z.object({
  organizationId: z.string().uuid(),
  groupId: z.string().uuid(),
  athleteId: z.string().uuid(),
  startsOn: z.string().date(),
  status: z.enum(["pending", "active"]),
  idempotencyKey: commandKeySchema,
  actor: operationalActorSchema,
});

const personNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value))
  .transform((value) => value.normalize("NFC").replace(/\s+/gu, " "));

const createAthleteForGroupSchema = z.object({
  organizationId: z.string().uuid(),
  groupId: z.string().uuid(),
  givenName: personNameSchema,
  familyName: personNameSchema,
  idempotencyKey: commandKeySchema,
  actor: operationalActorSchema,
});

const transitionMembershipSchema = z.object({
  organizationId: z.string().uuid(),
  membershipId: z.string().uuid(),
  groupId: z.string().uuid().optional(),
  expectedStatus: openStatusSchema,
  toStatus: z.enum(["active", "paused", "ended"]),
  effectiveOn: z.string().date(),
  reasonCode: z.enum(membershipReasonCodes).nullable().optional(),
  idempotencyKey: commandKeySchema,
  actor: operationalActorSchema,
});

export type AddGroupMembershipCommand = z.infer<typeof addMembershipSchema>;
export type CreateAthleteForGroupCommand = z.infer<
  typeof createAthleteForGroupSchema
>;
export type TransitionGroupMembershipCommand = z.infer<
  typeof transitionMembershipSchema
>;

const recoverCreatedAthleteSchema = z.object({
  organizationId: z.string().uuid(),
  groupId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(150),
  actor: operationalActorSchema,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const privilegedRoles = ["owner", "manager", "admin"] as const;

async function loadMembership(
  tx: TransactionClient,
  organizationId: string,
  membershipId: string,
  options: { priorResult?: boolean } = {}
): Promise<GroupMembership> {
  const [membership] = await tx
    .select()
    .from(groupMemberships)
    .where(
      and(
        eq(groupMemberships.organizationId, organizationId),
        eq(groupMemberships.id, membershipId)
      )
    )
    .limit(1);

  if (!membership) {
    throw new OperationalError(
      options.priorResult ? "IDEMPOTENCY_CONFLICT" : "NOT_FOUND",
      options.priorResult ? "No se puede recuperar el resultado de la operación anterior" : "Pertenencia al grupo no encontrada",
      options.priorResult ? 409 : 404
    );
  }
  return membership;
}

async function assertGroupAccess(
  tx: TransactionClient,
  input: {
    organizationId: string;
    groupId: string;
    actor: AddGroupMembershipCommand["actor"];
    requireActive?: boolean;
    intent?: "read" | "write";
  }
): Promise<{
  id: string;
  locationId: string;
  capacity: number | null;
  status: string;
}> {
  const [group] = await tx
    .select({
      id: groups.id,
      locationId: groups.locationId,
      capacity: groups.capacity,
      status: groups.status,
    })
    .from(groups)
    .where(
      and(
        eq(groups.organizationId, input.organizationId),
        eq(groups.id, input.groupId)
      )
    )
    .limit(1);

  if (!group || (input.requireActive !== false && group.status !== "active")) {
    throw new OperationalError("NOT_FOUND", "Grupo activo no encontrado", 404);
  }

  await assertOperationalAccess(tx, {
    organizationId: input.organizationId,
    locationId: group.locationId,
    actor: input.actor,
    intent: input.intent === "read" ? undefined : "write",
    allowedRoles: privilegedRoles,
  });

  return group;
}

async function loadMembershipFromEvent(
  tx: TransactionClient,
  input: {
    organizationId: string;
    eventName: string;
    idempotencyKey: string;
    expectedPayload: Record<string, string | number | boolean | null>;
  }
): Promise<GroupMembership | null> {
  const event = await findOutboxEvent(tx, input);
  if (!event) return null;

  assertIdempotencyPayload(event.payload, input.expectedPayload);
  const membershipId = z.string().uuid().safeParse(event.payload.membershipId);
  if (!membershipId.success || event.aggregateId !== membershipId.data) {
    throw new OperationalError(
      "IDEMPOTENCY_CONFLICT",
      "El registro de la operación anterior no identifica una pertenencia coherente",
      409
    );
  }
  return loadMembership(tx, input.organizationId, membershipId.data, { priorResult: true });
}

export async function addGroupMembership(
  command: AddGroupMembershipCommand
): Promise<GroupMembership> {
  const input = addMembershipSchema.parse(command);
  const eventName = "group.membership_added";

  return db.transaction(async (tx) => {
    await lockCommand(tx, input.organizationId, input.idempotencyKey);

    const prior = await loadMembershipFromEvent(tx, {
      organizationId: input.organizationId,
      eventName,
      idempotencyKey: input.idempotencyKey,
      expectedPayload: {
        groupId: input.groupId,
        startsOn: input.startsOn,
        status: input.status,
      },
    });
    if (prior) {
      if (
        prior.athleteId !== input.athleteId ||
        prior.groupId !== input.groupId
      ) {
        throw new OperationalError(
          "IDEMPOTENCY_CONFLICT",
          "La clave de idempotencia ya pertenece a otra persona o grupo",
          409
        );
      }
      await assertGroupAccess(tx, {
        organizationId: input.organizationId,
        groupId: prior.groupId,
        actor: input.actor,
        requireActive: false,
        intent: "read",
      });
      return prior;
    }

    const group = await assertGroupAccess(tx, {
      organizationId: input.organizationId,
      groupId: input.groupId,
      actor: input.actor,
    });

    const [eligibleAthlete] = await tx
      .select({ id: athletes.id })
      .from(athletes)
      .where(
        and(
          eq(athletes.organizationId, input.organizationId),
          eq(athletes.id, input.athleteId),
          eq(athletes.isActive, true),
          hasEligibleGroupLocationRelationship({
            organizationId: input.organizationId,
            groupId: input.groupId,
            locationId: group.locationId,
          })
        )
      )
      .limit(1);
    if (!eligibleAthlete) {
      throw new OperationalError("NOT_FOUND", "Atleta activo no encontrado", 404);
    }

    await lockGroupCapacity(tx, input.organizationId, group.id);

    const [existing] = await tx
      .select({ id: groupMemberships.id })
      .from(groupMemberships)
      .where(
        and(
          eq(groupMemberships.organizationId, input.organizationId),
          eq(groupMemberships.groupId, input.groupId),
          eq(groupMemberships.athleteId, input.athleteId),
          inArray(groupMemberships.status, [...openStatuses])
        )
      )
      .limit(1);
    if (existing) {
      throw new OperationalError(
        "DUPLICATE_OPEN_GROUP_MEMBERSHIP",
        "La gimnasta ya pertenece a este grupo",
        409
      );
    }

    if (group.capacity !== null) {
      const [occupancy] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(groupMemberships)
        .where(
          and(
            eq(groupMemberships.organizationId, input.organizationId),
            eq(groupMemberships.groupId, input.groupId),
            inArray(groupMemberships.status, [...openStatuses])
          )
        );
      if (Number(occupancy?.count ?? 0) >= group.capacity) {
        throw new OperationalError(
          "GROUP_CAPACITY_FULL",
          "El grupo no tiene plazas disponibles",
          409
        );
      }
    }

    const [membership] = await tx
      .insert(groupMemberships)
      .values({
        organizationId: input.organizationId,
        groupId: input.groupId,
        athleteId: input.athleteId,
        startsOn: input.startsOn,
        status: input.status,
      })
      .returning();

    await tx.insert(groupMembershipHistory).values({
      organizationId: input.organizationId,
      membershipId: membership.id,
      fromStatus: null,
      toStatus: membership.status,
      changedByMemberId: input.actor.memberId,
      idempotencyKey: input.idempotencyKey,
      effectiveOn: input.startsOn,
    });

    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId: group.locationId,
      eventName,
      aggregateType: "group_membership",
      aggregateId: membership.id,
      idempotencyKey: input.idempotencyKey,
      payload: {
        membershipId: membership.id,
        groupId: membership.groupId,
        startsOn: membership.startsOn,
        status: membership.status,
      },
    });
    await appendAuditEntry(tx, {
      organizationId: input.organizationId,
      locationId: group.locationId,
      actorUserId: input.actor.userId,
      action: eventName,
      targetType: "group_membership",
      targetId: membership.id,
      idempotencyKey: input.idempotencyKey,
      after: {
        groupId: membership.groupId,
        athleteId: membership.athleteId,
        startsOn: membership.startsOn,
        status: membership.status,
      },
    });

    return membership;
  });
}

/**
 * Creates a minimal athlete record and its first group membership atomically.
 * Names stay in the operational tables; outbox and audit payloads contain IDs
 * and scope only. Family, enrollment, consent, and billing are separate flows.
 */
export async function createAthleteForGroup(
  command: CreateAthleteForGroupCommand
): Promise<GroupMembership> {
  const input = createAthleteForGroupSchema.parse(command);
  const createEventName = "athlete.created";
  const membershipEventName = "group.membership_added";

  return db.transaction(async (tx) => {
    await lockCommand(tx, input.organizationId, input.idempotencyKey);

    const priorCreate = await findOutboxEvent(tx, {
      organizationId: input.organizationId,
      eventName: createEventName,
      idempotencyKey: input.idempotencyKey,
    });
    if (priorCreate) {
      const priorMembershipEvent = await findOutboxEvent(tx, {
        organizationId: input.organizationId,
        eventName: membershipEventName,
        idempotencyKey: input.idempotencyKey,
      });
      if (!priorMembershipEvent) {
        throw new OperationalError(
          "IDEMPOTENCY_CONFLICT",
          "El alta anterior no contiene la pertenencia esperada",
          409
        );
      }

      const athleteId = priorCreate.aggregateId;
      const membershipId = priorMembershipEvent.aggregateId;
      assertIdempotencyPayload(priorMembershipEvent.payload, {
        groupId: input.groupId,
        athleteId,
      });
      await assertGroupAccess(tx, {
        organizationId: input.organizationId,
        groupId: input.groupId,
        actor: input.actor,
        requireActive: false,
        intent: "read",
      });

      const [existingAthlete] = await tx
        .select({
          id: athletes.id,
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
            eq(athletes.id, athleteId)
          )
        )
        .limit(1);
      if (!existingAthlete) {
        throw new OperationalError(
          "IDEMPOTENCY_CONFLICT",
          "La ficha creada anteriormente ya no está disponible",
          409
        );
      }
      if (
        existingAthlete.givenName !== input.givenName ||
        existingAthlete.familyName !== input.familyName
      ) {
        throw new OperationalError(
          "IDEMPOTENCY_CONFLICT",
          "La clave de idempotencia ya fue usada con otros datos",
          409
        );
      }

      const membership = await loadMembership(
        tx,
        input.organizationId,
        membershipId,
        { priorResult: true }
      );
      if (
        membership.athleteId !== athleteId ||
        membership.groupId !== input.groupId
      ) {
        throw new OperationalError(
          "IDEMPOTENCY_CONFLICT",
          "La clave de idempotencia pertenece a otra pertenencia",
          409
        );
      }
      return membership;
    }

    const priorMembershipEvent = await findOutboxEvent(tx, {
      organizationId: input.organizationId,
      eventName: membershipEventName,
      idempotencyKey: input.idempotencyKey,
    });
    if (priorMembershipEvent) {
      throw new OperationalError(
        "IDEMPOTENCY_CONFLICT",
        "La clave de idempotencia ya pertenece a otra operación",
        409
      );
    }

    const group = await assertGroupAccess(tx, {
      organizationId: input.organizationId,
      groupId: input.groupId,
      actor: input.actor,
    });
    await assertOrganizationAthleteCapacity(
      tx,
      input.organizationId,
      async (transaction, organizationId) =>
        (
          await resolveEffectiveOrganizationEntitlement(
            transaction,
            organizationId
          )
        ).limits.athleteLimit
    );
    await lockGroupCapacity(tx, input.organizationId, group.id);

    const [dateRow] = await tx
      .select({
        localDate: sql<string>`(current_timestamp at time zone ${locations.timezone})::date::text`,
      })
      .from(groups)
      .innerJoin(
        locations,
        and(
          eq(locations.organizationId, groups.organizationId),
          eq(locations.id, groups.locationId)
        )
      )
      .where(
        and(
          eq(groups.organizationId, input.organizationId),
          eq(groups.id, group.id),
          eq(locations.isActive, true)
        )
      )
      .limit(1);
    if (!dateRow) {
      throw new OperationalError(
        "LOCATION_SCOPE_DENIED",
        "La sede del grupo no está disponible",
        404
      );
    }

    if (group.capacity !== null) {
      const [occupancy] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(groupMemberships)
        .where(
          and(
            eq(groupMemberships.organizationId, input.organizationId),
            eq(groupMemberships.groupId, group.id),
            inArray(groupMemberships.status, [...openStatuses])
          )
        );
      if (Number(occupancy?.count ?? 0) >= group.capacity) {
        throw new OperationalError(
          "GROUP_CAPACITY_FULL",
          "El grupo no tiene plazas disponibles",
          409
        );
      }
    }

    const [person] = await tx
      .insert(people)
      .values({
        organizationId: input.organizationId,
        givenName: input.givenName,
        familyName: input.familyName,
      })
      .returning({ id: people.id });
    const [athlete] = await tx
      .insert(athletes)
      .values({
        organizationId: input.organizationId,
        personId: person.id,
      })
      .returning({ id: athletes.id });
    const [membership] = await tx
      .insert(groupMemberships)
      .values({
        organizationId: input.organizationId,
        groupId: group.id,
        athleteId: athlete.id,
        startsOn: dateRow.localDate,
        status: "active",
      })
      .returning();

    await tx.insert(groupMembershipHistory).values({
      organizationId: input.organizationId,
      membershipId: membership.id,
      fromStatus: null,
      toStatus: membership.status,
      changedByMemberId: input.actor.memberId,
      idempotencyKey: input.idempotencyKey,
      effectiveOn: membership.startsOn,
    });

    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId: group.locationId,
      eventName: createEventName,
      aggregateType: "athlete",
      aggregateId: athlete.id,
      idempotencyKey: input.idempotencyKey,
      payload: { athleteId: athlete.id },
    });
    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId: group.locationId,
      eventName: membershipEventName,
      aggregateType: "group_membership",
      aggregateId: membership.id,
      idempotencyKey: input.idempotencyKey,
      payload: {
        membershipId: membership.id,
        groupId: group.id,
        athleteId: athlete.id,
        startsOn: membership.startsOn,
        status: membership.status,
      },
    });
    await appendAuditEntry(tx, {
      organizationId: input.organizationId,
      locationId: group.locationId,
      actorUserId: input.actor.userId,
      action: "athlete.created_and_added_to_group",
      targetType: "athlete",
      targetId: athlete.id,
      idempotencyKey: `athlete-created:${input.idempotencyKey}`,
      after: {
        groupId: group.id,
        membershipId: membership.id,
      },
    });

    return membership;
  });
}

/**
 * Recovers only the ID-based receipt for an athlete-create operation. Names
 * never leave the operational tables; both outbox events and the matching
 * human audit entry must agree before a receipt is exposed.
 */
export async function recoverCreatedAthleteForGroup(
  command: z.input<typeof recoverCreatedAthleteSchema>
): Promise<GroupMembership | null> {
  const input = recoverCreatedAthleteSchema.parse(command);
  return db.transaction(async (tx) => {
    const group = await assertGroupAccess(tx, {
      organizationId: input.organizationId,
      groupId: input.groupId,
      actor: input.actor,
      requireActive: false,
      intent: "read",
    });
    const events = await tx
      .select()
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.organizationId, input.organizationId),
          eq(outboxEvents.idempotencyKey, input.idempotencyKey)
        )
      )
      .limit(3);
    const [audit] = await tx
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, input.organizationId),
          eq(auditLog.idempotencyKey, `athlete-created:${input.idempotencyKey}`)
        )
      )
      .limit(2);

    if (events.length === 0 && !audit) return null;
    if (events.length !== 2 || !audit) {
      throw new OperationalError(
        "IDEMPOTENCY_CONFLICT",
        "El alta anterior tiene un recibo incompleto y requiere revisión",
        409
      );
    }

    const createEvent = events.find((event) => event.eventName === "athlete.created");
    const membershipEvent = events.find((event) => event.eventName === "group.membership_added");
    const athleteId = createEvent?.aggregateId;
    const membershipId = membershipEvent?.aggregateId;
    const createPayload = createEvent?.payload;
    const membershipPayload = membershipEvent?.payload;
    if (
      !createEvent || !membershipEvent ||
      createEvent.eventVersion !== 1 || membershipEvent.eventVersion !== 1 ||
      createEvent.aggregateType !== "athlete" || membershipEvent.aggregateType !== "group_membership" ||
      !athleteId || !membershipId ||
      !isRecord(createPayload) || !isRecord(membershipPayload) ||
      Object.keys(createPayload).sort().join(",") !== "athleteId" ||
      Object.keys(membershipPayload).sort().join(",") !== "athleteId,groupId,membershipId,startsOn,status" ||
      createPayload.athleteId !== athleteId ||
      membershipPayload.membershipId !== membershipId ||
      audit.action !== "athlete.created_and_added_to_group" ||
      audit.targetType !== "athlete" || audit.targetId !== athleteId ||
      audit.actorUserId !== input.actor.userId ||
      !matchesAthleteCreateAuditAfter(audit.after, input.groupId, membershipId) ||
      !z.string().date().safeParse(membershipPayload.startsOn).success ||
      membershipPayload.status !== "active"
    ) {
      throw new OperationalError(
        "IDEMPOTENCY_CONFLICT",
        "El recibo del alta no coincide con la operación y el actor actuales",
        409
      );
    }

    assertIdempotencyPayload(membershipPayload, {
      groupId: input.groupId,
      athleteId,
    });
    if (
      createEvent.locationId !== membershipEvent.locationId ||
      audit.locationId !== membershipEvent.locationId
    ) {
      throw new OperationalError(
        "IDEMPOTENCY_CONFLICT",
        "El recibo del alta contiene datos de alcance incoherentes",
        409
      );
    }

    if (group.locationId !== membershipEvent.locationId) {
      throw new OperationalError(
        "IDEMPOTENCY_CONFLICT",
        "La pertenencia anterior ya no coincide con el alcance de la sede",
        409
      );
    }

    const membership = await loadMembership(tx, input.organizationId, membershipId, { priorResult: true });
    if (
      membership.athleteId !== athleteId ||
      membership.groupId !== input.groupId ||
      membership.startsOn !== membershipPayload.startsOn
    ) {
      throw new OperationalError(
        "IDEMPOTENCY_CONFLICT",
        "La pertenencia actual no coincide con el recibo del alta",
        409
      );
    }
    return membership;
  });
}

function canTransition(from: MembershipStatus, to: MembershipStatus): boolean {
  if (from === "pending") return to === "active" || to === "ended";
  if (from === "active") return to === "paused" || to === "ended";
  if (from === "paused") return to === "active" || to === "ended";
  return false;
}

async function assertEffectiveDate(
  tx: TransactionClient,
  input: {
    organizationId: string;
    groupId: string;
    membershipId: string;
    effectiveOn: string;
    startsOn: string;
  }
): Promise<string> {
  const result = await tx
    .select({
      localDate: sql<string>`(current_timestamp at time zone ${locations.timezone})::date::text`,
    })
    .from(groups)
    .innerJoin(
      locations,
      and(
        eq(locations.organizationId, groups.organizationId),
        eq(locations.id, groups.locationId)
      )
    )
    .where(
      and(
        eq(groups.organizationId, input.organizationId),
        eq(groups.id, input.groupId)
      )
    )
    .limit(1);
  const localDate = result[0]?.localDate;
  if (!localDate) {
    throw new OperationalError("NOT_FOUND", "Grupo no encontrado", 404);
  }
  const [latestHistory] = await tx
    .select({
      effectiveOn: sql<
        string | null
      >`max(${groupMembershipHistory.effectiveOn})::text`,
    })
    .from(groupMembershipHistory)
    .where(
      and(
        eq(groupMembershipHistory.organizationId, input.organizationId),
        eq(groupMembershipHistory.membershipId, input.membershipId)
      )
    );
  if (
    input.effectiveOn > localDate ||
    input.effectiveOn < input.startsOn ||
    (latestHistory?.effectiveOn &&
      input.effectiveOn < latestHistory.effectiveOn)
  ) {
    throw new OperationalError(
      "INVALID_DATE_RANGE",
      "La fecha efectiva debe respetar el inicio, el último cambio y hoy",
      409
    );
  }
  return localDate;
}

export async function transitionGroupMembership(
  command: TransitionGroupMembershipCommand
): Promise<GroupMembership> {
  const input = transitionMembershipSchema.parse(command);
  const eventName = `group.membership_${input.toStatus}`;

  return db.transaction(async (tx) => {
    await lockCommand(tx, input.organizationId, input.idempotencyKey);
    await tx.execute(sql`
      select id
      from zaltyko.group_memberships
      where organization_id = ${input.organizationId}::uuid
        and id = ${input.membershipId}::uuid
      for update
    `);

    const current = await loadMembership(
      tx,
      input.organizationId,
      input.membershipId
    );
    if (input.groupId && current.groupId !== input.groupId) {
      throw new OperationalError("NOT_FOUND", "Pertenencia no encontrada", 404);
    }
    const group = await assertGroupAccess(tx, {
      organizationId: input.organizationId,
      groupId: current.groupId,
      actor: input.actor,
      requireActive: false,
      intent: "read",
    });

    const prior = await loadMembershipFromEvent(tx, {
      organizationId: input.organizationId,
      eventName,
      idempotencyKey: input.idempotencyKey,
      expectedPayload: {
        membershipId: input.membershipId,
        fromStatus: input.expectedStatus,
        toStatus: input.toStatus,
        effectiveOn: input.effectiveOn,
        reasonCode: input.reasonCode ?? null,
      },
    });
    if (prior) return prior;

    // Reading an authorized prior result is not a new operational write.
    await assertOrganizationOperationalWritable(tx, input.organizationId);

    if (current.status !== input.expectedStatus) {
      throw new OperationalError(
        "VERSION_CONFLICT",
        "La pertenencia al grupo cambió desde la última lectura",
        409
      );
    }
    if (!canTransition(current.status, input.toStatus)) {
      throw new OperationalError(
        "INVALID_STATE_TRANSITION",
        "No se permite este cambio de estado de pertenencia",
        409
      );
    }
    if (input.toStatus === "active" && group.status !== "active") {
      throw new OperationalError(
        "INVALID_STATE_TRANSITION",
        "No se puede reactivar una pertenencia en un grupo inactivo",
        409
      );
    }

    await assertEffectiveDate(tx, {
      organizationId: input.organizationId,
      groupId: current.groupId,
      membershipId: current.id,
      effectiveOn: input.effectiveOn,
      startsOn: current.startsOn,
    });

    const [updated] = await tx
      .update(groupMemberships)
      .set({
        status: input.toStatus,
        endsOn: input.toStatus === "ended" ? input.effectiveOn : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(groupMemberships.organizationId, input.organizationId),
          eq(groupMemberships.id, input.membershipId),
          eq(groupMemberships.status, input.expectedStatus)
        )
      )
      .returning();
    if (!updated) {
      throw new OperationalError(
        "VERSION_CONFLICT",
        "La pertenencia al grupo cambió desde la última lectura",
        409
      );
    }

    await tx.insert(groupMembershipHistory).values({
      organizationId: input.organizationId,
      membershipId: updated.id,
      fromStatus: current.status,
      toStatus: updated.status,
      reasonCode: input.reasonCode ?? null,
      changedByMemberId: input.actor.memberId,
      idempotencyKey: input.idempotencyKey,
      effectiveOn: input.effectiveOn,
    });

    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId: group.locationId,
      eventName,
      aggregateType: "group_membership",
      aggregateId: updated.id,
      idempotencyKey: input.idempotencyKey,
      payload: {
        membershipId: updated.id,
        groupId: updated.groupId,
        fromStatus: current.status,
        toStatus: updated.status,
        effectiveOn: input.effectiveOn,
        reasonCode: input.reasonCode ?? null,
      },
    });
    await appendAuditEntry(tx, {
      organizationId: input.organizationId,
      locationId: group.locationId,
      actorUserId: input.actor.userId,
      action: eventName,
      targetType: "group_membership",
      targetId: updated.id,
      idempotencyKey: input.idempotencyKey,
      before: {
        status: current.status,
        startsOn: current.startsOn,
        endsOn: current.endsOn,
      },
      after: {
        status: updated.status,
        startsOn: updated.startsOn,
        endsOn: updated.endsOn,
        effectiveOn: input.effectiveOn,
      },
      metadata: input.reasonCode ? { reasonCode: input.reasonCode } : {},
    });

    return updated;
  });
}
