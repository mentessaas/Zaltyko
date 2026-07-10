import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { MessagesPage as InternalMessagesPage } from "@/components/messages/MessagesPage";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { academies, memberships, profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

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
    title: `Mensajes · ${academy?.name ?? "Academia"}`,
    description: "Conversaciones internas con la academia y las familias.",
  };
}

export default async function MessagesRoute({ params }: PageProps) {
  const { academyId } = await params;
  const supabase = await createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const [[profile], [membership], [academy]] = await Promise.all([
    db
      .select({ id: profiles.id, name: profiles.name, role: profiles.role, photoUrl: profiles.photoUrl })
      .from(profiles)
      .where(eq(profiles.userId, user.id))
      .limit(1),
    db
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.userId, user.id), eq(memberships.academyId, academyId)))
      .limit(1),
    db
      .select({ id: academies.id, ownerId: academies.ownerId })
      .from(academies)
      .where(eq(academies.id, academyId))
      .limit(1),
  ]);

  if (!profile || !membership || !academy) redirect("/app");

  const canManageContactMessages =
    profile.role === "admin" ||
    profile.role === "super_admin" ||
    membership.role === "owner" ||
    academy.ownerId === profile.id;

  return (
    <div className="space-y-6 py-6 lg:py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Mensajes</h1>
          <p className="text-sm text-muted-foreground">
            Historial interno entre la academia, entrenadores y familias.
          </p>
        </div>
        {canManageContactMessages ? (
          <Button asChild variant="outline">
            <Link href={`/app/${academyId}/contact-messages`}>Consultas del directorio</Link>
          </Button>
        ) : null}
      </div>

      <div className="min-h-[560px] overflow-hidden rounded-xl border bg-background">
        <InternalMessagesPage
          academyId={academyId}
          currentUserId={profile.id}
          currentUserRole={membership.role ?? profile.role}
          currentUserProfile={{ fullName: profile.name ?? undefined, avatarUrl: profile.photoUrl ?? undefined }}
        />
      </div>
    </div>
  );
}
