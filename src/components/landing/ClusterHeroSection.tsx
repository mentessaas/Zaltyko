"use client";

import { memo } from "react";


import Link from "next/link";
import { ArrowRight, Sparkles, Shield, Zap, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import type { ClusterContent } from "@/lib/seo/clusters";
import { getPublicSiteUrl } from "@/lib/seo/site-url";

interface ClusterHeroSectionProps {
  content: ClusterContent;
  locale: "es" | "en";
  modalityLabel: string;
  countryLabel: string;
  modalitySlug: string;
  countrySlug: string;
}

function ClusterHeroSectionImpl({
  content,
  locale,
  modalityLabel,
  countryLabel,
  modalitySlug,
  countrySlug,
}: ClusterHeroSectionProps) {
  const baseUrl = getPublicSiteUrl();

  return (
    <section className="relative flex min-h-[70vh] items-center bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
        <div className="max-w-3xl">
          {/* Breadcrumb */}
          <nav className="mb-6 text-sm">
            <ol className="flex items-center gap-2 text-gray-500">
              <li>
                <Link href={`/${locale}`} className="hover:text-zaltyko-teal transition-colors">
                  {locale === "es" ? "Inicio" : "Home"}
                </Link>
              </li>
              <li className="mx-1">/</li>
              <li>
                <Link
                  href={`/${locale}/${modalitySlug}`}
                  className="hover:text-zaltyko-teal transition-colors"
                >
                  {modalityLabel}
                </Link>
              </li>
              <li className="mx-1">/</li>
              <li className="text-gray-900 font-medium">{countryLabel}</li>
            </ol>
          </nav>

          {/* Badge */}
          <p className="mb-6 text-xs font-semibold uppercase tracking-[0.08em] text-zaltyko-teal">
            {content.hero.badge}
          </p>

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
              href="/auth/register?role=owner"
              className={cn(
                buttonVariants({ variant: "default", size: "lg" }),
                "bg-zaltyko-teal hover:bg-primary-dark text-white shadow-soft transition-all duration-300 text-base px-8 py-6 group"
              )}
            >
              <Sparkles className="mr-2 h-5 w-5" />
              {locale === "es" ? "Crear mi academia gratis" : "Create my academy for free"}
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              href="/pricing"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "border-zaltyko-mist text-zaltyko-navy hover:border-zaltyko-teal hover:bg-zaltyko-white text-base px-8 py-6"
              )}
            >
              {locale === "es" ? "Ver planes" : "View plans"}
            </Link>
          </div>

          {/* Trust indicators */}
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-zaltyko-text-secondary">
            <span className="flex items-center gap-1">
              <Shield className="h-4 w-4 text-zaltyko-teal" />
              {locale === "es" ? "Sin tarjeta de crédito" : "No credit card required"}
            </span>
            <span className="flex items-center gap-1">
              <Zap className="h-4 w-4 text-zaltyko-teal" />
              {locale === "es" ? "Puesta en marcha guiada" : "Guided setup"}
            </span>
            <span className="flex items-center gap-1">
              <Check className="h-4 w-4 text-zaltyko-teal" />
              {locale === "es" ? "Soporte en español" : "Support included"}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

export default memo(ClusterHeroSectionImpl);
