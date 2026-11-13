import Link from "next/link";

import { ZaltykoLockup } from "@/components/brand/ZaltykoMark";

interface SystemStatusPageProps {
  /** Código de estado («404»): cifra condensada en azul tapiz, decorativa para lectores de pantalla. */
  code?: string;
  title: string;
  description: React.ReactNode;
  actions: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * Páginas de sistema (404, error) en «Magnesio sobre tapiz»: banda de zona
 * de seguridad con el lockup, como la cabecera móvil de la entrada, y sobre
 * magnesio el titular condensado en mayúsculas apoyado en la regla de cinta
 * de 3 px. Una sola acción principal en tapiz; el resto, de contorno.
 * Sin hooks: sirve tanto a `not-found.tsx` (servidor) como a `error.tsx`
 * (cliente).
 */
export function SystemStatusPage({ code, title, description, actions, children }: SystemStatusPageProps) {
  return (
    <div className="chalk-field flex min-h-screen flex-col text-mat-night [overflow-wrap:anywhere]">
      <header className="mat-field-deep flex h-16 shrink-0 items-center px-5 sm:px-10">
        <Link href="/" aria-label="Zaltyko, inicio" className="inline-flex min-h-11 items-center text-white">
          <ZaltykoLockup markClassName="h-7 w-7" />
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-16 sm:px-10">
        {code ? (
          <p aria-hidden className="font-display text-[clamp(4.5rem,14vw,8rem)] font-black leading-[0.8] text-mat tabular-nums">
            {code}
          </p>
        ) : null}
        <h1 className="mt-4 font-display text-[clamp(2.25rem,5vw,4rem)] font-black uppercase leading-[0.92] text-mat-night">
          {title}
        </h1>
        <div className="mt-6 max-w-xl border-t-[3px] border-mat-night pt-5 text-base leading-relaxed text-ramp-600">
          {description}
        </div>
        {children}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">{actions}</div>
      </main>
    </div>
  );
}

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mat";

export const systemPageUi = {
  primary: `inline-flex min-h-11 items-center justify-center rounded-md bg-mat px-6 py-2.5 text-sm font-semibold text-white shadow-[0_1px_0_rgba(11,20,48,0.25)] transition-colors hover:bg-mat-deep ${FOCUS}`,
  outline: `inline-flex min-h-11 items-center justify-center rounded-md border border-ramp-300 bg-white px-6 py-2.5 text-sm font-semibold text-mat-night transition-colors hover:border-mat hover:text-mat ${FOCUS}`,
} as const;
