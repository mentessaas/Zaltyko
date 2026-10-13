import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  not,
  or,
} from "drizzle-orm";

import { db } from "@/db";
import {
  athletes,
  classTemplates,
  enrollments,
  groupMemberships,
  groups,
  locations,
  people,
  programs,
  spaces,
} from "@/db/zaltyko-schema";
import { calculateEffectiveCapacity } from "@/modules/scheduling/domain/capacity";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import type { EnrollmentStatus } from "@/modules/enrollments/domain/contracts";

const openEnrollmentStatuses = [
  "pending",
  "trial",
  "active",
  "paused",
] as const;
const openGroupMembershipStatuses = ["pending", "active", "paused"] as const;
const pageSize = 50;

function visibleLocationIds(input: {
  requestedLocationId?: string;
  accessibleLocationIds: string[];
}): string[] {
  const ids = input.requestedLocationId
    ? [input.requestedLocationId]
    : input.accessibleLocationIds;
  if (!ids.length) {
    throw new OperationalError(
      "LOCATION_SCOPE_DENIED",
      "No hay sedes disponibles para gestionar inscripciones",
      403
    );
  }
  return ids;
}

function localDate(timezone: string, now: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: timezone }).format(now);
}

export async function getOwnerEnrollmentsPageData(input: {
  userId: string;
  organizationId?: string;
  locationId?: string;
  status?: EnrollmentStatus;
  page?: number;
}) {
  const scope = await resolveOwnerScope(input);
  const accessibleLocationIds = scope.locations.map((location) => location.id);
  const filterLocationIds = visibleLocationIds({
    requestedLocationId: input.locationId,
    accessibleLocationIds,
  });

  const [locationRows, programRows, templateRows] = await Promise.all([
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
      .select({ id: programs.id, name: programs.name, kind: programs.kind })
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
        id: classTemplates.id,
        name: classTemplates.name,
        locationId: classTemplates.locationId,
        locationName: locations.name,
        programId: classTemplates.programId,
        programName: programs.name,
        programKind: programs.kind,
        capacity: classTemplates.capacity,
        spaceCapacity: spaces.capacity,
        effectiveFrom: classTemplates.effectiveFrom,
        effectiveTo: classTemplates.effectiveTo,
      })
      .from(classTemplates)
      .innerJoin(
        locations,
        and(
          eq(locations.organizationId, classTemplates.organizationId),
          eq(locations.id, classTemplates.locationId)
        )
      )
      .leftJoin(
        programs,
        and(
          eq(programs.organizationId, classTemplates.organizationId),
          eq(programs.id, classTemplates.programId)
        )
      )
      .leftJoin(
        spaces,
        and(
          eq(spaces.organizationId, classTemplates.organizationId),
          eq(spaces.id, classTemplates.defaultSpaceId)
        )
      )
      .where(
        and(
          eq(classTemplates.organizationId, scope.organization.id),
          eq(classTemplates.status, "active"),
          eq(locations.isActive, true),
          inArray(classTemplates.locationId, accessibleLocationIds)
        )
      )
      .orderBy(asc(locations.name), asc(classTemplates.name))
      .limit(500),
  ]);

  const todayByLocation = Object.fromEntries(
    locationRows.map((location) => [
      location.id,
      localDate(location.timezone, new Date()),
    ])
  );
  const occupancyRows = templateRows.length
    ? await db
        .select({
          classTemplateId: enrollments.classTemplateId,
          total: count(),
        })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.organizationId, scope.organization.id),
            inArray(
              enrollments.classTemplateId,
              templateRows.map((template) => template.id)
            ),
            inArray(enrollments.status, [...openEnrollmentStatuses])
          )
        )
        .groupBy(enrollments.classTemplateId)
    : [];
  const occupancyByTemplate = new Map(
    occupancyRows.map((row) => [row.classTemplateId, Number(row.total)])
  );
  const classes = templateRows
    .filter((template) => {
      const today = todayByLocation[template.locationId];
      return !template.effectiveTo || !today || template.effectiveTo >= today;
    })
    .map((template) => {
      const occupied = occupancyByTemplate.get(template.id) ?? 0;
      const effectiveCapacity = calculateEffectiveCapacity({
        templateCapacity: template.capacity,
        spaceCapacity: template.spaceCapacity,
      });
      return {
        ...template,
        occupied,
        availableSeats: Math.max(effectiveCapacity - occupied, 0),
      };
    });

  const filters = [
    eq(enrollments.organizationId, scope.organization.id),
    inArray(enrollments.locationId, filterLocationIds),
  ];
  if (input.status) filters.push(eq(enrollments.status, input.status));

  const [{ total = 0 } = {}] = await db
    .select({ total: count() })
    .from(enrollments)
    .where(and(...filters));
  const pages = Math.max(1, Math.ceil(Number(total) / pageSize));
  const currentPage = Math.min(Math.max(input.page ?? 1, 1), pages);

  const [rows, statusTotals] = await Promise.all([
    db
      .select({
        id: enrollments.id,
        athleteId: athletes.id,
        givenName: people.givenName,
        preferredName: people.preferredName,
        familyName: people.familyName,
        status: enrollments.status,
        startsOn: enrollments.startsOn,
        endsOn: enrollments.endsOn,
        version: enrollments.version,
        classTemplateId: classTemplates.id,
        className: classTemplates.name,
        locationId: enrollments.locationId,
        locationName: locations.name,
        programName: programs.name,
      })
      .from(enrollments)
      .innerJoin(
        athletes,
        and(
          eq(athletes.organizationId, enrollments.organizationId),
          eq(athletes.id, enrollments.athleteId)
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
        classTemplates,
        and(
          eq(classTemplates.organizationId, enrollments.organizationId),
          eq(classTemplates.id, enrollments.classTemplateId)
        )
      )
      .innerJoin(
        locations,
        and(
          eq(locations.organizationId, enrollments.organizationId),
          eq(locations.id, enrollments.locationId)
        )
      )
      .leftJoin(
        programs,
        and(
          eq(programs.organizationId, classTemplates.organizationId),
          eq(programs.id, classTemplates.programId)
        )
      )
      .where(and(...filters))
      .orderBy(
        desc(enrollments.updatedAt),
        asc(people.familyName),
        asc(people.givenName)
      )
      .limit(pageSize)
      .offset((currentPage - 1) * pageSize),
    db
      .select({
        status: enrollments.status,
        total: count(),
      })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.organizationId, scope.organization.id),
          inArray(enrollments.locationId, filterLocationIds)
        )
      )
      .groupBy(enrollments.status),
  ]);

  const totalsByStatus = Object.fromEntries(
    statusTotals.map((row) => [row.status, Number(row.total)])
  );
  const locationNames = new Map(
    locationRows.map((location) => [location.id, location.name])
  );
  const selectedLocationId =
    input.locationId ?? scope.selectedLocationId ?? locationRows[0]?.id ?? null;

  return {
    organization: scope.organization,
    member: scope.member,
    locations: locationRows,
    programs: programRows,
    classes,
    enrollments: rows.map((row) => ({
      ...row,
      athleteName: [row.preferredName?.trim() || row.givenName, row.familyName]
        .filter(Boolean)
        .join(" "),
      locationName: row.locationName ?? locationNames.get(row.locationId) ?? "",
    })),
    totalsByStatus,
    total: Number(total),
    page: currentPage,
    pages,
    pageSize,
    selectedLocationId,
    localTodayByLocation: todayByLocation,
  };
}

