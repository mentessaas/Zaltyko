// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

function tracesSampler(samplingContext: {
  parentSampled?: boolean;
  transactionContext?: { status?: string };
}) {
  if (samplingContext.parentSampled === false) return 0;
  const status = samplingContext.transactionContext?.status;
  if (status && ["internal_error", "unavailable", "unknown_error", "server_error"].includes(status)) {
    return 1.0;
  }
  return 0.1;
}

Sentry.init({
  dsn: SENTRY_DSN,
  tracesSampler,

  debug: false,

  beforeSend(event, hint) {
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


