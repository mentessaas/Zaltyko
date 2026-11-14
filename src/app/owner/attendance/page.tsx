import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { OwnerAttendanceManager } from "@/components/owner-dashboard/OwnerAttendanceManager";
import { OwnerWorkspacePageShell } from "@/components/owner-dashboard/OwnerWorkspacePageShell";
import { createClient } from "@/lib/supabase/server";
import { getOwnerAttendanceSessionOptions } from "@/modules/attendance/application/owner-attendance-sessions";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { recordStaffVisit } from "@/modules/habitual-use/application/usage-events";
import { db } from "@/db";
import { isAthleteProgressAvailableForPage } from "@/modules/athlete-progress/application/athlete-progress-service";
import { isSessionPlanAvailableForPage } from "@/modules/session-plans/application/session-plan-service";
import {
  isCoachAssignmentAvailableForPage,
  withSessionCoaches,
} from "@/modules/coach-assignment/application/coach-assignment-service";
import { OwnerTodaySessionsPanel } from "@/components/owner-dashboard/OwnerTodaySessionsPanel";
import { OwnerScheduleConflictList } from "@/components/owner-dashboard/OwnerScheduleConflicts";
import { getUpcomingScheduleConflicts } from "@/modules/schedule-conflicts/application/schedule-conflicts-service";
import { ownerTab, ownerTone, ownerUi } from "@/components/owner-dashboard/owner-ui";
import { logger } from "@/lib/logger";
import { getOwnerTodaySessions } from "@/modules/owner-dashboard/application/today-sessions";
import {
  coachHomeHref,
  coachWithoutLocationsOrganizationId,
  isCoachRole,
} from "@/modules/owner-dashboard/domain/coach-access";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Asistencia | Zaltyko",
  description: "Pasa lista en las sesiones de tu academia.",
  robots: { index: false, follow: false },
};

const querySchema = z.object({
  organizationId: z.guid().optional(),
  locationId: z.guid().optional(),
  sessionId: z.guid().optional(),
});

