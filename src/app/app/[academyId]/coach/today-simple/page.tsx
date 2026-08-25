import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, memberships, profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { getDevSessionFromCookieStore } from "@/lib/dev-session";
import { getCoachAttentionBundle } from "@/lib/dashboard/attention-bundle";
import { CoachSimplePanel } from "@/components/dashboard/CoachSimplePanel";

interface PageProps {
  params: Promise<{ academyId: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { academyId } = await params;
  const [academy] = await db
    .select({ name: academies.name })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);
  return {
    title: `${academy?.name ?? "Academia"} · Modo simple del coach`,
    description:
      "Vista de solo lectura para el coach: clases de hoy, asistencia pendiente y mensajes.",
  };
}

/**
 * Página `/app/[academyId]/coach/today-simple` — Modo simple y read-only
 * para coaches, según ZAL-619 §4 y la matriz de ZAL-624. No expone cobros,
 * import ni configuración administrativa; eso queda en el panel del dueño
 * `/app/[academyId]/dashboard/at-a-glance`.
 */
export default async function CoachTodaySimplePage({ params }: PageProps) {
  const { academyId } = await params;
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const devSession = await getDevSessionFromCookieStore(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const effectiveUserId = user?.id ?? devSession?.userId ?? null;

  if (!effectiveUserId) {
    redirect(`/auth/login?next=/app/${academyId}/coach/today-simple`);
  }

  const [academy] = await db
    .select({ id: academies.id, name: academies.name, tenantId: academies.tenantId })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!academy) {
    redirect(`/app`);
  }

  const [profile] = await db
    .select({ id: profiles.id, name: profiles.name, role: profiles.role })
    .from(profiles)
    .where(eq(profiles.userId, effectiveUserId))
    .limit(1);

  const [membership] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(
      and(eq(memberships.userId, effectiveUserId), eq(memberships.academyId, academyId))
    )
    .limit(1);

  // Permitimos coach, owner, admin y super_admin (debug).
  // Un viewer queda fuera: lo mandamos al portal familiar si existe la ruta.
  const allowedProfileRoles = new Set(["owner", "admin", "super_admin", "coach"]);
  const allowedMembershipRoles = new Set(["owner", "admin", "coach"]);
  const isAllowed =
    (profile && allowedProfileRoles.has(profile.role)) ||
    (membership && allowedMembershipRoles.has(membership.role));
  if (!isAllowed) {
    redirect(`/app/${academyId}/my-dashboard`);
  }

  const bundle = await getCoachAttentionBundle({
    academyId,
    tenantId: academy.tenantId,
  });

  return (
    <CoachSimplePanel
      bundle={bundle}
      academyName={academy.name}
      profileName={profile?.name ?? user?.email ?? null}
    />
  );
}
