import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { ZaltykoLockup } from "@/components/brand/ZaltykoMark";

interface InvitationPageShellProps {
  /** Nombra el bloque del tapiz (lo que la invitación abre); no es un antetítulo. */
  eyebrow: string;
  title: string;
  description: React.ReactNode;
  highlights?: string[];
  form: React.ReactNode;
  backHref?: string;
  backLabel?: string;
}

/**
 * Entrada de entrenadoras, familias y gimnastas invitadas con la misma
 * composición que `AuthPageShell` («Magnesio sobre tapiz»): la tarea vive
 * sobre magnesio, con el titular condensado y la regla de cinta de 3 px;
 * el tapiz nombra lo que abre la invitación y ordena los detalles en una
 * lista reglada. A diferencia de la entrada, en móvil el tapiz no se oculta:
 * pasa debajo del formulario, porque los detalles explican la invitación.
 */
export function InvitationPageShell({
  eyebrow,
  title,
  description,
  highlights = [],
  form,
  backHref = "/auth/login",
  backLabel = "Volver al acceso",
}: InvitationPageShellProps) {
  const hasHighlights = highlights.length > 0;

  return (
    <div className="chalk-field min-h-screen text-mat-night [overflow-wrap:anywhere] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="mat-field-deep flex h-16 items-center justify-between px-5 lg:hidden">
        <Link href="/" aria-label="Zaltyko, inicio" className="text-white">
          <ZaltykoLockup markClassName="h-7 w-7" />
        </Link>
        <Link href={backHref} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-white/85">
          <ArrowLeft aria-hidden className="h-4 w-4" />
          {backLabel}
        </Link>
      </div>

      <main className="flex min-h-[calc(100vh-4rem)] flex-col px-6 py-8 sm:px-10 lg:min-h-screen lg:px-16 lg:py-10">
        <div className="hidden items-center justify-between lg:flex">
          <Link href="/" aria-label="Zaltyko, inicio" className="text-mat">
            <ZaltykoLockup markClassName="h-8 w-8" />
          </Link>
          <Link
            href={backHref}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-ramp-600 hover:text-mat"
          >
            <ArrowLeft aria-hidden className="h-4 w-4" />
            {backLabel}
          </Link>
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <h1 className="font-display text-[clamp(2.5rem,6vw,3.75rem)] font-black uppercase leading-[0.92] text-mat-night">
            {title}
          </h1>
          <div className="mt-4 text-base leading-relaxed text-ramp-600">{description}</div>
          <div className="mt-8 border-t-[3px] border-mat-night pt-8">{form}</div>
        </div>
      </main>

      <aside
        aria-label={eyebrow}
        className={`mat-field relative overflow-hidden ${hasHighlights ? "flex" : "hidden lg:flex"}`}
      >
        <div aria-hidden className="pointer-events-none absolute inset-3 border-[3px] border-white/80 lg:inset-6" />
        <div className="relative flex w-full flex-col justify-end px-8 py-12 sm:px-12 lg:p-16 xl:p-20">
          <h2 className="font-display max-w-lg text-[clamp(2rem,4vw,4rem)] font-black uppercase leading-[0.92] text-white">
            {eyebrow}
          </h2>
          {hasHighlights ? (
            <ul className="mt-8 max-w-lg border-t-[3px] border-white lg:mt-10">
              {highlights.map((highlight) => (
                <li key={highlight} className="border-b border-white/20 py-4 text-base leading-relaxed text-white/90">
                  {highlight}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
