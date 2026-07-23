import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { MessageSquare } from "lucide-react";

import { MessagesPage as InternalMessagesPage } from "@/components/messages/MessagesPage";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { academies, classSessions, classes, groups, memberships, profiles } from "@/db/schema";
import { getDevSessionFromCookieStore } from "@/lib/dev-session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";

interface PageProps {
  params: Promise<{ academyId: string }>;
  searchParams?: Promise<{ session?: string }>;
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

export default async function MessagesRoute({ params, searchParams }: PageProps) {
  const { academyId } = await params;
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const devSession = await getDevSessionFromCookieStore(cookieStore);
  const userId = user?.id ?? devSession?.userId;

  if (!userId) redirect("/auth/login");

  const [[profile], [membership], [academy]] = await Promise.all([
    db
      .select({ id: profiles.id, name: profiles.name, role: profiles.role, photoUrl: profiles.photoUrl })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1),
    db
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.academyId, academyId)))
      .limit(1),
    db
      .select({ id: academies.id, ownerId: academies.ownerId, tenantId: academies.tenantId })
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

  const resolvedSearchParams = (await searchParams) ?? {};
  const sessionId = resolvedSearchParams.session;
  const canSendGroupAlert =
    profile.role === "coach" ||
    profile.role === "admin" ||
    profile.role === "owner" ||
    profile.role === "super_admin" ||
    membership.role === "owner";
  const isUuid =
    typeof sessionId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId);

  const [sessionContext] = canSendGroupAlert && isUuid
    ? await db
        .select({
          id: classSessions.id,
          className: classes.name,
          groupName: groups.name,
          sessionDate: classSessions.sessionDate,
        })
        .from(classSessions)
        .innerJoin(classes, eq(classSessions.classId, classes.id))
        .leftJoin(groups, eq(classes.groupId, groups.id))
        .where(
          and(
            eq(classSessions.id, sessionId),
            eq(classSessions.tenantId, academy.tenantId),
            eq(classes.tenantId, academy.tenantId),
            eq(classes.academyId, academyId)
          )
        )
        .limit(1)
    : [];

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: `/app/${academyId}/dashboard` },
          { label: "Mensajes" },
        ]}
        title="Mensajes"
        description="Historial interno entre la academia, entrenadores y familias."
        icon={<MessageSquare className="h-5 w-5" strokeWidth={1.8} />}
        actions={
          canManageContactMessages ? (
            <Button asChild variant="outline">
              <Link href={`/app/${academyId}/contact-messages`}>Consultas del directorio</Link>
            </Button>
          ) : null
        }
      />

      <div className="min-h-[560px] overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-[0_18px_50px_-32px_rgba(15,23,42,0.45)]">
        <InternalMessagesPage
          academyId={academyId}
          currentUserId={profile.id}
          currentUserRole={profile.role}
          currentUserProfile={{ fullName: profile.name ?? undefined, avatarUrl: profile.photoUrl ?? undefined }}
          sessionContext={sessionContext ?? null}
        />
      </div>
    </div>
  );
}
