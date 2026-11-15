import type { Metadata } from "next";
import Link from "next/link";

import { ownerUi } from "@/components/owner-dashboard/owner-ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Esto no está en la demo · Zaltyko" };

/** Destino de los enlaces del panel real a secciones que la demo no incluye. */
export default function DemoUnavailablePage() {
  return (
    <main className={`${ownerUi.page} min-h-[70vh]`}>
      <section aria-labelledby="demo-more-title" className={`mx-auto max-w-2xl ${ownerUi.emptyState}`}>
        <h1 id="demo-more-title" className={ownerUi.sectionTitle}>
          Esto está en la versión completa
        </h1>
        <p className={`${ownerUi.muted} mt-3 max-w-md`}>
          La demo enseña lo del día a día: resumen, clases, asistencia, gimnastas, cobros y el portal de familia. El resto de
          apartados los tienes al crear tu academia, gratis hasta 30 gimnastas.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/auth/register?role=owner" data-demo-cta="seccion-no-incluida" className={ownerUi.primaryButton}>
            Crear mi academia gratis
          </Link>
          <Link href="/demo" className={ownerUi.secondaryButton}>
            Volver a la demo
          </Link>
        </div>
      </section>
    </main>
  );
}
