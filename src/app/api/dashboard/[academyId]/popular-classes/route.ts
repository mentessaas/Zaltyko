import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api-response";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { db } from "@/db";
import { classes as classesTable, classGroups, groups, groupAthletes } from "@/db/schema";
import { eq, sql, desc, count } from "drizzle-orm";

const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ academyId: string }> }
) {
  try {
    const { academyId } = await params;
    const cookieStore = await import("next/headers").then(m => m.cookies());
    const supabase = await createClient(cookieStore);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return apiError("No autorizado", "No autorizado", 401);
    }

    const profile = await getCurrentProfile(user.id);
    if (!profile) {
      return apiError("Perfil no encontrado", "Perfil no encontrado", 404);
    }

    // Get all classes with their group info
    const classesData = await db
      .select({
        id: classesTable.id,
        name: classesTable.name,
        weekday: classesTable.weekday,
        startTime: classesTable.startTime,
        endTime: classesTable.endTime,
        groupId: classesTable.groupId,
        groupName: groups.name,
        groupLevel: groups.level,
      })
      .from(classesTable)
      .leftJoin(groups, eq(classesTable.groupId, groups.id))
      .where(eq(classesTable.academyId, academyId));

    // Get athlete counts for each class via its groups
    const classesWithCounts = await Promise.all(
      classesData.map(async (cls) => {
        // Get groups associated with this class
        const classGroupRows = await db
          .select({ groupId: classGroups.groupId })
          .from(classGroups)
          .where(eq(classGroups.classId, cls.id));

        // If no groups directly linked, use the class's own group
        const groupIds = classGroupRows.length > 0
          ? classGroupRows.map(g => g.groupId)
          : (cls.groupId ? [cls.groupId] : []);

        // Count athletes in those groups
        let totalEnrollments = 0;
        if (groupIds.length > 0) {
          const athleteCounts = await db
            .select({ count: count() })
            .from(groupAthletes)
            .where(sql`${groupAthletes.groupId} IN ${groupIds}`);
          totalEnrollments = athleteCounts[0]?.count || 0;
        }

        // Format schedule
        const weekday = cls.weekday !== null ? WEEKDAYS[cls.weekday] : "Sin horario";
        const time = cls.startTime && cls.endTime
          ? `${cls.startTime.slice(0, 5)} - ${cls.endTime.slice(0, 5)}`
          : "Por definir";

        return {
          id: cls.id,
          name: cls.name || "Clase sin nombre",
          level: cls.groupLevel || "general",
          schedule: `${weekday} ${time}`,
          totalEnrollments,
          averageAttendance: 85, // Default placeholder
          avgAge: 0,
        };
      })
    );

    // Sort by total enrollments
    const sortedClasses = classesWithCounts.sort(
      (a, b) => b.totalEnrollments - a.totalEnrollments
    );

    return apiSuccess({
      classes: sortedClasses,
    });
  } catch (error) {
    console.error("Error loading popular classes:", error);
    return apiError("Error al cargar clases populares", "Error al cargar clases populares", 500);
  }
}