import type { Metadata, Viewport } from "next";
import { Outfit, Inter } from "next/font/google";
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

const outfit = Outfit({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-outfit",
});

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
  variable: "--font-inter",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: "#0D47A1",
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: {
    default: "Zaltyko - Sistema de Gestión para Academias de Gimnasia",
    template: "%s | Zaltyko",
  },
  description:
    "Zaltyko — El sistema definitivo para gestionar academias de gimnasia. Administra atletas, clases, pagos y más.",
  keywords: [
    "zaltyko",
    "gimnasia",
    "academias de gimnasia",
    "gestión deportiva",
    "gestión de academias",
    "software para gimnasios",
    "SaaS",
  ],
  authors: [{ name: "Zaltyko" }],
  creator: "Zaltyko",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  openGraph: {
    type: "website",
    locale: "es_ES",
    url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    siteName: "Zaltyko",
    title: "Zaltyko - Sistema de Gestión para Academias de Gimnasia",
    description: "El sistema definitivo para gestionar academias de gimnasia. Administra atletas, clases, pagos y más.",
    images: [
      {
        url: "/api/og",
        width: 1200,
        height: 630,
        alt: "Zaltyko - Gestión de Academias de Gimnasia",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Zaltyko - Sistema de Gestión para Academias de Gimnasia",
    description: "El sistema definitivo para gestionar academias de gimnasia",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0D47A1" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body
        className={cn(inter.variable, outfit.variable, "font-sans antialiased")}
        suppressHydrationWarning
      >
        <OfflineBanner />
        <UpdateBanner />
        <InstallPrompt />
        <AppProviders>
          {children}
          <BottomNav />
        </AppProviders>
        <ServiceWorkerRegister />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
