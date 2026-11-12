import Link from "next/link";

import { ZaltykoLockup } from "@/components/brand/ZaltykoMark";

/**
 * Bienvenida de entrenadoras, familias y gimnastas («Magnesio sobre tapiz»):
 * la banda de zona de seguridad con el lockup, como la cabecera móvil de la
 * entrada, y debajo la mesa de magnesio con cada paso en un panel reglado.
 * Las clases viven en `onboardingUi` para que los tres recorridos compartan
 * jerarquía sin tocar su lógica. En modo oscuro las piezas siguen The Night
 * Mat Rule de `globals.css` (magnesio → fondo, blanco → tarjeta, noche → tinta).
 */
export function RoleOnboardingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="chalk-field min-h-screen text-mat-night">
      <header className="mat-field-deep flex h-16 items-center px-5 sm:px-10">
        <Link href="/" aria-label="Zaltyko, inicio" className="inline-flex min-h-11 items-center text-white">
          <ZaltykoLockup markClassName="h-7 w-7" />
        </Link>
      </header>
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-lg flex-col justify-center px-6 py-10">
        {children}
      </main>
    </div>
  );
}

export const onboardingUi = {
  /** Panel reglado: blanco, 12 px, borde de magnesio y regla superior de 3 px en noche. */
  panel: "rounded-xl border border-chalk-line border-t-[3px] border-t-mat-night bg-white p-6 sm:p-8",
  /** Titular del primer paso: condensado, negro y en mayúsculas. */
  title: "font-display text-[clamp(2.25rem,6vw,3rem)] font-black uppercase leading-[0.92] text-mat-night",
  /** Título de cada paso siguiente, en voz *panel title*. */
  stepTitle: "font-display text-2xl font-black uppercase leading-none text-mat-night",
  lede: "text-base leading-relaxed text-ramp-600",
  subtitle: "mt-2 text-sm leading-6 text-ramp-600",
  /** Lista reglada: regla de 3 px arriba y filas separadas por 1 px de magnesio. */
  list: "border-t-[3px] border-mat-night",
  listRow: "flex items-start gap-3 border-b border-chalk-line py-4",
  rowIcon: "mt-0.5 h-5 w-5 shrink-0 text-mat",
  rowTitle: "text-sm font-semibold text-mat-night",
  item: "flex items-center justify-between rounded-[10px] border border-chalk-line bg-white p-3",
  label: "text-sm font-semibold text-mat-night",
  field:
    "mt-1 h-11 w-full rounded-[10px] border border-chalk-line bg-white px-4 text-base text-mat-night placeholder:text-ramp-500 focus:border-mat focus:outline-none focus:ring-4 focus:ring-mat/15 sm:text-sm",
  spinner: "h-6 w-6 animate-spin rounded-full border-2 border-mat border-t-transparent",
} as const;
