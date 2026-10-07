import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { headers } from "next/headers";
import "./globals.css";
import type React from "react";
import { cn } from "@/lib/utils";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { BottomNav } from "@/components/navigation/BottomNav";
import { AppProviders } from "./providers";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { OfflineBanner } from "@/components/ui/offline-banner";
import { UpdateBanner } from "@/components/ui/update-banner";
import { InstallPrompt } from "@/components/ui/install-prompt";
import { PostHogProvider } from "@/components/PostHogProvider";
import { UtmCapture } from "@/components/growth/UtmCapture";
import { GoogleAdsTracking } from "@/components/GoogleAdsTracking";
import { getPublicSiteUrl } from "@/lib/seo/site-url";

const spaceGrotesk = localFont({
  src: [
    { path: "../assets/fonts/space-grotesk-400.ttf", weight: "400", style: "normal" },
    { path: "../assets/fonts/space-grotesk-500.ttf", weight: "500", style: "normal" },
    { path: "../assets/fonts/space-grotesk-600.ttf", weight: "600", style: "normal" },
    { path: "../assets/fonts/space-grotesk-700.ttf", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-space-grotesk",
});

// Body: Manrope (geométrica, distintiva). Se conserva el nombre de variable
// CSS --font-inter para no tocar el resto del sistema de estilos.
const bodyFont = localFont({
  src: [
    { path: "../assets/fonts/manrope-400.ttf", weight: "400", style: "normal" },
    { path: "../assets/fonts/manrope-500.ttf", weight: "500", style: "normal" },
    { path: "../assets/fonts/manrope-600.ttf", weight: "600", style: "normal" },
    { path: "../assets/fonts/manrope-700.ttf", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-inter",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: "#16243A",
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: {
    default: "Zaltyko — Tu academia de gimnasia, en ritmo",
    template: "%s | Zaltyko",
  },
  description:
    "Zaltyko ayuda a quienes dirigen academias de gimnasia artística y rítmica a ordenar grupos, asistencia, cuotas y comunicación con familias.",
  keywords: [
    "zaltyko",
    "gimnasia",
    "academias de gimnasia",
    "gimnasia artística",
    "gimnasia rítmica",
    "gestión de academias",
    "software para academias de gimnasia",
  ],
  authors: [{ name: "Zaltyko" }],
  creator: "Zaltyko",
  metadataBase: new URL(getPublicSiteUrl()),
  alternates: {
    canonical: getPublicSiteUrl(),
    languages: {
      "es-ES": `${getPublicSiteUrl()}/es`,
      "en-US": `${getPublicSiteUrl()}/en`,
      "x-default": getPublicSiteUrl(),
    },
  },
  openGraph: {
    type: "website",
    locale: "es_ES",
    url: getPublicSiteUrl(),
    siteName: "Zaltyko",
    title: "Zaltyko — Tu academia de gimnasia, en ritmo",
    description: "Ordena grupos, asistencia, cuotas y comunicación con familias en un sistema para gimnasia artística y rítmica.",
    images: [
      {
        url: "/branding/zaltyko/photos/academia-editorial-01.png",
        width: 1536,
        height: 1024,
        alt: "Entrenadora adulta prepara una sesión en una sala de gimnasia",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Zaltyko — Tu academia de gimnasia, en ritmo",
    description: "Menos trabajo administrativo repetido; más claridad para dirigir tu academia.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Zaltyko",
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/branding/zaltyko/favicon-zaltyko.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // El nonce CSP se genera por request en middleware.ts y se expone vía el
  // header `x-nonce`. Sin propagarlo a `<html nonce>` y a los `<Script>` que
  // metan scripts inline (Google Ads, etc.), el navegador bloquea el bundle
  // de hidratación de React porque el CSP no encuentra un nonce que matchear.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  // W9 GEO audit: derive the concrete Supabase origin from a public env var
  // (NEXT_PUBLIC_* vars are intentionally not secrets — they are already
  // inlined into client bundles). Skip silently when unset or malformed so
  // local builds without Supabase configured still render.
  let supabaseOrigin: string | null = null;
  const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (rawSupabaseUrl && !rawSupabaseUrl.includes("your-project")) {
    try {
      supabaseOrigin = new URL(rawSupabaseUrl).origin;
    } catch {
      supabaseOrigin = null;
    }
  }

  return (
    <html lang="es" nonce={nonce} suppressHydrationWarning>
      <head>
        {/* Preconnect to critical third-party origins (W5 + W9 GEO audit).
            Wildcards aren't valid in preconnect — concrete subdomains only.
            PostHog, Supabase (project-scoped), and
            Stripe (js.stripe.com + api.stripe.com) added now to cut cold
            DNS+TCP+TLS when users sign in or start checkout. */}
        <link rel="preconnect" href="https://app.posthog.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://js.stripe.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://api.stripe.com" crossOrigin="anonymous" />
        {supabaseOrigin && (
          <link rel="preconnect" href={supabaseOrigin} crossOrigin="anonymous" />
        )}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0F172A" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body
        className={cn(bodyFont.variable, spaceGrotesk.variable, "font-sans antialiased")}
        suppressHydrationWarning
      >
        <UtmCapture />
        <OfflineBanner />
        <UpdateBanner />
        <InstallPrompt />
        <GoogleAdsTracking nonce={nonce} />
        <AppProviders nonce={nonce}>
          <PostHogProvider>
            {children}
            <BottomNav />
          </PostHogProvider>
        </AppProviders>
        <ServiceWorkerRegister />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
