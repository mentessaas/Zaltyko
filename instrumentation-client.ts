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
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.05,
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
  beforeSend(event) {
    if (process.env.NODE_ENV === "development") {
      return null;
    }
    return event;
  },
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

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

