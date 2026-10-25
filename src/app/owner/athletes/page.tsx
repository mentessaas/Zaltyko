import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { OwnerAthleteIntakeWorkspace } from "@/components/owner-dashboard/OwnerAthleteIntakeWorkspace";
import { createClient } from "@/lib/supabase/server";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Gimnastas | Zaltyko",
  description: "Crea fichas y gestiona la bandeja de gimnastas sin asignación operativa.",
  robots: { index: false, follow: false },
};

const querySchema = z.object({ organizationId: z.guid().optional() }).strict();

export default async function OwnerAthletesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient(await cookies());
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/owner/athletes");

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

  if ((scope.member.role !== "owner" && scope.member.role !== "admin") || scope.member.locationScopeMode !== "all") {
    notFound();
  }

  if (!query.data.organizationId) {
    redirect(`/owner/athletes?organizationId=${encodeURIComponent(scope.organization.id)}`);
  }

  // The page validates only the signed-in Owner/Admin scope. Athlete, family,
  // and group records are fetched after mount from the tenant-checked API.
  return <OwnerAthleteIntakeWorkspace organizationId={scope.organization.id} organizationName={scope.organization.name} />;
}
