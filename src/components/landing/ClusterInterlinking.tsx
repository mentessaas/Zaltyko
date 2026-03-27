"use client";

import Link from "next/link";
import { ArrowRight, Globe, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import type { ModalitySlug, CountrySlug } from "@/lib/seo/clusters";

interface ClusterInterlinkingProps {
  locale: "es" | "en";
  modality: ModalitySlug;
  country: CountrySlug;
  modalityLabel: string;
  countryLabel: string;
  relatedByModality: Array<{ slug: CountrySlug; label: string; url: string }>;
  relatedByCountry: Array<{ slug: ModalitySlug; label: string; url: string }>;
  federationName: string;
  competitions: string[];
}

export default function ClusterInterlinking({
  locale,
  modality,
  country,
  modalityLabel,
  countryLabel,
  relatedByModality,
  relatedByCountry,
  federationName,
  competitions,
}: ClusterInterlinkingProps) {
  const labels = {
    es: {
      title: "Explora más academias",
      sameModality: `Otras ${modalityLabel} en Latinoamérica`,
      sameCountry: `Otros deportes en ${countryLabel}`,
      cta: "Probar gratis",
      federation: "Federación",
      competitions: "Competiciones principales",
    },
    en: {
      title: "Explore more academies",
      sameModality: `Other ${modalityLabel} in Latin America`,
      sameCountry: `Other sports in ${countryLabel}`,
      cta: "Try for free",
      federation: "Federation",
      competitions: "Main competitions",
    },
  };

  const t = labels[locale];

  return (
    <section className="py-20 bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            {t.title}
          </h2>
          <p className="text-lg text-gray-600">
            {locale === "es"
              ? "Encuentra la solución perfecta para tu academia"
              : "Find the perfect solution for your academy"}
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 mb-12">
          {/* Related by Modality - Same modality, different countries */}
          <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                <Globe className="h-5 w-5 text-blue-600" />
              </div>
              <h3 className="font-semibold text-gray-900 text-lg">{t.sameModality}</h3>
            </div>
            <div className="space-y-3">
              {relatedByModality.map((item) => (
                <Link
                  key={item.slug}
                  href={item.url}
                  className="flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-blue-50 transition-colors group"
                >
                  <span className="text-gray-700 group-hover:text-blue-700 font-medium">
                    {item.label}
                  </span>
                  <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
                </Link>
              ))}
            </div>
          </div>

          {/* Related by Country - Same country, different modalities */}
          <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                <Layers className="h-5 w-5 text-purple-600" />
              </div>
              <h3 className="font-semibold text-gray-900 text-lg">{t.sameCountry}</h3>
            </div>
            <div className="space-y-3">
              {relatedByCountry.map((item) => (
                <Link
                  key={item.slug}
                  href={item.url}
                  className="flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-purple-50 transition-colors group"
                >
                  <span className="text-gray-700 group-hover:text-purple-700 font-medium">
                    {item.label}
                  </span>
                  <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-purple-500 transition-colors" />
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Federation & Competitions */}
        <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm mb-12">
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h4 className="font-semibold text-gray-900 mb-3">{t.federation}</h4>
              <p className="text-gray-600">{federationName}</p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-3">{t.competitions}</h4>
              <ul className="space-y-2">
                {competitions.slice(0, 3).map((comp, i) => (
                  <li key={i} className="flex items-center gap-2 text-gray-600 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    {comp}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <Link
            href="/onboarding"
            className={cn(
              buttonVariants({ variant: "default", size: "lg" }),
              "bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/25 hover:shadow-red-600/40 transition-all duration-300 text-base px-8 py-6 group inline-flex items-center"
            )}
          >
            {t.cta}
            <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </div>
    </section>
  );
}
