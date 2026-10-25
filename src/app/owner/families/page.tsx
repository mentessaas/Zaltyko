import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { OwnerFamiliesDirectory } from "@/components/owner-dashboard/OwnerFamiliesDirectory";
import { createClient } from "@/lib/supabase/server";
import { getOwnerFamilyOptions } from "@/modules/families/application/owner-family-association";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Familias | Zaltyko",
  description: "Consulta las familias vinculadas a las inscripciones de cada sede.",
  robots: { index: false, follow: false },
};

const querySchema = z.object({
  organizationId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
});

export default async function OwnerFamiliesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/owner/families");

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

  let scope: Awaited<ReturnType<typeof resolveOwnerScope>>;
  try {
    scope = await resolveOwnerScope({
      userId: user.id,
      organizationId: query.data.organizationId,
      locationId: query.data.locationId,
    });
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

  const locationId =
    query.data.locationId ??
    scope.selectedLocationId ??
    scope.locations[0]?.id ??
    "";
  if (!locationId) notFound();

  let families: Awaited<ReturnType<typeof getOwnerFamilyOptions>>["families"];
  try {
    const options = await getOwnerFamilyOptions({
      organizationId: scope.organization.id,
      locationId,
      actor: { userId: user.id, memberId: scope.member.id },
    });
    families = options.families;
  } catch (error) {
    if (
      error instanceof OperationalError &&
      ["FORBIDDEN", "LOCATION_SCOPE_DENIED", "INVALID_RELATION", "NOT_FOUND"].includes(
        error.code
      )
    ) {
      notFound();
    }
    throw error;
  }

  return (
    <OwnerFamiliesDirectory
      organizationId={scope.organization.id}
      organizationName={scope.organization.name}
      locations={scope.locations}
      selectedLocationId={locationId}
      families={families}
      canManageBilling={scope.member.role === "owner" || scope.member.role === "admin"}
    />
  );
}
