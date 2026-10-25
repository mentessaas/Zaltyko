import { createHash } from "node:crypto";
import { and, asc, eq, inArray, notExists, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  athletes,
  groupMemberships,
  groups,
  locations,
  people,
  outboxEvents,
  programs,
} from "@/db/zaltyko-schema";
import { operationalActorSchema } from "@/modules/shared/application/actor";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { assertOperationalAccess } from "@/modules/shared/infrastructure/operational-authorization";
import {
  appendAuditEntry,
  appendOutboxEvent,
  assertIdempotencyPayload,
  findOutboxEvent,
  lockGroupCapacity,
  lockCommand,
} from "@/modules/shared/infrastructure/transactional-records";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { assertOrganizationResourceCapacity } from "@/modules/saas-billing/application/organization-usage";
import { selectOwnerGroup } from "./owner-group-selection";
import { hasEligibleGroupLocationRelationship } from "./group-athlete-location-eligibility";

const openMembershipStatuses = ["pending", "active", "paused"] as const;
const commandKeySchema = z.string().trim().min(8).max(180);
const groupDetailsUpdatedEvent = "group.details_updated";
const createGroupSchema = z.object({
  organizationId: z.string().uuid(),
  locationId: z.string().uuid(),
  programId: z.string().uuid().nullable(),
  name: z.string().trim().min(2).max(120),
  capacity: z.number().int().positive().max(5000).nullable(),
  idempotencyKey: commandKeySchema,
  actor: operationalActorSchema,
});

export type CreateGroupCommand = z.infer<typeof createGroupSchema>;

const updateGroupDetailsSchema = z
  .object({
    organizationId: z.string().uuid(),
    groupId: z.string().uuid(),
    expectedUpdatedAt: z.string().datetime({ precision: 6 }),
    name: z.string().trim().min(2).max(120).optional(),
    capacity: z.number().int().positive().max(5000).nullable().optional(),
    idempotencyKey: commandKeySchema,
    actor: operationalActorSchema,
  })
  .strict()
  .refine((input) => input.name !== undefined || input.capacity !== undefined, {
    message: "Indica el nuevo nombre o la nueva capacidad.",
  });

export type UpdateGroupDetailsCommand = z.infer<typeof updateGroupDetailsSchema>;

function groupLabelHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const privilegedRoles = ["owner", "manager", "admin"] as const;

export async function createOperationalGroup(command: CreateGroupCommand) {
  const input = createGroupSchema.parse(command);
  const eventName = "group.created";

  return db.transaction(async (tx) => {
    await lockCommand(tx, input.organizationId, input.idempotencyKey);

    const prior = await findOutboxEvent(tx, {
      organizationId: input.organizationId,
      eventName,
      idempotencyKey: input.idempotencyKey,
    });
    if (prior) {
      assertIdempotencyPayload(prior.payload, {
        locationId: input.locationId,
        programId: input.programId,
        capacity: input.capacity,
      });
      const groupId = prior.payload.groupId;
      if (typeof groupId !== "string") {
        throw new OperationalError(
          "IDEMPOTENCY_CONFLICT",
          "La clave de idempotencia no contiene el grupo esperado",
          409
        );
      }
      const [group] = await tx
        .select()
        .from(groups)
        .where(
          and(
            eq(groups.organizationId, input.organizationId),
            eq(groups.id, groupId)
          )
        )
        .limit(1);
      if (!group) {
        throw new OperationalError("NOT_FOUND", "Grupo no encontrado", 404);
      }
      if (
        group.name !== input.name ||
        group.locationId !== input.locationId ||
        group.programId !== input.programId ||
        group.capacity !== input.capacity
      ) {
        throw new OperationalError(
          "IDEMPOTENCY_CONFLICT",
          "La clave de idempotencia ya fue usada con otros parámetros",
          409
        );
      }
      await assertOperationalAccess(tx, {
        organizationId: input.organizationId,
        locationId: group.locationId,
        actor: input.actor,
        allowedRoles: privilegedRoles,
      });
      return group;
    }

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
        "La sede no está disponible en esta organización",
        404
      );
    }
    await assertOperationalAccess(tx, {
      organizationId: input.organizationId,
      locationId: input.locationId,
      actor: input.actor,
      intent: "write",
      allowedRoles: privilegedRoles,
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

    await assertOrganizationResourceCapacity(tx, input.organizationId, "groups");
    const [group] = await tx
      .insert(groups)
      .values({
        organizationId: input.organizationId,
        locationId: input.locationId,
        programId: input.programId,
        name: input.name,
        capacity: input.capacity,
        status: "active",
      })
      .returning();

    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId: input.locationId,
      eventName,
      aggregateType: "group",
      aggregateId: group.id,
      idempotencyKey: input.idempotencyKey,
      payload: {
        groupId: group.id,
        locationId: input.locationId,
        programId: input.programId,
        capacity: input.capacity,
      },
    });
    await appendAuditEntry(tx, {
      organizationId: input.organizationId,
      locationId: input.locationId,
      actorUserId: input.actor.userId,
      action: eventName,
      targetType: "group",
      targetId: group.id,
      idempotencyKey: input.idempotencyKey,
      after: {
        locationId: group.locationId,
        programId: group.programId,
        capacity: group.capacity,
        status: group.status,
      },
    });

    return group;
  });
}

