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
];

import { withSentryConfig } from "@sentry/nextjs";

const nextConfig = {
  // En producción, NO ignorar errores de TypeScript
  // Esto ayuda a detectar problemas antes del deploy
  typescript: { 
    ignoreBuildErrors: process.env.NODE_ENV === "development",
  },
  pageExtensions: ["ts", "tsx", "mdx"],
  // Deshabilitar exportación estática (la app es completamente dinámica)
  output: undefined, // No usar 'export', usar modo estándar de Next.js
  
  // Configuración de imágenes para optimización
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
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
  swcMinify: true,
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
  
  // Configuración de experimental features
  experimental: {
    // Optimizar re-renders
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
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
  
  // Hides source maps from generated client bundles
  hideSourceMaps: true,
  
  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,
  
  // Enables automatic instrumentation of Vercel Cron Monitors.
  automaticVercelMonitors: true,
});

