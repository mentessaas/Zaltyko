import { and, asc, eq, inArray, notExists, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  athletes,
  groupMemberships,
  groups,
  locations,
  people,
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
  lockCommand,
} from "@/modules/shared/infrastructure/transactional-records";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";

const openMembershipStatuses = ["pending", "active", "paused"] as const;
const commandKeySchema = z.string().trim().min(8).max(180);
const createGroupSchema = z.object({
  organizationId: z.guid(),
  locationId: z.guid(),
  programId: z.guid().nullable(),
  name: z.string().trim().min(2).max(120),
  capacity: z.number().int().positive().max(5000).nullable(),
  idempotencyKey: commandKeySchema,
  actor: operationalActorSchema,
});

export type CreateGroupCommand = z.infer<typeof createGroupSchema>;

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
  const selectedGroup =
    accessibleGroups.find((group) => group.id === input.groupId) ??
    accessibleGroups[0] ??
    null;

  const memberRows = selectedGroup
    ? await db
        .select({
          id: groupMemberships.id,
          athleteId: athletes.id,
          athleteName: sql<string>`concat_ws(' ', coalesce(nullif(btrim(${people.preferredName}), ''), ${people.givenName}), ${people.familyName})`,
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
    .select({ id: groups.id })
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
