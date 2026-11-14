import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { OwnerCalendarView } from "@/components/owner-dashboard/OwnerCalendarView";
import { parseCalendarSearch } from "@/components/owner-dashboard/owner-calendar-ui";
import { OwnerWorkspacePageShell } from "@/components/owner-dashboard/OwnerWorkspacePageShell";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { getOwnerCalendar } from "@/modules/scheduling/application/calendar-sessions";
import { calendarRange, todayIn } from "@/modules/scheduling/domain/calendar";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Calendario | Zaltyko",
  description: "Las clases de tu academia por día, semana y mes.",
  robots: { index: false, follow: false },
};

const fallbackTimeZone = "Europe/Madrid";

const querySchema = z.object({
  organizationId: z.guid().optional(),
  locationId: z.guid().optional(),
});

export default async function OwnerCalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/owner/calendar");

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

  // Superficie de gestión: owner, admin y manager (con sus sedes); el coach
  // queda fuera, como en Clases.
  let scope: Awaited<ReturnType<typeof resolveOwnerScope>>;
  try {
    scope = await resolveOwnerScope({ userId: user.id, ...query.data });
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

  const locations = scope.locations.map((location) => ({
    id: location.id,
    name: location.name,
    timezone: location.timezone || fallbackTimeZone,
  }));
  // «Hoy» se decide en la zona de la sede elegida o, sin ella, en la primera.
  const referenceTimeZone =
    locations.find((location) => location.id === query.data.locationId)?.timezone ??
    locations[0]?.timezone ??
    fallbackTimeZone;
  const today = todayIn(referenceTimeZone);
  const initialState = parseCalendarSearch(raw, today);
  // Una sede o grupo que no sea del alcance se ignora en lugar de romper la página.
  const initialLocationId = locations.some((location) => location.id === query.data.locationId)
    ? (query.data.locationId ?? "")
    : "";
  const state = {
    ...initialState,
    locationId: initialLocationId,
    groupId: z.guid().safeParse(initialState.groupId).success ? initialState.groupId : "",
  };
  const range = calendarRange(state.view, state.date);

  // Primer rango leído en el servidor; si falla, la pantalla lo pide sola y
  // muestra el error con «Reintentar».
  const initialData = await getOwnerCalendar({
    scope,
    from: range.from,
    to: range.to,
    locationId: state.locationId || null,
    groupId: state.groupId || null,
  }).catch((error: unknown) => {
    logger.error("Owner calendar initial read failed", error);
    return null;
  });

  const navigationLocationId =
    query.data.locationId ??
    (scope.member.locationScopeMode === "all" ? null : scope.selectedLocationId);

  return (
    <OwnerWorkspacePageShell
      member={scope.member}
      organizationId={scope.organization.id}
      organizationName={scope.organization.name}
      locationId={navigationLocationId}
    >
      <OwnerCalendarView
        organizationId={scope.organization.id}
        initialState={state}
        locations={locations}
        referenceTimeZone={referenceTimeZone}
        todayLocal={today}
        initialData={initialData}
      />
    </OwnerWorkspacePageShell>
  );
}
