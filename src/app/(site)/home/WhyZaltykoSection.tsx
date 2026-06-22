"use client";

import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

const comparison = [
  { feature: "Gestión de niveles técnicos", zaltyko: true, generic: false },
  { feature: "Inscripciones a competiciones", zaltyko: true, generic: false },
  { feature: "Seguimiento por aparato", zaltyko: true, generic: false },
  { feature: "Historial por atleta", zaltyko: true, generic: "limitado" },
  { feature: "Comunicación con familias", zaltyko: true, generic: "básica" },
  { feature: "Evaluaciones técnicas", zaltyko: true, generic: false },
  { feature: "Automatización de cobros", zaltyko: true, generic: true },
];

export default function WhyZaltykoSection() {
  return (
    <section className="py-24 bg-white relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-gradient-to-b from-zaltyko-white to-white" />
      <div className="absolute left-1/2 top-1/2 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-zaltyko-teal/6 blur-3xl opacity-70" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="mb-4 inline-block rounded-full bg-zaltyko-teal/10 px-4 py-1.5 text-sm font-semibold text-zaltyko-indigo">
            ¿Por qué Zaltyko?
          </span>
          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6">
            Software específico para gimnasia
          </h2>
          <p className="text-xl text-gray-600">
            Las academias de artística y rítmica tienen necesidades que una agenda o un CRM genérico no cubren.
          </p>
        </div>

        {/* Comparison table */}
        <div className="max-w-4xl mx-auto bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-3 gap-4 p-6 bg-gray-50 border-b border-gray-100">
            <div className="text-left">
              <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Funcionalidad</span>
            </div>
            <div className="text-center">
              <span className="inline-block rounded-full bg-zaltyko-indigo px-4 py-1.5 text-sm font-bold text-white">
                Zaltyko
              </span>
            </div>
            <div className="text-center">
              <span className="text-sm font-semibold text-gray-600">Software genérico</span>
            </div>
          </div>

          {/* Rows */}
          {comparison.map((item, i) => (
            <div 
              key={i}
              className={cn(
                "grid grid-cols-3 gap-4 p-5 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors",
                i % 2 === 0 && "bg-gray-50/50"
              )}
            >
              <div className="text-left">
                <span className="text-gray-700 font-medium">{item.feature}</span>
              </div>
              <div className="flex justify-center">
                {item.zaltyko === true ? (
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <Check className="w-5 h-5 text-green-600" />
                  </div>
                ) : (
                  <span className="text-green-600 font-medium">{item.zaltyko}</span>
                )}
              </div>
              <div className="flex justify-center">
                {item.generic === true ? (
                  <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                    <Check className="w-5 h-5 text-gray-600" />
                  </div>
                ) : item.generic === false ? (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zaltyko-coral/10">
                    <X className="h-5 w-5 text-zaltyko-coral" />
                  </div>
                ) : (
                  <span className="text-gray-600 text-sm">{item.generic}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom message */}
        <div className="text-center mt-10">
          <p className="text-lg text-gray-600">
            <span className="font-semibold text-zaltyko-indigo">Zaltyko</span> está diseñado exclusivamente para gimnasia artística femenina, artística masculina y rítmica.
          </p>
        </div>
      </div>
    </section>
  );
}
