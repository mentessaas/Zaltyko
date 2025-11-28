// Next.js instrumentation file
// This file is used to initialize Sentry on the server and edge runtime

import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

export async function register() {
  // Server-side initialization
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn: SENTRY_DSN,
      tracesSampleRate: 1.0,
      debug: false,
      beforeSend(event, hint) {
        if (process.env.NODE_ENV === "development") {
          return null;
        }
        
        // Remove sensitive data from event
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

  // Edge runtime initialization
  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: SENTRY_DSN,
      tracesSampleRate: 1.0,
      debug: false,
      beforeSend(event, hint) {
        if (process.env.NODE_ENV === "development") {
          return null;
        }
        return event;
      },
    });
  }
}