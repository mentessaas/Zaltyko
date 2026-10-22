/**
 * Error boundaries para operaciones de base de datos
 * US-008: Add error boundaries for database operations
 */

import { logger } from "./logger";
import { AppError, InternalServerError } from "./errors";
import { PostgrestError } from "@supabase/supabase-js";

interface DbOperationOptions<T> {
  operation: string;
  table: string;
  query?: Record<string, unknown>;
  onError?: (error: unknown) => T;
  retryCount?: number;
}

/**
 * Wrapper para operaciones de base de datos con manejo de errores
 * Agrega logging, retry logic y error boundaries
 */
export async function withDbErrorBoundary<T>(
  operation: () => Promise<T>,
  options: DbOperationOptions<T>
): Promise<T> {
  const { operation: opName, table, query, onError, retryCount = 2 } = options;
  const startTime = Date.now();
  
  let lastError: unknown;
  
  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      const result = await operation();
      
      // Log exitoso
      const duration = Date.now() - startTime;
      logger.dbOperation(opName, table, duration, {
        query,
        attempt: attempt > 0 ? attempt + 1 : undefined,
      });
      
      return result;
    } catch (error) {
      lastError = error;
      
      // Log del error
      logger.error(`DB operation failed (attempt ${attempt + 1}/${retryCount + 1})`, error, {
        operation: opName,
        table,
        query,
      });
      
      // Si no es el último intento, esperar antes de retry
      if (attempt < retryCount) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000); // Exponential backoff
        logger.warn(`Retrying DB operation after ${delay}ms`, {
          operation: opName,
          table,
          attempt: attempt + 1,
        });
        await sleep(delay);
      }
    }
  }
  
  // Si llegamos aquí, todos los intentos fallaron
  if (onError) {
    return onError(lastError);
  }
  
  // Convertir error de Supabase a AppError
  throw normalizeDbError(lastError, { operation: opName, table });
}

/**
 * Normaliza errores de Supabase/Postgres a AppError
 */
function normalizeDbError(
  error: unknown,
  context: { operation: string; table: string }
): AppError {
  // Error de Supabase (PostgrestError)
  if (isPostgrestError(error)) {
    switch (error.code) {
      case "PGRST116": // Not found
        return new AppError(
          `Registro no encontrado en ${context.table}`,
          "DB_NOT_FOUND",
          404,
          { table: context.table, operation: context.operation }
        );
      case "23505": // Unique violation
        return new AppError(
          "Registro duplicado",
          "DB_DUPLICATE",
          409,
          { table: context.table, operation: context.operation }
        );
      case "23503": // Foreign key violation
        return new AppError(
          "Referencia inválida a otro registro",
          "DB_FOREIGN_KEY",
          400,
          { table: context.table, operation: context.operation }
        );
      case "P0001": // Raise exception
        return new AppError(
          error.message || "Error de validación en base de datos",
          "DB_VALIDATION",
          400,
          { table: context.table, operation: context.operation }
        );
      default:
        return new InternalServerError(
          `Error de base de datos: ${error.message}`,
          { 
            table: context.table, 
            operation: context.operation,
            code: error.code 
          }
        );
    }
  }
  
  // Error genérico
  if (error instanceof Error) {
    return new InternalServerError(
      `Error en operación ${context.operation}: ${error.message}`,
      { table: context.table, operation: context.operation }
    );
  }
  
  return new InternalServerError(
    "Error desconocido en base de datos",
    { table: context.table, operation: context.operation }
  );
}

/**
 * Type guard para PostgrestError
 */
function isPostgrestError(error: unknown): error is PostgrestError {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    "message" in error &&
    "details" in error &&
    "hint" in error
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Helper para transacciones con rollback automático
 */
export async function withTransaction<T>(
  supabase: { rpc: (fn: string, params: unknown) => Promise<unknown> },
  operation: () => Promise<T>,
  options: { operation: string; table: string }
): Promise<T> {
  try {
    // Iniciar transacción
    await supabase.rpc("begin_transaction", {});
    
    const result = await operation();
    
    // Commit
    await supabase.rpc("commit_transaction", {});
    
    logger.info("Transaction completed successfully", {
      operation: options.operation,
      table: options.table,
    });
    
    return result;
  } catch (error) {
    // Rollback
    try {
      await supabase.rpc("rollback_transaction", {});
    } catch (rollbackError) {
      logger.error("Failed to rollback transaction", rollbackError, {
        operation: options.operation,
        table: options.table,
      });
    }
    
    logger.error("Transaction failed", error, {
      operation: options.operation,
      table: options.table,
    });
    
    throw normalizeDbError(error, options);
  }
}
