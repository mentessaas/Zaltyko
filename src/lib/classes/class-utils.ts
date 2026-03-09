import { db } from "@/db";
import { classEnrollments, classes } from "@/db/schema";
import { eq, count } from "drizzle-orm";

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

  // Contar inscripciones actuales usando COUNT de SQL (más eficiente)
  const [{ count: currentCount }] = await db
    .select({ count: count() })
    .from(classEnrollments)
    .where(eq(classEnrollments.classId, classId));

  const current = currentCount ?? 0;

  return {
    current,
    capacity,
    available: Math.max(0, capacity - current),
  };
}
