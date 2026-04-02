"use client";

import { Trophy, Users, Building2, Sparkles } from "lucide-react";
import type { ClusterContent } from "@/lib/seo/clusters";

interface ClusterStatsSectionProps {
  content: ClusterContent;
  locale: "es" | "en";
  modalityLabel: string;
  countryLabel: string;
  academiesCount?: number;
  coachesCount?: number;
  eventsCount?: number;
}

export default function ClusterStatsSection({
  content,
  locale,
  modalityLabel,
  countryLabel,
  academiesCount,
  coachesCount,
  eventsCount,
}: ClusterStatsSectionProps) {
  const labels = {
    es: {
      academies: "academias",
      coaches: "entrenadores",
      events: "eventos",
      athletes: "atletas",
    },
    en: {
      academies: "academies",
      coaches: "coaches",
      events: "events",
      athletes: "athletes",
    },
  };

  const t = labels[locale];

  const stats = [
    {
      icon: Building2,
      value: academiesCount ?? content.socialProof.stats.academies,
      label: t.academies,
      color: "text-red-600",
      bg: "bg-red-100",
    },
    {
      icon: Users,
      value: content.socialProof.stats.athletes,
      label: t.athletes,
      color: "text-purple-600",
      bg: "bg-purple-100",
    },
    {
      icon: Trophy,
      value: content.federation.competitions.length.toString(),
      label: t.events,
      color: "text-amber-600",
      bg: "bg-amber-100",
    },
  ];

  return (
    <section className="py-20 bg-gradient-to-br from-gray-50 via-white to-rose-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 rounded-full bg-rose-50 border border-rose-100 px-4 py-1.5 text-sm font-medium text-rose-700 mb-6">
            <Sparkles className="h-4 w-4" />
            {locale === "es" ? `${modalityLabel} en ${countryLabel}` : `${modalityLabel} in ${countryLabel}`}
          </div>
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            {locale === "es"
              ? "La comunidad mas grande de gimnastas"
              : "The largest gymnastics community"}
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            {locale === "es"
              ? "Un ecosistema completo para atletas, entrenadores y academias"
              : "A complete ecosystem for athletes, coaches and academies"}
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid sm:grid-cols-3 gap-8 lg:gap-12">
          {stats.map((stat, index) => (
            <div
              key={index}
              className="text-center p-8 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
            >
              <div
                className={`w-14 h-14 ${stat.bg} rounded-2xl flex items-center justify-center mx-auto mb-4`}
              >
                <stat.icon className={`h-7 w-7 ${stat.color}`} />
              </div>
              <div className="font-display text-4xl lg:text-5xl font-bold text-gray-900 mb-2">
                {stat.value}
              </div>
              <div className="text-gray-500 font-medium">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Featured Academies */}
        {content.socialProof.academies.length > 0 && (
          <div className="mt-12 p-8 rounded-2xl bg-white border border-gray-100 shadow-sm">
            <h3 className="font-semibold text-gray-900 text-center mb-6">
              {locale === "es"
                ? "Academias que confian en nosotros"
                : "Academies that trust us"}
            </h3>
            <div className="flex flex-wrap justify-center gap-4">
              {content.socialProof.academies.map((academy, index) => (
                <span
                  key={index}
                  className="px-4 py-2 rounded-full bg-gray-50 text-gray-700 text-sm font-medium"
                >
                  {academy}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
