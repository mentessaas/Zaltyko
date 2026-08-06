import { and, asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { academies, profiles, ticketAttachments, ticketResponses, tickets } from "@/db/schema";
import { getCurrentProfile } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { TicketDetail } from "@/components/support/TicketDetail";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ academyId: string; ticketId: string }>;
}

async function getTicket(ticketId: string, academyId: string, profileId: string) {
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
    .where(and(eq(tickets.id, ticketId), eq(tickets.academyId, academyId)))
    .limit(1);

  if (!row || row.createdById !== profileId) return null;

  const responseRows = await db
    .select({
      id: ticketResponses.id,
      message: ticketResponses.message,
      isInternal: ticketResponses.isInternal,
      createdAt: ticketResponses.createdAt,
      userId: ticketResponses.userId,
      userName: profiles.name,
      attachmentId: ticketAttachments.id,
      fileName: ticketAttachments.fileName,
      fileUrl: ticketAttachments.fileUrl,
      fileType: ticketAttachments.fileType,
    })
    .from(ticketResponses)
    .leftJoin(profiles, eq(ticketResponses.userId, profiles.id))
    .leftJoin(ticketAttachments, eq(ticketAttachments.responseId, ticketResponses.id))
    .where(and(eq(ticketResponses.ticketId, ticketId), eq(ticketResponses.isInternal, false)))
    .orderBy(asc(ticketResponses.createdAt));

  const responses = responseRows.reduce<Array<{
    id: string;
    message: string;
    isInternal: boolean;
    createdAt: Date;
    user: { id: string; fullName: string };
    attachments: Array<{ id: string; fileName: string; fileUrl: string; fileType?: string }>;
  }>>((acc, response) => {
    let current = acc.find((item) => item.id === response.id);
    if (!current) {
      current = {
        id: response.id,
        message: response.message,
        isInternal: response.isInternal ?? false,
        createdAt: response.createdAt,
        user: { id: response.userId, fullName: response.userName ?? "Soporte" },
        attachments: [],
      };
      acc.push(current);
    }
    if (response.attachmentId && response.fileName && response.fileUrl) {
      current.attachments.push({
        id: response.attachmentId,
        fileName: response.fileName,
        fileUrl: response.fileUrl,
        fileType: response.fileType ?? undefined,
      });
    }
    return acc;
  }, []);

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
    createdBy: { id: row.createdById, fullName: row.creatorName ?? "Tu academia", email: "" },
    academy: row.academyId ? { id: row.academyId, name: row.academyName ?? "Academia" } : undefined,
    responses,
  };
}

export default async function TicketDetailPage({ params }: PageProps) {
  const { academyId, ticketId } = await params;
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const profile = await getCurrentProfile(user.id);
  if (!profile) redirect("/dashboard");

  const ticket = await getTicket(ticketId, academyId, profile.id);
  if (!ticket) redirect(`/app/${academyId}/support`);

  return (
    <div className="container mx-auto max-w-4xl py-8">
      <TicketDetail ticket={ticket} currentUserId={profile.id} isAdmin={false} />
    </div>
  );
}
