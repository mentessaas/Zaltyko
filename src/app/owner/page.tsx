import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { OwnerDashboardView } from "@/components/owner-dashboard/OwnerDashboardView";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import {
  getOwnerDashboard,
  ownerDashboardQuerySchema,
} from "@/modules/owner-dashboard/application/get-owner-dashboard";
import { getCapacityHeatmap } from "@/modules/owner-dashboard/application/capacity-heatmap";
import { getRetentionCohorts } from "@/modules/owner-dashboard/application/retention-cohorts";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export const dynamic = "force-dynamic";

export default async function OwnerDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/owner");

  const raw = await searchParams;
  const query = ownerDashboardQuerySchema.safeParse({
    organizationId:
      typeof raw.organizationId === "string" ? raw.organizationId : undefined,
    locationId:
      typeof raw.locationId === "string" && raw.locationId
        ? raw.locationId
        : undefined,
    from: typeof raw.from === "string" && raw.from ? raw.from : undefined,
    to: typeof raw.to === "string" && raw.to ? raw.to : undefined,
  });
  if (!query.success) notFound();

  let bundle: Awaited<ReturnType<typeof getOwnerDashboard>>;
  try {
    bundle = await getOwnerDashboard({ userId: user.id, ...query.data });
  } catch (error) {
    if (
      error instanceof OperationalError &&
      (error.code === "FORBIDDEN" || error.code === "LOCATION_SCOPE_DENIED")
    ) {
      if (error.code === "FORBIDDEN" && !query.data.organizationId) {
        redirect("/owner/setup");
      }
      notFound();
    }
    throw error;
  }

  const [capacityResult, cohortsResult] = await Promise.allSettled([
    getCapacityHeatmap({
      userId: user.id,
      organizationId: bundle.organization.id,
      locationId: bundle.scope.locationId ?? undefined,
      limit: 50,
    }),
    getRetentionCohorts({
      userId: user.id,
      organizationId: bundle.organization.id,
      locationId: bundle.scope.locationId ?? undefined,
      from: query.data.from,
      to: query.data.to,
      limit: 24,
    }),
  ]);
  for (const result of [capacityResult, cohortsResult]) {
    if (result.status === "rejected") {
      if (
        result.reason instanceof OperationalError &&
        (result.reason.code === "FORBIDDEN" ||
          result.reason.code === "LOCATION_SCOPE_DENIED")
      ) {
        notFound();
      }
      logger.error("Owner dashboard aggregate panel failed", result.reason);
    }
  }
  const capacity =
    capacityResult.status === "fulfilled" ? capacityResult.value : null;
  const cohorts =
    cohortsResult.status === "fulfilled" ? cohortsResult.value : null;

  return (
    <OwnerDashboardView bundle={bundle} capacity={capacity} cohorts={cohorts} />
  );
}
