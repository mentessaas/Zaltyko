import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { OwnerGroupsManager } from "@/components/owner-dashboard/OwnerGroupsManager";
import { createClient } from "@/lib/supabase/server";
import { getOwnerGroupsPageData } from "@/modules/groups/application/group-management-service";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Grupos y equipos | Zaltyko",
  description: "Organiza los grupos por actividad y sede de tu academia.",
  robots: { index: false, follow: false },
};

const querySchema = z.object({
  organizationId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
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
  return (
    <OwnerGroupsManager key={data.selectedGroupId ?? "none"} bundle={data} />
  );
}
