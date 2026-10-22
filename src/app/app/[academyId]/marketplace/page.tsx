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
  params: Promise<{ academyId: string }>;
}) {
  const { academyId } = await params;
  const user = await getCurrentUser();
  if (!user) notFound();

  const owner = await assertAcademyOwner(academyId, user);
  if (!owner) notFound();

  const [academy] = await db
    .select({ id: academies.id, name: academies.name })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);
  if (!academy) notFound();

  return (
    <MarketplaceAdminClient
      academyId={academy.id}
      academyName={academy.name}
    />
  );
}
