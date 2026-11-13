import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { OwnerAthleteImportWorkspace } from "@/components/owner-dashboard/OwnerAthleteImportWorkspace";
import { OwnerWorkspacePageShell } from "@/components/owner-dashboard/OwnerWorkspacePageShell";
import { createClient } from "@/lib/supabase/server";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Importar gimnastas | Zaltyko",
  description: "Importa gimnastas, tutores y grupos desde Excel o CSV con vista previa.",
  robots: { index: false, follow: false },
};

const querySchema = z.object({ organizationId: z.guid().optional() }).strict();

export default async function OwnerAthleteImportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient(await cookies());
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/owner/athletes/import");

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

  // Same rule as the manual intake: owner or admin with every site. The routes
  // and the import service check it again.
  if ((scope.member.role !== "owner" && scope.member.role !== "admin") || scope.member.locationScopeMode !== "all") {
    notFound();
  }

  if (!query.data.organizationId) {
    redirect(`/owner/athletes/import?organizationId=${encodeURIComponent(scope.organization.id)}`);
  }

  return (
    <OwnerWorkspacePageShell
      member={scope.member}
      organizationId={scope.organization.id}
      organizationName={scope.organization.name}
      locationId={scope.selectedLocationId}
    >
      <OwnerAthleteImportWorkspace
        organizationId={scope.organization.id}
        organizationName={scope.organization.name}
      />
    </OwnerWorkspacePageShell>
  );
}
