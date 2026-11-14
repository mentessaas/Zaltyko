import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { OwnerFamilyAccessManager } from "@/components/owner-dashboard/OwnerFamilyAccessManager";
import { OwnerFamilyNoticesPanel } from "@/components/owner-dashboard/OwnerFamilyNoticesPanel";
import { OwnerWorkspacePageShell } from "@/components/owner-dashboard/OwnerWorkspacePageShell";
import { ownerUi } from "@/components/owner-dashboard/owner-ui";
import { PageHeader } from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { isFamilyAccessAvailableForPage } from "@/modules/family-access/application/family-access-storage";
import { getOwnerNoticesBundle } from "@/modules/family-access/application/family-notices";
import { listOwnerFamilyAccess } from "@/modules/family-access/application/guardian-invitations";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Familias y avisos | Zaltyko",
  description: "Da acceso al portal a las familias y avísales de cambios en las sesiones.",
  robots: { index: false, follow: false },
};

const querySchema = z.object({ organizationId: z.guid().optional() }).strict();

/**
 * Familias y avisos: acceso al portal por invitación y avisos de sesión.
 * Detrás de ZALTYKO_FAMILY_ACCESS_ENABLED y del candidato SQL; sin las dos
 * cosas la página no existe (404).
 */
export default async function OwnerFamiliesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await isFamilyAccessAvailableForPage())) notFound();
  const supabase = await createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/owner/familias");

  const raw = await searchParams;
  const query = querySchema.safeParse({
    organizationId: typeof raw.organizationId === "string" ? raw.organizationId : undefined,
  });
  if (!query.success) notFound();

  let scope: Awaited<ReturnType<typeof resolveOwnerScope>>;
  try {
    scope = await resolveOwnerScope({ userId: user.id, organizationId: query.data.organizationId });
  } catch (error) {
    if (error instanceof OperationalError) {
      if (error.code === "FORBIDDEN" && !query.data.organizationId) redirect("/owner/setup");
      if (["FORBIDDEN", "LOCATION_SCOPE_DENIED", "INVALID_RELATION", "NOT_FOUND"].includes(error.code)) notFound();
    }
    throw error;
  }
  const locationId = scope.selectedLocationId ?? scope.locations[0]?.id ?? null;
  if (!locationId) notFound();
  const actor = { userId: user.id, memberId: scope.member.id };
  const input = { organizationId: scope.organization.id, locationId, actor };
  const allSites = scope.member.locationScopeMode === "all";

  const [access, notices] = await Promise.all([
    allSites ? listOwnerFamilyAccess(input) : Promise.resolve(null),
    getOwnerNoticesBundle(input),
  ]);

  return (
    <OwnerWorkspacePageShell
      member={scope.member}
      organizationId={scope.organization.id}
      organizationName={scope.organization.name}
      locationId={scope.selectedLocationId}
    >
      <div className={ownerUi.page}>
        <PageHeader
          title="Familias y avisos"
          description="Invita a las familias al portal y avísales cuando cambie o se cancele una sesión. Sin grupo de WhatsApp: cada familia ve solo lo de sus gimnastas."
          className={ownerUi.pageHeader}
        />
        <div className="space-y-8">
          {access ? (
            <OwnerFamilyAccessManager
              organizationId={scope.organization.id}
              locationId={locationId}
              guardians={access.guardians}
              truncated={access.truncated}
            />
          ) : (
            <p className={ownerUi.noticeInfo}>
              El acceso de las familias al portal lo gestiona quien tiene acceso a todas las sedes de la academia.
            </p>
          )}
          <OwnerFamilyNoticesPanel organizationId={scope.organization.id} bundle={notices} />
        </div>
      </div>
    </OwnerWorkspacePageShell>
  );
}
