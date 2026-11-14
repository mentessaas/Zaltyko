import { notFound } from "next/navigation";

import { AcademyTargetProfileForm } from "@/components/owner-dashboard/AcademyTargetProfileForm";
import { OwnerWorkspacePageShell } from "@/components/owner-dashboard/OwnerWorkspacePageShell";
import { PageHeader } from "@/components/ui/page-header";

export default function AcademyHealthScoreSetupPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <OwnerWorkspacePageShell previewMode>
      <main className="min-h-screen bg-z-canvas px-5 py-8 text-z-ink sm:py-14">
        <div className="mx-auto max-w-5xl">
          <PageHeader
            title="Decide qué significa “saludable” para tu academia"
            description="Vista previa sintética de Academy Health Score con la Academia Ejemplo (moneda base: EUR). Define cinco metas operativas. El score será una lectura explicable frente a objetivos propios, nunca una comparación con el mercado."
          />
          <section
            className="mt-8 bg-chalk-dust p-5 sm:p-8"
            aria-label="Objetivos sintéticos de salud"
          >
            <div className="mb-7">
              <h2 className="font-display text-2xl font-bold">
                Metas de Academia Ejemplo
              </h2>
              <p className="mt-1 text-sm text-z-soft">
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
    </OwnerWorkspacePageShell>
  );
}
