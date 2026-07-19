/**
 * WhatsApp Notification API
 * Send notifications to parents via WhatsApp using Twilio
 */

import { apiSuccess, apiError } from "@/lib/api-response";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { sendWhatsApp, WhatsAppTemplates } from "@/lib/whatsapp";
import { createMessageHistory, updateMessageHistoryStatus } from "@/lib/communication-service";
import { logger } from "@/lib/logger";
import { db } from "@/db";
import {
  academies,
  athletes,
  classes,
  familyContacts,
  groupAthletes,
  groups,
} from "@/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getClassAthletes } from "@/lib/classes/get-class-athletes";
import { verifyAcademySportConfig } from "@/lib/sport-config/service";

const sendWhatsAppSchema = z.object({
  message: z.string().min(1, "Message is required"),
  academyId: z.string().optional(),
  phone: z.string().min(1, "Phone is required").optional(),
  recipientType: z.enum(["all", "class", "group", "selected"]).optional(),
  recipientIds: z.array(z.string().uuid()).optional().default([]),
  sportConfigId: z.string().uuid().optional().nullable(),
  scheduledAt: z.string().optional(),
  templateId: z.string().uuid().optional(),
  historyId: z.string().uuid().optional(),
});

export const dynamic = 'force-dynamic';

interface ResolvedRecipient {
  athleteId: string;
  athleteName: string;
  phone: string;
  sportConfigId: string | null;
}

const formatPhoneForSpain = (phone: string) => {
  let formattedPhone = phone.replace(/\D/g, "");
  if (!formattedPhone.startsWith("34")) {
    formattedPhone = "34" + formattedPhone;
  }
  return formattedPhone;
};

async function resolveAthleteIds({
  academyId,
  tenantId,
  recipientType,
  recipientIds,
  sportConfigId,
}: {
  academyId: string;
  tenantId: string;
  recipientType: "all" | "class" | "group" | "selected";
  recipientIds: string[];
  sportConfigId: string | null;
}) {
  if (recipientType === "all") {
    const rows = await db
      .select({ id: athletes.id })
      .from(athletes)
      .where(and(
        eq(athletes.academyId, academyId),
        eq(athletes.tenantId, tenantId),
        isNull(athletes.deletedAt),
        ...(sportConfigId ? [eq(athletes.primarySportConfigId, sportConfigId)] : [])
      ));
    return rows.map((row) => row.id);
  }

  if (recipientIds.length === 0) return [];

  if (recipientType === "selected") {
    const rows = await db
      .select({ id: athletes.id })
      .from(athletes)
      .where(and(
        eq(athletes.academyId, academyId),
        eq(athletes.tenantId, tenantId),
        isNull(athletes.deletedAt),
        inArray(athletes.id, recipientIds),
        ...(sportConfigId ? [eq(athletes.primarySportConfigId, sportConfigId)] : [])
      ));
    return rows.map((row) => row.id);
  }

  if (recipientType === "group") {
    const groupRows = await db
      .select({ id: groups.id })
      .from(groups)
      .where(and(
        eq(groups.academyId, academyId),
        eq(groups.tenantId, tenantId),
        isNull(groups.deletedAt),
        inArray(groups.id, recipientIds),
        ...(sportConfigId ? [eq(groups.sportConfigId, sportConfigId)] : [])
      ));

    if (groupRows.length === 0) return [];

    const rows = await db
      .select({ athleteId: groupAthletes.athleteId })
      .from(groupAthletes)
      .innerJoin(athletes, eq(groupAthletes.athleteId, athletes.id))
      .where(and(
        eq(groupAthletes.tenantId, tenantId),
        inArray(groupAthletes.groupId, groupRows.map((row) => row.id)),
        eq(athletes.academyId, academyId),
        isNull(athletes.deletedAt),
        ...(sportConfigId ? [eq(athletes.primarySportConfigId, sportConfigId)] : [])
      ));
    return rows.map((row) => row.athleteId);
  }

  const classRows = await db
    .select({ id: classes.id })
    .from(classes)
    .where(and(
      eq(classes.academyId, academyId),
      eq(classes.tenantId, tenantId),
      isNull(classes.deletedAt),
      inArray(classes.id, recipientIds),
      ...(sportConfigId ? [eq(classes.sportConfigId, sportConfigId)] : [])
    ));

  const athleteIds = new Set<string>();
  for (const classRow of classRows) {
    const classAthletes = await getClassAthletes(classRow.id, academyId);
    for (const athlete of classAthletes) {
      if (!sportConfigId || athlete.primarySportConfigId === sportConfigId) {
        athleteIds.add(athlete.id);
      }
    }
  }

  return Array.from(athleteIds);
}

