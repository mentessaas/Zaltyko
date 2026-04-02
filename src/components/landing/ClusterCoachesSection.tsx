"use client";

import Link from "next/link";
import { Users, ArrowRight } from "lucide-react";
import CoachCard from "./CoachCard";
import type { PublicCoach } from "@/lib/seo/clusters";

interface ClusterCoachesSectionProps {
  coaches: PublicCoach[];
  locale: "es" | "en";
  modalityLabel: string;
  countryLabel: string;
}

export default function ClusterCoachesSection({
  coaches,
  locale,
  modalityLabel,
  countryLabel,
}: ClusterCoachesSectionProps) {
  const labels = {
    es: {
      title: "Entrenadores certificados",
      subtitle: `Conoce a los mejores entrenadores de ${modalityLabel} en ${countryLabel}`,
      cta: "Ver todos los entrenadores",
      empty: "No hay entrenadores destacados en esta region todavia",
    },
    en: {
      title: "Certified coaches",
      subtitle: `Meet the best ${modalityLabel} coaches in ${countryLabel}`,
      cta: "View all coaches",
      empty: "No featured coaches in this region yet",
    },
  };

  const t = labels[locale];

  if (coaches.length === 0) {
    return null;
  }

  return (
    <section className="py-20 bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-end justify-between mb-12">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                <Users className="h-5 w-5 text-purple-600" />
              </div>
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-gray-900">
                {t.title}
              </h2>
            </div>
            <p className="text-lg text-gray-600 max-w-xl">{t.subtitle}</p>
          </div>
          <Link
            href={`/${locale}/coaches`}
            className="hidden sm:flex items-center gap-2 text-sm font-medium text-purple-600 hover:text-purple-700 transition-colors"
          >
            {t.cta}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {coaches.slice(0, 8).map((coach) => (
            <CoachCard key={coach.id} coach={coach} locale={locale} />
          ))}
        </div>

        {/* Mobile CTA */}
        <div className="sm:hidden mt-8 text-center">
          <Link
            href={`/${locale}/coaches`}
            className="inline-flex items-center gap-2 text-sm font-medium text-purple-600 hover:text-purple-700 transition-colors"
          >
            {t.cta}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
