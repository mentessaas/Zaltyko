import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { OwnerWorkspacePageShell } from "@/components/owner-dashboard/OwnerWorkspacePageShell";
import { ownerUi } from "@/components/owner-dashboard/owner-ui";
import { PageHeader } from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import {
  INACTIVE_ATHLETE_DAYS,
  listInactiveAthletes,
} from "@/modules/habitual-use/application/inactive-athletes";
import { localDate } from "@/modules/habitual-use/domain/local-time";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Gimnastas sin venir | Zaltyko",
  description: "Gimnastas con inscripción activa que llevan dos semanas o más sin asistir.",
  robots: { index: false, follow: false },
};

const querySchema = z.object({
  organizationId: z.guid().optional(),
  locationId: z.guid().optional(),
});

const dateFormat = new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeZone: "UTC" });

/**
 * Lista a la que lleva el botón «Ver gimnastas» del resumen semanal: las mismas
 * gimnastas que cuenta el resumen, dentro de las sedes de quien mira.
 */
export default async function OwnerInactiveAthletesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/owner/athletes/sin-venir");

  const raw = await searchParams;
  const query = querySchema.safeParse({
    organizationId: typeof raw.organizationId === "string" ? raw.organizationId : undefined,
    locationId: typeof raw.locationId === "string" && raw.locationId ? raw.locationId : undefined,
  });
  if (!query.success) notFound();

  let scope: Awaited<ReturnType<typeof resolveOwnerScope>>;
  try {
    scope = await resolveOwnerScope({ userId: user.id, ...query.data });
  } catch (error) {
    if (error instanceof OperationalError) {
      if (error.code === "FORBIDDEN" && !query.data.organizationId) redirect("/owner/setup");
      if (["FORBIDDEN", "LOCATION_SCOPE_DENIED", "INVALID_RELATION", "NOT_FOUND"].includes(error.code)) notFound();
    }
    throw error;
  }

  // El alcance de sedes ya lo validó resolveOwnerScope: sin sede pedida se ven todas las de la persona.
  const locationIds = query.data.locationId ? [query.data.locationId] : scope.locations.map((location) => location.id);
  const now = new Date();
  const zone = scope.locations.find((location) => location.id === locationIds[0])?.timezone;
  const { rows, total } = await listInactiveAthletes({
    organizationId: scope.organization.id,
    locationIds,
    now,
    today: localDate(now, zone),
  });

  return (
    <OwnerWorkspacePageShell
      member={scope.member}
      organizationId={scope.organization.id}
      organizationName={scope.organization.name}
      locationId={scope.selectedLocationId}
    >
      <PageHeader
        title="Gimnastas sin venir"
        description={`Con inscripción activa y sin ninguna asistencia en los últimos ${INACTIVE_ATHLETE_DAYS} días, en clases que sí han pasado lista.`}
        className={ownerUi.pageHeader}
      />
      <section className={ownerUi.card} aria-labelledby="inactive-athletes-title">
        <h2 id="inactive-athletes-title" className={ownerUi.sectionTitle}>
          {total === 0 ? "Nadie" : total === 1 ? "1 gimnasta" : `${total} gimnastas`}
        </h2>
        {rows.length === 0 ? (
          <p className={`${ownerUi.muted} mt-3`}>
            Ahora mismo todas las gimnastas con inscripción activa han venido en las últimas dos semanas.
          </p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {rows.map((row) => (
              <li key={row.athleteId} className={ownerUi.listItem}>
                <p className="font-semibold text-z-ink">{row.displayName}</p>
                <p className={ownerUi.muted}>
                  {row.lastPresentOn
                    ? `Última vez: ${dateFormat.format(new Date(`${row.lastPresentOn}T00:00:00Z`))}`
                    : "Sin asistencias registradas"}
                </p>
              </li>
            ))}
          </ul>
        )}
        {total > rows.length ? (
          <p className={`${ownerUi.muted} mt-4`}>Se muestran las primeras {rows.length} por apellido.</p>
        ) : null}
        <Link
          href={`/owner/attendance?${new URLSearchParams({ organizationId: scope.organization.id })}`}
          className={`${ownerUi.textLink} mt-4 inline-block`}
        >
          Ir a Pasar lista
        </Link>
      </section>
    </OwnerWorkspacePageShell>
  );
}
