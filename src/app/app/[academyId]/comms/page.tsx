import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Metadata } from "next";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, memberships } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { CommunicationHub } from "@/components/communication/CommunicationHub";
import { Breadcrumb } from "@/components/ui/breadcrumb";

interface PageProps {
  params: Promise<{
    academyId: string;
  }>;
}

/**
 * Centro de comunicacion interno unificado.
 *
 * Reemplaza la necesidad de navegar entre /messages, /announcements
 * y /notifications con un hub con tabs. P3 del backlog.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { academyId } = await params;
  const [academy] = await db
    .select({ name: academies.name })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  return {
    title: `Comunicacion · ${academy?.name ?? "Academia"}`,
    description: "Centro unificado de mensajes, anuncios y notificaciones.",
  };
}

export default async function CommunicationCenterPage({ params }: PageProps) {
  const { academyId } = await params;
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Verify user has membership in the academy
  const [membership] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, user.id), eq(memberships.academyId, academyId)))
    .limit(1);

  if (!membership) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6 py-6 lg:py-8">
      <Breadcrumb
        items={[
          { label: "Dashboard", href: `/app/${academyId}/dashboard` },
          { label: "Comunicacion" },
        ]}
      />
      <div>
        <h1 className="font-display text-2xl font-semibold">Centro de comunicacion</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Mensajes directos, anuncios de la academia y notificaciones in-app en un solo lugar.
        </p>
      </div>
      <CommunicationHub academyId={academyId} />
    </div>
  );
}