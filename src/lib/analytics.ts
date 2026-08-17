import { getOptionalEnvVar, isProduction } from "./env";
import { logger } from "./logger";
import { hasAnalyticsConsent } from "./consent/state";
import { readStoredUtm } from "./gtm/utm";

export interface AnalyticsPayload {
  userId?: string;
  academyId?: string;
  tenantId?: string;
  metadata?: Record<string, unknown>;
}

const isAnalyticsDisabled = getOptionalEnvVar("NEXT_PUBLIC_DISABLE_ANALYTICS") === "true";

// posthog-js se importaba de forma estatica y quedaba en el bundle
// compartido de TODAS las paginas (incluida la home publica), sumando
// tiempo de parseo/ejecucion antes del primer paint. Se carga de forma
// perezosa (solo en cliente, solo cuando se usa) para que viva en un
// chunk aparte, igual que el fix de Sentry Replay.
let posthogModulePromise: Promise<typeof import("posthog-js")> | null = null;

function loadPostHog() {
  if (typeof window === "undefined") return null;
  if (!posthogModulePromise) {
    posthogModulePromise = import("posthog-js");
  }
  return posthogModulePromise;
}

// ZAL-247 — `initAnalytics` es idempotente: el provider la invoca cada vez
// que el consent pasa a `granted` (incluido el snapshot inicial), y sin este
// guard un grant -> revoke -> grant volvería a llamar `posthog.init`.
let initPromise: Promise<void> | null = null;

// Initialize PostHog (call once consent is granted)
export async function initAnalytics() {
  if (typeof window === "undefined") return;

  // ZAL-247 — el gate de consent vivía solo aguas abajo, en `trackPageView`.
  // Eso descargaba e inicializaba posthog-js para usuarios en `unset` /
  // `revoked`, dejando activo el capture automático de `pageleave` y
  // contradiciendo la garantía "sin consentimiento no se carga PostHog".
  // Ahora la carga del módulo y el `init` quedan detrás del consent; el
  // provider re-invoca esta función cuando el estado pasa a `granted`.
  if (!hasAnalyticsConsent()) {
    if (!isProduction()) {
      logger.debug("initAnalytics omitido: sin consent activo");
    }
    return;
  }

  if (initPromise) return initPromise;
  initPromise = runInit();
  return initPromise;
}

async function runInit(): Promise<void> {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com";

  if (!key) {
    if (!isProduction()) {
      logger.info("Analytics: PostHog key not configured, running in dev mode");
    }
    return;
  }

  const mod = await loadPostHog();
  if (!mod) return;

  mod.posthog.init(key, {
    api_host: host,
    person_profiles: "identified_only",
    capture_pageview: false, // We'll track pageviews manually for better control
    capture_pageleave: true,
    loaded: (posthog) => {
      if (!isProduction()) {
        posthog.debug();
      }
    },
  });
}

// Track pageview
export async function trackPageView(path: string, properties?: Record<string, unknown>) {
  if (isAnalyticsDisabled || typeof window === "undefined") {
    return;
  }

  // ZAL-160 [GTM-DEP.4] — page_view requiere consent activo. Sin consent
  // (unset o revoked) descartamos el evento sin persistir ni disparar
  // carga de posthog-js. Es la regla de RESEARCH/DATA_GOVERNANCE_TAXONOMY_GTM
  // §5: el evento de visita requiere consent previo porque arrastra cookies.
  // El resto del funnel (signup, claim, invite) sí puede trackearse post-
  // signup sin este gate porque el magic link prueba identidad.
  if (!hasAnalyticsConsent()) {
    if (!isProduction()) {
      logger.debug("page_view descartado: sin consent activo", { path });
    }
    return;
  }

  // Adjuntar UTMs persistidos (first-touch de la sesión, ver ZAL-157) si
  // están presentes. Esto enriquece el evento sin leer storage en el
  // resto del funnel — solo el page_view consentido los necesita para
  // atribuir el origen de la visita al canal.
  const storedUtm = readStoredUtm();
  const enrichedProperties = { ...properties, ...storedUtm };

  try {
    const mod = await loadPostHog();
    mod?.posthog.capture("$pageview", {
      path,
      ...enrichedProperties,
    });
  } catch (error) {
    logger.warn("Failed to track pageview", { path, error });
  }
}

// Track event
export async function trackEvent(eventName: string, payload: AnalyticsPayload = {}) {
  if (isAnalyticsDisabled) {
    return;
  }

  // Server-side product actions already call this helper (onboarding, invites,
  // billing and messaging). Previously those calls returned immediately, so
  // activation evidence described in the vault was never persisted. Keep the
  // browser path on PostHog, but persist authenticated milestones first-party
  // on the server without importing the DB layer into the client bundle.
  if (typeof window === "undefined") {
    try {
      const { userId, academyId, tenantId, metadata } = payload;
      const { recordGrowthEvent } = await import("@/lib/growth/events");
      const properties = Object.fromEntries(
        Object.entries(metadata ?? {}).filter(([, value]) =>
          value === null ||
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
        )
      ) as Record<string, string | number | boolean | null>;

      await recordGrowthEvent({
        eventName,
        userId: userId ?? null,
        academyId: academyId ?? null,
        tenantId: tenantId ?? null,
        source: "authenticated",
        properties,
      });
    } catch (error) {
      logger.warn("Failed to persist server analytics event", { eventName, error });
    }
    return;
  }

  try {
    const { userId, academyId, tenantId, metadata, ...rest } = payload;

    const mod = await loadPostHog();
    mod?.posthog.capture(eventName, {
      user_id: userId,
      academy_id: academyId,
      tenant_id: tenantId,
      ...metadata,
      ...rest,
    });
  } catch (error) {
    logger.warn("Failed to emit analytics event", { eventName, error });
  }
}

// Convenience methods for common events
export const analytics = {
  pageView: (path: string, properties?: Record<string, unknown>) => trackPageView(path, properties),

  signUp: (userId: string, plan?: string) =>
    trackEvent("sign_up_completed", { userId, metadata: { plan } }),

  checkoutStarted: (userId: string, plan: string) =>
    trackEvent("checkout_started", { userId, metadata: { plan } }),

  checkoutCompleted: (userId: string, plan: string) =>
    trackEvent("checkout_completed", { userId, metadata: { plan } }),

  subscriptionUpgraded: (userId: string, fromPlan: string, toPlan: string) =>
    trackEvent("subscription_upgraded", { userId, metadata: { from_plan: fromPlan, to_plan: toPlan } }),

  subscriptionDowngraded: (userId: string, fromPlan: string, toPlan: string) =>
    trackEvent("subscription_downgraded", { userId, metadata: { from_plan: fromPlan, to_plan: toPlan } }),

  subscriptionCanceled: (userId: string, plan: string) =>
    trackEvent("subscription_canceled", { userId, metadata: { plan } }),

  leadCaptured: (source?: string, plan?: string) =>
    trackEvent("lead_captured", { metadata: { source, plan } }),
};

// --- test hooks -------------------------------------------------------------

/**
 * ZAL-247 — expone si el import dinámico de `posthog-js` llegó a dispararse.
 * Es la única forma de aseverar "sin consent, posthog-js no se carga" sin
 * inspeccionar el grafo de módulos de vitest. Solo para tests.
 */
export function __isPostHogLoadedForTests(): boolean {
  return posthogModulePromise !== null;
}

/** ZAL-247 — resetea el estado de carga/init entre tests. */
export function __resetAnalyticsForTests(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("__resetAnalyticsForTests is not available in production");
  }
  posthogModulePromise = null;
  initPromise = null;
}
