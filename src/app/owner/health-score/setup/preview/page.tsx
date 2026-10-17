import { notFound } from "next/navigation";

import { AcademyTargetProfileForm } from "@/components/owner-dashboard/AcademyTargetProfileForm";

export default function AcademyHealthScoreSetupPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="min-h-screen bg-[#F1F3EF] px-5 py-8 text-slate-950 sm:py-14">
      <div className="mx-auto max-w-5xl">
        <header className="grid gap-6 border-t-4 border-teal-800 bg-[#F8F8F4] p-6 sm:p-10 lg:grid-cols-[1fr_16rem] lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-800">
              Preview sintética · Academy Health Score
            </p>
            <h1 className="mt-3 max-w-2xl font-display text-4xl font-bold tracking-[-0.04em] sm:text-5xl">
              Decide qué significa “saludable” para tu academia.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-700">
              Define cinco metas operativas. El score será una lectura
              explicable frente a objetivos propios, nunca una comparación con
              el mercado.
            </p>
          </div>
          <div className="border-l-2 border-teal-800 bg-white p-4">
            <span className="block text-xs font-bold uppercase tracking-wide text-slate-500">
              Academia ficticia
            </span>
            <span className="mt-1 block font-display text-lg font-bold">
              Academia Ejemplo
            </span>
            <span className="mt-3 block text-xs text-slate-600">
              Moneda base: EUR
            </span>
          </div>
        </header>
        <section
          className="mt-8 bg-[#E7EAE3] p-5 sm:p-8"
          aria-label="Objetivos sintéticos de salud"
        >
          <div className="mb-7">
            <h2 className="font-display text-2xl font-bold">
              Metas de Academia Ejemplo
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Fixture de demostración; no representa datos ni recomendaciones
              reales.
            </p>
          </div>
          <AcademyTargetProfileForm
            organizationId="30000000-0000-0000-0000-000000000001"
            profile={{
              version: 1,
              targets: {
                class_fill_rate: 0.75,
                cohort_retention_rate: 0.8,
                churn_rate: 0.05,
                collection_rate: 0.95,
                attendance_coverage: 0.95,
              },
            }}
          />
        </section>
      </div>
    </main>
  );
}
