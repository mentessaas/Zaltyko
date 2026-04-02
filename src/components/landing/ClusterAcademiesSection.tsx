"use client";

import Link from "next/link";
import { Building2, ArrowRight } from "lucide-react";
import AcademyCard from "./AcademyCard";
import type { PublicAcademy } from "@/lib/seo/clusters";

interface ClusterAcademiesSectionProps {
  academies: PublicAcademy[];
  locale: "es" | "en";
  modalityLabel: string;
  countryLabel: string;
}

export default function ClusterAcademiesSection({
  academies,
  locale,
  modalityLabel,
  countryLabel,
}: ClusterAcademiesSectionProps) {
  const labels = {
    es: {
      title: "Academias destacadas",
      subtitle: `Encuentra las mejores academias de ${modalityLabel} en ${countryLabel}`,
      cta: "Ver todas las academias",
      empty: "No hay academias destacadas en esta region todavia",
    },
    en: {
      title: "Featured academies",
      subtitle: `Find the best ${modalityLabel} academies in ${countryLabel}`,
      cta: "View all academies",
      empty: "No featured academies in this region yet",
    },
  };

  const t = labels[locale];

  if (academies.length === 0) {
    return null;
  }

  return (
    <section className="py-20 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-end justify-between mb-12">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-red-600" />
              </div>
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-gray-900">
                {t.title}
              </h2>
            </div>
            <p className="text-lg text-gray-600 max-w-xl">{t.subtitle}</p>
          </div>
          <Link
            href={`/${locale}/academies`}
            className="hidden sm:flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-700 transition-colors"
          >
            {t.cta}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {academies.slice(0, 8).map((academy) => (
            <AcademyCard key={academy.id} academy={academy} locale={locale} />
          ))}
        </div>

        {/* Mobile CTA */}
        <div className="sm:hidden mt-8 text-center">
          <Link
            href={`/${locale}/academies`}
            className="inline-flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-700 transition-colors"
          >
            {t.cta}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
