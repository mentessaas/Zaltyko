import { eq } from "drizzle-orm";
import { db } from "@/db";
import { events, academies } from "@/db/schema";
import { config } from "@/config";
import { sendBulkEmails } from "./email-service";
import { getInternalStaffEmails, getAcademiesEmailsByLocation } from "./event-recipients";
import { generateEventEmailContent, type NotificationType, type EventData } from "./event-email-content";

export interface NotificationResult {
  sent: number;
  errors: number;
}

/**
 * Obtiene los datos del evento y la academia necesarios para las notificaciones
 */
async function getEventAndAcademyData(
  academyId: string,
  eventId: string
): Promise<{ event: EventData; academyName: string }> {
  const [event] = await db
    .select({
      title: events.title,
      description: events.description,
      startDate: events.startDate,
      endDate: events.endDate,
      city: events.city,
      province: events.province,
      country: events.country,
      contactEmail: events.contactEmail,
      contactPhone: events.contactPhone,
      contactWebsite: events.contactWebsite,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event) {
    throw new Error("Evento no encontrado");
  }

  const [academy] = await db
    .select({ name: academies.name })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!academy) {
    throw new Error("Academia no encontrada");
  }

  return {
    event: {
      ...event,
      startDate: event.startDate ? String(event.startDate) : null,
      endDate: event.endDate ? String(event.endDate) : null,
    },
    academyName: academy.name,
  };
}

/**
 * Función genérica para enviar notificaciones de eventos
 */
async function sendEventNotification(
  academyId: string,
  eventId: string,
  notificationType: NotificationType,
  getRecipients: (academyId: string) => Promise<string[]>
): Promise<NotificationResult> {
  const { event, academyName } = await getEventAndAcademyData(academyId, eventId);
  const emails = await getRecipients(academyId);

  if (emails.length === 0) {
    return { sent: 0, errors: 0 };
  }

  const emailContent = generateEventEmailContent(event, academyName, notificationType);
  const result = await sendBulkEmails(
    emails,
    emailContent,
    event.contactEmail || config.mailgun.supportEmail
  );

  return {
    sent: result.sent,
    errors: result.errors,
  };
}

/**
 * Notifica al personal interno de la academia sobre un evento
 */
export async function notifyInternalStaff(
  academyId: string,
  eventId: string
): Promise<NotificationResult> {
  return sendEventNotification(academyId, eventId, "internal", getInternalStaffEmails);
}

/**
 * Notifica a academias de la misma ciudad sobre un evento
 */
export async function notifyCity(
  academyId: string,
  eventId: string
): Promise<NotificationResult> {
  return sendEventNotification(academyId, eventId, "city", (id) => getAcademiesEmailsByLocation(id, "city"));
}

/**
 * Notifica a academias de la misma provincia sobre un evento
 */
export async function notifyProvince(
  academyId: string,
  eventId: string
): Promise<NotificationResult> {
  return sendEventNotification(academyId, eventId, "province", (id) => getAcademiesEmailsByLocation(id, "province"));
}

/**
 * Notifica a academias del mismo país sobre un evento
 */
export async function notifyCountry(
  academyId: string,
  eventId: string
): Promise<NotificationResult> {
  return sendEventNotification(academyId, eventId, "country", (id) => getAcademiesEmailsByLocation(id, "country"));
}
