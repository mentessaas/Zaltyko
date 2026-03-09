import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TicketDetail } from "@/components/support/TicketDetail";
import { TicketStatus } from "@/components/support/TicketFilters";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ ticketId: string }>;
}

async function getTicket(ticketId: string) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const { data: ticket, error: ticketError } = await supabase
    .from("tickets")
    .select(`
      *,
      createdBy:profiles!tickets_created_by_fkey(id, fullName, email),
      assignedTo:profiles(id, fullName, email),
      academy:academies(id, name)
    `)
    .eq("id", ticketId)
    .single();

  if (ticketError || !ticket) {
    return null;
  }

  // Obtener respuestas
  const { data: responses } = await supabase
    .from("ticket_responses")
    .select(`
      *,
      user:profiles(id, fullName),
      attachments:ticket_attachments(id, fileName, fileUrl, fileType)
    `)
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });

  return {
    ...ticket,
    createdBy: ticket.createdBy?.[0],
    assignedTo: ticket.assignedTo?.[0],
    academy: ticket.academy?.[0],
    responses: responses?.map((r: any) => ({
      ...r,
      user: r.user?.[0],
      attachments: r.attachments || [],
    })) || [],
  };
}

async function getAdmins() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const { data: admins } = await supabase
    .from("profiles")
    .select("id, fullName, email")
    .in("role", ["super_admin", "admin"])
    .order("fullName");

  return admins || [];
}

export default async function SuperAdminTicketDetailPage({ params }: PageProps) {
  const { ticketId } = await params;
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

  const ticket = await getTicket(ticketId);

  if (!ticket) {
    redirect("/super-admin/support");
  }

  async function handleStatusChange(newStatus: TicketStatus) {
    "use server";
    const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
      status: newStatus,
    };

    if (newStatus === "resolved") {
      updateData.resolved_at = new Date().toISOString();
    } else if (newStatus === "closed") {
      updateData.closed_at = new Date().toISOString();
    }

    await supabase
      .from("tickets")
      .update(updateData)
      .eq("id", ticketId);
  }

  async function handleAssign(userId: string) {
    "use server";
    const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

    await supabase
      .from("tickets")
      .update({
        assigned_to: userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ticketId);
  }

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <TicketDetail
        ticket={ticket}
        currentUserId={user.id}
        isAdmin={true}
        onStatusChange={handleStatusChange}
        onAssign={handleAssign}
      />
    </div>
  );
}
