import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { OwnerSaasBillingManager } from "@/components/owner-dashboard/OwnerSaasBillingManager";
import { db } from "@/db";
import { organizationMembers, organizations } from "@/db/zaltyko-schema";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Plan y facturación | Zaltyko",
  description: "Consulta y gestiona el plan SaaS de tu academia.",
  robots: { index: false, follow: false },
};

const querySchema = z.object({ organizationId: z.string().uuid().optional() });

export default async function OwnerSaasBillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const query = querySchema.safeParse({
    organizationId:
      typeof raw.organizationId === "string" ? raw.organizationId : undefined,
  });
  if (!query.success) notFound();

  const supabase = await createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const next = `/owner/subscription${query.data.organizationId ? `?organizationId=${query.data.organizationId}` : ""}`;
    redirect(`/auth/login?next=${encodeURIComponent(next)}`);
  }

  // This lookup builds the page shell without requiring a selected location.
  // The SaaS API independently verifies the Owner scope for every operation.
  const membershipConditions = [
    eq(organizationMembers.userId, user.id),
    eq(organizationMembers.status, "active"),
    eq(organizationMembers.role, "owner"),
  ];
  if (query.data.organizationId) {
    membershipConditions.push(
      eq(organizationMembers.organizationId, query.data.organizationId)
    );
  }

  const memberships = await db
    .select({
      organizationId: organizationMembers.organizationId,
      organizationName: organizations.name,
    })
    .from(organizationMembers)
    .innerJoin(
      organizations,
      eq(organizations.id, organizationMembers.organizationId)
    )
    .where(and(...membershipConditions))
    .orderBy(asc(organizations.name))
    .limit(100);

  const organization = memberships[0];
  if (!organization) notFound();

  return (
    <OwnerSaasBillingManager
      organizationId={organization.organizationId}
      organizationName={organization.organizationName}
    />
  );
}
