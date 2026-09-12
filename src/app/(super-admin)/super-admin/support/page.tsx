import { and, count, desc, eq, inArray } from "drizzle-orm";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { academies, profiles, ticketResponses, tickets } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { getDevSessionFromCookieStore } from "@/lib/dev-session";
import { TicketList } from "@/components/support/TicketList";
import { TicketFilters } from "@/components/support/TicketFilters";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    status?: string;
    priority?: string;
    category?: string;
    academyId?: string;
  }>;
}

async function getAllTickets(filters: {
  status?: string;
  priority?: string;
  category?: string;
  academyId?: string;
}) {
  const conditions = [
    filters.status && filters.status !== "all"
      ? eq(tickets.status, filters.status as typeof tickets.status.enumValues[number])
      : undefined,
    filters.priority && filters.priority !== "all"
      ? eq(tickets.priority, filters.priority as typeof tickets.priority.enumValues[number])
      : undefined,
    filters.category && filters.category !== "all"
      ? eq(tickets.category, filters.category as typeof tickets.category.enumValues[number])
      : undefined,
    filters.academyId && filters.academyId !== "all"
      ? eq(tickets.academyId, filters.academyId)
      : undefined,
  ].filter(Boolean) as Array<ReturnType<typeof eq>>;

  const rows = await db
    .select({
      id: tickets.id,
      title: tickets.title,
      description: tickets.description,
      status: tickets.status,
      priority: tickets.priority,
      category: tickets.category,
      createdAt: tickets.createdAt,
      updatedAt: tickets.updatedAt,
      creatorId: profiles.id,
      creatorName: profiles.name,
      academyId: academies.id,
      academyName: academies.name,
    })
    .from(tickets)
    .leftJoin(profiles, eq(tickets.createdBy, profiles.id))
    .leftJoin(academies, eq(tickets.academyId, academies.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(tickets.createdAt))
    .limit(200);

  const responseCounts = new Map<string, number>();
  if (rows.length > 0) {
    const counts = await db
      .select({ ticketId: ticketResponses.ticketId, total: count(ticketResponses.id) })
      .from(ticketResponses)
      .where(inArray(ticketResponses.ticketId, rows.map((row) => row.id)))
      .groupBy(ticketResponses.ticketId);

    for (const row of counts) {
      responseCounts.set(row.ticketId, Number(row.total));
    }
  }

  return rows.map((ticket) => ({
    id: ticket.id,
    title: ticket.title,
    description: ticket.description,
    status: ticket.status,
    priority: ticket.priority,
    category: ticket.category,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    createdBy: {
      id: ticket.creatorId ?? "unknown",
      fullName: ticket.creatorName ?? "Usuario",
      email: "",
    },
    academy: ticket.academyId
      ? { id: ticket.academyId, name: ticket.academyName ?? "Academia" }
      : undefined,
    _count: { responses: responseCounts.get(ticket.id) ?? 0 },
  }));
}

async function TicketsContent({
  filters,
}: {
  filters: {
    status?: string;
    priority?: string;
    category?: string;
    academyId?: string;
  };
}) {
  const tickets = await getAllTickets(filters);

  return (
    <>
      <TicketFilters
        currentStatus={filters.status as any}
        currentPriority={filters.priority as any}
        currentCategory={filters.category as any}
        showStatus
        showPriority
        showCategory
      />
      <div className="mt-6">
        <TicketList
          tickets={tickets}
          isAdmin
          emptyMessage="No hay tickets de soporte"
        />
      </div>
    </>
  );
}

export default async function SuperAdminSupportPage({ searchParams }: PageProps) {
  const filters = await searchParams;
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const devSession = await getDevSessionFromCookieStore(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !devSession) redirect("/auth/login");

  const profile = user ? await getCurrentProfile(user.id) : null;
  const effectiveProfile = profile ?? (devSession ? { role: "super_admin" } : null);
  if (!effectiveProfile || effectiveProfile.role !== "super_admin") redirect("/dashboard");

  return (
    <div className="container mx-auto py-8">
      <PageHeader
        title="Soporte"
        description="Gestiona todos los tickets de soporte"
      />

      <Suspense fallback={<TicketFiltersSkeleton />}>
        <TicketsContent filters={filters} />
      </Suspense>
    </div>
  );
}

function TicketFiltersSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
      <Skeleton className="h-10 w-[160px]" />
      <Skeleton className="h-10 w-[160px]" />
      <Skeleton className="h-10 w-[180px]" />
    </div>
  );
}
