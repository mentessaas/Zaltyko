import { db } from "@/db";

export type TransactionClient = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];
export type DatabaseClient = typeof db | TransactionClient;

/**
 * Ejecuta una función dentro de una transacción de base de datos
 * Si la función lanza un error, la transacción se revierte automáticamente
 */
export async function withTransaction<T>(
  callback: (tx: TransactionClient) => Promise<T>
): Promise<T> {
  if (typeof db.transaction !== "function") {
    // Entornos de prueba pueden mockear db sin soporte de transacciones
    return callback(db as unknown as TransactionClient);
  }

  return await db.transaction(async (tx) => {
    return await callback(tx);
  });
}
