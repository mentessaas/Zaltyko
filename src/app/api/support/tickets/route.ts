import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { getCurrentProfile } from "@/lib/authz";
import { verifyAcademyAccessForProfile } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  try {
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

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const category = searchParams.get("category");
    const academyId = searchParams.get("academyId");

    // Determinar si es admin o super admin
    const isSuperAdmin = profile.role === "super_admin";

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

    if (academyId) {
      if (!isSuperAdmin) {
        const access = await verifyAcademyAccessForProfile({
          academyId,
          tenantId: profile.tenantId,
          profile,
        });
        if (!access.allowed) {
          return NextResponse.json({ error: "No autorizado" }, { status: 403 });
        }
      }
      query = query.eq("academy_id", academyId);
    } else if (!isSuperAdmin) {
      // Usuarios normales solo ven sus propios tickets si no filtran por academia autorizada
      query = query.eq("created_by", profile.id);
    }

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    if (priority && priority !== "all") {
      query = query.eq("priority", priority);
    }

    if (category && category !== "all") {
      query = query.eq("category", category);
    }

    const { data: tickets, error } = await query;

    if (error) {
      logger.error("Error fetching tickets:", error);
      return NextResponse.json({ error: "Error al obtener tickets" }, { status: 500 });
    }

    // Transformar datos
    const transformedTickets = tickets?.map((ticket: any) => ({
      ...ticket,
      createdBy: ticket.createdBy?.[0],
      assignedTo: ticket.assignedTo?.[0],
      academy: ticket.academy?.[0],
      _count: {
        responses: ticket.ticket_responses?.[0]?.count || 0,
      },
    })) || [];

    return NextResponse.json(transformedTickets);
  } catch (error) {
    logger.error("Error in GET /api/support/tickets:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { title, description, category, priority, academyId } = body;

    if (!title || !description || !category) {
      return NextResponse.json(
        { error: "Faltan campos requeridos" },
        { status: 400 }
      );
    }

    const profile = await getCurrentProfile(user.id);

    if (!profile) {
      return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });
    }

    // Si es super admin y proporciona academyId, usar ese; de lo contrario buscar membresía
    let finalAcademyId = academyId;

    if (finalAcademyId && profile.role !== "super_admin") {
      const access = await verifyAcademyAccessForProfile({
        academyId: finalAcademyId,
        tenantId: profile.tenantId,
        profile,
      });
      if (!access.allowed) {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }
    }

    if (!finalAcademyId && profile.role !== "super_admin") {
      const { data: membership } = await supabase
        .from("memberships")
        .select("academy_id")
        .eq("user_id", user.id)
        .eq("role", "owner")
        .single();

      finalAcademyId = membership?.academy_id;
    }

    const { data: ticket, error } = await supabase
      .from("tickets")
      .insert({
        title,
        description,
        category,
        priority: priority || "medium",
        status: "open",
        created_by: profile.id,
        academy_id: finalAcademyId,
      })
      .select()
      .single();

    if (error) {
      logger.error("Error creating ticket:", error);
      return NextResponse.json(
        { error: "Error al crear el ticket" },
        { status: 500 }
      );
    }

    // Aquí se podrían enviar notificaciones por email
    // await sendTicketCreatedEmail(ticket);

    return NextResponse.json(ticket, { status: 201 });
  } catch (error) {
    logger.error("Error in POST /api/support/tickets:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
