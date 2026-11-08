"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { ZaltykoLockup } from "@/components/brand/ZaltykoMark";

interface AuthPageShellProps {
  title: string;
  description: string;
  backHref?: string;
  backLabel?: string;
  footer: React.ReactNode;
  children: React.ReactNode;
  sideTitle: string;
  sideDescription: string;
  highlights: string[];
}

/**
 * Entrada «Magnesio sobre tapiz»: el formulario vive sobre magnesio, a la
 * izquierda; a la derecha, el tapiz con su cinta y el mensaje del espacio
 * al que se entra. En móvil, una franja de tapiz encabeza el formulario.
 */
export function AuthPageShell({
  title,
  description,
  backHref = "/",
  backLabel = "Volver",
  footer,
  children,
  sideTitle,
  sideDescription,
  highlights,
}: AuthPageShellProps) {
  return (
    <div className="chalk-field min-h-screen text-mat-night lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
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
          <p className="mt-4 text-base leading-relaxed text-ramp-600">{description}</p>
          <div className="mt-8 border-t-[3px] border-mat-night pt-8">{children}</div>
          <div className="mt-8 text-sm text-ramp-600">{footer}</div>
        </div>
      </main>

      <aside className="mat-field relative hidden overflow-hidden lg:flex">
        <div aria-hidden className="pointer-events-none absolute inset-6 border-[3px] border-white/80" />
        <div className="relative flex w-full flex-col justify-end p-16 xl:p-20">
          <h2 className="font-display max-w-lg text-[clamp(2.5rem,4vw,4rem)] font-black uppercase leading-[0.92] text-white">
            {sideTitle}
          </h2>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-white/85">{sideDescription}</p>
          <ul className="mt-10 max-w-lg border-t-[3px] border-white">
            {highlights.map((highlight) => (
              <li key={highlight} className="border-b border-white/20 py-4 text-base leading-relaxed text-white/90">
                {highlight}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
