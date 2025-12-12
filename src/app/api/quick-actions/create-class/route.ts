import { NextResponse } from "next/server";
import { withTenant } from "@/lib/authz";
import { db } from "@/db";
import { classSessions, classes } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * POST /api/quick-actions/create-class
 * Crea una sesión de clase rápidamente con valores pre-rellenados
 */
export const POST = withTenant(async (req, context) => {
    try {
        const { tenantId, profile } = context;
        const body = await req.json();

        const { classId, date, startTime, endTime } = body;

        if (!classId) {
            return NextResponse.json(
                { error: "classId is required" },
                { status: 400 }
            );
        }

        // Verificar que la clase existe y pertenece al tenant
        const [classData] = await db
            .select()
            .from(classes)
            .where(eq(classes.id, classId))
            .limit(1);

        if (!classData || classData.tenantId !== tenantId) {
            return NextResponse.json(
                { error: "Class not found" },
                { status: 404 }
            );
        }

        // Usar fecha de hoy si no se especifica
        const sessionDate = date || new Date().toISOString().split("T")[0];

        // Usar horarios de la clase si no se especifican
        const finalStartTime = startTime || classData.startTime || "10:00";
        const finalEndTime = endTime || classData.endTime || "11:00";

        // Crear la sesión
        const [newSession] = await db
            .insert(classSessions)
            .values({
                tenantId,
                classId,
                sessionDate,
                startTime: finalStartTime,
                endTime: finalEndTime,
                status: "scheduled",
            })
            .returning();

        return NextResponse.json({
            success: true,
            data: newSession,
        });
    } catch (error) {
        console.error("Error creating quick class:", error);
        return NextResponse.json(
            { error: "Failed to create class session" },
            { status: 500 }
        );
    }
});