export async function updateOperationalGroupDetails(
  command: UpdateGroupDetailsCommand
) {
  const input = updateGroupDetailsSchema.parse(command);

  return db.transaction(async (tx) => {
    await lockCommand(tx, input.organizationId, input.idempotencyKey);

    const prior = await findOutboxEvent(tx, {
      organizationId: input.organizationId,
      eventName: groupDetailsUpdatedEvent,
      idempotencyKey: input.idempotencyKey,
    });
    if (prior) {
      assertIdempotencyPayload(prior.payload, {
        groupId: input.groupId,
        expectedUpdatedAt: input.expectedUpdatedAt,
        requestedLabelDigest:
          input.name === undefined ? null : groupLabelHash(input.name),
        capacityProvided: input.capacity !== undefined,
        requestedCapacity: input.capacity ?? null,
      });
      if (prior.aggregateId !== input.groupId) {
        throw new OperationalError(
          "IDEMPOTENCY_CONFLICT",
          "La clave de idempotencia ya pertenece a otro grupo",
          409
        );
      }

      // Keep replay under the same resource lock order as the original write.
      // Otherwise a concurrent edit could change the row between verification
      // and receipt, or a membership write could race the capacity snapshot.
      await lockGroupCapacity(tx, input.organizationId, input.groupId);

      const [current] = await tx
        .select({
          id: groups.id,
          locationId: groups.locationId,
          name: groups.name,
          capacity: groups.capacity,
          status: groups.status,
          updatedAtVersion: sql<string>`to_char(${groups.updatedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
        })
        .from(groups)
        .where(
          and(
            eq(groups.organizationId, input.organizationId),
            eq(groups.id, input.groupId),
            eq(groups.status, "active")
          )
        )
        .limit(1);
      if (
        !current ||
        current.updatedAtVersion !== prior.payload.updatedAtVersion ||
        groupLabelHash(current.name) !== prior.payload.resultLabelDigest ||
        current.capacity !== prior.payload.resultCapacity
      ) {
        throw new OperationalError(
          "IDEMPOTENCY_CONFLICT",
          "El grupo cambió después de la operación pendiente. Actualiza la lista antes de continuar.",
          409
        );
      }
      const [activeLocation] = await tx
        .select({ id: locations.id })
        .from(locations)
        .where(
          and(
            eq(locations.organizationId, input.organizationId),
            eq(locations.id, current.locationId),
            eq(locations.isActive, true)
          )
        )
        .limit(1);
      if (!activeLocation) {
        throw new OperationalError(
          "LOCATION_SCOPE_DENIED",
          "La sede del grupo no está disponible",
          404
        );
      }
      await assertOperationalAccess(tx, {
        organizationId: input.organizationId,
        locationId: current.locationId,
        actor: input.actor,
        allowedRoles: privilegedRoles,
      });
      return current;
    }

    const [usedKey] = await tx
      .select({ id: outboxEvents.id })
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.organizationId, input.organizationId),
          eq(outboxEvents.idempotencyKey, input.idempotencyKey)
        )
      )
      .limit(1);
    if (usedKey) {
      throw new OperationalError(
        "IDEMPOTENCY_CONFLICT",
        "La clave de idempotencia ya pertenece a otra operación",
        409
      );
    }

    await lockGroupCapacity(tx, input.organizationId, input.groupId);
    const locked = await tx.execute(sql`
      select id from zaltyko.groups
      where organization_id = ${input.organizationId}::uuid
        and id = ${input.groupId}::uuid
        and status = 'active'
      for update
    `);
    if (locked.rows.length !== 1) {
      throw new OperationalError("NOT_FOUND", "Grupo activo no encontrado", 404);
    }

    const [current] = await tx
      .select({
        id: groups.id,
        locationId: groups.locationId,
        name: groups.name,
        capacity: groups.capacity,
        status: groups.status,
        updatedAtVersion: sql<string>`to_char(${groups.updatedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      })
      .from(groups)
      .where(
        and(
          eq(groups.organizationId, input.organizationId),
          eq(groups.id, input.groupId),
          eq(groups.status, "active")
        )
      )
      .limit(1);
    if (!current) {
      throw new OperationalError("NOT_FOUND", "Grupo activo no encontrado", 404);
    }
    const [activeLocation] = await tx
      .select({ id: locations.id })
      .from(locations)
      .where(
        and(
          eq(locations.organizationId, input.organizationId),
          eq(locations.id, current.locationId),
          eq(locations.isActive, true)
        )
      )
      .limit(1);
    if (!activeLocation) {
      throw new OperationalError(
        "LOCATION_SCOPE_DENIED",
        "La sede del grupo no está disponible",
        404
      );
    }
    await assertOperationalAccess(tx, {
      organizationId: input.organizationId,
      locationId: current.locationId,
      actor: input.actor,
      intent: "write",
      allowedRoles: privilegedRoles,
    });
    if (current.updatedAtVersion !== input.expectedUpdatedAt) {
      throw new OperationalError(
        "VERSION_CONFLICT",
        "El grupo cambió desde la última lectura. Actualiza la lista y vuelve a intentarlo.",
        409
      );
    }

    const nextName = input.name ?? current.name;
    const nextCapacity =
      input.capacity === undefined ? current.capacity : input.capacity;
    if (nextName === current.name && nextCapacity === current.capacity) {
      throw new OperationalError(
        "INVALID_RELATION",
        "No hay cambios que guardar",
        422
      );
    }

    if (nextCapacity !== current.capacity && nextCapacity !== null) {
      const [occupancy] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(groupMemberships)
        .where(
          and(
            eq(groupMemberships.organizationId, input.organizationId),
            eq(groupMemberships.groupId, input.groupId),
            inArray(groupMemberships.status, [...openMembershipStatuses])
          )
        );
      if (Number(occupancy?.count ?? 0) > nextCapacity) {
        throw new OperationalError(
          "GROUP_CAPACITY_BELOW_OCCUPANCY",
          "No se puede reducir la capacidad por debajo de las pertenencias abiertas. No se ha cambiado el grupo.",
          409,
          { openMemberships: Number(occupancy?.count ?? 0), nextCapacity }
        );
      }
    }

    const [updated] = await tx
      .update(groups)
      .set({
        name: nextName,
        capacity: nextCapacity,
        updatedAt: sql`greatest(clock_timestamp(), ${groups.updatedAt} + interval '1 microsecond')`,
      })
      .where(
        and(
          eq(groups.organizationId, input.organizationId),
          eq(groups.id, input.groupId),
          sql`${groups.updatedAt} = ${input.expectedUpdatedAt}::timestamptz`
        )
      )
      .returning({
        id: groups.id,
        locationId: groups.locationId,
        name: groups.name,
        capacity: groups.capacity,
        status: groups.status,
        updatedAtVersion: sql<string>`to_char(${groups.updatedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      });
    if (!updated) {
      throw new OperationalError(
        "VERSION_CONFLICT",
        "El grupo cambió desde la última lectura. Actualiza la lista y vuelve a intentarlo.",
        409
      );
    }

    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId: current.locationId,
      eventName: groupDetailsUpdatedEvent,
      aggregateType: "group",
      aggregateId: current.id,
      idempotencyKey: input.idempotencyKey,
      payload: {
        groupId: current.id,
        expectedUpdatedAt: input.expectedUpdatedAt,
        requestedLabelDigest:
          input.name === undefined ? null : groupLabelHash(input.name),
        capacityProvided: input.capacity !== undefined,
        requestedCapacity: input.capacity ?? null,
        resultLabelDigest: groupLabelHash(updated.name),
        resultCapacity: updated.capacity,
        updatedAtVersion: updated.updatedAtVersion,
        labelChanged: nextName !== current.name,
        changedCapacity: nextCapacity !== current.capacity,
      },
    });
    await appendAuditEntry(tx, {
      organizationId: input.organizationId,
      locationId: current.locationId,
      actorUserId: input.actor.userId,
      action: groupDetailsUpdatedEvent,
      targetType: "group",
      targetId: current.id,
      idempotencyKey: input.idempotencyKey,
      before: {
        labelDigest: groupLabelHash(current.name),
        capacity: current.capacity,
      },
      after: {
        labelDigest: groupLabelHash(updated.name),
        capacity: updated.capacity,
      },
    });
    return updated;
  });
}

export async function getOwnerGroupsPageData(input: {
  userId: string;
  organizationId?: string;
  locationId?: string;
  groupId?: string;
}) {
  const scope = await resolveOwnerScope(input);
  const accessibleLocationIds = scope.locations.map((location) => location.id);
  if (!accessibleLocationIds.length) {
    throw new OperationalError(
      "LOCATION_SCOPE_DENIED",
      "No hay sedes disponibles para gestionar grupos",
      403
    );
  }

  const [locationRows, programRows, groupRows] = await Promise.all([
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
        id: groups.id,
        name: groups.name,
        capacity: groups.capacity,
        status: groups.status,
        locationId: groups.locationId,
        locationName: locations.name,
        timezone: locations.timezone,
        programId: groups.programId,
        programName: programs.name,
        updatedAtVersion: sql<string>`to_char(${groups.updatedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      })
      .from(groups)
      .innerJoin(
        locations,
        and(
          eq(locations.organizationId, groups.organizationId),
          eq(locations.id, groups.locationId)
        )
      )
      .leftJoin(
        programs,
        and(
          eq(programs.organizationId, groups.organizationId),
          eq(programs.id, groups.programId)
        )
      )
      .where(
        and(
          eq(groups.organizationId, scope.organization.id),
          inArray(groups.locationId, accessibleLocationIds)
        )
      )
      .orderBy(asc(locations.name), asc(groups.name))
      .limit(500),
  ]);

  const groupIds = groupRows.map((group) => group.id);
  const countRows = groupIds.length
    ? await db
        .select({
          groupId: groupMemberships.groupId,
          count: sql<number>`count(*)::int`,
        })
        .from(groupMemberships)
        .where(
          and(
            eq(groupMemberships.organizationId, scope.organization.id),
            inArray(groupMemberships.groupId, groupIds),
            inArray(groupMemberships.status, [...openMembershipStatuses])
          )
        )
        .groupBy(groupMemberships.groupId)
    : [];
  const countByGroup = new Map(
    countRows.map((row) => [row.groupId, Number(row.count)])
  );
  const accessibleGroups = groupRows.map((group) => ({
    ...group,
    memberCount: countByGroup.get(group.id) ?? 0,
  }));
  const selectedGroup = selectOwnerGroup(accessibleGroups, input.groupId);
  if (input.groupId && !selectedGroup) {
    throw new OperationalError("NOT_FOUND", "Grupo no encontrado", 404);
  }

  const memberRows = selectedGroup
    ? await db
        .select({
          id: groupMemberships.id,
          athleteId: athletes.id,
          athleteName: sql<string>`concat_ws(' ', coalesce(nullif(btrim(${people.preferredName}), ''), ${people.givenName}), ${people.familyName})`,
          givenName: people.givenName,
          familyName: people.familyName,
          preferredName: people.preferredName,
          profileVersion: sql<string>`to_char(${people.updatedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
          status: groupMemberships.status,
          startsOn: groupMemberships.startsOn,
          endsOn: groupMemberships.endsOn,
        })
        .from(groupMemberships)
        .innerJoin(
          athletes,
          and(
            eq(athletes.organizationId, groupMemberships.organizationId),
            eq(athletes.id, groupMemberships.athleteId)
          )
        )
        .innerJoin(
          people,
          and(
            eq(people.organizationId, athletes.organizationId),
            eq(people.id, athletes.personId)
          )
        )
        .where(
          and(
            eq(groupMemberships.organizationId, scope.organization.id),
            eq(groupMemberships.groupId, selectedGroup.id),
            inArray(groupMemberships.status, [...openMembershipStatuses])
          )
        )
        .orderBy(asc(people.familyName), asc(people.givenName))
        .limit(500)
    : [];

  const now = new Date();
  const localTodayByLocation = Object.fromEntries(
    locationRows.map((location) => [
      location.id,
      new Intl.DateTimeFormat("sv-SE", {
        timeZone: location.timezone,
      }).format(now),
    ])
  );

  return {
    organization: scope.organization,
    member: scope.member,
    locations: locationRows,
    programs: programRows,
    groups: accessibleGroups,
    selectedLocationId: scope.selectedLocationId,
    selectedGroupId: selectedGroup?.id ?? null,
    memberships: memberRows,
    localTodayByLocation,
  };
}

export async function searchGroupAthleteOptions(input: {
  userId: string;
  organizationId: string;
  groupId: string;
  query: string;
}) {
  const query = input.query.trim();
  if (query.length < 2 || query.length > 80) {
    throw new OperationalError(
      "INVALID_RELATION",
      "Escribe al menos dos letras para buscar",
      422
    );
  }

  const scope = await resolveOwnerScope({
    userId: input.userId,
    organizationId: input.organizationId,
  });
  const locationIds = scope.locations.map((location) => location.id);
  if (!locationIds.length) {
    throw new OperationalError(
      "LOCATION_SCOPE_DENIED",
      "No hay sedes disponibles para gestionar este grupo",
      403
    );
  }

  const escapedQuery = query.replace(/[\\%_]/g, "\\$&");
  const [group] = await db
    .select({ id: groups.id, locationId: groups.locationId })
    .from(groups)
    .where(
      and(
        eq(groups.organizationId, scope.organization.id),
        eq(groups.id, input.groupId),
        eq(groups.status, "active"),
        inArray(groups.locationId, locationIds)
      )
    )
    .limit(1);
  if (!group) {
    throw new OperationalError("NOT_FOUND", "Grupo activo no encontrado", 404);
  }

  const rows = await db
    .select({
      id: athletes.id,
      name: sql<string>`concat_ws(' ', coalesce(nullif(btrim(${people.preferredName}), ''), ${people.givenName}), ${people.familyName})`,
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
        eq(athletes.organizationId, scope.organization.id),
        eq(athletes.isActive, true),
        sql`concat_ws(' ', coalesce(nullif(btrim(${people.preferredName}), ''), ${people.givenName}), ${people.familyName}) ilike ${`%${escapedQuery}%`}`,
        hasEligibleGroupLocationRelationship({
          organizationId: scope.organization.id,
          groupId: group.id,
          locationId: group.locationId,
        }),
        notExists(
          db
            .select({ id: groupMemberships.id })
            .from(groupMemberships)
            .where(
              and(
                eq(groupMemberships.organizationId, scope.organization.id),
                eq(groupMemberships.groupId, input.groupId),
                eq(groupMemberships.athleteId, athletes.id),
                inArray(groupMemberships.status, [...openMembershipStatuses])
              )
            )
            .limit(1)
        )
      )
    )
    .orderBy(asc(people.familyName), asc(people.givenName))
    .limit(20);

  return rows;
}
