/**
 * Tipos de error específicos para el manejo seguro de errores en la aplicación
 */

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly statusCode?: number,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AppError";
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "VALIDATION_ERROR", 400, details);
    this.name = "ValidationError";
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "No autenticado", details?: Record<string, unknown>) {
    super(message, "AUTHENTICATION_ERROR", 401, details);
    this.name = "AuthenticationError";
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "No autorizado", details?: Record<string, unknown>) {
    super(message, "AUTHORIZATION_ERROR", 403, details);
    this.name = "AuthorizationError";
    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Recurso no encontrado", details?: Record<string, unknown>) {
    super(message, "NOT_FOUND", 404, details);
    this.name = "NotFoundError";
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "CONFLICT", 409, details);
    this.name = "ConflictError";
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Demasiadas requests", resetIn?: number) {
    super(message, "RATE_LIMIT_EXCEEDED", 429, { resetIn });
    this.name = "RateLimitError";
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message: string, size?: number, maxSize?: number) {
    super(message, "PAYLOAD_TOO_LARGE", 413, { size, maxSize });
    this.name = "PayloadTooLargeError";
    Object.setPrototypeOf(this, PayloadTooLargeError.prototype);
  }
}

export class InternalServerError extends AppError {
  constructor(message = "Error interno del servidor", details?: Record<string, unknown>) {
    super(message, "INTERNAL_ERROR", 500, details);
    this.name = "InternalServerError";
    Object.setPrototypeOf(this, InternalServerError.prototype);
  }
}

/**
 * Type guard para verificar si un error es una instancia de Error
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * Type guard para verificar si un error es una instancia de AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Convierte un error desconocido a un mensaje de error seguro
 */
export function getErrorMessage(error: unknown): string {
  if (isError(error)) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Ha ocurrido un error desconocido";
}

/**
 * Convierte un error desconocido a un objeto de error seguro para respuestas API
 */
export function getErrorResponse(error: unknown): {
  error: string;
  message: string;
  details?: Record<string, unknown>;
} {
  if (isAppError(error)) {
    return {
      error: error.code ?? "UNKNOWN_ERROR",
      message: error.message,
      ...(error.details && { details: error.details }),
    };
  }
  if (isError(error)) {
    return {
      error: "UNKNOWN_ERROR",
      message: error.message,
    };
  }
  return {
    error: "UNKNOWN_ERROR",
    message: "Ha ocurrido un error desconocido",
  };
}

