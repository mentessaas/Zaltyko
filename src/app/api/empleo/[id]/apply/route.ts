import { NextResponse } from "next/server";
import { db } from "@/db";
import { empleoListings, empleoApplications } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

const ApplySchema = z.object({
  message: z.string().max(2000).optional(),
  resumeUrl: z.string().url().optional(),
});

// Helper to get authenticated user
async function getUser() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verificar autenticación
    const user = await getUser();
    if (!user) {
      return NextResponse.json(
        { error: "AUTH_REQUIRED", message: "Debes iniciar sesión para aplicar" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const validated = ApplySchema.parse(body);

    // Verificar que el empleo existe y está activo
    const [listing] = await db.select()
      .from(empleoListings)
      .where(and(
        eq(empleoListings.id, id),
        eq(empleoListings.status, "active")
      ))
      .limit(1);

    if (!listing) {
      return NextResponse.json(
        { error: "LISTING_NOT_FOUND", message: "El empleo no existe o ya no está activo" },
        { status: 404 }
      );
    }

    // Verificar que no haya aplicado ya
    const [existingApp] = await db.select()
      .from(empleoApplications)
      .where(and(
        eq(empleoApplications.listingId, id),
        eq(empleoApplications.userId, user.id)
      ))
      .limit(1);

    if (existingApp) {
      return NextResponse.json(
        { error: "ALREADY_APPLIED", message: "Ya has aplicado a este puesto" },
        { status: 400 }
      );
    }

    // Crear la aplicación
    const [application] = await db.insert(empleoApplications).values({
      listingId: id,
      userId: user.id,
      message: validated.message,
      resumeUrl: validated.resumeUrl,
      status: "pending",
    }).returning();

    return NextResponse.json({ application }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", details: error.errors },
        { status: 400 }
      );
    }
    console.error("Error applying to job:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Error al procesar la solicitud" },
      { status: 500 }
    );
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verificar autenticación
    const user = await getUser();
    if (!user) {
      return NextResponse.json(
        { error: "AUTH_REQUIRED", message: "Debes iniciar sesión" },
        { status: 401 }
      );
    }

    const { id } = await params;

    // Obtener la aplicación del usuario para este empleo
    const [application] = await db.select()
      .from(empleoApplications)
      .where(and(
        eq(empleoApplications.listingId, id),
        eq(empleoApplications.userId, user.id)
      ))
      .limit(1);

    if (!application) {
      return NextResponse.json({ hasApplied: false });
    }

    return NextResponse.json({ hasApplied: true, application });
  } catch (error) {
    console.error("Error checking application status:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}