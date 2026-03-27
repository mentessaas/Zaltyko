"use client";

import Link from "next/link";
import { ArrowRight, Sparkles, Shield, Zap, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import type { ClusterContent } from "@/lib/seo/clusters";

interface ClusterHeroSectionProps {
  content: ClusterContent;
  locale: "es" | "en";
  modalityLabel: string;
  countryLabel: string;
  modalitySlug: string;
  countrySlug: string;
}

export default function ClusterHeroSection({
  content,
  locale,
  modalityLabel,
  countryLabel,
  modalitySlug,
  countrySlug,
}: ClusterHeroSectionProps) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://zaltyko.com";

  return (
    <section className="relative min-h-[70vh] flex items-center overflow-hidden bg-gradient-to-br from-slate-50 via-white to-red-50">
      {/* Background decorations */}
      <div className="absolute inset-0">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-br from-red-100/50 via-rose-50/30 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-gradient-to-tr from-red-50/80 via-pink-50/40 to-transparent rounded-full blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#fecaca10_1px,transparent_1px),linear-gradient(to_bottom,#fecaca10_1px,transparent_1px)] bg-[size:60px_60px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
        <div className="max-w-3xl">
          {/* Breadcrumb */}
          <nav className="mb-6 text-sm">
            <ol className="flex items-center gap-2 text-gray-500">
              <li>
                <Link href={`/${locale}`} className="hover:text-red-600 transition-colors">
                  {locale === "es" ? "Inicio" : "Home"}
                </Link>
              </li>
              <li className="mx-1">/</li>
              <li>
                <Link
                  href={`/${locale}/${modalitySlug}`}
                  className="hover:text-red-600 transition-colors"
                >
                  {modalityLabel}
                </Link>
              </li>
              <li className="mx-1">/</li>
              <li className="text-gray-900 font-medium">{countryLabel}</li>
            </ol>
          </nav>

          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full bg-red-50 border border-red-100 px-4 py-1.5 text-sm font-medium text-red-700 mb-6">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            {content.hero.badge}
          </div>

          {/* H1 */}
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.05] tracking-tight text-gray-900 mb-6">
            {content.hero.headline}
          </h1>

          {/* Subtitle */}
          <p className="text-xl text-gray-600 leading-relaxed mb-8 max-w-xl">
            {content.hero.subheadline}
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <Link
              href="/onboarding"
              className={cn(
                buttonVariants({ variant: "default", size: "lg" }),
                "bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/25 hover:shadow-red-600/40 transition-all duration-300 text-base px-8 py-6 group"
              )}
            >
              <Sparkles className="mr-2 h-5 w-5" />
              {locale === "es" ? "Crear mi academia gratis" : "Create my academy for free"}
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              href="#demo"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "border-gray-200 hover:border-red-200 hover:bg-red-50 text-gray-700 text-base px-8 py-6"
              )}
            >
              {locale === "es" ? "Ver demo en 2 min" : "Watch demo in 2 min"}
            </Link>
          </div>

          {/* Trust indicators */}
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <Shield className="h-4 w-4 text-green-500" />
              {locale === "es" ? "Sin tarjeta de crédito" : "No credit card required"}
            </span>
            <span className="flex items-center gap-1">
              <Zap className="h-4 w-4 text-amber-500" />
              {locale === "es" ? "Configuración en 5 min" : "Setup in 5 min"}
            </span>
            <span className="flex items-center gap-1">
              <Check className="h-4 w-4 text-blue-500" />
              {locale === "es" ? "Soporte incluido" : "Support included"}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
