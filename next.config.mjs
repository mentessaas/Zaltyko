import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { withSentryConfig } from "@sentry/nextjs/config";
import { LEGACY_PUBLIC_REDIRECTS } from "./src/lib/launch/legacy-public-redirects.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isSandboxPreviewBuild =
  process.env.VERCEL_ENV === "preview" &&
  process.env.ZALTYKO_SANDBOX_PREVIEW_BRANCH === "codex/fix-f84-build-hang-20261019" &&
  process.env.NEXT_PUBLIC_SUPABASE_URL === "https://aeeootdmuiqkfeernskw.supabase.co" &&
  process.env.ZALTYKO_SANDBOX_PREVIEW_BUILD_OPTIMIZATIONS === "true";
const isProductionBuildOptimization =
  process.env.VERCEL === "1" &&
  process.env.VERCEL_ENV === "production" &&
  process.env.NEXT_PUBLIC_SUPABASE_URL === "https://jegxfahsvugilbthbked.supabase.co" &&
  process.env.ZALTYKO_PRODUCTION_BUILD_OPTIMIZATIONS === "true";

// Security headers (HSTS, CSP con nonce, X-Frame-Options, X-Content-Type-Options,
// Referrer-Policy, Permissions-Policy) y redirección www↔apex se aplican desde
// middleware.ts para generar nonces por request (CSP estricta).
// El bloque `securityHeaders` que vivía aquí se eliminó porque next.config.mjs
// sólo permite headers estáticos y no puede emitir un nonce por request.

const nextConfig = {
  // El typecheck corre en el job de CI (Lint & Type Check) antes de mergear a main;
  // repetirlo aquí agotaba el límite de build de Vercel (2 cores / 8 GB) y mataba
  // cada deploy en "Checking validity of types" sin emitir un error.
  typescript: {
    ignoreBuildErrors: true,
  },
  // ESLint runs via the dedicated CI job (Lint & Type Check); skip it during next build.
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Files named `*.dev.ts` (today only src/app/api/dev/session/route.dev.ts)
  // are routes under `next dev` and do not exist in any `next build`:
  // production, the delivery preview and the synthetic E2E never ship them.
  pageExtensions:
    process.env.NODE_ENV === "development" ? ["dev.ts", "ts", "tsx", "mdx"] : ["ts", "tsx", "mdx"],
  // Deshabilitar exportación estática (la app es completamente dinámica)
  output: undefined, // No usar 'export', usar modo estándar de Next.js
  outputFileTracingRoot: resolve(__dirname),
  outputFileTracingIncludes: {
    "/*": ["./certs/supabase-root-ca.crt"],
  },
  // swagger-jsdoc analiza archivos de rutas dinámicamente. Externalizarlo evita
  // que Webpack intente resolver esos requires durante el build de Next.
  // El entrypoint Node de Sentry reexporta integraciones y dependencias CJS.
  // Cargar el SDK en Node evita recorrer ese grafo en cada bundle servidor;
  // no desactiva el plugin, la captura ni los bundles browser/edge.
  serverExternalPackages: [
    "next-swagger-doc",
    "swagger-jsdoc",
    "@sentry/nextjs",
  ],

  // Configuración de imágenes para optimización
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
    ],
  },

  webpack: (config, { isServer }) => {
    if (isSandboxPreviewBuild || isProductionBuildOptimization) {
      // Avoid carrying a large filesystem cache across opted-in remote candidates.
      // Keep compilation caching in memory; ordinary production/local are unchanged.
      config.cache = Object.freeze({ type: "memory" });
      // Bounded remote diagnostics: phase/elapsed/memory only, no module paths.
      config.plugins.push({
        apply(compiler) {
          const name = isServer ? "server" : "client";
          const start = Date.now();
          const report = (phase) => {
            const memory = process.memoryUsage();
            console.log("Sandbox compiler phase:", JSON.stringify({
              compiler: name, phase, elapsedMs: Date.now() - start,
              rssMiB: Math.round(memory.rss / 1024 / 1024),
              heapMiB: Math.round(memory.heapUsed / 1024 / 1024),
            }));
          };
          compiler.hooks.compile.tap("SandboxBuildPhases", () => report("compile"));
          compiler.hooks.afterCompile.tap("SandboxBuildPhases", () => report("afterCompile"));
          compiler.hooks.done.tap("SandboxBuildPhases", () => report("done"));
        },
      });
    }
    if (!isServer) {
      // Excluir módulos de Node.js del bundle del cliente
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        dns: false,
        child_process: false,
      };
    }
    return config;
  },

  // Optimizaciones de compilación
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,

  // Playwright/dev-server requests originate from loopback during local E2E;
  // explicitly allow them so Next.js does not emit the upcoming
  // cross-origin warning (production traffic remains governed by middleware).
  allowedDevOrigins: ["127.0.0.1", "localhost"],

  // Headers de seguridad: ver middleware.ts (nonce por request).

  // Consolidar señales SEO en el dominio canónico: el dominio de despliegue
  // de Vercel no debe competir con zaltyko.com por indexación/backlinks.
  // El manejo www↔apex con 301 vive en middleware.ts para evitar ciclos
  // y poder reflejar el path completo sin doble match.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "zaltyko.vercel.app" }],
        destination: "https://zaltyko.com/:path*",
        permanent: true,
      },
      // Legacy public aliases, all permanent; list and reasons in
      // src/lib/launch/legacy-public-redirects.mjs (shared with the SEO test).
      ...LEGACY_PUBLIC_REDIRECTS.map(([source, destination]) => ({ source, destination, permanent: true })),
    ];
  },

  // Configuración de experimental features
  experimental: {
    // Preserve the local gate and sandbox behavior. Production is a separate,
    // explicit Vercel-only opt-in tied to the production Supabase project.
    ...((process.env.E2E_LOCAL_SUPABASE === "true" &&
    process.env.ZALTYKO_E2E_WEBPACK_BUILD_WORKER === "true") ||
    (process.env.VERCEL_ENV === "preview" &&
      process.env.ZALTYKO_SANDBOX_PREVIEW_BRANCH === "codex/fix-f84-build-hang-20261019" &&
      process.env.NEXT_PUBLIC_SUPABASE_URL === "https://aeeootdmuiqkfeernskw.supabase.co" &&
      process.env.ZALTYKO_SANDBOX_PREVIEW_BUILD_OPTIMIZATIONS === "true") ||
    (process.env.VERCEL === "1" &&
      process.env.VERCEL_ENV === "production" &&
      process.env.NEXT_PUBLIC_SUPABASE_URL === "https://jegxfahsvugilbthbked.supabase.co" &&
      process.env.ZALTYKO_PRODUCTION_BUILD_OPTIMIZATIONS === "true")
      // Trace the completed server output while edge/client compilation runs.
      // Next requires the build worker for this; keep both behind the same gate.
      ? {
          webpackBuildWorker: true,
          parallelServerBuildTraces: true,
          // Keep the measured local/sandbox experiment unchanged. Production
          // retains Next's server minification setting for its existing artifact.
          ...(isProductionBuildOptimization ? {} : { serverMinification: false }),
        }
      : {}),
    // Next optimizes date-fns itself, but not its 95-locale barrel. Select only
    // the requested es/enUS exports instead of compiling every other locale.
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-icons",
      "date-fns/locale",
    ],
  },
};

