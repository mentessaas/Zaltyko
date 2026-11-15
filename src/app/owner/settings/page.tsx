import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { OwnerAcademySettingsManager } from "@/components/owner-dashboard/OwnerAcademySettingsManager";
import { OwnerWorkspacePageShell } from "@/components/owner-dashboard/OwnerWorkspacePageShell";
import { ownerUi } from "@/components/owner-dashboard/owner-ui";
import { PageHeader } from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ajustes | Zaltyko",
  description: "Datos de tu academia y sus sedes.",
  robots: { index: false, follow: false },
};

const querySchema = z.object({ organizationId: z.guid().optional() }).strict();

export default async function OwnerSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient(await cookies());
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/owner/settings");

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
  if (scope.member.role !== "owner" || scope.member.locationScopeMode !== "all") notFound();
  if (!query.data.organizationId) {
    redirect(`/owner/settings?organizationId=${encodeURIComponent(scope.organization.id)}`);
  }

  return (
    <OwnerWorkspacePageShell
      member={scope.member}
      organizationId={scope.organization.id}
      organizationName={scope.organization.name}
    >
      <main className={ownerUi.page}>
        <PageHeader
          title="Ajustes"
          description="Los datos de tu academia y sus sedes."
          className={ownerUi.pageHeader}
        />
        <OwnerAcademySettingsManager key={scope.organization.id} organizationId={scope.organization.id} />
      </main>
    </OwnerWorkspacePageShell>
  );
}
