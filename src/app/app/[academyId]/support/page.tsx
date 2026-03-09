import { Suspense } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TicketList } from "@/components/support/TicketList";
import { TicketFilters } from "@/components/support/TicketFilters";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ academyId: string }>;
  searchParams: Promise<{ status?: string; priority?: string; category?: string }>;
}

async function getTickets(academyId: string, filters: { status?: string; priority?: string; category?: string }) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
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
    .eq("academy_id", academyId)
    .eq("created_by", user.id)
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

async function TicketsContent({ academyId, filters }: { academyId: string; filters: { status?: string; priority?: string; category?: string } }) {
  const tickets = await getTickets(academyId, filters);

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
