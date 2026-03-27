"use client";

import { AlertCircle, CheckCircle2, Users, Calendar, CreditCard, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClusterContent } from "@/lib/seo/clusters";

interface ClusterPainPointsSectionProps {
  content: ClusterContent;
  locale: "es" | "en";
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

export default function ClusterPainPointsSection({
  content,
  locale,
}: ClusterPainPointsSectionProps) {
  const titles = painPointTitles[locale];
  const solution = solutionTitles[locale];

  return (
    <section className="py-20 bg-white">
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
          <div className="bg-gray-50 rounded-2xl p-8 border border-gray-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                <painPointIcons.generic className="h-5 w-5 text-red-600" />
              </div>
              <h3 className="font-semibold text-gray-900 text-lg">{titles.generic}</h3>
            </div>
            <p className="text-gray-600 leading-relaxed">{content.painPoints.generic}</p>
          </div>

          {/* Pain Point 2 - Specific */}
          <div className="bg-gray-50 rounded-2xl p-8 border border-gray-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                <painPointIcons.specific className="h-5 w-5 text-amber-600" />
              </div>
              <h3 className="font-semibold text-gray-900 text-lg">{titles.specific}</h3>
            </div>
            <p className="text-gray-600 leading-relaxed">{content.painPoints.specific}</p>
          </div>
        </div>

        {/* Solution */}
        <div className="bg-gradient-to-br from-red-50 via-rose-50 to-pink-50 rounded-2xl p-8 md:p-12 border border-red-100">
          <h3 className="font-display text-2xl sm:text-3xl font-bold text-gray-900 mb-8 text-center">
            {solution.title}
          </h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {solution.features.map((feature) => (
              <div key={feature.text} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
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
