import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { getCurrentProfile } from "@/lib/authz";
import { verifyAcademyAccessForProfile } from "@/lib/permissions";

async function canAccessTicket(profile: NonNullable<Awaited<ReturnType<typeof getCurrentProfile>>>, ticket: { created_by: string; academy_id: string | null }) {
  if (profile.role === "super_admin" || ticket.created_by === profile.id) {
    return true;
  }

  if (!ticket.academy_id) {
    return false;
  }

  const access = await verifyAcademyAccessForProfile({
    academyId: ticket.academy_id,
    tenantId: profile.tenantId,
    profile,
  });

  return access.allowed;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const profile = await getCurrentProfile(user.id);

    if (!profile) {
      return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });
    }

    // Obtener ticket
    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .select(`
        *,
        createdBy:profiles!tickets_created_by_fkey(id, fullName, email),
        assignedTo:profiles(id, fullName, email),
        academy:academies(id, name)
      `)
      .eq("id", id)
      .single();

    if (ticketError || !ticket) {
      return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });
    }

    if (!(await canAccessTicket(profile, ticket))) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    // Obtener respuestas
    const { data: responses } = await supabase
      .from("ticket_responses")
      .select(`
        *,
        user:profiles(id, fullName),
        attachments:ticket_attachments(id, fileName, fileUrl, fileType)
      `)
      .eq("ticket_id", id)
      .order("created_at", { ascending: true });

    return NextResponse.json({
      ...ticket,
      createdBy: ticket.createdBy?.[0],
      assignedTo: ticket.assignedTo?.[0],
      academy: ticket.academy?.[0],
      responses: responses?.map((r: any) => ({
        ...r,
        user: r.user?.[0],
        attachments: r.attachments || [],
      })) || [],
    });
  } catch (error) {
    logger.error("Error in GET /api/support/tickets/[id]:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const profile = await getCurrentProfile(user.id);

    if (!profile) {
      return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });
    }

    const body = await request.json();
    const { status, assignedTo } = body;

    if (!status && !assignedTo) {
      return NextResponse.json(
        { error: "Se requiere estado o asignación" },
        { status: 400 }
      );
    }

    // Verificar que el ticket existe
    const { data: existingTicket, error: ticketError } = await supabase
      .from("tickets")
      .select("id, status, created_by, academy_id")
      .eq("id", id)
      .single();

    if (ticketError || !existingTicket) {
      return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });
    }

    // Solo el creador o admins pueden cambiar el estado
    const isSuperAdmin = profile.role === "super_admin";
    const isOwner = existingTicket.created_by === profile.id;
    const hasAcademyAccess = await canAccessTicket(profile, existingTicket);

    if (!isSuperAdmin && !isOwner && (!hasAcademyAccess || status)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    // Solo admins pueden asignar
    if (assignedTo && !isSuperAdmin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (status) {
      updateData.status = status;
      if (status === "resolved") {
        updateData.resolved_at = new Date().toISOString();
      } else if (status === "closed") {
        updateData.closed_at = new Date().toISOString();
      }
    }

    if (assignedTo !== undefined) {
      updateData.assigned_to = assignedTo || null;
    }

    const { data: ticket, error } = await supabase
      .from("tickets")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      logger.error("Error updating ticket:", error);
      return NextResponse.json(
        { error: "Error al actualizar el ticket" },
        { status: 500 }
      );
    }

    return NextResponse.json(ticket);
  } catch (error) {
    logger.error("Error in PATCH /api/support/tickets/[id]:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
