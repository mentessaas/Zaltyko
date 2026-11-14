import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { OwnerGroupsManager } from "@/components/owner-dashboard/OwnerGroupsManager";
import { db } from "@/db";
import { isAthleteProgressAvailableForPage } from "@/modules/athlete-progress/application/athlete-progress-service";
import { OwnerWorkspacePageShell } from "@/components/owner-dashboard/OwnerWorkspacePageShell";
import { ownerUi } from "@/components/owner-dashboard/owner-ui";
import { createClient } from "@/lib/supabase/server";
import { getOwnerGroupsPageData } from "@/modules/groups/application/group-management-service";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { isSkillLevelsAvailableForPage } from "@/modules/skill-levels/application/skill-level-service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Grupos y equipos | Zaltyko",
  description: "Organiza los grupos por actividad y sede de tu academia.",
  robots: { index: false, follow: false },
};

const querySchema = z.object({
  organizationId: z.guid().optional(),
  locationId: z.guid().optional(),
  groupId: z.guid().optional(),
});

export default async function OwnerGroupsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/owner/groups");

  const raw = await searchParams;
  const query = querySchema.safeParse({
    organizationId:
      typeof raw.organizationId === "string" ? raw.organizationId : undefined,
    locationId:
      typeof raw.locationId === "string" && raw.locationId
        ? raw.locationId
        : undefined,
    groupId:
      typeof raw.groupId === "string" && raw.groupId ? raw.groupId : undefined,
  });
  if (!query.success) notFound();

  let data: Awaited<ReturnType<typeof getOwnerGroupsPageData>>;
  try {
    data = await getOwnerGroupsPageData({
      userId: user.id,
      ...query.data,
    });
  } catch (error) {
    if (error instanceof OperationalError) {
      if (error.code === "FORBIDDEN" && !query.data.organizationId) {
        redirect("/owner/setup");
      }
      if (
        error.code === "NOT_FOUND" ||
        error.code === "FORBIDDEN" ||
        error.code === "LOCATION_SCOPE_DENIED" ||
        error.code === "INVALID_RELATION"
      ) {
        notFound();
      }
    }
    throw error;
  }
  // P2 #17: sin el candidato SQL aplicado no se muestran los accesos.
  const progressAvailable = await isAthleteProgressAvailableForPage(db);
  // Niveles y progresión: con la bandera apagada o sin el candidato SQL no hay acceso.
  const skillLevelsAvailable = await isSkillLevelsAvailableForPage(db);
  const skillsQuery = new URLSearchParams({
    organizationId: data.organization.id,
    ...(data.selectedLocationId ? { locationId: data.selectedLocationId } : {}),
  }).toString();
  return (
    <OwnerWorkspacePageShell
      member={data.member}
      organizationId={data.organization.id}
      organizationName={data.organization.name}
      locationId={data.selectedLocationId}
    >
      {skillLevelsAvailable ? (
        <div className="mx-auto w-full max-w-6xl px-5 pt-7 sm:pt-9 lg:px-10">
          <Link href={`/owner/skills?${skillsQuery}`} className={ownerUi.secondaryButton}>
            Niveles y progresión
          </Link>
        </div>
      ) : null}
      <OwnerGroupsManager
        key={data.selectedGroupId ?? "none"}
        bundle={data}
        progressAvailable={progressAvailable}
      />
    </OwnerWorkspacePageShell>
  );
}
