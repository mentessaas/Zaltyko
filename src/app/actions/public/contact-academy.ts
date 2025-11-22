"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, profiles } from "@/db/schema";

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

  // Obtener email del propietario de la academia
  const [owner] = await db
    .select({
      email: profiles.email,
      name: profiles.name,
    })
    .from(profiles)
    .where(eq(profiles.id, academy.ownerId))
    .limit(1);

  // TODO: Integrar con servicio de email (Mailgun, SendGrid, etc.)
  // Por ahora, solo logueamos el contacto
  console.log("Contact form submitted:", {
    academyId,
    academyName: academy.name,
    contactName: name,
    contactEmail: email,
    contactPhone: phone,
    message,
    ownerEmail: owner?.email,
  });

  return {
    success: true,
    message: "Tu mensaje ha sido enviado. La academia te contactará pronto.",
  };
}