export default async function OwnerAttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/owner/attendance");

  const raw = await searchParams;
  const query = querySchema.safeParse({
    organizationId:
      typeof raw.organizationId === "string" ? raw.organizationId : undefined,
    locationId: typeof raw.locationId === "string" ? raw.locationId : undefined,
    sessionId: typeof raw.sessionId === "string" ? raw.sessionId : undefined,
  });
  if (!query.success) notFound();

  let data: Awaited<ReturnType<typeof getOwnerAttendanceSessionOptions>>;
  try {
    data = await getOwnerAttendanceSessionOptions({
      userId: user.id,
      organizationId: query.data.organizationId,
      locationId: query.data.locationId,
      sessionId: query.data.sessionId,
    });
  } catch (error) {
    const coachOrganizationId = coachWithoutLocationsOrganizationId(error);
    if (coachOrganizationId) {
      return <CoachWithoutLocations />;
    }
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

  let scope: Awaited<ReturnType<typeof resolveOwnerScope>>;
  try {
    scope = await resolveOwnerScope({
      userId: user.id,
      organizationId: data.organization.id,
      locationId: query.data.locationId,
      surface: "coach_operations",
    });
  } catch (error) {
    if (
      error instanceof OperationalError &&
      (error.code === "FORBIDDEN" ||
        error.code === "LOCATION_SCOPE_DENIED" ||
        error.code === "INVALID_RELATION")
    ) {
      notFound();
    }
    throw error;
  }

  // Uso habitual: cuenta una visita del equipo (sin persona; apagado por defecto).
  await recordStaffVisit({ organizationId: scope.organization.id, role: scope.member.role });

  // P1 #8: /owner sends coaches here, so this page also carries their "Hoy",
  // computed from the same coach scope (one assigned site, no aggregate).
  const coachMode = isCoachRole(scope.member.role);
  const coachToday = coachMode
    ? await getOwnerTodaySessions({ scope, locationId: data.locationId }).catch(
        (error: unknown) => {
          logger.error("Coach today sessions failed", error);
          return null;
        }
      )
    : null;

  // P2 #17: sin el candidato SQL aplicado no se muestran los accesos.
  const [progressAvailable, sessionPlansAvailable, coachAssignmentAvailable, coachConflicts] = await Promise.all([
    isAthleteProgressAvailableForPage(db),
    isSessionPlanAvailableForPage(db),
    // O1: lo mismo para titulares y sustituciones.
    isCoachAssignmentAvailableForPage(db),
    // O2: la entrenadora ve sus propios choques próximos, solo en sus sedes
    // (14 días, presupuesto de 1,5 s; si no llega, no se muestra).
    coachMode
      ? getUpcomingScheduleConflicts({
          organizationId: scope.organization.id,
          locationIds: scope.locations.map((location) => location.id),
          viewer: { memberId: scope.member.id, role: scope.member.role },
        })
      : Promise.resolve(null),
  ]);
  // O1: Hoy de la entrenadora pone primero sus sesiones asignadas, sin añadir
  // ninguna que no viera ya.
  const coachTodayWithCoaches = coachAssignmentAvailable
    ? await withSessionCoaches(db, coachToday, {
        organizationId: scope.organization.id,
        viewerMemberId: scope.member.id,
      })
    : coachToday;

  return (
    <OwnerWorkspacePageShell
      member={scope.member}
      organizationId={scope.organization.id}
      organizationName={scope.organization.name}
      locationId={scope.selectedLocationId}
    >
      {coachMode ? (
        <div className="mx-auto w-full max-w-6xl px-5 pt-7 sm:pt-9 lg:px-10">
          <div className="mx-auto grid max-w-4xl gap-4">
            {scope.locations.length > 1 ? (
              // Pestañas planas con cinta bajo la sede activa, no botones.
              <nav aria-label="Sedes asignadas" className={ownerTone.tabList}>
                {scope.locations.map((location) => (
                  <Link
                    key={location.id}
                    href={coachHomeHref({
                      organizationId: scope.organization.id,
                      locationId: location.id,
                    })}
                    aria-current={location.id === data.locationId ? "page" : undefined}
                    className={ownerTab(location.id === data.locationId)}
                  >
                    {location.name}
                  </Link>
                ))}
              </nav>
            ) : null}
            <OwnerTodaySessionsPanel
              organizationId={scope.organization.id}
              classesHref={null}
              today={coachTodayWithCoaches}
              prioritizeViewerSessions
            />
            {coachConflicts ? (
              <OwnerScheduleConflictList
                conflicts={coachConflicts.conflicts}
                truncated={coachConflicts.truncated}
                variant="upcoming"
                title="Tus choques próximos"
              />
            ) : null}
          </div>
        </div>
      ) : null}
      <OwnerAttendanceManager
        coachMode={coachMode}
        organizationId={data.organization.id}
        locationId={data.locationId}
        sessions={data.sessions}
        initialSessionId={query.data.sessionId}
        initialNextCursor={data.nextCursor}
        selectedSession={data.selectedSession}
        progressAvailable={progressAvailable}
        coachAssignmentAvailable={coachAssignmentAvailable}
        sessionPlansAvailable={sessionPlansAvailable}
      />
    </OwnerWorkspacePageShell>
  );
}

/** A coach with no assigned site sees nothing operational, only this. */
function CoachWithoutLocations() {
  // No organization context: the plan-policy probe would only fail again for a
  // coach without sites, and there is nothing operational to scope.
  return (
    <OwnerWorkspacePageShell
      member={{ role: "coach", locationScopeMode: "selected" }}
      organizationId={null}
      locationId={null}
    >
      <main className={ownerUi.page}>
        <section
          aria-labelledby="coach-without-locations-title"
          className={`mx-auto max-w-2xl ${ownerUi.emptyState}`}
        >
          <h1 id="coach-without-locations-title" className={ownerUi.sectionTitle}>
            Aún no tienes sedes asignadas
          </h1>
          <p className="max-w-md text-sm leading-6 text-z-soft">
            Para ver las sesiones de hoy y pasar lista, la persona responsable
            del club tiene que asignarte al menos una sede en Equipo.
          </p>
        </section>
      </main>
    </OwnerWorkspacePageShell>
  );
}
