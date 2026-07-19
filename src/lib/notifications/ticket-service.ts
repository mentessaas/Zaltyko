import { getSupabaseAdminClient } from "@/lib/supabase/admin";

interface TicketNotificationData {
  ticketId: string;
  ticketTitle: string;
  userId: string;
  userEmail: string;
  userName: string;
  academyName?: string;
  type: "created" | "response" | "status_changed" | "assigned";
}

export async function sendTicketCreatedNotification(data: TicketNotificationData) {
  const supabase = getSupabaseAdminClient();

  // Crear notificación in-app
  await supabase.from("notifications").insert({
    user_id: data.userId,
    title: "Ticket creado",
    message: `Tu ticket "${data.ticketTitle}" ha sido creado correctamente`,
    type: "ticket",
    read: false,
    data: {
      ticketId: data.ticketId,
      type: "created",
    },
  });

  // Aquí se podría enviar email también
  // await sendEmail({
  //   to: data.userEmail,
  //   subject: `Ticket #${data.ticketId.slice(0, 8)} creado`,
  //   template: "ticket-created",
  //   data: {
  //     ticketTitle: data.ticketTitle,
  //     ticketId: data.ticketId,
  //   },
  // });
}

export async function sendTicketResponseNotification(data: TicketNotificationData) {
  const supabase = getSupabaseAdminClient();

  // Notificar al creador del ticket
  await supabase.from("notifications").insert({
    user_id: data.userId,
    title: "Nueva respuesta",
    message: `Tu ticket "${data.ticketTitle}" ha recibido una nueva respuesta`,
    type: "ticket",
    read: false,
    data: {
      ticketId: data.ticketId,
      type: "response",
    },
  });
}

export async function sendTicketStatusNotification(data: TicketNotificationData) {
  const supabase = getSupabaseAdminClient();

  await supabase.from("notifications").insert({
    user_id: data.userId,
    title: "Estado actualizado",
    message: `El estado de tu ticket "${data.ticketTitle}" ha sido actualizado`,
    type: "ticket",
    read: false,
    data: {
      ticketId: data.ticketId,
      type: "status_changed",
    },
  });
}

export async function sendTicketAssignedNotification(
  ticketId: string,
  ticketTitle: string,
  assignedToId: string,
  assignedToEmail: string,
  assignedToName: string
) {
  const supabase = getSupabaseAdminClient();

  await supabase.from("notifications").insert({
    user_id: assignedToId,
    title: "Ticket asignado",
    message: `Se te ha asignado el ticket "${ticketTitle}"`,
    type: "ticket",
    read: false,
    data: {
      ticketId,
      type: "assigned",
    },
  });
}