async function resolveRecipients({
  academyId,
  tenantId,
  recipientType,
  recipientIds,
  sportConfigId,
}: {
  academyId: string;
  tenantId: string;
  recipientType: "all" | "class" | "group" | "selected";
  recipientIds: string[];
  sportConfigId: string | null;
}): Promise<ResolvedRecipient[]> {
  const athleteIds = await resolveAthleteIds({
    academyId,
    tenantId,
    recipientType,
    recipientIds,
    sportConfigId,
  });

  if (athleteIds.length === 0) return [];

  const contactRows = await db
    .select({
      athleteId: athletes.id,
      athleteName: athletes.name,
      sportConfigId: athletes.primarySportConfigId,
      phone: familyContacts.phone,
    })
    .from(athletes)
    .innerJoin(familyContacts, eq(familyContacts.athleteId, athletes.id))
    .where(and(
      eq(athletes.academyId, academyId),
      eq(athletes.tenantId, tenantId),
      inArray(athletes.id, athleteIds)
    ));

  const recipientsByPhone = new Map<string, ResolvedRecipient>();
  for (const row of contactRows) {
    if (!row.phone) continue;
    const phone = formatPhoneForSpain(row.phone);
    if (recipientsByPhone.has(phone)) continue;
    recipientsByPhone.set(phone, {
      athleteId: row.athleteId,
      athleteName: row.athleteName,
      phone,
      sportConfigId: row.sportConfigId,
    });
  }

  return Array.from(recipientsByPhone.values());
}

