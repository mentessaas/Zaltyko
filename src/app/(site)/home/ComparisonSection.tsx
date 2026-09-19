"use client";

import Link from "next/link";
import { Check, X, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import Reveal from "@/components/motion/Reveal";

const comparisonFeatures = [
  {
    feature: "Puesta en marcha",
    zaltyko: "Importación base desde Excel",
    spreadsheets: "Manual",
    generic: "Según proveedor",
  },
  {
    feature: "Cobros automáticos",
    zaltyko: true,
    spreadsheets: false,
    generic: "Limitado",
  },
  {
    feature: "Pase de lista por sesión",
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
    feature: "Reportes para dirección",
    zaltyko: true,
    spreadsheets: false,
    generic: "Limitado",
  },
  {
    feature: "Evaluaciones con rúbrica",
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
    feature: "7 días de Starter sin tarjeta",
    zaltyko: true,
    spreadsheets: false,
    generic: false,
  },
];

function CellValue({ value, highlight }: { value: boolean | string; highlight?: boolean }) {
  if (value === true) {
    return (
      <div className="flex items-center justify-center">
        {highlight ? (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zaltyko-teal/15">
            <span className="sr-only">Sí</span>
            <Check aria-hidden="true" className="h-4 w-4 text-zaltyko-teal" />
          </span>
        ) : (
          <span className="flex items-center justify-center">
            <span className="sr-only">Sí</span>
            <Check aria-hidden="true" className="h-5 w-5 text-green-600" />
          </span>
        )}
      </div>
    );
  }
  if (value === false) {
    return (
      <div className="flex items-center justify-center">
        <span className="sr-only">No</span>
        <X aria-hidden="true" className="h-5 w-5 text-gray-300" />
      </div>
    );
  }
  return (
    <span className="text-sm text-center">{value}</span>
  );
}

export default function ComparisonSection() {
  return (
    <section className="surface-subtle py-24">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <Reveal>
          <div className="text-center mb-12">
            <span className="inline-block px-4 py-1.5 bg-zaltyko-teal/10 text-zaltyko-indigo text-sm font-semibold rounded-full mb-4">
              Comparativa
            </span>
            <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-foreground mb-4">
              ¿Por qué no seguir con Excel?
            </h2>
            <p className="text-xl text-gray-600 dark:text-muted-foreground max-w-2xl mx-auto">
              Comparamos Zaltyko con las alternativas más comunes para que veas la diferencia.
            </p>
          </div>
        </Reveal>

        {/* Table */}
        <Reveal delay={120}>
        <div className="relative">
          <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-lg">
          <table className="w-full bg-white dark:bg-card">
            {/* Header */}
            <thead>
              <tr>
                <th className="px-6 py-4 text-left text-sm font-bold text-gray-900 surface-subtle border-b border-gray-200 w-1/3">
                  Funcionalidad
                </th>
                <th className="px-4 py-4 text-center text-sm font-bold bg-[#00695C] text-white border-x-2 border-[#00695C]">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-base">Zaltyko</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-[#00695C]">Recomendado</span>
                  </div>
                </th>
                <th className="px-4 py-4 text-center text-sm font-semibold text-gray-500 surface-subtle border-b border-gray-200">
                  Excel / Sheets
                </th>
                <th className="px-4 py-4 text-center text-sm font-semibold text-gray-500 surface-subtle border-b border-gray-200">
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
                    i % 2 === 0 ? "bg-white dark:bg-card" : "bg-muted/40"
                  )}
                >
                  <td className="px-6 py-3.5 text-sm font-medium text-gray-700 dark:text-muted-foreground">
                    {row.feature}
                  </td>
                  <td className="px-4 py-3.5 bg-zaltyko-teal/[0.06] border-x-2 border-zaltyko-teal/20">
                    <CellValue value={row.zaltyko} highlight />
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
          {/* Fade que indica scroll horizontal en mobile — en desktop la tabla
              cabe entera y este overlay no aporta nada, por eso solo md:hidden. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-10 rounded-r-2xl bg-gradient-to-l from-white to-transparent md:hidden"
          />
        </div>
        </Reveal>

        {/* Bottom note */}
        <p className="text-center text-sm text-gray-500 mt-6">
          * Software genérico se refiere a herramientas de gestión sin especialización en gimnasia artística o rítmica.
        </p>

        {/* Comparativas dedicadas */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/comparativas/zaltyko-vs-excel"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:border-zaltyko-teal/40 hover:bg-zaltyko-teal/5"
          >
            Zaltyko vs Excel
            <ArrowRight aria-hidden="true" className="h-3 w-3" />
          </Link>
          <Link
            href="/comparativas/zaltyko-vs-sportmember"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:border-zaltyko-teal/40 hover:bg-zaltyko-teal/5"
          >
            Zaltyko vs SportMember
            <ArrowRight aria-hidden="true" className="h-3 w-3" />
          </Link>
          <Link
            href="/comparativas/zaltyko-vs-glofox"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:border-zaltyko-teal/40 hover:bg-zaltyko-teal/5"
          >
            Zaltyko vs Glofox
            <ArrowRight aria-hidden="true" className="h-3 w-3" />
          </Link>
          <Link
            href="/comparativas"
            className="inline-flex items-center gap-1 text-sm font-semibold text-zaltyko-teal hover:underline"
          >
            Ver todas las comparativas
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
