import type { Metadata } from "next";
import { Poppins, Inter } from "next/font/google";
import "./globals.css";
import type React from "react";
import { cn } from "@/lib/utils";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { AppProviders } from "./providers";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

const poppins = Poppins({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-poppins",
});

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Zaltyko",
  description:
    "Zaltyko — El sistema definitivo para gestionar academias de gimnasia",
  keywords: [
    "zaltyko",
    "gimnasia",
    "academias de gimnasia",
    "gestión deportiva",
    "multi tenant",
    "stripe",
    "saas",
    "drizzle",
    "supabase",
    "pwa",
  ],
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
      </head>
      <body
        className={cn(inter.variable, poppins.variable, "font-sans antialiased")}
        suppressHydrationWarning
      >
        <AppProviders>{children}</AppProviders>
        <ServiceWorkerRegister />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
