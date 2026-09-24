import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { academies } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertAcademyOwner } from "@/lib/actor-pages/guard";
import { MarketplaceAdminClient } from "@/components/marketplace/MarketplaceAdminClient";

export default async function MarketplaceAdminPage({
  params,
}: {
  params: { academyId: string };
}) {
  const user = await getCurrentUser();
  if (!user) notFound();

  const owner = await assertAcademyOwner(params.academyId, user);
  if (!owner) notFound();

  const [academy] = await db
    .select({ id: academies.id, name: academies.name })
    .from(academies)
    .where(eq(academies.id, params.academyId))
    .limit(1);
  if (!academy) notFound();

  return (
    <MarketplaceAdminClient
      academyId={academy.id}
      academyName={academy.name}
    />
  );
}
