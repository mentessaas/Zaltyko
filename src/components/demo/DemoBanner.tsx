import Link from "next/link";

/**
 * Banda fija de la demo pública. Mide 2,75 rem (h-11) y el layout de la demo
 * desplaza con ese mismo valor el lateral y la cabecera pegajosa del panel.
 * El clic al registro lo mide DemoSandbox por el atributo data-demo-cta.
 */
export function DemoBanner() {
  return (
    <div
      role="region"
      aria-label="Aviso de demo"
      className="sticky top-0 z-[60] flex h-11 items-center justify-between gap-3 bg-mat-night px-4 text-white lg:px-10"
    >
      <p className="flex min-w-0 items-center gap-2 text-sm font-semibold">
        <span className="rounded-sm bg-ochre-light px-1.5 py-0.5 text-[0.7rem] font-extrabold uppercase tracking-[0.08em] text-mat-night">
          Demo
        </span>
        <span className="truncate">Estás viendo una demo</span>
        <span className="hidden truncate font-medium text-white/80 md:inline">· Datos ficticios, nada se guarda</span>
      </p>
      <Link
        href="/auth/register?role=owner"
        data-demo-cta="banner"
        className="inline-flex h-9 shrink-0 items-center justify-center rounded-md bg-white px-3 text-sm font-extrabold text-mat-deep transition-colors hover:bg-chalk focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <span className="sm:hidden">Crear academia</span>
        <span className="hidden sm:inline">Crear mi academia gratis</span>
      </Link>
    </div>
  );
}
