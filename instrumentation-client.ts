import { sentryPrivacyOptions } from "./src/lib/monitoring/sentry-privacy";
import * as Sentry from "@sentry/nextjs";
import { captureTeamInvitationFragment, discardTeamInvitationToken } from "./src/lib/auth/team-invitation-fragment";

// The fragment is never sent in the HTTP request. Remove it before initializing
// a browser SDK; this acceptance document does not initialize Sentry at all.
const teamInvitationDocument = captureTeamInvitationFragment();

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

if (!teamInvitationDocument) Sentry.init({
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

export const onRouterTransitionStart: typeof Sentry.captureRouterTransitionStart = (...args) => {
  // A new navigation cannot reuse a credential left by an unmounted/failed page.
  // The document bootstrap-to-page handoff still works without navigation.
  discardTeamInvitationToken();
  // Next may announce the destination before updating window.location. Never
  // forward an invitation destination (which may include its fragment) to SDKs.
  try {
    if (new URL(args[0], "https://zaltyko.invalid").pathname === "/staff/accept") {
      captureTeamInvitationFragment();
      return;
    }
  } catch {
    return;
  }
  // Never recapture an abandoned source fragment while leaving the page.
  if (typeof window !== "undefined" && window.location.pathname === "/staff/accept") return;
  return Sentry.captureRouterTransitionStart(...args);
};

