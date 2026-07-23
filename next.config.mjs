import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { withSentryConfig } from "@sentry/nextjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.supabase.co https://*.stripe.com https://vercel.live https://va.vercel-scripts.com https://*.posthog.com https://*.google-analytics.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.stripe.com https://*.posthog.com https://*.google-analytics.com https://vercel.live",
      "frame-src 'self' https://*.stripe.com https://*.supabase.co",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self' https://*.supabase.co",
    ].join("; "),
  },
];

const nextConfig = {
  // TypeScript still runs during build; ESLint runs explicitly via `pnpm lint`.
  typescript: {
    ignoreBuildErrors: false,
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

  // Headers de seguridad
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },

  // Consolidar señales SEO en el dominio canónico: el dominio de despliegue
  // de Vercel no debe competir con zaltyko.com por indexación/backlinks.
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
export default withSentryConfig(nextConfig, {
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
