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
      <div className="absolute inset-0 bg-gradient-to-b from-gray-50 to-white" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-red-50 rounded-full blur-3xl opacity-50" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="inline-block px-4 py-1.5 bg-red-100 text-red-700 text-sm font-semibold rounded-full mb-4">
            ¿Por qué Zaltyko?
          </span>
          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6">
            Software específico para gimansia
          </h2>
          <p className="text-xl text-gray-600">
            Los clubes de gimansia tienen necesidades únicas que los sistemas genéricos no cubren
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
              <span className="inline-block px-4 py-1.5 bg-red-600 text-white text-sm font-bold rounded-full">
                Zaltyko
              </span>
            </div>
            <div className="text-center">
              <span className="text-sm font-semibold text-gray-400">Software genérico</span>
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
                    <Check className="w-5 h-5 text-gray-400" />
                  </div>
                ) : item.generic === false ? (
                  <div className="w-8 h-8 bg-red-50 rounded-full flex items-center justify-center">
                    <X className="w-5 h-5 text-red-300" />
                  </div>
                ) : (
                  <span className="text-gray-400 text-sm">{item.generic}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom message */}
        <div className="text-center mt-10">
          <p className="text-lg text-gray-600">
            <span className="font-semibold text-red-600">Zaltyko</span> está diseñado exclusivamente para gimansia artística, rítmica y acrobática
          </p>
        </div>
      </div>
    </section>
  );
}
