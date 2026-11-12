import type { Metadata } from "next";
import Link from "next/link";

// 404 de academia autenticada: nunca indexable. El middleware ya emite
// X-Robots-Tag en academias no-indexables; replicamos la regla aqui para
// el caso 404 dentro del area autenticada.
export const metadata: Metadata = {
  title: "Sección no encontrada",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noarchive: true,
      "max-snippet": -1,
    },
  },
};

/**
 * Fallback compartido para `notFound()` en `/app/[academyId]/...`.
 *
 * Se activa desde:
 *  - `layout.tsx:107` cuando el `academyId` no resuelve a una academia
 *    accesible.
 *  - Cualquier página descendiente que llame a `notFound()` (atletas,
 *    coaches, settings, billing, my-dashboard, etc.).
 *
 * Antes solo existía el default del framework; ahora la persona siempre
 * tiene un siguiente paso claro: volver al panel o cambiar de academia.
 */
export default function AcademySectionNotFound() {
  return (
    <main
      role="alert"
      className="mx-auto flex max-w-3xl flex-col gap-5 p-4 sm:p-6"
      data-testid="academy-section-not-found"
    >
      <h1 className="border-b-[3px] border-mat-night pb-5 font-display text-[clamp(2rem,3.5vw,3rem)] font-black uppercase leading-[0.95] text-mat-night dark:border-chalk-dust dark:text-chalk">
        No encontramos esta sección
      </h1>
      <p className="max-w-2xl text-sm leading-relaxed text-ramp-600 dark:text-ramp-300">
        Puede que la academia ya no esté disponible o que la ruta haya
        cambiado. Tus datos siguen a salvo en el panel principal.
      </p>
      <div className="flex flex-wrap gap-3 text-sm">
        <Link
          href="../dashboard"
          className="inline-flex min-h-11 items-center rounded-md bg-mat px-6 py-2.5 font-semibold text-white shadow-[0_1px_0_rgba(11,20,48,0.25)] transition-colors hover:bg-mat-deep focus:outline-none focus-visible:ring-2 focus-visible:ring-mat focus-visible:ring-offset-2"
        >
          Volver al panel
        </Link>
        <Link
          href="/app"
          className="inline-flex min-h-11 items-center rounded-md border border-ramp-300 bg-white px-6 py-2.5 font-semibold text-mat-night transition-colors hover:border-mat hover:text-mat focus:outline-none focus-visible:ring-2 focus-visible:ring-mat focus-visible:ring-offset-2 dark:border-border dark:bg-card dark:text-foreground"
        >
          Cambiar de academia
        </Link>
      </div>
    </main>
  );
}
