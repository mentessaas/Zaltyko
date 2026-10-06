import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { InsightInbox } from "@/components/owner-dashboard/InsightInbox";
import { createClient } from "@/lib/supabase/server";
import {
  insightListQuerySchema,
  listInsights,
} from "@/modules/insights/application/insight-query";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export const dynamic = "force-dynamic";

export default async function OwnerInsightsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/owner/insights");

  const raw = await searchParams;
  const query = insightListQuerySchema.safeParse({
    organizationId:
      typeof raw.organizationId === "string" ? raw.organizationId : undefined,
    locationId:
      typeof raw.locationId === "string" && raw.locationId
        ? raw.locationId
        : undefined,
    status: typeof raw.status === "string" ? raw.status : undefined,
    cursor: typeof raw.cursor === "string" ? raw.cursor : undefined,
    limit: 20,
  });
  if (!query.success) notFound();

  let bundle: Awaited<ReturnType<typeof listInsights>>;
  try {
    bundle = await listInsights({ userId: user.id, ...query.data });
  } catch (error) {
    if (
      error instanceof OperationalError &&
      ["FORBIDDEN", "LOCATION_SCOPE_DENIED", "INVALID_RELATION"].includes(
        error.code
      )
    ) {
      notFound();
    }
    throw error;
  }
  return <InsightInbox bundle={bundle} />;
}
