import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { OwnerDashboardView } from "@/components/owner-dashboard/OwnerDashboardView";
import { createClient } from "@/lib/supabase/server";
import {
  getOwnerDashboard,
  ownerDashboardQuerySchema,
} from "@/modules/owner-dashboard/application/get-owner-dashboard";
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

  return <OwnerDashboardView bundle={bundle} />;
}
