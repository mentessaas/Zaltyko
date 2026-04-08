import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ticketAttachments, ticketResponses } from "@/db/schema/support-tickets";
import { logger } from "@/lib/logger";

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

    // Verificar acceso al ticket
    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .select("id, created_by, academy_id")
      .eq("id", id)
      .single();

    if (ticketError || !ticket) {
      return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });
    }

    // Obtener perfil del usuario
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .single();

    const isSuperAdmin = profile?.role === "super_admin";

    // Verificar acceso
    if (!isSuperAdmin && ticket.created_by !== user.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    // Obtener respuestas
    const { data: responses, error } = await supabase
      .from("ticket_responses")
      .select(`
        *,
        user:profiles(id, fullName),
        attachments:ticket_attachments(id, fileName, fileUrl, fileType)
      `)
      .eq("ticket_id", id)
      .order("created_at", { ascending: true });

    if (error) {
      logger.error("Error fetching responses:", error);
      return NextResponse.json(
        { error: "Error al obtener respuestas" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      responses?.map((r: any) => ({
        ...r,
        user: r.user?.[0],
        attachments: r.attachments || [],
      })) || []
    );
  } catch (error) {
    logger.error("Error in GET /api/support/tickets/[id]/responses:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function POST(
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

    // Verificar que el ticket existe y está abierto
    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .select("id, status, created_by")
      .eq("id", id)
      .single();

    if (ticketError || !ticket) {
      return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });
    }

    if (ticket.status === "closed" || ticket.status === "resolved") {
      return NextResponse.json(
        { error: "No se puede responder a un ticket cerrado" },
        { status: 400 }
      );
    }

    // Obtener perfil del usuario
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .single();

    const isSuperAdmin = profile?.role === "super_admin";
    const isOwner = ticket.created_by === user.id;

    // Verificar acceso
    if (!isSuperAdmin && !isOwner) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const formData = await request.formData();
    const fd = formData as unknown as { get(name: string): unknown };
    const message = fd.get("message") as string;
    const isInternal = fd.get("isInternal") === "true";

    if (!message?.trim()) {
      return NextResponse.json(
        { error: "El mensaje es requerido" },
        { status: 400 }
      );
    }

    // Crear respuesta
    const { data: response, error } = await supabase
      .from("ticket_responses")
      .insert({
        ticket_id: id,
        user_id: user.id,
        message: message.trim(),
        is_internal: isSuperAdmin ? isInternal : false,
      })
      .select()
      .single();

    if (error) {
      logger.error("Error creating response:", error);
      return NextResponse.json(
        { error: "Error al crear la respuesta" },
        { status: 500 }
      );
    }

    // Procesar archivos adjuntos si hay
    const files = formData.getAll("files") as unknown as File[];
    if (files.length > 0) {
      for (const file of files) {
        if (file.size > 0) {
          // Aquí se subiría el archivo a storage
          // Por ahora guardamos la referencia
          const arrayBuffer = await file.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          const fileName = `${id}/${Date.now()}-${file.name}`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from("ticket-attachments")
            .upload(fileName, buffer);

          if (!uploadError && uploadData) {
            const { data: { publicUrl } } = supabase.storage
              .from("ticket-attachments")
              .getPublicUrl(fileName);

            await supabase.from("ticket_attachments").insert({
              ticket_id: id,
              response_id: response.id,
              file_name: file.name,
              file_url: publicUrl,
              file_type: file.type,
              file_size: String(file.size),
              uploaded_by: user.id,
            });
          }
        }
      }
    }

    // Actualizar ticket
    await supabase
      .from("tickets")
      .update({
        updated_at: new Date().toISOString(),
        status: isSuperAdmin && !isOwner ? "in_progress" : "waiting",
      })
      .eq("id", id);

    // Aquí se podrían enviar notificaciones por email
    // await sendTicketResponseEmail(ticket.id, response.id);

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    logger.error("Error in POST /api/support/tickets/[id]/responses:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
