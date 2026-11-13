import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { OwnerMonthlyInvoicesManager } from "@/components/owner-dashboard/OwnerMonthlyInvoicesManager";
import { OwnerWorkspacePageShell } from "@/components/owner-dashboard/OwnerWorkspacePageShell";
import { createClient } from "@/lib/supabase/server";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cuotas mensuales | Zaltyko",
  description: "Emite las cuotas mensuales pendientes de las familias.",
  robots: { index: false, follow: false },
};

const querySchema = z.object({
  organizationId: z.guid().optional(),
  locationId: z.guid().optional(),
  servicePeriod: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});

function currentServicePeriod(timezone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
    }).formatToParts(new Date());
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    if (!year || !month || !/^\d{4}$/.test(year) || !/^\d{2}$/.test(month)) {
      return null;
    }
    return `${year}-${month}`;
  } catch {
    return null;
  }
}

export default async function OwnerMonthlyInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/owner/monthly-invoices");

  const raw = await searchParams;
  const query = querySchema.safeParse({
    organizationId:
      typeof raw.organizationId === "string" ? raw.organizationId : undefined,
    locationId: typeof raw.locationId === "string" ? raw.locationId : undefined,
    servicePeriod:
      typeof raw.servicePeriod === "string" ? raw.servicePeriod : undefined,
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

  if (scope.member.role !== "owner" && scope.member.role !== "admin") {
    notFound();
  }
  const selectedLocationId =
    query.data.locationId ??
    scope.selectedLocationId ??
    scope.locations[0]?.id ??
    "";
  if (!selectedLocationId) notFound();
  const selectedLocation = scope.locations.find(
    (location) => location.id === selectedLocationId
  );
  const initialServicePeriod =
    query.data.servicePeriod ??
    (selectedLocation?.timezone
      ? currentServicePeriod(selectedLocation.timezone)
      : null);
  if (!initialServicePeriod) {
    return (
      <OwnerWorkspacePageShell
        member={scope.member}
        organizationId={scope.organization.id}
        organizationName={scope.organization.name}
        locationId={scope.selectedLocationId}
      >
        <p
          role="alert"
          className="mx-5 mt-6 rounded-md border border-ochre-line bg-ochre-wash p-4 text-sm leading-6 text-ochre-ink lg:mx-10"
        >
          No se puede determinar el mes actual para la sede seleccionada. La
          sede no tiene una zona horaria válida. Configura una zona horaria
          antes de continuar.
        </p>
      </OwnerWorkspacePageShell>
    );
  }
  return (
    <OwnerWorkspacePageShell
      member={scope.member}
      organizationId={scope.organization.id}
      organizationName={scope.organization.name}
      locationId={scope.selectedLocationId}
    >
      <OwnerMonthlyInvoicesManager
        organizationId={scope.organization.id}
        organizationName={scope.organization.name}
        defaultCurrency={scope.organization.defaultCurrency}
        locations={scope.locations}
        initialLocationId={selectedLocationId}
        initialServicePeriod={initialServicePeriod}
      />
    </OwnerWorkspacePageShell>
  );
}
