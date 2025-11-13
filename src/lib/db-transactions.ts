import { db } from "@/db";

/**
 * Ejecuta una función dentro de una transacción de base de datos
 * Si la función lanza un error, la transacción se revierte automáticamente
 */
export async function withTransaction<T>(
  callback: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>
): Promise<T> {
  return await db.transaction(async (tx) => {
    return await callback(tx);
  });
}

