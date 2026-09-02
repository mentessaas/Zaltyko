import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { withSentryConfig } from "@sentry/nextjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  pageExtensions: ["ts", "tsx", "mdx"],
  // Deshabilitar exportación estática (la app es completamente dinámica)
  output: undefined, // No usar 'export', usar modo estándar de Next.js
  outputFileTracingRoot: resolve(__dirname),
  outputFileTracingIncludes: {
    "/*": ["./certs/supabase-root-ca.crt"],
  },
  // swagger-jsdoc analiza archivos de rutas dinámicamente. Externalizarlo evita
  // que Webpack intente resolver esos requires durante el build de Next.
  serverExternalPackages: ["next-swagger-doc", "swagger-jsdoc"],

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
    ];
  },

  // Configuración de experimental features
  experimental: {
    // Optimizar re-renders
    optimizePackageImports: ["lucide-react", "@radix-ui/react-icons"],
  },
};

// Wrap Next.js config with Sentry
const sentryConfig = withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Only upload source maps in production
  silent: !process.env.SENTRY_AUTH_TOKEN,
  hideSourceMaps: true,

  // Automatically instrument Next.js
  widenClientFileUpload: true,

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
