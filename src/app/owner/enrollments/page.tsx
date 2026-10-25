import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { OwnerEnrollmentsManager } from "@/components/owner-dashboard/OwnerEnrollmentsManager";
import { createClient } from "@/lib/supabase/server";
import { getOwnerEnrollmentsPageData } from "@/modules/enrollments/application/enrollment-query-service";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Inscripciones | Zaltyko",
  description: "Gestiona las plazas y el estado de las inscripciones.",
  robots: { index: false, follow: false },
};

const querySchema = z.object({
  organizationId: z.guid().optional(),
  locationId: z.guid().optional(),
  status: z
    .enum([
      "all",
      "pending",
      "trial",
      "active",
      "paused",
      "cancelled",
      "completed",
    ])
    .default("all"),
  page: z.coerce.number().int().positive().max(10000).default(1),
});

export default async function OwnerEnrollmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/owner/enrollments");

  const raw = await searchParams;
  const query = querySchema.safeParse({
    organizationId:
      typeof raw.organizationId === "string" ? raw.organizationId : undefined,
    locationId:
      typeof raw.locationId === "string" && raw.locationId
        ? raw.locationId
        : undefined,
    status: typeof raw.status === "string" ? raw.status : undefined,
    page: typeof raw.page === "string" ? raw.page : undefined,
  });
  if (!query.success) notFound();

  let bundle: Awaited<ReturnType<typeof getOwnerEnrollmentsPageData>>;
  try {
    bundle = await getOwnerEnrollmentsPageData({
      userId: user.id,
      organizationId: query.data.organizationId,
      locationId: query.data.locationId,
      status: query.data.status === "all" ? undefined : query.data.status,
      page: query.data.page,
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

  return (
    <OwnerEnrollmentsManager
      bundle={{ ...bundle, filterLocationId: query.data.locationId ?? null }}
      selectedStatus={query.data.status}
    />
  );
}
