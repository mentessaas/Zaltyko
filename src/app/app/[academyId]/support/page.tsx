import { Suspense } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TicketList } from "@/components/support/TicketList";
import { TicketFilters, TicketCategory, TicketPriority, TicketStatus } from "@/components/support/TicketFilters";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { logger } from "@/lib/logger";
import { db } from "@/db";
import { count, and, desc, eq } from "drizzle-orm";
import { profiles, ticketResponses, tickets } from "@/db/schema";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ academyId: string }>;
  searchParams: Promise<{ status?: string; priority?: string; category?: string }>;
}

async function getTickets(academyId: string, filters: { status?: string; priority?: string; category?: string }) {
  const conditions = [eq(tickets.academyId, academyId)];
  if (filters.status && filters.status !== "all") {
    conditions.push(eq(tickets.status, filters.status as "open" | "in_progress" | "waiting" | "resolved" | "closed"));
  }
  if (filters.priority && filters.priority !== "all") {
    conditions.push(eq(tickets.priority, filters.priority as "low" | "medium" | "high" | "urgent"));
  }
  if (filters.category && filters.category !== "all") {
    conditions.push(eq(tickets.category, filters.category as "technical" | "billing" | "account" | "feature_request" | "other"));
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
        responseCount: count(ticketResponses.id),
      })
      .from(tickets)
      .leftJoin(profiles, eq(tickets.createdBy, profiles.id))
      .leftJoin(ticketResponses, eq(ticketResponses.ticketId, tickets.id))
      .where(and(...conditions))
      .groupBy(tickets.id, profiles.name)
      .orderBy(desc(tickets.createdAt));

    return rows.map((row) => ({
      ...row,
      createdBy: row.creatorName
        ? { id: row.createdBy, fullName: row.creatorName, email: "" }
        : undefined,
      assignedTo: undefined,
      _count: { responses: Number(row.responseCount) },
    }));
  } catch (error) {
    logger.error("Error fetching tickets:", error);
    return [];
  }
}

async function TicketsContent({ academyId, filters }: { academyId: string; filters: { status?: string; priority?: string; category?: string } }) {
  const tickets = await getTickets(academyId, filters);

  return (
    <>
      <TicketFilters
        currentStatus={filters.status as TicketStatus | undefined}
        currentPriority={filters.priority as TicketPriority | undefined}
        currentCategory={filters.category as TicketCategory | undefined}
        showStatus
        showPriority
        showCategory
      />
      <div className="mt-6">
        <TicketList
          tickets={tickets}
          academyId={academyId}
          isAdmin={false}
          emptyMessage="No has creado ningún ticket todavía"
        />
      </div>
    </>
  );
}

export default async function SupportPage({ params, searchParams }: PageProps) {
  const { academyId } = await params;
  const filters = await searchParams;
  const cookieStore = await cookies();

  const supabase = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Verificar que el usuario tiene acceso a la academia
  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("academy_id", academyId)
    .single();

  if (!membership) {
    redirect("/dashboard");
  }

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Soporte</h1>
          <p className="text-muted-foreground mt-1">
            Gestiona tus tickets de soporte
          </p>
        </div>
        <Link href={`/app/${academyId}/support/new`}>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo ticket
          </Button>
        </Link>
      </div>

      <Suspense fallback={<TicketFiltersSkeleton />}>
        <TicketsContent academyId={academyId} filters={filters} />
      </Suspense>
    </div>
  );
}

function TicketFiltersSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-3 p-4 bg-card rounded-lg border">
      <div className="flex flex-col gap-1">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-10 w-[160px]" />
      </div>
      <div className="flex flex-col gap-1">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-10 w-[160px]" />
      </div>
      <div className="flex flex-col gap-1">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-[180px]" />
      </div>
    </div>
  );
}
