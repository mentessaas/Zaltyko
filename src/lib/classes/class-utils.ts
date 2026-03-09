import { db } from "@/db";
import { classEnrollments, classes } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Verifica la capacidad actual de una clase
 * @param classId - ID de la clase
 * @returns Objeto con el conteo actual, capacidad y lugares disponibles
 */
export async function checkClassCapacity(classId: string): Promise<{
  current: number;
  capacity: number;
  available: number;
}> {
  const [classSession] = await db
    .select({ capacity: classes.capacity })
    .from(classes)
    .where(eq(classes.id, classId))
    .limit(1);

  if (!classSession) {
    throw new Error("Class not found");
  }

  const capacity = classSession.capacity ?? 1;

  // Contar inscripciones actuales (extras) en esta clase
  const enrollments = await db
    .select({ id: classEnrollments.id })
    .from(classEnrollments)
    .where(eq(classEnrollments.classId, classId));

  const current = enrollments.length;

  return {
    current,
    capacity,
    available: Math.max(0, capacity - current),
  };
}
