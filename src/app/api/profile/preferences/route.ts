import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";

import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

const UpdatePreferencesSchema = z.object({
  timezone: z.string().optional(),
  language: z.string().optional(),
  emailNotifications: z.record(z.boolean()).optional(),
});

export async function PATCH(request: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const body = UpdatePreferencesSchema.parse(await request.json());
    const updates: Record<string, unknown> = {};

    if (body.timezone !== undefined) {
      updates.timezone = body.timezone;
    }

    if (body.language !== undefined) {
      updates.language = body.language;
    }

    if (body.emailNotifications !== undefined) {
      updates.emailNotifications = body.emailNotifications;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "NO_CHANGES" }, { status: 400 });
    }

    updates.updatedAt = new Date();

    await db
      .insert(userPreferences)
      .values({
        userId: user.id,
        ...updates,
      })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: updates,
      });

    const [updated] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, user.id))
      .limit(1);

    return NextResponse.json(updated);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "INVALID_INPUT", details: error.errors }, { status: 400 });
    }
    console.error("Error updating preferences:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR", message: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const [preferences] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, user.id))
      .limit(1);

    return NextResponse.json(preferences || null);
  } catch (error: any) {
    console.error("Error fetching preferences:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR", message: error.message }, { status: 500 });
  }
}

