import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { OwnerStaffManager } from "@/components/owner-dashboard/OwnerStaffManager";
import { OwnerWorkspacePageShell } from "@/components/owner-dashboard/OwnerWorkspacePageShell";
import { OwnerTeamAccessPanel } from "@/components/owner/OwnerTeamAccessPanel";
import { createClient } from "@/lib/supabase/server";
import { isCanonicalTeamAccessAvailable } from "@/modules/staff/application/canonical-team-access";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Equipo | Zaltyko",
  description: "Organiza a las personas que forman parte de tu club.",
  robots: { index: false, follow: false },
};

const querySchema = z.object({ organizationId: z.guid().optional() }).strict();

export default async function OwnerStaffPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient(await cookies());
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/owner/staff");

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

  // Personal (directory) stays with the owner with every site. Team
  // invitations (O3) also open to admin with every site and to managers, but
  // only when the flag is on and the reviewed candidate is installed.
  const ownerAll = scope.member.role === "owner" && scope.member.locationScopeMode === "all";
  const invitationManager = ((scope.member.role === "owner" || scope.member.role === "admin") && scope.member.locationScopeMode === "all")
    || scope.member.role === "manager";
  const teamAccessAvailable = invitationManager ? await isCanonicalTeamAccessAvailable() : false;
  if (!ownerAll && !teamAccessAvailable) notFound();

  if (!query.data.organizationId) {
    redirect(`/owner/staff?organizationId=${encodeURIComponent(scope.organization.id)}`);
  }

  return (
    <OwnerWorkspacePageShell
      member={scope.member}
      organizationId={scope.organization.id}
    >
      {ownerAll && teamAccessAvailable ? (
        <>
          <OwnerStaffManager key={`staff:${scope.organization.id}`} organizationId={scope.organization.id} organizationName={scope.organization.name} />
          <OwnerTeamAccessPanel key={`access:${scope.organization.id}`} organizationId={scope.organization.id} />
        </>
      ) : ownerAll ? (
        <OwnerStaffManager key={`staff:${scope.organization.id}`} organizationId={scope.organization.id} organizationName={scope.organization.name} />
      ) : (
        <OwnerTeamAccessPanel key={`access:${scope.organization.id}`} organizationId={scope.organization.id} />
      )}
    </OwnerWorkspacePageShell>
  );
}
