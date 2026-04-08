"use client";

import { useCallback } from "react";

export interface LogContext {
  [key: string]: unknown;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

interface UseLogger {
  debug: (message: string, context?: LogContext) => void;
  info: (message: string, context?: LogContext) => void;
  warn: (message: string, context?: LogContext) => void;
  error: (message: string, error?: Error | unknown, context?: LogContext) => void;
  log: (level: LogLevel, message: string, context?: LogContext) => void;
}

/**
 * Client-side logger hook
 * Provides structured logging with optional Sentry integration
 * Falls back to console in development
 */
export function useLogger(): UseLogger {
  const isDevelopment = process.env.NODE_ENV === "development";

  const formatMessage = useCallback((level: LogLevel, message: string, context?: LogContext): string => {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : "";
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
  }, []);

  const log = useCallback((level: LogLevel, message: string, context?: LogContext) => {
    const formatted = formatMessage(level, message, context);

    switch (level) {
      case "debug":
        if (isDevelopment) console.debug(formatted);
        break;
      case "info":
        console.info(formatted);
        break;
      case "warn":
        console.warn(formatted);
        // In production, could send to Sentry here
        break;
      case "error":
        console.error(formatted);
        // In production, could send to Sentry here
        break;
    }
  }, [isDevelopment, formatMessage]);

  const debug = useCallback((message: string, context?: LogContext) => {
    log("debug", message, context);
  }, [log]);

  const info = useCallback((message: string, context?: LogContext) => {
    log("info", message, context);
  }, [log]);

  const warn = useCallback((message: string, context?: LogContext) => {
    log("warn", message, context);
  }, [log]);

  const error = useCallback((message: string, error?: Error | unknown, context?: LogContext) => {
    const errorContext: LogContext = {
      ...context,
      error: error instanceof Error
        ? { message: error.message, stack: error.stack, name: error.name }
        : String(error),
    };
    log("error", message, errorContext);
  }, [log]);

  return { debug, info, warn, error, log };
}
