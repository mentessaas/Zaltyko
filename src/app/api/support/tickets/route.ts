import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { tickets } from "@/db/schema/support-tickets";
import { eq, desc, and, or, ilike } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Obtener perfil del usuario usando userId
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role, user_id")
      .eq("user_id", user.id)
      .single();

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

    if (!isSuperAdmin) {
      // Usuarios normales solo ven sus propios tickets
      query = query.eq("created_by", user.id);
    } else if (academyId) {
      // Super admin puede filtrar por academia
      query = query.eq("academy_id", academyId);
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
      console.error("Error fetching tickets:", error);
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
    console.error("Error in GET /api/support/tickets:", error);
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

    // Obtener perfil del usuario usando userId
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role, user_id")
      .eq("user_id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });
    }

    // Si es super admin y proporciona academyId, usar ese; de lo contrario buscar membresía
    let finalAcademyId = academyId;

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
        created_by: user.id,
        academy_id: finalAcademyId,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating ticket:", error);
      return NextResponse.json(
        { error: "Error al crear el ticket" },
        { status: 500 }
      );
    }

    // Aquí se podrían enviar notificaciones por email
    // await sendTicketCreatedEmail(ticket);

    return NextResponse.json(ticket, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/support/tickets:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
