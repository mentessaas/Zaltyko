import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, memberships, profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { getDevSessionFromCookieStore } from "@/lib/dev-session";
import { getOwnerAttentionBundle } from "@/lib/dashboard/attention-bundle";
import { OwnerAttentionPanel } from "@/components/dashboard/OwnerAttentionPanel";

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
    title: `${academy?.name ?? "Academia"} · Panel de un vistazo`,
    description:
      "Vista operativa del dueño: clase de hoy, asistencia, mensajes, cargos y acción prioritaria.",
  };
}

/**
 * Página `/app/[academyId]/dashboard/at-a-glance` — Dashboard operativo del
 * dueño bajo el contrato ZAL-619 §3.2. Esta página NO reemplaza al
 * dashboard de vanity board existente; ambas conviven. La nueva ruta está
 * pensada para el recorrido "primera hora de la mañana" del dueño.
 */
export default async function OwnerAtAGlancePage({ params }: PageProps) {
  const { academyId } = await params;
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const devSession = await getDevSessionFromCookieStore(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const effectiveUserId = user?.id ?? devSession?.userId ?? null;

  if (!effectiveUserId) {
    redirect(`/auth/login?next=/app/${academyId}/dashboard/at-a-glance`);
  }

  // Resolver academia y su tenant.
  const [academy] = await db
    .select({ id: academies.id, name: academies.name, tenantId: academies.tenantId })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!academy) {
    // Renderizamos boundary a nivel ruta; aquí devolvemos un redirect amable.
    redirect(`/app`);
  }

  // Resolver profile + membership.
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

  const allowedRoles = new Set(["owner", "admin", "super_admin"]);
  const isMember = profile && allowedRoles.has(profile.role);
  const isOwner = membership?.role === "owner" || isMember;
  if (!isOwner) {
    // Un coach o viewer no debe ver el panel del dueño. Lo mandamos al modo
    // simple del coach para que tenga un destino coherente.
    redirect(`/app/${academyId}/coach/today-simple`);
  }

  const bundle = await getOwnerAttentionBundle({
    academyId,
    tenantId: academy.tenantId,
  });

  return (
    <OwnerAttentionPanel
      bundle={bundle}
      academyName={academy.name}
      profileName={profile?.name ?? user?.email ?? null}
    />
  );
}
