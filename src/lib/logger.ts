/**
 * Sistema de logging estructurado para la aplicación
 * Integrado con Sentry para error tracking en producción
 */

import * as Sentry from "@sentry/nextjs";
import { isProduction } from "./env";

export enum LogLevel {
  DEBUG = "debug",
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
}

export interface LogContext {
  [key: string]: unknown;
}

const REDACTED_VALUE = "[REDACTED]";
const SENSITIVE_KEYS = new Set(["clientSecret", "client_secret"]);
<<<<<<< HEAD
const SENSITIVE_KEY_PATTERN = /(?:client[-_]?secret|api[-_]?key|authorization|bearer|token|password|secret)/i;

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key) || SENSITIVE_KEY_PATTERN.test(key);
}

/** Redacta credenciales embebidas en mensajes libres antes de loguearlos. */
export function redactSensitiveText(value: string): string {
  return value
    .replace(
      /(\bauthorization\s*:\s*(?:bearer|basic)\s+)[^\s,;"']+/gi,
      "$1[REDACTED]",
    )
    .replace(/(\bbearer\s+)[^\s,;"']+/gi, "$1[REDACTED]")
    .replace(
      /(\b(?:api[-_]?key|token|secret|password)\s*[:=]\s*)["']?[^\s,;}"']+/gi,
      "$1[REDACTED]",
    );
}
=======
>>>>>>> origin/main

/**
 * Clona un valor de logging y redacciona secretos SCA aunque estén anidados
 * dentro de arrays u objetos. Los ciclos se reemplazan para que la propia
 * protección no vuelva a fallar al serializar el contexto.
 */
export function redactSensitive<T>(value: T): T {
  const seen = new WeakSet<object>();

  const redact = (current: unknown, key?: string): unknown => {
<<<<<<< HEAD
    if (key && isSensitiveKey(key)) {
      return REDACTED_VALUE;
    }
    if (typeof current === "string") {
      return redactSensitiveText(current);
    }
=======
    if (key && SENSITIVE_KEYS.has(key)) {
      return REDACTED_VALUE;
    }
>>>>>>> origin/main
    if (current === null || typeof current !== "object") {
      return current;
    }
    if (seen.has(current)) {
      return "[Circular]";
    }
    seen.add(current);

    if (Array.isArray(current)) {
      return current.map((item) => redact(item));
    }
    if (current instanceof Date) {
      return current.toISOString();
    }

    return Object.fromEntries(
      Object.entries(current).map(([property, child]) => [property, redact(child, property)])
    );
  };

  return redact(value) as T;
}

export function redactError(error: Error): Error {
<<<<<<< HEAD
  const sanitized = new Error(redactSensitiveText(error.message));
  sanitized.name = error.name;
  sanitized.stack = error.stack ? redactSensitiveText(error.stack) : error.stack;

  for (const [key, value] of Object.entries(error)) {
    Object.defineProperty(sanitized, key, {
      value: isSensitiveKey(key) ? REDACTED_VALUE : redactSensitive(value),
=======
  const sanitized = new Error(error.message);
  sanitized.name = error.name;
  sanitized.stack = error.stack;

  for (const [key, value] of Object.entries(error)) {
    Object.defineProperty(sanitized, key, {
      value: SENSITIVE_KEYS.has(key) ? REDACTED_VALUE : redactSensitive(value),
>>>>>>> origin/main
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }

  return sanitized;
}

class Logger {
  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(redactSensitive(context))}` : "";
<<<<<<< HEAD
    return `[${timestamp}] [${level.toUpperCase()}] ${redactSensitiveText(message)}${contextStr}`;
=======
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
>>>>>>> origin/main
  }

  private captureToSentry(level: Sentry.SeverityLevel, message: string, error?: Error | unknown, context?: LogContext): void {
    if (!isProduction()) {
      return;
    }

    try {
      const safeContext = redactSensitive(context);
      if (error instanceof Error) {
        Sentry.captureException(redactError(error), {
          level,
          tags: safeContext as Record<string, string>,
          extra: {
<<<<<<< HEAD
            message: redactSensitiveText(message),
=======
            message,
>>>>>>> origin/main
            ...safeContext,
          },
        });
      } else {
<<<<<<< HEAD
        Sentry.captureMessage(redactSensitiveText(message), {
=======
        Sentry.captureMessage(message, {
>>>>>>> origin/main
          level,
          tags: safeContext as Record<string, string>,
          extra: safeContext,
        });
      }
    } catch (sentryError) {
      // Fallback a console si Sentry falla
      console.error("Failed to send to Sentry:", redactSensitive(sentryError));
    }
  }

  debug(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV === "development") {
      console.debug(this.formatMessage(LogLevel.DEBUG, message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    console.info(this.formatMessage(LogLevel.INFO, message, context));
    // No enviar info a Sentry para evitar ruido
  }

  warn(message: string, context?: LogContext): void {
    console.warn(this.formatMessage(LogLevel.WARN, message, context));
    // Enviar warnings a Sentry solo en producción
    if (isProduction()) {
      this.captureToSentry("warning", message, undefined, context);
    }
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const errorContext = redactSensitive<LogContext>({
      ...context,
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
      } : String(error),
    });
    console.error(this.formatMessage(LogLevel.ERROR, message, errorContext));
    
    // Enviar errores a Sentry en producción
    if (isProduction()) {
      this.captureToSentry("error", message, error, context);
    }
  }

  /**
   * Log de errores de API con contexto completo
   */
  apiError(
    endpoint: string,
    method: string,
    error: Error | unknown,
    context?: LogContext
  ): void {
    this.error(
      `API Error: ${method} ${endpoint}`,
      error,
      {
        ...context,
        endpoint,
        method,
      }
    );
  }

  /**
   * Log de operaciones de base de datos
   */
  dbOperation(
    operation: string,
    table: string,
    duration?: number,
    context?: LogContext
  ): void {
    const logContext: LogContext = {
      ...context,
      operation,
      table,
      ...(duration !== undefined && { duration: `${duration}ms` }),
    };

    if (duration && duration > 1000) {
      this.warn(`Slow DB operation: ${operation} on ${table}`, logContext);
    } else {
      this.debug(`DB operation: ${operation} on ${table}`, logContext);
    }
  }

  /**
   * Log de operaciones de integraciones externas (Stripe, Brevo, etc.)
   */
  externalService(
    service: string,
    operation: string,
    success: boolean,
    duration?: number,
    error?: Error | unknown,
    context?: LogContext
  ): void {
    const logContext: LogContext = {
      ...context,
      service,
      operation,
      success,
      ...(duration !== undefined && { duration: `${duration}ms` }),
    };

    if (success) {
      this.info(`External service: ${service}.${operation}`, logContext);
    } else {
      this.error(`External service error: ${service}.${operation}`, error, logContext);
    }
  }
}

export const logger = new Logger();
