// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn: SENTRY_DSN,
  
  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: 1.0,
  
  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,
  
  // Filter out sensitive data
  beforeSend(event, hint) {
    // Don't send events in development
    if (process.env.NODE_ENV === "development") {
      return null;
    }
    
    // Remove sensitive data from event
    if (event.request) {
      // Remove sensitive headers
      if (event.request.headers) {
        delete event.request.headers["authorization"];
        delete event.request.headers["cookie"];
        delete event.request.headers["x-api-key"];
      }
      
      // Remove sensitive query params
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
  
  // Ignore certain errors
  ignoreErrors: [
    // Database connection errors that are handled
    "ECONNREFUSED",
    "ETIMEDOUT",
    "ENOTFOUND",
    // Validation errors that are expected
    "VALIDATION_ERROR",
    "ZodError",
  ],
});

