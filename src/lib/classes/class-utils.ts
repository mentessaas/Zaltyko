import { db } from "@/db";
import { classes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getClassAthletes } from "@/lib/classes/get-class-athletes";

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
  const [classRow] = await db
    .select({ capacity: classes.capacity, academyId: classes.academyId })
    .from(classes)
    .where(eq(classes.id, classId))
    .limit(1);

  if (!classRow) {
    throw new Error("Class not found");
  }

  const capacity = classRow.capacity ?? 1;
  const current = (await getClassAthletes(classId, classRow.academyId)).length;

  return {
    current,
    capacity,
    available: Math.max(0, capacity - current),
  };
}
