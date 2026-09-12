import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { academies, profiles, ticketResponses, tickets } from "@/db/schema";
import { getCurrentProfile } from "@/lib/authz";
import { getDevSessionFromCookieStore } from "@/lib/dev-session";
import { createClient } from "@/lib/supabase/server";
import { logAdminAction } from "@/lib/admin-logs";
import { TicketDetail } from "@/components/support/TicketDetail";
import { TicketStatus } from "@/components/support/TicketFilters";

export const dynamic = "force-dynamic";

type SearchParamValue = string | string[] | undefined;

interface PageProps {
  params: Promise<{ ticketId: string }>;
  searchParams: Promise<{ returnTo?: SearchParamValue }>;
}

function firstSearchParam(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

async function getTicket(ticketId: string) {
  const [row] = await db
    .select({
      id: tickets.id,
      title: tickets.title,
      description: tickets.description,
      status: tickets.status,
      priority: tickets.priority,
      category: tickets.category,
      createdAt: tickets.createdAt,
      updatedAt: tickets.updatedAt,
      resolvedAt: tickets.resolvedAt,
      closedAt: tickets.closedAt,
      createdById: tickets.createdBy,
      creatorName: profiles.name,
      academyId: tickets.academyId,
      academyName: academies.name,
    })
    .from(tickets)
    .leftJoin(profiles, eq(tickets.createdBy, profiles.id))
    .leftJoin(academies, eq(tickets.academyId, academies.id))
    .where(eq(tickets.id, ticketId))
    .limit(1);

  if (!row) return null;

  const responseRows = await db
    .select({
      id: ticketResponses.id,
      message: ticketResponses.message,
      isInternal: ticketResponses.isInternal,
      createdAt: ticketResponses.createdAt,
      userId: ticketResponses.userId,
      userName: profiles.name,
    })
    .from(ticketResponses)
    .leftJoin(profiles, eq(ticketResponses.userId, profiles.id))
    .where(eq(ticketResponses.ticketId, ticketId))
    .orderBy(asc(ticketResponses.createdAt));

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    category: row.category,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    resolvedAt: row.resolvedAt ?? undefined,
    closedAt: row.closedAt ?? undefined,
    createdBy: { id: row.createdById, fullName: row.creatorName ?? "Academia", email: "" },
    academy: row.academyId ? { id: row.academyId, name: row.academyName ?? "Academia" } : undefined,
    responses: responseRows.map((response) => ({
      id: response.id,
      message: response.message,
      isInternal: response.isInternal ?? false,
      createdAt: response.createdAt,
      user: { id: response.userId, fullName: response.userName ?? "Soporte" },
      attachments: [],
    })),
  };
}

export default async function SuperAdminTicketDetailPage({ params, searchParams }: PageProps) {
  const { ticketId } = await params;
  const { returnTo } = await searchParams;
  const safeReturnTo = firstSearchParam(returnTo);
  const backHref =
    safeReturnTo === "/super-admin/support" || safeReturnTo?.startsWith("/super-admin/support?")
      ? safeReturnTo
      : "/super-admin/support";
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const devSession = await getDevSessionFromCookieStore(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user && !devSession) redirect("/auth/login");
  const userId = user?.id ?? devSession?.userId ?? "";

  const profile = user ? await getCurrentProfile(userId) : devSession ? {
    id: devSession.profileId,
    role: "super_admin" as const,
  } : null;
  if (!profile || profile.role !== "super_admin") redirect("/dashboard");

  const ticket = await getTicket(ticketId);
  if (!ticket) redirect("/super-admin/support");
  const ticketRecord = ticket!;

  async function handleStatusChange(newStatus: TicketStatus) {
    "use server";
    const actionCookieStore = await cookies();
    const actionDevSession = await getDevSessionFromCookieStore(actionCookieStore);
    const current = await getCurrentProfile(userId);
    if ((!current || current.role !== "super_admin") && !actionDevSession) return;

    const [updatedTicket] = await db
      .update(tickets)
      .set({
        status: newStatus,
        updatedAt: new Date(),
        resolvedAt: newStatus === "resolved" ? new Date() : null,
        closedAt: newStatus === "closed" ? new Date() : null,
      })
      .where(eq(tickets.id, ticketId))
      .returning({ id: tickets.id, academyId: tickets.academyId });

    if (updatedTicket) {
      await logAdminAction({
        userId,
        tenantId: null,
        action: "support.ticket_status_changed",
        resourceType: "ticket",
        resourceId: ticketId,
        resourceName: ticketRecord.title,
        description: `Super Admin cambió el ticket ${ticketRecord.title} de ${ticketRecord.status} a ${newStatus}`,
        meta: {
          ticketId,
          academyId: updatedTicket.academyId,
          from: ticketRecord.status,
          to: newStatus,
        },
      });
    }

    revalidatePath("/super-admin/support");
    revalidatePath(`/super-admin/support/${ticketId}`);
  }

  return (
    <div className="container mx-auto max-w-4xl py-8">
      <TicketDetail
        ticket={ticketRecord}
        currentUserId={profile.id}
        isAdmin
        onStatusChange={handleStatusChange}
        backHref={backHref}
      />
    </div>
  );
}
