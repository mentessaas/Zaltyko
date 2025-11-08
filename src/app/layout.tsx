import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import type React from "react";
import { cn } from "@/lib/utils";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { AppProviders } from "./providers";

const bricolageGrotesque = Bricolage_Grotesque({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Gym SaaS",
  description:
    "Plataforma multi-academia para gimnasia con dashboards, Stripe, PWA y control por planes.",
  keywords: [
    "gimnasia",
    "multi tenant",
    "stripe",
    "saas",
    "drizzle",
    "supabase",
    "nextauth",
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
        <meta name="theme-color" content="#000000" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body
        className={cn(bricolageGrotesque.className, "antialiased")}
        suppressHydrationWarning
      >
        <AppProviders>{children}</AppProviders>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
