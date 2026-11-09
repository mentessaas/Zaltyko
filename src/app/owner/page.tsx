import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { OwnerEssentialDashboard } from "@/components/owner-dashboard/OwnerEssentialDashboard";
import { OwnerProductDiscovery } from "@/components/owner-dashboard/OwnerProductDiscovery";
import { OwnerWorkspacePageShell } from "@/components/owner-dashboard/OwnerWorkspacePageShell";
import { findLegacyAcademyMemberships } from "@/lib/auth/legacy-academy-access";
import { resolveUserHome } from "@/lib/auth/resolve-user-home";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import {
  getOwnerOperationalSummary,
  ownerOperationalSummaryQuerySchema,
} from "@/modules/owner-dashboard/application/operational-summary";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { getOwnerTodaySessions } from "@/modules/owner-dashboard/application/today-sessions";
import { getOwnerAttentionItems } from "@/modules/owner-dashboard/application/attention-items";
import { getOwnerSetupProgress } from "@/modules/owner-dashboard/application/setup-checklist";
import { canSeeOwnerSetupChecklist } from "@/modules/owner-dashboard/application/setup-checklist-steps";
import { ownerWorkspaceCapabilitiesFor } from "@/components/owner-dashboard/owner-workspace-capabilities";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { coachHomeHref, coachWithoutLocationsOrganizationId, isCoachRole } from "@/modules/owner-dashboard/domain/coach-access";

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
    scope = await resolveOwnerScope({ userId: user.id, ...query.data, surface: "coach_operations" });
  } catch (error) {
    const coachOrganizationId = coachWithoutLocationsOrganizationId(error);
    if (coachOrganizationId) redirect(coachHomeHref({ organizationId: coachOrganizationId }));
    if (
      error instanceof OperationalError &&
      (error.code === "FORBIDDEN" || error.code === "LOCATION_SCOPE_DENIED")
    ) {
      if (error.code === "FORBIDDEN" && !query.data.organizationId) redirect("/owner/setup");
      notFound();
    }
    throw error;
  }
  // P1 #8: a coach only has Hoy + Pasar lista; both live on the attendance page.
  if (isCoachRole(scope.member.role)) redirect(coachHomeHref({ organizationId: scope.organization.id, locationId: scope.selectedLocationId }));

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
  const [todaySessions, attentionItems, setupProgress] = await Promise.all([
    getOwnerTodaySessions({ scope, locationId: query.data.locationId }).catch((error: unknown) => {
      logger.error("Owner today sessions failed", error);
      return null;
    }),
    getOwnerAttentionItems({
      scope,
      locationId: query.data.locationId,
      includeFinancials: ownerWorkspaceCapabilitiesFor(scope.member).canManageFinancials,
    }).catch((error: unknown) => {
      logger.error("Owner attention items failed", error);
      return null;
    }),
    canSeeOwnerSetupChecklist(scope.member.role)
      ? getOwnerSetupProgress({ scope, locationId: query.data.locationId }).catch((error: unknown) => {
          logger.error("Owner setup checklist failed", error);
          return null;
        })
      : Promise.resolve(null),
  ]);
  return (
    <OwnerWorkspacePageShell
      member={scope.member}
      organizationId={scope.organization.id}
      locationId={scope.selectedLocationId}
    >
      <OwnerEssentialDashboard
        scope={scope}
        operationalSummary={operationalSummary}
        todaySessions={todaySessions}
        attentionItems={attentionItems}
        setupProgress={setupProgress}
      />
      <OwnerProductDiscovery
        organizationId={scope.organization.id}
        locationId={scope.selectedLocationId}
        role={scope.member.role}
      />
    </OwnerWorkspacePageShell>
  );
}