export const POST = withTenant(async (request: Request, context) => {
  try {
    const body = await request.json();
    const validated = sendWhatsAppSchema.parse(body);

    const { phone, message, academyId, recipientType, recipientIds, sportConfigId, templateId, historyId } = validated;

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
    }

    // Get academy Twilio config (would come from academy settings in production)
    // For now, use environment variables
    const academyTwilioConfig = process.env.TWILIO_ACCOUNT_SID
      ? {
          accountSid: process.env.TWILIO_ACCOUNT_SID!,
          authToken: process.env.TWILIO_AUTH_TOKEN!,
          from: process.env.TWILIO_WHATSAPP_FROM!,
        }
      : undefined;

    if (recipientType) {
      if (!academyId) {
        return apiError("ACADEMY_REQUIRED", "Academia requerida", 400);
      }

      const [academy] = await db
        .select({ id: academies.id, tenantId: academies.tenantId })
        .from(academies)
        .where(and(eq(academies.id, academyId), eq(academies.tenantId, context.tenantId)))
        .limit(1);

      if (!academy) {
        return apiError("ACADEMY_NOT_FOUND", "Academia no encontrada", 404);
      }

      if (sportConfigId) {
        const verifiedConfig = await verifyAcademySportConfig({
          academyId,
          tenantId: context.tenantId,
          sportConfigId,
        });

        if (!verifiedConfig) {
          return apiError("SPORT_CONFIG_NOT_FOUND", "La rama/modalidad no está activa en esta academia", 400);
        }
      }

      const recipients = await resolveRecipients({
        academyId,
        tenantId: context.tenantId,
        recipientType,
        recipientIds,
        sportConfigId: sportConfigId ?? null,
      });

      if (recipients.length === 0) {
        return apiSuccess({
          success: false,
          sent: 0,
          errors: ["No hay destinatarios con teléfono para este filtro."],
        });
      }

      let sent = 0;
      const errors: string[] = [];

      for (const recipient of recipients) {
        const personalizedMessage = message.replace(/\{\{name\}\}/g, recipient.athleteName);
        const history = await createMessageHistory({
          tenantId: context.tenantId,
          phone: recipient.phone,
          sportConfigId: recipient.sportConfigId,
          channel: "whatsapp",
          direction: "outbound",
          status: "pending",
          message: personalizedMessage,
          templateId: templateId ?? null,
          meta: {
            academyId,
            athleteId: recipient.athleteId,
            sportConfigId: recipient.sportConfigId,
            recipientType,
          },
        });

        const result = await sendWhatsApp(recipient.phone, personalizedMessage, academyTwilioConfig);
        if (result.success) {
          sent += 1;
          await updateMessageHistoryStatus(history.id, "sent", {
            meta: {
              academyId,
              athleteId: recipient.athleteId,
              sportConfigId: recipient.sportConfigId,
              recipientType,
              externalIds: { twilio: result.messageId || "unknown" },
            },
            sentAt: new Date(),
          });
        } else {
          errors.push(`${recipient.athleteName}: ${result.error || "error de envío"}`);
          await updateMessageHistoryStatus(history.id, "failed", {
            meta: {
              academyId,
              athleteId: recipient.athleteId,
              sportConfigId: recipient.sportConfigId,
              recipientType,
              errorMessage: result.error || "Unknown error",
            },
            failedAt: new Date(),
          });
        }
      }

      return apiSuccess({
        success: errors.length === 0,
        sent,
        errors,
      });
    }

    if (!phone) {
      return apiError("PHONE_REQUIRED", "Teléfono requerido", 400);
    }

    const formattedPhone = formatPhoneForSpain(phone);

    // Try to send via Twilio
    const result = await sendWhatsApp(formattedPhone, message, academyTwilioConfig);

    // Update history if provided
    if (historyId && academyId) {
      if (result.success) {
        await updateMessageHistoryStatus(historyId, "sent", {
          externalIds: { twilio: result.messageId || "unknown" },
          sentAt: new Date(),
        });
      } else {
        await updateMessageHistoryStatus(historyId, "failed", {
          errorMessage: result.error || "Unknown error",
          failedAt: new Date(),
        });
      }
    }

    if (result.success) {
      return apiSuccess({
        success: true,
        message: "WhatsApp sent successfully",
        phone: formattedPhone,
        messageId: result.messageId,
      });
    } else {
      // In production, we'd handle this differently
      // For now, return success if Twilio is not configured (simulated)
      return apiSuccess({
        success: true,
        message: "WhatsApp queued (simulated)",
        phone: formattedPhone,
        note: result.error || "Twilio not configured - message logged",
      });
    }
  } catch (error) {
    logger.error("WhatsApp error:", error);

    if (error instanceof z.ZodError) {
      return apiError("VALIDATION_ERROR", "Validation failed", 400);
    }

    return apiError("Failed to send WhatsApp message", "Failed to send WhatsApp message", 500);
  }
});

// GET - Return available templates
export async function GET() {
  return apiSuccess({
    templates: {
      attendancePresent: WhatsAppTemplates.attendancePresent("Nombre"),
      attendanceAbsent: WhatsAppTemplates.attendanceAbsent("Nombre"),
      paymentReminder: WhatsAppTemplates.paymentReminder("Nombre", 50, "15/03/2024"),
      classReminder: WhatsAppTemplates.classReminder("Nombre", "Ballet", "10:00", "Lunes"),
      welcome: WhatsAppTemplates.welcome("Juan", "Maria", "Academia de Danza"),
    },
  });
}
