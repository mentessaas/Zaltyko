"use client";

import { AlertCircle, CheckCircle2, Users, Calendar, CreditCard, FileText } from "lucide-react";
import type { ClusterContent } from "@/lib/seo/clusters";

interface ClusterPainPointsSectionProps {
  content: ClusterContent;
  locale: "es" | "en";
  available?: boolean;
}

const painPointIcons = {
  generic: AlertCircle,
  specific: FileText,
};

const painPointTitles = {
  es: {
    generic: "El problema genérico",
    specific: "El problema específico",
  },
  en: {
    generic: "The generic problem",
    specific: "The specific problem",
  },
};

const solutionTitles = {
  es: {
    title: "La solución Zaltyko",
    features: [
      { icon: Users, text: "Gestión de atletas con categorías oficiales" },
      { icon: Calendar, text: "Control de asistencia y horarios" },
      { icon: CreditCard, text: "Cobros automatizados con Stripe" },
      { icon: FileText, text: "Renovación de licencias simplificada" },
    ],
  },
  en: {
    title: "The Zaltyko solution",
    features: [
      { icon: Users, text: "Athlete management with official categories" },
      { icon: Calendar, text: "Attendance and schedule control" },
      { icon: CreditCard, text: "Automated payments with Stripe" },
      { icon: FileText, text: "Simplified license renewal" },
    ],
  },
};

const comingSoonCopy = {
  es: {
    badge: "Próximamente",
    headline: "Estamos preparando esta gestión para ti",
    body:
      "Cuando lancemos el soporte oficial para esta modalidad, encontrarás aquí los problemas específicos que resolvemos y las funcionalidades de Zaltyko adaptadas al sector.",
  },
  en: {
    badge: "Coming soon",
    headline: "We're preparing this management for you",
    body:
      "Once we launch official support for this modality, you'll find here the specific problems we solve and Zaltyko's features tailored to the sector.",
  },
};

export default function ClusterPainPointsSection({
  content,
  locale,
  available = true,
}: ClusterPainPointsSectionProps) {
  const titles = painPointTitles[locale];
  const solution = solutionTitles[locale];
  const comingSoon = comingSoonCopy[locale];

  if (!available) {
    return (
      <section className="py-20 bg-card">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
            <span className="mb-4 inline-flex rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {comingSoon.badge}
            </span>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              {comingSoon.headline}
            </h2>
            <p className="text-lg text-gray-600">{comingSoon.body}</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-20 bg-card">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            {locale === "es"
              ? "Sabemos lo que cuesta gestionar una academia"
              : "We know how hard it is to manage an academy"}
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            {locale === "es"
              ? "Dos problemas que escuchamos cada semana de dueños de academias como la tuya"
              : "Two problems we hear every week from academy owners like yours"}
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-16">
          {/* Pain Point 1 - Generic */}
          <div className="bg-zaltyko-white rounded-2xl p-8 border border-border shadow-soft">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-zaltyko-coral/10 flex items-center justify-center">
                <painPointIcons.generic className="h-5 w-5 text-zaltyko-coral" />
              </div>
              <h3 className="font-semibold text-gray-900 text-lg">{titles.generic}</h3>
            </div>
            <p className="text-gray-600 leading-relaxed">{content.painPoints.generic}</p>
          </div>

          {/* Pain Point 2 - Specific */}
          <div className="bg-zaltyko-white rounded-2xl p-8 border border-border shadow-soft">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-zaltyko-indigo/10 flex items-center justify-center">
                <painPointIcons.specific className="h-5 w-5 text-zaltyko-indigo" />
              </div>
              <h3 className="font-semibold text-gray-900 text-lg">{titles.specific}</h3>
            </div>
            <p className="text-gray-600 leading-relaxed">{content.painPoints.specific}</p>
          </div>
        </div>

        {/* Solution */}
        <div className="rounded-card border border-border bg-zaltyko-white p-8 md:p-12 shadow-soft">
          <h3 className="font-display text-2xl sm:text-3xl font-bold text-gray-900 mb-8 text-center">
            {solution.title}
          </h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {solution.features.map((feature) => (
              <div key={feature.text} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-card shadow-sm flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-4 w-4 text-zaltyko-teal" />
                </div>
                <p className="text-gray-700 text-sm leading-snug">{feature.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
