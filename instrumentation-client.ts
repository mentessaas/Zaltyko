import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn: SENTRY_DSN,
  // Tracing (APM) deshabilitado en cliente: BrowserTracing era lo que
  // quedaba dominando el chunk compartido por todas las páginas (~165KB
  // sin usar en la home, medido con PageSpeed Insights) despues de sacar
  // Replay. Se sacrifica APM de rendimiento en el navegador a cambio de
  // velocidad de carga; la captura de errores (lo que realmente importa
  // para monitoreo de produccion) sigue completa mas abajo.
  tracesSampleRate: 0,
  debug: false,
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.05,
  // El Session Replay de Sentry (rrweb) es lo que dominaba el chunk
  // compartido por TODAS las páginas (134KB / ~442KB sin minificar,
  // confirmado en el build) — se cargaba entero para el 100% de las
  // visitas aunque solo graba al 5%. lazyLoadIntegration() lo separa en
  // un chunk aparte que solo se descarga cuando realmente se activa.
  integrations: [],
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

if (typeof window !== "undefined") {
  Sentry.lazyLoadIntegration("replayIntegration").then((replayIntegration) => {
    Sentry.addIntegration(
      replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      })
    );
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

