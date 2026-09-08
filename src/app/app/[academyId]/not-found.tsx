import Link from "next/link";

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
      className="mx-auto flex max-w-3xl flex-col gap-4 p-4 sm:p-6"
      data-testid="academy-section-not-found"
    >
      <h1 className="text-xl font-semibold text-foreground dark:text-slate-50">
        No encontramos esta sección
      </h1>
      <p className="text-sm text-muted-foreground dark:text-slate-300">
        Puede que la academia ya no esté disponible o que la ruta haya
        cambiado. Tus datos siguen a salvo en el panel principal.
      </p>
      <div className="flex flex-wrap gap-3 text-sm">
        <Link
          href="../dashboard"
          className="rounded-md bg-sky-700 px-4 py-2 font-medium text-white shadow-sm hover:bg-sky-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          Volver al panel
        </Link>
        <Link
          href="/app"
          className="rounded-md border border-border px-4 py-2 font-medium text-foreground hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Cambiar de academia
        </Link>
      </div>
    </main>
  );
}
