import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { userPreferences, profiles } from "@/db/schema";
import { getCurrentProfile } from "@/lib/authz";

const updateSchema = z.object({
  emailNotifications: z.record(z.boolean()).optional(),
});

export const PUT = async (request: Request) => {
  try {
    const profile = await getCurrentProfile(request);
    if (!profile) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = updateSchema.parse(await request.json());

    // Obtener preferencias actuales
    const [currentPrefs] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, profile.userId))
      .limit(1);

    const updatedEmailNotifications = currentPrefs?.emailNotifications
      ? { ...currentPrefs.emailNotifications, ...body.emailNotifications }
      : body.emailNotifications || {};

    if (currentPrefs) {
      // Actualizar preferencias existentes
      await db
        .update(userPreferences)
        .set({
          emailNotifications: updatedEmailNotifications,
          updatedAt: new Date(),
        })
        .where(eq(userPreferences.userId, profile.userId));
    } else {
      // Crear nuevas preferencias
      await db.insert(userPreferences).values({
        userId: profile.userId,
        tenantId: profile.tenantId,
        emailNotifications: updatedEmailNotifications,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error updating email preferences:", error);
    return NextResponse.json(
      { error: "UPDATE_FAILED", message: error.message },
      { status: 500 }
    );
  }
};

export const GET = async (request: Request) => {
  try {
    const profile = await getCurrentProfile(request);
    if (!profile) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const [prefs] = await db
      .select({
        emailNotifications: userPreferences.emailNotifications,
      })
      .from(userPreferences)
      .where(eq(userPreferences.userId, profile.userId))
      .limit(1);

    return NextResponse.json({
      emailNotifications: prefs?.emailNotifications || {},
    });
  } catch (error: any) {
    console.error("Error fetching email preferences:", error);
    return NextResponse.json(
      { error: "FETCH_FAILED", message: error.message },
      { status: 500 }
    );
  }
};

