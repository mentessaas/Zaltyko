import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { OwnerTrialRequestsWorkspace } from "@/components/owner-dashboard/OwnerTrialRequestsWorkspace";
import { OwnerWorkspacePageShell } from "@/components/owner-dashboard/OwnerWorkspacePageShell";
import { createClient } from "@/lib/supabase/server";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Solicitudes | Zaltyko",
  description: "Solicitudes de clase de prueba que llegan desde el enlace público de la academia.",
  robots: { index: false, follow: false },
};

const querySchema = z
  .object({ organizationId: z.guid().optional(), locationId: z.guid().optional() })
  .strict();

export default async function OwnerTrialRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/owner/requests");

  const raw = await searchParams;
  const query = querySchema.safeParse({
    organizationId: typeof raw.organizationId === "string" ? raw.organizationId : undefined,
    locationId: typeof raw.locationId === "string" && raw.locationId ? raw.locationId : undefined,
  });
  if (!query.success) notFound();

  let scope: Awaited<ReturnType<typeof resolveOwnerScope>>;
  try {
    scope = await resolveOwnerScope({
      userId: user.id,
      organizationId: query.data.organizationId,
      locationId: query.data.locationId,
    });
  } catch (error) {
    if (error instanceof OperationalError) {
      if (error.code === "FORBIDDEN" && !query.data.organizationId) redirect("/owner/setup");
      if (["FORBIDDEN", "LOCATION_SCOPE_DENIED", "INVALID_RELATION", "NOT_FOUND"].includes(error.code)) notFound();
    }
    throw error;
  }

  if (!query.data.organizationId) {
    const params = new URLSearchParams({ organizationId: scope.organization.id });
    if (scope.selectedLocationId) params.set("locationId", scope.selectedLocationId);
    redirect(`/owner/requests?${params.toString()}`);
  }

  // La página solo valida el alcance; las solicitudes se piden después del
  // montaje a la API, que vuelve a filtrar por academia y sedes autorizadas.
  return (
    <OwnerWorkspacePageShell
      member={scope.member}
      organizationId={scope.organization.id}
      locationId={scope.selectedLocationId}
    >
      <OwnerTrialRequestsWorkspace
        organizationId={scope.organization.id}
        organizationName={scope.organization.name}
        locations={scope.locations.map((location) => ({ id: location.id, name: location.name }))}
        initialLocationId={query.data.locationId ?? null}
      />
    </OwnerWorkspacePageShell>
  );
}
