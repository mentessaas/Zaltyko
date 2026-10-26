import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { OwnerEssentialDashboard } from "@/components/owner-dashboard/OwnerEssentialDashboard";
import { findLegacyAcademyMemberships } from "@/lib/auth/legacy-academy-access";
import { resolveUserHome } from "@/lib/auth/resolve-user-home";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import {
  getOwnerOperationalSummary,
  ownerOperationalSummaryQuerySchema,
} from "@/modules/owner-dashboard/application/operational-summary";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
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

  const legacyMemberships = await findLegacyAcademyMemberships(user.id);
  if (legacyMemberships.length > 0) {
    const legacyHome = await resolveUserHome({
      userId: user.id,
      email: user.email,
    });
    if (legacyHome.destination === "academy_workspace") {
      redirect(legacyHome.redirectUrl);
    }
    if (legacyHome.destination === "blocked") redirect(legacyHome.redirectUrl);
    redirect("/owner/setup");
  }

  const raw = await searchParams;
  const query = ownerOperationalSummaryQuerySchema.safeParse({
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

  let scope: Awaited<ReturnType<typeof resolveOwnerScope>>;
  try {
    scope = await resolveOwnerScope({ userId: user.id, ...query.data });
  } catch (error) {
    if (
      error instanceof OperationalError &&
      (error.code === "FORBIDDEN" || error.code === "LOCATION_SCOPE_DENIED")
    ) {
      if (error.code === "FORBIDDEN" && !query.data.organizationId) redirect("/owner/setup");
      notFound();
    }
    throw error;
  }

  let operationalSummary: Awaited<ReturnType<typeof getOwnerOperationalSummary>> | null = null;
  try {
    operationalSummary = await getOwnerOperationalSummary({
      userId: user.id,
      organizationId: scope.organization.id,
      locationId: query.data.locationId,
      from: query.data.from,
      to: query.data.to,
    });
  } catch (error) {
    if (error instanceof OperationalError && ["FORBIDDEN", "LOCATION_SCOPE_DENIED"].includes(error.code)) notFound();
    logger.error("Owner operational summary failed", error);
  }
  return <OwnerEssentialDashboard scope={scope} operationalSummary={operationalSummary} />;
}
