import { and, count, desc, eq, inArray } from "drizzle-orm";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { academies, authUsers, profiles, ticketResponses, tickets } from "@/db/schema";
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
    page?: string;
  }>;
}

const TICKET_STATUS_VALUES = ["open", "in_progress", "waiting", "resolved", "closed"] as const;
const TICKET_PRIORITY_VALUES = ["low", "medium", "high", "urgent"] as const;
const TICKET_CATEGORY_VALUES = ["technical", "billing", "account", "feature_request", "other"] as const;
const PAGE_SIZE = 50;

function pickFilter<T extends string>(value: string | undefined, values: readonly T[]) {
  return value && values.includes(value as T) ? (value as T) : undefined;
}

function normalizeSupportFilters(filters: {
  status?: string;
  priority?: string;
  category?: string;
  academyId?: string;
}) {
  return {
    status: pickFilter(filters.status, TICKET_STATUS_VALUES),
    priority: pickFilter(filters.priority, TICKET_PRIORITY_VALUES),
    category: pickFilter(filters.category, TICKET_CATEGORY_VALUES),
    academyId:
      filters.academyId && z.string().uuid().safeParse(filters.academyId).success
        ? filters.academyId
        : undefined,
  };
}

async function getAllTickets(
  filters: {
    status?: string;
    priority?: string;
    category?: string;
    academyId?: string;
  },
  requestedPage: number
) {
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

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [totalRow] = await db
    .select({ total: count(tickets.id) })
    .from(tickets)
    .where(where);
  const total = Number(totalRow?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, requestedPage), totalPages);

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
      creatorEmail: authUsers.email,
      academyId: academies.id,
      academyName: academies.name,
    })
    .from(tickets)
    .leftJoin(profiles, eq(tickets.createdBy, profiles.id))
    .leftJoin(authUsers, eq(profiles.userId, authUsers.id))
    .leftJoin(academies, eq(tickets.academyId, academies.id))
    .where(where)
    .orderBy(desc(tickets.createdAt), desc(tickets.id))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

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

  return {
    items: rows.map((ticket) => ({
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
        email: ticket.creatorEmail ?? "",
      },
      academy: ticket.academyId
        ? { id: ticket.academyId, name: ticket.academyName ?? "Academia" }
        : undefined,
      _count: { responses: responseCounts.get(ticket.id) ?? 0 },
    })),
    total,
    page,
    totalPages,
  };
}

function pageHref(filters: {
  status?: string;
  priority?: string;
  category?: string;
  academyId?: string;
}, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  params.set("page", String(page));
  return `?${params.toString()}`;
}

async function TicketsContent({
  filters,
  page: requestedPage,
}: {
  filters: {
    status?: string;
    priority?: string;
    category?: string;
    academyId?: string;
  };
  page: number;
}) {
  const result = await getAllTickets(filters, requestedPage);

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
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Mostrando {result.items.length} de {result.total} tickets
        </span>
        <span>
          Página {result.page} de {result.totalPages}
        </span>
      </div>
      <div className="mt-4">
        <TicketList
          tickets={result.items}
          isAdmin
          emptyMessage="No hay tickets de soporte"
        />
      </div>
      {result.totalPages > 1 && (
        <nav aria-label="Paginación de tickets" className="mt-6 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {PAGE_SIZE} por página
          </span>
          <div className="flex items-center gap-2">
            <a
              href={pageHref(filters, Math.max(1, result.page - 1))}
              aria-disabled={result.page === 1}
              tabIndex={result.page === 1 ? -1 : 0}
              className={`inline-flex min-h-10 items-center rounded-md border px-3 text-sm font-medium transition ${
                result.page === 1
                  ? "pointer-events-none opacity-40"
                  : "border-border hover:bg-muted"
              }`}
            >
              Anteriores
            </a>
            <a
              href={pageHref(filters, Math.min(result.totalPages, result.page + 1))}
              aria-disabled={result.page === result.totalPages}
              tabIndex={result.page === result.totalPages ? -1 : 0}
              className={`inline-flex min-h-10 items-center rounded-md border px-3 text-sm font-medium transition ${
                result.page === result.totalPages
                  ? "pointer-events-none opacity-40"
                  : "border-border hover:bg-muted"
              }`}
            >
              Siguientes
            </a>
          </div>
        </nav>
      )}
    </>
  );
}

export default async function SuperAdminSupportPage({ searchParams }: PageProps) {
  const rawSearchParams = await searchParams;
  const filters = normalizeSupportFilters(rawSearchParams);
  const requestedPage = Number.parseInt(rawSearchParams.page ?? "1", 10);
  const page = Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1;
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
        <TicketsContent filters={filters} page={page} />
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
