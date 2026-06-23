// Next.js instrumentation file
// This file is used to initialize Sentry on the server and edge runtime

import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

// tracesSampler: 100% para errores y paths criticos, 10% para el resto.
// Evita saturar la quota de Sentry sin perder visibilidad en fallos.
function tracesSampler(samplingContext: {
  request?: { url?: string };
  parentSampled?: boolean;
  transactionContext?: { status?: string };
}) {
  if (samplingContext.parentSampled === false) return 0;
  const status = samplingContext.transactionContext?.status;
  if (status && ["internal_error", "unavailable", "unknown_error", "server_error"].includes(status)) {
    return 1.0;
  }
  const url = samplingContext.request?.url ?? "";
  if (url.includes("/api/stripe/webhook") || url.includes("/api/cron")) return 0;
  return 0.1;
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn: SENTRY_DSN,
      tracesSampler,
      debug: false,
      beforeSend(event) {
        if (process.env.NODE_ENV === "development") {
          return null;
        }

        if (event.request) {
          if (event.request.headers) {
            delete event.request.headers["authorization"];
            delete event.request.headers["cookie"];
            delete event.request.headers["x-api-key"];
          }

          if (event.request.query_string) {
            const params = new URLSearchParams(event.request.query_string);
            params.delete("token");
            params.delete("api_key");
            params.delete("password");
            event.request.query_string = params.toString();
          }
        }

        return event;
      },
      ignoreErrors: [
        "ECONNREFUSED",
        "ETIMEDOUT",
        "ENOTFOUND",
        "VALIDATION_ERROR",
        "ZodError",
      ],
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: SENTRY_DSN,
      tracesSampler,
      debug: false,
      beforeSend(event) {
        if (process.env.NODE_ENV === "development") {
          return null;
        }
        return event;
      },
    });
  }
}

export const onRequestError = Sentry.captureRequestError;

