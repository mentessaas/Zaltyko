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

class Logger {
  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : "";
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
  }

  private captureToSentry(level: Sentry.SeverityLevel, message: string, error?: Error | unknown, context?: LogContext): void {
    if (!isProduction()) {
      return;
    }

    try {
      if (error instanceof Error) {
        Sentry.captureException(error, {
          level,
          tags: context as Record<string, string>,
          extra: {
            message,
            ...context,
          },
        });
      } else {
        Sentry.captureMessage(message, {
          level,
          tags: context as Record<string, string>,
          extra: context,
        });
      }
    } catch (sentryError) {
      // Fallback a console si Sentry falla
      console.error("Failed to send to Sentry:", sentryError);
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
    const errorContext: LogContext = {
      ...context,
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
      } : String(error),
    };
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
   * Log de operaciones de integraciones externas (Stripe, Mailgun, etc.)
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