// Skip Sentry's webpack plugin on Vercel preview builds: withSentryConfig runs
// the @sentry/webpack-plugin (source map generation + upload + bundle transforms)
// over all 172 routes, which consistently OOMs on the standard 8 GB Vercel
// preview container. The plugin is also responsible for wiring the
// `/monitoring` tunnelRoute rewrite — without it, runtime Sentry events from
// preview would 404 anyway, so server init is also gated (see
// instrumentation.ts). Production deployments keep the full Sentry treatment.
const isVercelPreview = process.env.VERCEL_ENV === "preview";
const sentryConfig = isVercelPreview
  ? nextConfig
  : withSentryConfig(nextConfig, {
      // For all available options, see:
      // https://github.com/getsentry/sentry-webpack-plugin#options

      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,

      // Only upload source maps in production
      silent: !process.env.SENTRY_AUTH_TOKEN,
      hideSourceMaps: true,
      // The standard Vercel build container has 8 GB of RAM. Generating and
      // uploading client source maps across the full route set exhausts it and
      // terminates production builds with SIGKILL/OOM. Runtime Sentry capture
      // remains enabled; symbolication can be restored when the build runs on
      // a larger runner.
      sourcemaps: {
        disable: true,
      },

      // Automatically instrument Next.js
      widenClientFileUpload: false,

      // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
      tunnelRoute: "/monitoring",

      webpack: {
        // API actual de Sentry; reemplaza el alias deprecado disableLogger.
        treeshake: {
          removeDebugLogging: true,
        },
        // API actual de Sentry; crea monitores de los cron definidos en vercel.json.
        automaticVercelMonitors: true,
      },
    });

// Sentry 10.64 injects this experimental option, which breaks Next's internal
// Pages Router error prerender on Next 15.5.21 (`/_error` -> `/404`).
delete sentryConfig.experimental?.clientTraceMetadata;

export default sentryConfig;
