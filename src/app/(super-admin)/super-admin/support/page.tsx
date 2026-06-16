import { Suspense } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
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
    .eq("id", user.id)
    .single();

  if (profile?.role !== "super_admin") {
    redirect("/dashboard");
  }

  let query = supabase
    .from("tickets")
    .select(`
      *,
      createdBy:profiles!tickets_created_by_fkey(id, fullName, email),
      assignedTo:profiles(id, fullName),
      academy:academies(id, name),
      ticket_responses(count)
    `)
    .order("created_at", { ascending: false });

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.priority && filters.priority !== "all") {
    query = query.eq("priority", filters.priority);
  }
  if (filters.category && filters.category !== "all") {
    query = query.eq("category", filters.category);
  }
  if (filters.academyId && filters.academyId !== "all") {
    query = query.eq("academy_id", filters.academyId);
  }

  const { data: tickets, error } = await query;

  if (error) {
    console.error("Error fetching tickets:", error);
    return [];
  }

  return tickets?.map((ticket: any) => ({
    ...ticket,
    createdBy: ticket.createdBy?.[0],
    assignedTo: ticket.assignedTo?.[0],
    academy: ticket.academy?.[0],
    _count: {
      responses: ticket.ticket_responses?.[0]?.count || 0,
    },
  })) || [];
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
    .eq("id", user.id)
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
