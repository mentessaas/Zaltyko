"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, profiles, contactMessages } from "@/db/schema";
import { createNotification } from "@/lib/notifications/notification-service";

const ContactAcademySchema = z.object({
  academyId: z.string().uuid(),
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  message: z.string().min(10).max(1000),
});

export type ContactAcademyInput = z.infer<typeof ContactAcademySchema>;

export type ContactAcademyResult = {
  success: boolean;
  error?: string;
  message?: string;
};

/**
 * Server action para enviar formulario de contacto a una academia
 * 
 * @param input - Datos del formulario de contacto
 * @returns Resultado de la operación
 */
export async function contactAcademy(
  input: ContactAcademyInput
): Promise<ContactAcademyResult> {
  const parsed = ContactAcademySchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
    };
  }

  const { academyId, name, email, phone, message } = parsed.data;

  // Verificar que la academia existe y es pública
  const [academy] = await db
    .select({
      id: academies.id,
      name: academies.name,
      ownerId: academies.ownerId,
      tenantId: academies.tenantId,
    })
    .from(academies)
    .where(
      and(
        eq(academies.id, academyId),
        eq(academies.isPublic, true),
        eq(academies.isSuspended, false)
      )
    )
    .limit(1);

  if (!academy) {
    return {
      success: false,
      error: "ACADEMY_NOT_FOUND",
    };
  }

  // Obtener perfil del propietario de la academia
  const [ownerProfile] = await db
    .select({
      id: profiles.id,
      name: profiles.name,
    })
    .from(profiles)
    .where(eq(profiles.id, academy.ownerId))
    .limit(1);

  if (!ownerProfile) {
    return {
      success: false,
      error: "OWNER_NOT_FOUND",
    };
  }

  try {
    // Crear mensaje de contacto en la base de datos
    const [contactMessage] = await db
      .insert(contactMessages)
      .values({
        academyId: academy.id,
        contactName: name,
        contactEmail: email,
        contactPhone: phone || null,
        message,
        read: false,
        responded: false,
        archived: false,
      })
      .returning({ id: contactMessages.id });

    // Crear notificación para el propietario de la academia
    await createNotification({
      tenantId: academy.tenantId,
      userId: academy.ownerId, // profileId del propietario
      type: "contact_message",
      title: `Nuevo mensaje de contacto para ${academy.name}`,
      message: `${name} te ha enviado un mensaje.`,
      data: {
        contactMessageId: contactMessage.id,
        academyId: academy.id,
        academyName: academy.name,
        contactName: name,
        contactEmail: email,
        contactPhone: phone || null,
      },
    });

    return {
      success: true,
      message: "Tu mensaje ha sido enviado. La academia te contactará pronto.",
    };
  } catch (error) {
    console.error("Error creating contact message:", error);
    return {
      success: false,
      error: "MESSAGE_CREATION_FAILED",
    };
  }
}

