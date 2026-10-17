import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

import { OwnerAttentionPanel } from "@/components/dashboard/OwnerAttentionPanel";
import { getLegacyOwnerAcademyAccess } from "@/lib/auth/legacy-academy-access";
import { getDevSessionFromCookieStore } from "@/lib/dev-session";
import { getOwnerAttentionBundle } from "@/lib/dashboard/attention-bundle";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  params: Promise<{ academyId: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Panel de un vistazo · Zaltyko",
    description:
      "Vista operativa de la academia: clases, asistencia y acciones prioritarias.",
  };
}

export default async function OwnerAtAGlancePage({ params }: PageProps) {
  const { academyId } = await params;
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const devSession =
    process.env.NODE_ENV === "production"
      ? null
      : await getDevSessionFromCookieStore(cookieStore);
  const effectiveUserId = user?.id ?? devSession?.userId ?? null;

  if (!effectiveUserId) {
    redirect(`/auth/login?next=/app/${academyId}/dashboard/at-a-glance`);
  }

  const access = await getLegacyOwnerAcademyAccess(effectiveUserId, academyId);
  if (!access?.allowed || !access.academy) notFound();

  const bundle = await getOwnerAttentionBundle({
    academyId: access.academy.id,
    tenantId: access.academy.tenantId,
  });

  return (
    <OwnerAttentionPanel
      bundle={bundle}
      academyName={access.academy.name}
      profileName={access.profile.name ?? user?.email ?? null}
    />
  );
}
