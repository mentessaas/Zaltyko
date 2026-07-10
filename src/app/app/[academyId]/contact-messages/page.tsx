import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";

import { ContactMessagesList } from "@/components/messages/ContactMessagesList";
import { db } from "@/db";
import { academies, contactMessages, memberships, profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  params: Promise<{ academyId: string }>;
}

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Consultas del directorio",
  description: "Mensajes recibidos desde el directorio público de academias.",
};

export default async function ContactMessagesPage({ params }: PageProps) {
  const { academyId } = await params;
  const supabase = await createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const [[profile], [membership], [academy]] = await Promise.all([
    db.select({ id: profiles.id, role: profiles.role }).from(profiles).where(eq(profiles.userId, user.id)).limit(1),
    db.select({ role: memberships.role }).from(memberships).where(and(eq(memberships.userId, user.id), eq(memberships.academyId, academyId))).limit(1),
    db.select({ ownerId: academies.ownerId }).from(academies).where(eq(academies.id, academyId)).limit(1),
  ]);

  const canManage =
    profile &&
    academy &&
    (profile.role === "admin" ||
      profile.role === "super_admin" ||
      membership?.role === "owner" ||
      academy.ownerId === profile.id);

  if (!canManage) redirect(`/app/${academyId}/messages`);

  const messages = await db
    .select()
    .from(contactMessages)
    .where(eq(contactMessages.academyId, academyId))
    .orderBy(desc(contactMessages.createdAt));

  return (
    <div className="space-y-6 py-6 lg:py-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Consultas del directorio</h1>
        <p className="text-sm text-muted-foreground">
          Mensajes recibidos desde la ficha pública de la academia.
        </p>
      </div>
      <ContactMessagesList
        academyId={academyId}
        initialMessages={messages.map((message) => ({
          id: message.id,
          academyId: message.academyId,
          contactName: message.contactName,
          contactEmail: message.contactEmail,
          contactPhone: message.contactPhone,
          message: message.message,
          read: message.read,
          readAt: message.readAt?.toISOString() ?? null,
          responded: message.responded,
          respondedAt: message.respondedAt?.toISOString() ?? null,
          archived: message.archived,
          createdAt: message.createdAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
