import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Metadata } from "next";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, memberships, profiles, contactMessages } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { ContactMessagesList } from "@/components/messages/ContactMessagesList";
import { desc } from "drizzle-orm";

interface PageProps {
  params: {
    academyId: string;
  };
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const [academy] = await db
    .select({ name: academies.name })
    .from(academies)
    .where(eq(academies.id, params.academyId))
    .limit(1);

  const name = academy?.name ?? "Academia";

  return {
    title: `${name} · Mensajes de contacto`,
    description: `Mensajes de contacto recibidos para la academia ${name}.`,
  };
}

export default async function MessagesPage({ params }: PageProps) {
  const { academyId } = params;
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const [profile] = await db
    .select({
      id: profiles.id,
      name: profiles.name,
      role: profiles.role,
      tenantId: profiles.tenantId,
    })
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  const [membership] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(
      and(eq(memberships.userId, user.id), eq(memberships.academyId, academyId))
    )
    .limit(1);

  // Obtener información de la academia
  const [academy] = await db
    .select({
      id: academies.id,
      name: academies.name,
      ownerId: academies.ownerId,
      tenantId: academies.tenantId,
    })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!academy) {
    redirect("/dashboard");
  }

  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";
  const isOwner = academy.ownerId === profile?.id || membership?.role === "owner";

  if (!isAdmin && !isOwner) {
    redirect(`/app/${academyId}/dashboard`);
  }

  // Obtener mensajes de contacto
  const messages = await db
    .select()
    .from(contactMessages)
    .where(eq(contactMessages.academyId, academyId))
    .orderBy(desc(contactMessages.createdAt));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Mensajes de contacto</h1>
        <p className="text-sm text-muted-foreground">
          Gestiona los mensajes recibidos desde el directorio público de academias.
        </p>
      </div>

      <ContactMessagesList
        academyId={academyId}
        initialMessages={messages.map((m) => ({
          id: m.id,
          academyId: m.academyId,
          contactName: m.contactName,
          contactEmail: m.contactEmail,
          contactPhone: m.contactPhone,
          message: m.message,
          read: m.read,
          readAt: m.readAt?.toISOString() || null,
          responded: m.responded,
          respondedAt: m.respondedAt?.toISOString() || null,
          archived: m.archived,
          createdAt: m.createdAt?.toISOString() || null,
        }))}
      />
    </div>
  );
}

