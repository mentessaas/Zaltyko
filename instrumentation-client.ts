import { sentryPrivacyOptions } from "./src/lib/monitoring/sentry-privacy";
import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

function tracesSampler(samplingContext: {
  parentSampled?: boolean;
  transactionContext?: { status?: string };
}) {
  if (samplingContext.parentSampled === false) return 0;
  const status = samplingContext.transactionContext?.status;
  if (status && ["internal_error", "server_error"].includes(status)) {
    return 1.0;
  }
  return 0.1;
}

Sentry.init({
  dsn: SENTRY_DSN,
  tracesSampler,
  debug: false,
  ...sentryPrivacyOptions,
  replaysOnErrorSampleRate: 0,
  replaysSessionSampleRate: 0,
  // No replay integration or replay envelopes in the launch candidate.
  integrations: [],

  ignoreErrors: [
    "top.GLOBALS",
    "originalCreateNotification",
    "canvas.contentDocument",
    "MyApp_RemoveAllHighlights",
    "atomicFindClose",
    "fb_xd_fragment",
    "bmi_SafeAddOnload",
    "EBCallBackMessageReceived",
    "conduitPage",
    "NetworkError",
    "Network request failed",
    "Failed to fetch",
    "chrome-extension://",
    "moz-extension://",
  ],
});

// Replay is not loaded until its collection and retention are separately reviewed.

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

