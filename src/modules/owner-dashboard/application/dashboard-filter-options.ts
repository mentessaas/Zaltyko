import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  classTemplateGroups,
  classTemplates,
  groups,
  programs,
} from "@/db/zaltyko-schema";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export async function getOwnerDashboardFilterOptions(input: {
  userId: string;
  organizationId: string;
  locationId?: string;
  programId?: string;
  groupId?: string;
}) {
  const scope = await resolveOwnerScope(input);
  const templateScope = and(
    eq(classTemplates.organizationId, scope.organization.id),
    scope.selectedLocationId
      ? eq(classTemplates.locationId, scope.selectedLocationId)
      : undefined,
    eq(classTemplates.status, "active")
  );
  const programRows = await db
    .selectDistinct({ id: programs.id, name: programs.name })
    .from(classTemplates)
    .innerJoin(
      programs,
      and(
        eq(programs.organizationId, classTemplates.organizationId),
        eq(programs.id, classTemplates.programId),
        eq(programs.status, "active")
      )
    )
    .where(templateScope)
    .orderBy(asc(programs.name))
    .limit(200);
  const programIds = programRows.map(({ id }) => id);
  const groupRows = await db
    .selectDistinct({
      id: groups.id,
      name: groups.name,
      programId: groups.programId,
    })
    .from(classTemplateGroups)
    .innerJoin(
      classTemplates,
      and(
        eq(classTemplates.organizationId, classTemplateGroups.organizationId),
        eq(classTemplates.id, classTemplateGroups.classTemplateId)
      )
    )
    .innerJoin(
      groups,
      and(
        eq(groups.organizationId, classTemplateGroups.organizationId),
        eq(groups.id, classTemplateGroups.groupId),
        eq(groups.status, "active")
      )
    )
    .where(
      and(
        templateScope,
        programIds.length
          ? inArray(classTemplates.programId, programIds)
          : undefined,
        scope.selectedLocationId
          ? eq(groups.locationId, scope.selectedLocationId)
          : undefined
      )
    )
    .orderBy(asc(groups.name))
    .limit(500);
  if (
    input.programId &&
    !programRows.some(({ id }) => id === input.programId)
  ) {
    throw new OperationalError(
      "INVALID_RELATION",
      "Programa fuera de ámbito",
      400
    );
  }
  if (input.groupId && !groupRows.some(({ id }) => id === input.groupId)) {
    throw new OperationalError(
      "INVALID_RELATION",
      "Grupo fuera de ámbito",
      400
    );
  }
  return {
    programs: programRows,
    groups: groupRows,
    selectedProgramId: input.programId ?? null,
    selectedGroupId: input.groupId ?? null,
  };
}
