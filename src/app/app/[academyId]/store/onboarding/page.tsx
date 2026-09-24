import { notFound } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/current-user";
import { assertAcademyOwner } from "@/lib/actor-pages/guard";
import { StripeOnboardingClient } from "@/components/store-admin/StripeOnboardingClient";

export default async function StripeOnboardingPage({
  params,
  searchParams,
}: {
  params: Promise<{ academyId: string }>;
  searchParams: Promise<{ done?: string; refresh?: string; returnUrl?: string }>;
}) {
  const { academyId } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) notFound();
  if (!(await assertAcademyOwner(academyId, user))) notFound();

  const returnUrl =
    sp.returnUrl ?? `/app/${academyId}/store/onboarding?done=1`;

  return (
    <StripeOnboardingClient
      academyId={academyId}
      returnUrl={returnUrl}
      done={sp.done === "1"}
    />
  );
}