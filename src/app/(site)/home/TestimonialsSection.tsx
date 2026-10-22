"use client";

import { Sparkles, ArrowRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const proofPoints = [
  {
    title: "Dirección con contexto",
    description: "Cobros, asistencia, ocupación y evolución en un mismo lugar para decidir qué necesita tu academia.",
    audience: "Para dueños y administración",
  },
  {
    title: "Menos administración en pista",
    description: "Agenda, pase de lista, notas y evaluaciones pensadas para usarse desde el móvil durante la sesión.",
    audience: "Para entrenadores",
  },
  {
    title: "Familias mejor informadas",
    description: "Recibos, eventos, avisos y progreso dentro de un canal claro, con permisos según cada relación.",
    audience: "Para familias y gimnastas",
  },
];

export default function TestimonialsSection() {
  return (
    <section className="py-24 bg-white dark:bg-background relative overflow-hidden">
      {/* Background accent */}
      <div className="absolute top-0 right-0 w-1/3 h-full bg-gradient-to-l from-zaltyko-white to-transparent" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="inline-block px-4 py-1.5 bg-zaltyko-teal/10 text-zaltyko-indigo text-sm font-semibold rounded-full mb-4">
            Diseñado para gimnasia
          </span>
          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-foreground mb-6">
            Una plataforma que entiende el día a día
          </h2>
          <p className="text-xl text-gray-600 dark:text-muted-foreground">
            Cada decisión de producto parte de una pregunta concreta: ¿ayuda a que la academia funcione mejor hoy?
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {proofPoints.map((point) => (
            <div
              key={point.title}
              className="relative bg-white dark:bg-card rounded-2xl p-8 border border-gray-100 dark:border-border shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
            >
              {/* Accent icon */}
              <div className="absolute -top-4 left-8">
                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-gray-600" aria-hidden="true" />
                </div>
              </div>

              <h3 className="mb-4 pt-2 text-xl font-bold text-gray-900 dark:text-foreground">{point.title}</h3>
              <p className="mb-6 leading-relaxed text-gray-600 dark:text-muted-foreground">{point.description}</p>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zaltyko-teal/10 text-zaltyko-teal">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                </div>
                <p className="text-sm font-semibold text-gray-700 dark:text-muted-foreground">{point.audience}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA: ver directorio */}
        <div className="mt-8 text-center">
          <Link
            href="/contact?type=demo"
            className="inline-flex items-center gap-2 text-zaltyko-teal font-semibold hover:gap-3 transition-all text-sm"
          >
            Solicitar demo de Zaltyko
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
