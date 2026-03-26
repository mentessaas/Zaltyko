/**
 * Notification Preferences API
 * Get and update notification preferences
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "@/lib/communication-service";

const updatePreferencesSchema = z.object({
  channels: z.object({
    inApp: z.object({
      enabled: z.boolean().optional(),
      types: z.record(z.boolean()).optional(),
    }).optional(),
    email: z.object({
      enabled: z.boolean().optional(),
      types: z.record(z.boolean()).optional(),
    }).optional(),
    whatsapp: z.object({
      enabled: z.boolean().optional(),
      types: z.record(z.boolean()).optional(),
    }).optional(),
    push: z.object({
      enabled: z.boolean().optional(),
      types: z.record(z.boolean()).optional(),
    }).optional(),
  }).optional(),
  reminders: z.object({
    classReminder: z.object({
      enabled: z.boolean().optional(),
      timing: z.array(z.string()).optional(),
    }).optional(),
    paymentReminder: z.object({
      enabled: z.boolean().optional(),
      daysBefore: z.array(z.number()).optional(),
    }).optional(),
    attendanceAlert: z.object({
      enabled: z.boolean().optional(),
    }).optional(),
  }).optional(),
  quietHours: z.object({
    enabled: z.boolean().optional(),
    start: z.string().optional(),
    end: z.string().optional(),
  }).optional(),
});

export const dynamic = 'force-dynamic';

// GET /api/communication/preferences - Get current user's preferences
export const GET = withTenant(async (request, context) => {
  try {
    const prefs = await getNotificationPreferences(context.profile.id);

    if (!prefs) {
      // Return default preferences
      return NextResponse.json({
        channels: {
          inApp: { enabled: true, types: {} },
          email: { enabled: true, types: {} },
          whatsapp: { enabled: true, types: {} },
          push: { enabled: true, types: {} },
        },
        reminders: {
          classReminder: { enabled: true, timing: ["24h", "1h"] },
          paymentReminder: { enabled: true, daysBefore: [7, 3, 1] },
          attendanceAlert: true,
        },
        quietHours: { enabled: false, start: "22:00", end: "08:00" },
      });
    }

    return NextResponse.json(prefs.channels);
  } catch (error) {
    console.error("Error fetching notification preferences:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
});

// PATCH /api/communication/preferences - Update preferences
export const PATCH = withTenant(async (request, context) => {
  try {
    const body = await request.json();
    const validated = updatePreferencesSchema.parse(body);

    await updateNotificationPreferences(context.profile.id, {
      ...validated,
      tenantId: context.tenantId,
    });

    return NextResponse.json({ ok: true, message: "Preferencias actualizadas" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "VALIDATION_ERROR", details: error.errors }, { status: 400 });
    }
    console.error("Error updating notification preferences:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
});
