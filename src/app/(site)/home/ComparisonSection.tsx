"use client";

import { Check, X, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

const comparisonFeatures = [
  {
    feature: "Tiempo de configuración",
    zaltyko: "2 horas",
    spreadsheets: "Días/semanas",
    generic: "1-2 semanas",
  },
  {
    feature: "Cobros automáticos",
    zaltyko: true,
    spreadsheets: false,
    generic: "Limitado",
  },
  {
    feature: "Asistencia en tiempo real",
    zaltyko: true,
    spreadsheets: false,
    generic: "Básico",
  },
  {
    feature: "Comunicación con familias",
    zaltyko: true,
    spreadsheets: false,
    generic: "No",
  },
  {
    feature: "Inscripciones a competiciones",
    zaltyko: true,
    spreadsheets: false,
    generic: "No",
  },
  {
    feature: "Reportes para padres",
    zaltyko: true,
    spreadsheets: false,
    generic: "Limitado",
  },
  {
    feature: "Evaluaciones técnicas",
    zaltyko: true,
    spreadsheets: false,
    generic: "No",
  },
  {
    feature: "Específico para gimnasia",
    zaltyko: true,
    spreadsheets: false,
    generic: "No",
  },
  {
    feature: "Soporte en español",
    zaltyko: true,
    spreadsheets: false,
    generic: "Limitado",
  },
  {
    feature: "Trial gratis sin tarjeta",
    zaltyko: true,
    spreadsheets: false,
    generic: false,
  },
];

function CellValue({ value }: { value: boolean | string }) {
  if (value === true) {
    return (
      <div className="flex items-center justify-center">
        <Check className="h-5 w-5 text-green-600" />
      </div>
    );
  }
  if (value === false) {
    return (
      <div className="flex items-center justify-center">
        <X className="h-5 w-5 text-gray-300" />
      </div>
    );
  }
  return (
    <span className="text-sm text-center">{value}</span>
  );
}

export default function ComparisonSection() {
  return (
    <section className="py-24 bg-gray-50 relative overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-red-50 rounded-full blur-3xl opacity-50" />
        <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-rose-50 rounded-full blur-3xl opacity-50" />
      </div>

      <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <span className="inline-block px-4 py-1.5 bg-red-100 text-red-700 text-sm font-semibold rounded-full mb-4">
            Comparativa
          </span>
          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
            ¿Por qué no seguir con Excel?
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Comparamos Zaltyko con las alternativas más comunes para que veas la diferencia.
          </p>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-lg">
          <table className="w-full bg-white">
            {/* Header */}
            <thead>
              <tr>
                <th className="px-6 py-4 text-left text-sm font-bold text-gray-900 bg-gray-50 border-b border-gray-200 w-1/3">
                  Funcionalidad
                </th>
                <th className="px-4 py-4 text-center text-sm font-bold bg-red-600 text-white border-b border-red-500">
                  <div className="flex flex-col items-center gap-1">
                    <span>Zaltyko</span>
                    <span className="text-xs font-normal opacity-80">Recomendado</span>
                  </div>
                </th>
                <th className="px-4 py-4 text-center text-sm font-semibold text-gray-500 bg-gray-50 border-b border-gray-200">
                  Excel / Sheets
                </th>
                <th className="px-4 py-4 text-center text-sm font-semibold text-gray-500 bg-gray-50 border-b border-gray-200">
                  Software genérico
                </th>
              </tr>
            </thead>

            {/* Rows */}
            <tbody>
              {comparisonFeatures.map((row, i) => (
                <tr
                  key={row.feature}
                  className={cn(
                    "border-b border-gray-100 last:border-0",
                    i % 2 === 0 ? "bg-white" : "bg-gray-50/50"
                  )}
                >
                  <td className="px-6 py-3.5 text-sm font-medium text-gray-700">
                    {row.feature}
                  </td>
                  <td className="px-4 py-3.5 bg-red-50/30">
                    <CellValue value={row.zaltyko} />
                  </td>
                  <td className="px-4 py-3.5">
                    <CellValue value={row.spreadsheets} />
                  </td>
                  <td className="px-4 py-3.5">
                    <CellValue value={row.generic} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bottom note */}
        <p className="text-center text-sm text-gray-500 mt-6">
          * Software genérico se refiere a herramientas de gestión deportiva sin especialización en gimnasia.
        </p>
      </div>
    </section>
  );
}
