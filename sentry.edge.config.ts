// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is incompatible with the Server-side SDK (@sentry/node).
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
    return event;
  },
});

