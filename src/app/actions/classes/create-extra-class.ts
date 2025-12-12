"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  academies,
  athletes,
  athleteExtraClasses,
  charges,
  classes,
  classCoachAssignments,
  classWeekdays,
  coaches,
} from "@/db/schema";
import { checkScheduleConflict } from "@/lib/classes/schedule-conflicts";
import { getCurrentProfile, getTenantId } from "@/lib/authz";
import { verifyAcademyAccess } from "@/lib/permissions";
import { withTransaction } from "@/lib/db-transactions";
import { createClient } from "@/lib/supabase/server";

const createExtraClassSchema = z.object({
  athleteId: z.string().uuid(),
  coachId: z.string().uuid(),
  startTime: z.string(), // ISO datetime string
  endTime: z.string(), // ISO datetime string
  duration: z.number().int().min(15).max(180).optional(), // minutos, para validación
  capacity: z.number().int().min(1).default(1),
  createCharge: z.boolean().default(false),
  notes: z.string().optional(),
  academyId: z.string().uuid(),
});

/**
 * Server action para crear una clase extra para un atleta
 * 
 * Pasos:
 * 1. Validar usuario pertenece al mismo tenant
 * 2. Ejecutar checkScheduleConflict para atleta Y entrenador
 * 3. Crear clase (is_extra = true, group_id = null)
 * 4. Insertar en athlete_extra_classes
 * 5. Si create_charge = true → crear billing charge
 * 6. Revalidar calendar & athlete pages
 */
export async function createExtraClassAction(input: z.infer<typeof createExtraClassSchema>) {
  try {
    const body = createExtraClassSchema.parse(input);

    // 1. Obtener usuario actual
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: "UNAUTHENTICATED", message: "Usuario no autenticado" };
    }

    // 2. Obtener perfil y tenantId
    const profile = await getCurrentProfile(user.id);
    if (!profile) {
      return { error: "PROFILE_NOT_FOUND", message: "Perfil de usuario no encontrado" };
    }

    const tenantId = await getTenantId(user.id, body.academyId);
    if (!tenantId) {
      return { error: "TENANT_REQUIRED", message: "No se pudo determinar el tenant del usuario" };
    }

    // 3. Verificar acceso a la academia
    const academyAccess = await verifyAcademyAccess(body.academyId, tenantId);
    if (!academyAccess.allowed) {
      return {
        error: academyAccess.reason ?? "ACADEMY_ACCESS_DENIED",
        message: "No tienes acceso a esta academia",
      };
    }

    // 4. Verificar que el atleta existe y pertenece a la academia
    const [athlete] = await db
      .select({
        id: athletes.id,
        academyId: athletes.academyId,
        tenantId: athletes.tenantId,
      })
      .from(athletes)
      .where(and(eq(athletes.id, body.athleteId), eq(athletes.academyId, body.academyId)))
      .limit(1);

    if (!athlete) {
      return { error: "ATHLETE_NOT_FOUND", message: "El atleta no fue encontrado" };
    }

    if (athlete.tenantId !== tenantId) {
      return { error: "FORBIDDEN", message: "El atleta no pertenece a tu tenant" };
    }

    // 5. Verificar que el entrenador existe y pertenece a la academia
    const [coach] = await db
      .select({
        id: coaches.id,
        academyId: coaches.academyId,
      })
      .from(coaches)
      .where(and(eq(coaches.id, body.coachId), eq(coaches.academyId, body.academyId)))
      .limit(1);

    if (!coach) {
      return { error: "COACH_NOT_FOUND", message: "El entrenador no fue encontrado" };
    }

    // 6. Validar conflictos de horario
    const conflict = await checkScheduleConflict({
      tenantId,
      academyId: body.academyId,
      athleteId: body.athleteId,
      coachId: body.coachId,
      startTime: body.startTime,
      endTime: body.endTime,
    });

    if (conflict.hasConflict) {
      const conflictType = conflict.conflictType === "athlete" ? "atleta" : "entrenador";
      const conflictName = conflict.conflictingClass?.name ?? "clase";
      return {
        error: "SCHEDULE_CONFLICT",
        message: `Conflicto de horario: el ${conflictType} ya tiene ${conflictName} asignada en ese horario.`,
        conflictingClass: conflict.conflictingClass,
      };
    }

    // 7. Crear clase extra y relacionarla con el atleta
    const classId = crypto.randomUUID();
    const startDate = new Date(body.startTime);
    const endDate = new Date(body.endTime);
    const weekday = startDate.getDay(); // 0 = domingo, 6 = sábado

    // Extraer solo la hora de los datetimes
    const startTimeOnly = `${String(startDate.getHours()).padStart(2, "0")}:${String(startDate.getMinutes()).padStart(2, "0")}`;
    const endTimeOnly = `${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`;

    // Obtener nombre del atleta
    const [athleteWithName] = await db
      .select({ name: athletes.name })
      .from(athletes)
      .where(eq(athletes.id, body.athleteId))
      .limit(1);

    const className = `Clase extra - ${athleteWithName?.name ?? "Atleta"} - ${startDate.toLocaleDateString("es-ES", { day: "numeric", month: "short" })}`;

    await withTransaction(async (tx) => {
      // Crear la clase
      await tx.insert(classes).values({
        id: classId,
        tenantId,
        academyId: body.academyId,
        name: className,
        startTime: startTimeOnly,
        endTime: endTimeOnly,
        capacity: body.capacity,
        isExtra: true,
        groupId: null, // Clases extra no tienen grupo
      });

      // Añadir weekday
      await tx.insert(classWeekdays).values({
        id: crypto.randomUUID(),
        classId,
        tenantId,
        weekday,
      });

      // Asignar entrenador
      await tx.insert(classCoachAssignments).values({
        id: crypto.randomUUID(),
        tenantId,
        classId,
        coachId: body.coachId,
      });

      // Relacionar atleta con clase extra
      await tx.insert(athleteExtraClasses).values({
        id: crypto.randomUUID(),
        tenantId,
        academyId: body.academyId,
        athleteId: body.athleteId,
        classId,
      });

      // 8. Crear charge si está solicitado
      if (body.createCharge) {
        const currentDate = new Date();
        const period = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;
        const dueDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0); // Último día del mes

        // Por defecto, usar 0 o un valor configurable (por ahora 0)
        const amountCents = 0; // TODO: Hacer configurable desde settings

        await tx.insert(charges).values({
          id: crypto.randomUUID(),
          tenantId,
          academyId: body.academyId,
          athleteId: body.athleteId,
          classId, // Nuevo campo
          label: "Clase extra",
          amountCents,
          currency: "EUR",
          period,
          dueDate: dueDate.toISOString().split("T")[0],
          status: "pending",
          notes: body.notes ?? null,
        });
      }
    });

    // 9. Revalidar páginas
    revalidatePath(`/app/${body.academyId}/athletes/${body.athleteId}`);
    revalidatePath(`/app/${body.academyId}/classes`);
    revalidatePath(`/dashboard/calendar`);

    return { ok: true, classId };
  } catch (error: any) {
    console.error("Error en createExtraClassAction:", error);
    if (error instanceof z.ZodError) {
      return {
        error: "VALIDATION_ERROR",
        message: "Los datos proporcionados no son válidos",
        details: error.issues,
      };
    }
    return {
      error: "INTERNAL_ERROR",
      message: error.message ?? "Error al crear la clase extra",
    };
  }
}