export async function searchOwnerEnrollmentCandidates(input: {
  userId: string;
  organizationId?: string;
  locationId: string;
  classTemplateId: string;
  query: string;
}) {
  const query = input.query.trim();
  if (query.length < 2) {
    throw new OperationalError(
      "INVALID_RELATION",
      "Escribe al menos dos letras para buscar",
      422
    );
  }

  const scope = await resolveOwnerScope({
    userId: input.userId,
    organizationId: input.organizationId,
    locationId: input.locationId,
  });
  const [template] = await db
    .select({ id: classTemplates.id, locationId: classTemplates.locationId })
    .from(classTemplates)
    .innerJoin(
      locations,
      and(
        eq(locations.organizationId, classTemplates.organizationId),
        eq(locations.id, classTemplates.locationId),
        eq(locations.isActive, true)
      )
    )
    .where(
      and(
        eq(classTemplates.organizationId, scope.organization.id),
        eq(classTemplates.id, input.classTemplateId),
        eq(classTemplates.locationId, input.locationId),
        eq(classTemplates.status, "active")
      )
    )
    .limit(1);
  if (!template) {
    throw new OperationalError(
      "NOT_FOUND",
      "Clase activa no encontrada en esta sede",
      404
    );
  }

  const accessibleLocationIds = scope.locations.map((location) => location.id);
  const targetLocationIds = [input.locationId].filter((id) =>
    accessibleLocationIds.includes(id)
  );
  if (!targetLocationIds.length) {
    throw new OperationalError(
      "LOCATION_SCOPE_DENIED",
      "Sede fuera de alcance",
      403
    );
  }

  const escapedQuery = query.replace(/[\\%_]/g, "\\$&");
  const pattern = "%" + escapedQuery + "%";
  const hasGroupMembershipAtLocation = exists(
    db
      .select({ id: groupMemberships.id })
      .from(groupMemberships)
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
          eq(groupMemberships.organizationId, scope.organization.id),
          eq(groupMemberships.athleteId, athletes.id),
          inArray(groupMemberships.status, [...openGroupMembershipStatuses]),
          inArray(groups.locationId, targetLocationIds)
        )
      )
  );
  const hasOpenEnrollmentAtLocation = exists(
    db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.organizationId, scope.organization.id),
          eq(enrollments.athleteId, athletes.id),
          inArray(enrollments.locationId, targetLocationIds),
          inArray(enrollments.status, [...openEnrollmentStatuses])
        )
      )
  );
  const alreadyInTargetClass = not(
    exists(
      db
        .select({ id: enrollments.id })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.organizationId, scope.organization.id),
            eq(enrollments.athleteId, athletes.id),
            eq(enrollments.classTemplateId, input.classTemplateId),
            inArray(enrollments.status, [...openEnrollmentStatuses])
          )
        )
    )
  );

  const rows = await db
    .select({
      id: athletes.id,
      givenName: people.givenName,
      preferredName: people.preferredName,
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
        eq(athletes.organizationId, scope.organization.id),
        eq(athletes.isActive, true),
        or(
          ilike(people.givenName, pattern),
          ilike(people.preferredName, pattern),
          ilike(people.familyName, pattern)
        ),
        or(hasGroupMembershipAtLocation, hasOpenEnrollmentAtLocation),
        alreadyInTargetClass
      )
    )
    .orderBy(asc(people.familyName), asc(people.givenName))
    .limit(20);

  return rows.map((row) => ({
    id: row.id,
    name: [row.preferredName?.trim() || row.givenName, row.familyName]
      .filter(Boolean)
      .join(" "),
  }));
}
