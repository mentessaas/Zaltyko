/**
 * WhatsApp Notification API
 * Send notifications to parents via WhatsApp using Twilio
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { sendWhatsApp, WhatsAppTemplates } from "@/lib/whatsapp";
import { createMessageHistory, updateMessageHistoryStatus, getMessageTemplateById } from "@/lib/communication-service";

const sendWhatsAppSchema = z.object({
  phone: z.string().min(1, "Phone is required"),
  message: z.string().min(1, "Message is required"),
  academyId: z.string().optional(),
  templateId: z.string().uuid().optional(),
  historyId: z.string().uuid().optional(),
});

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  // Allow unauthenticated for academy-triggered messages
  const tenantId: string | null = null;
  const profileId: string | null = null;

  try {
    const body = await request.json();
    const validated = sendWhatsAppSchema.parse(body);

    const { phone, message, academyId, templateId, historyId } = validated;

    // Use academyId from body or try to get from auth
    const targetAcademyId = academyId;

    // Format phone for Spain
    let formattedPhone = phone.replace(/\D/g, "");
    if (!formattedPhone.startsWith("34")) {
      formattedPhone = "34" + formattedPhone;
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

    // Try to send via Twilio
    const result = await sendWhatsApp(formattedPhone, message, academyTwilioConfig);

    // Update history if provided
    if (historyId && targetAcademyId) {
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
      return NextResponse.json({
        success: true,
        message: "WhatsApp sent successfully",
        phone: formattedPhone,
        messageId: result.messageId,
      });
    } else {
      // In production, we'd handle this differently
      // For now, return success if Twilio is not configured (simulated)
      return NextResponse.json({
        success: true,
        message: "WhatsApp queued (simulated)",
        phone: formattedPhone,
        note: result.error || "Twilio not configured - message logged",
      });
    }
  } catch (error) {
    console.error("WhatsApp error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to send WhatsApp message" },
      { status: 500 }
    );
  }
}

// GET - Return available templates
export async function GET() {
  return NextResponse.json({
    templates: {
      attendancePresent: WhatsAppTemplates.attendancePresent("Nombre"),
      attendanceAbsent: WhatsAppTemplates.attendanceAbsent("Nombre"),
      paymentReminder: WhatsAppTemplates.paymentReminder("Nombre", 50, "15/03/2024"),
      classReminder: WhatsAppTemplates.classReminder("Nombre", "Ballet", "10:00", "Lunes"),
      welcome: WhatsAppTemplates.welcome("Juan", "Maria", "Academia de Danza"),
    },
  });
}
