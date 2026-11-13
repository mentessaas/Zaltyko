import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { OwnerClassesManager } from "@/components/owner-dashboard/OwnerClassesManager";
import { OwnerWorkspacePageShell } from "@/components/owner-dashboard/OwnerWorkspacePageShell";
import { createClient } from "@/lib/supabase/server";
import { getOwnerClassesPageData } from "@/modules/scheduling/application/class-management-service";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { getUpcomingScheduleConflicts } from "@/modules/schedule-conflicts/application/schedule-conflicts-service";
import { OwnerUpcomingConflicts } from "@/components/owner-dashboard/OwnerScheduleConflicts";
import { db } from "@/db";
import { logger } from "@/lib/logger";
import {
  getClassTitularsByClass,
  isCoachAssignmentAvailableForPage,
} from "@/modules/coach-assignment/application/coach-assignment-service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Clases recurrentes | Zaltyko",
  description:
    "Organiza clases semanales y genera sus próximas sesiones.",
  robots: { index: false, follow: false },
};

const querySchema = z.object({
  organizationId: z.guid().optional(),
  locationId: z.guid().optional(),
});

export default async function OwnerClassesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/owner/classes");

  const raw = await searchParams;
  const query = querySchema.safeParse({
    organizationId:
      typeof raw.organizationId === "string" ? raw.organizationId : undefined,
    locationId:
      typeof raw.locationId === "string" && raw.locationId
        ? raw.locationId
        : undefined,
  });
  if (!query.success) notFound();

  let bundle: Awaited<ReturnType<typeof getOwnerClassesPageData>>;
  try {
    bundle = await getOwnerClassesPageData({ userId: user.id, ...query.data });
  } catch (error) {
    if (error instanceof OperationalError) {
      if (error.code === "FORBIDDEN" && !query.data.organizationId) {
        redirect("/owner/setup");
      }
      if (
        error.code === "FORBIDDEN" ||
        error.code === "LOCATION_SCOPE_DENIED" ||
        error.code === "INVALID_RELATION"
      ) {
        notFound();
      }
    }
    throw error;
  }

  // En paralelo:
  // - O1: titulares por clase, solo con el candidato SQL aplicado. Si la
  //   lectura falla, la ficha de clase se pinta como antes, sin titulares.
  // - O2: choques próximos de entrenadora en las sedes de su alcance. Solo
  //   lectura, 14 días y un presupuesto de 1,5 s; si no llega, no se muestra.
  const [coachAssignment, upcomingConflicts] = await Promise.all([
    isCoachAssignmentAvailableForPage(db).then((available) =>
      available
        ? getClassTitularsByClass(db, {
            organizationId: bundle.organization.id,
            classTemplateIds: bundle.classes.map((classItem) => classItem.id),
          })
            .then((titularsByClass) => ({ titularsByClass }))
            .catch((error: unknown) => {
              logger.error("Class titulars failed", error);
              return null;
            })
        : null
    ),
    getUpcomingScheduleConflicts({
      organizationId: bundle.organization.id,
      locationIds: (query.data.locationId
        ? bundle.locations.filter((location) => location.id === query.data.locationId)
        : bundle.locations
      ).map((location) => location.id),
      viewer: { memberId: bundle.member.id, role: bundle.member.role },
    }),
  ]);

  const navigationLocationId =
    query.data.locationId ??
    (bundle.member.locationScopeMode === "all"
      ? null
      : bundle.selectedLocationId);

  return (
    <OwnerWorkspacePageShell
      member={bundle.member}
      organizationId={bundle.organization.id}
      organizationName={bundle.organization.name}
      locationId={navigationLocationId}
    >
      <OwnerUpcomingConflicts upcoming={upcomingConflicts} coachMode={false} />
      <OwnerClassesManager
        bundle={bundle}
        navigationLocationId={navigationLocationId}
        coachAssignment={coachAssignment}
      />
    </OwnerWorkspacePageShell>
  );
}
