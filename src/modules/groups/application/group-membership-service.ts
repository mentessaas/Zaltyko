import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  athletes,
  groupMemberships,
  groupMembershipHistory,
  groups,
  locations,
  type GroupMembership,
} from "@/db/zaltyko-schema";
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

const transitionMembershipSchema = z.object({
  organizationId: z.string().uuid(),
  membershipId: z.string().uuid(),
  expectedStatus: openStatusSchema,
  toStatus: z.enum(["active", "paused", "ended"]),
  effectiveOn: z.string().date(),
  reasonCode: z.enum(membershipReasonCodes).nullable().optional(),
  idempotencyKey: commandKeySchema,
  actor: operationalActorSchema,
});

export type AddGroupMembershipCommand = z.infer<typeof addMembershipSchema>;
export type TransitionGroupMembershipCommand = z.infer<
  typeof transitionMembershipSchema
>;

const privilegedRoles = ["owner", "manager", "admin"] as const;

async function loadMembership(
  tx: TransactionClient,
  organizationId: string,
  membershipId: string
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
      "NOT_FOUND",
      "Pertenencia al grupo no encontrada",
      404
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
  const membershipId = event.payload.membershipId;
  if (typeof membershipId !== "string") return null;
  return loadMembership(tx, input.organizationId, membershipId);
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
      });
      return prior;
    }

    const group = await assertGroupAccess(tx, {
      organizationId: input.organizationId,
      groupId: input.groupId,
      actor: input.actor,
    });

    await lockGroupCapacity(tx, input.organizationId, group.id);

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
    const group = await assertGroupAccess(tx, {
      organizationId: input.organizationId,
      groupId: current.groupId,
      actor: input.actor,
      requireActive: false,
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
