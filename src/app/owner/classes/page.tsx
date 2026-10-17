import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { OwnerClassesManager } from "@/components/owner-dashboard/OwnerClassesManager";
import { createClient } from "@/lib/supabase/server";
import { getOwnerClassesPageData } from "@/modules/scheduling/application/class-management-service";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Clases recurrentes | Zaltyko",
  description:
    "Organiza entrenamientos semanales y genera sus próximas sesiones.",
  robots: { index: false, follow: false },
};

const querySchema = z.object({
  organizationId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
});

export default async function OwnerClassesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/owner/classes");

  const raw = await searchParams;
  const query = querySchema.safeParse({
    organizationId:
      typeof raw.organizationId === "string" ? raw.organizationId : undefined,
    locationId:
      typeof raw.locationId === "string" && raw.locationId
        ? raw.locationId
        : undefined,
  });
  if (!query.success) notFound();

  let bundle: Awaited<ReturnType<typeof getOwnerClassesPageData>>;
  try {
    bundle = await getOwnerClassesPageData({ userId: user.id, ...query.data });
  } catch (error) {
    if (error instanceof OperationalError) {
      if (error.code === "FORBIDDEN" && !query.data.organizationId) {
        redirect("/owner/setup");
      }
      if (
        error.code === "FORBIDDEN" ||
        error.code === "LOCATION_SCOPE_DENIED" ||
        error.code === "INVALID_RELATION"
      ) {
        notFound();
      }
    }
    throw error;
  }

  return <OwnerClassesManager bundle={bundle} />;
}
