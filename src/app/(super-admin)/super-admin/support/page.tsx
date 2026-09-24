import { Suspense } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TicketList } from "@/components/support/TicketList";
import { TicketFilters } from "@/components/support/TicketFilters";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { logger } from "@/lib/logger";
import { db } from "@/db";
import { academies, profiles, ticketResponses, tickets } from "@/db/schema";
import { and, count, desc, eq } from "drizzle-orm";

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
  const conditions = [] as Array<ReturnType<typeof eq>>;
  if (filters.status && filters.status !== "all") {
    conditions.push(
      eq(
        tickets.status,
        filters.status as "open" | "in_progress" | "waiting" | "resolved" | "closed"
      )
    );
  }
  if (filters.priority && filters.priority !== "all") {
    conditions.push(
      eq(
        tickets.priority,
        filters.priority as "low" | "medium" | "high" | "urgent"
      )
    );
  }
  if (filters.category && filters.category !== "all") {
    conditions.push(
      eq(
        tickets.category,
        filters.category as "technical" | "billing" | "account" | "feature_request" | "other"
      )
    );
  }
  if (filters.academyId && filters.academyId !== "all") {
    conditions.push(eq(tickets.academyId, filters.academyId));
  }

  try {
    const rows = await db
      .select({
        id: tickets.id,
        title: tickets.title,
        description: tickets.description,
        status: tickets.status,
        priority: tickets.priority,
        category: tickets.category,
        academyId: tickets.academyId,
        createdBy: tickets.createdBy,
        assignedTo: tickets.assignedTo,
        createdAt: tickets.createdAt,
        updatedAt: tickets.updatedAt,
        creatorName: profiles.name,
        academyName: academies.name,
        responseCount: count(ticketResponses.id),
      })
      .from(tickets)
      .leftJoin(profiles, eq(tickets.createdBy, profiles.id))
      .leftJoin(academies, eq(tickets.academyId, academies.id))
      .leftJoin(ticketResponses, eq(ticketResponses.ticketId, tickets.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(tickets.id, profiles.name, academies.name)
      .orderBy(desc(tickets.createdAt))
      .limit(500);

    return rows.map((row) => ({
      ...row,
      createdBy: {
        id: row.createdBy,
        fullName: row.creatorName ?? "Academia",
        email: "",
      },
      assignedTo: undefined,
      academy: row.academyId
        ? { id: row.academyId, name: row.academyName ?? "Academia" }
        : undefined,
      _count: { responses: Number(row.responseCount) },
    }));
  } catch (error) {
    logger.error("Error fetching tickets:", error);
    return [];
  }
}

async function TicketsContent({ filters }: { filters: { status?: string; priority?: string; category?: string; academyId?: string } }) {
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
          isAdmin={true}
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
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Verificar que es super admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (profile?.role !== "super_admin") {
    redirect("/dashboard");
  }

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
    <div className="flex flex-wrap items-center gap-3 p-4 bg-card rounded-lg border">
      <Skeleton className="h-10 w-[160px]" />
      <Skeleton className="h-10 w-[160px]" />
      <Skeleton className="h-10 w-[180px]" />
    </div>
  );
}
