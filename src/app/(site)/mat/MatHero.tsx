"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";

import { ChalkTally } from "@/components/mat/ChalkTally";
import { HERO_LEAD } from "@/lib/launch/essential-public-catalog";
import { cn } from "@/lib/utils";

/**
 * Primer viewport de la home: el tapiz de competición a sangre, con el marco
 * de cinta blanca del área de suelo. A la derecha, la sesión de esta tarde:
 * tocar a una gimnasta la marca presente y suma un palote de magnesio. Los
 * nombres son de demostración y así se rotula.
 */
const DEMO_ROSTER = [
  { name: "Lucía M.", detail: "Base 3 · GAF" },
  { name: "Martina O.", detail: "Base 3 · GAF" },
  { name: "Vera S.", detail: "Base 3 · GAF" },
  { name: "Noa P.", detail: "Base 3 · GAF" },
  { name: "Irene G.", detail: "Base 3 · GAF" },
  { name: "Carla M.", detail: "Base 3 · GAF" },
  { name: "Alba R.", detail: "Base 3 · GAF" },
];
const INITIALLY_PRESENT = [0, 1, 3];

function useClock() {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const fmt = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" });
    const tick = () => setNow(fmt.format(new Date()));
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export default function MatHero() {
  const [present, setPresent] = useState<Set<number>>(() => new Set(INITIALLY_PRESENT));
  const clock = useClock();
  const count = present.size;

  const toggle = (i: number) =>
    setPresent((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <section aria-labelledby="hero-title" className="mat-field relative overflow-hidden pt-16">
      {/* Marco de cinta del área de suelo */}
      <div aria-hidden className="pointer-events-none absolute inset-x-3 bottom-3 top-[4.75rem] border-[3px] border-white/80 sm:inset-x-6 sm:bottom-6 sm:top-[5.5rem]" />
      {/* Línea central del tapiz */}
      <div aria-hidden className="pointer-events-none absolute bottom-6 left-1/2 top-[5.5rem] hidden w-px bg-white/15 lg:block" />

      <div className="relative mx-auto grid max-w-7xl gap-12 px-6 pb-16 pt-14 sm:px-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-end lg:gap-16 lg:px-14 lg:pb-20 lg:pt-20">
        <div>
          <h1
            id="hero-title"
            className="font-display text-[clamp(2.75rem,8vw,6rem)] font-black uppercase leading-[0.9] tracking-[-0.01em] text-white"
          >
            El software
            <br />
            de tu academia
            <br />
            de gimnasia.
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-white/85 sm:text-xl">
            {HERO_LEAD} Trae tus gimnastas desde Excel y lleva al día las cuotas de cada familia.
            Solo para gimnasia artística y rítmica.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/auth/register?role=owner"
              className="inline-flex min-h-14 items-center justify-center rounded-md bg-white px-7 text-base font-extrabold text-mat-deep shadow-[0_8px_20px_-10px_rgba(11,20,48,0.8)] transition-transform duration-150 ease-out focus-visible:ring-white focus-visible:ring-offset-mat"
            >
              Crear academia gratis
            </Link>
            <Link
              href="/pricing"
              className="inline-flex min-h-14 items-center justify-center rounded-md border-2 border-white/60 px-7 text-base font-bold text-white transition-colors hover:border-white hover:bg-white/10 focus-visible:ring-white focus-visible:ring-offset-mat"
            >
              Ver planes
            </Link>
            <Link
              href="/demo?origen=inicio"
              className="inline-flex min-h-14 items-center justify-center rounded-md px-3 text-base font-bold text-white underline decoration-2 underline-offset-4 transition-colors hover:bg-white/10 focus-visible:ring-white focus-visible:ring-offset-mat"
            >
              Ver demo
            </Link>
          </div>
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-white/80">
            {["Gratis hasta 30 gimnastas", "Sin tarjeta", "Abierto a cualquier país"].map((item) => (
              <li key={item} className="inline-flex items-center gap-1.5">
                <Check aria-hidden className="h-4 w-4 text-mat-lane" strokeWidth={2.5} />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Sesión de esta tarde, pintada sobre el propio tapiz: los palotes son
            magnesio blanco, la lista va entre líneas de cinta. Sin tarjeta. */}
        <div className="relative">
          {/* La ficha es ilustrativa: se rotula como ejemplo antes del dato,
              no solo en el pie (P2 #21). Blanco sobre el brillo del tapiz:
              5,8:1 en el peor punto. */}
          <p className="floor-label mb-3 inline-flex items-center gap-2 text-white">
            <span className="rounded-sm border border-white/60 px-1.5 py-0.5 text-white">Ejemplo</span>
            Sesión ilustrativa con datos ficticios
          </p>
          <div className="flex items-end justify-between gap-4 border-b-[3px] border-white pb-4">
            <div>
              <p className="font-display text-3xl font-black uppercase leading-none text-white">Base 3 GAF</p>
              <p className="mt-2 text-sm font-medium text-white/80">Hoy · Pista 1 · Suelo · 17:30 – 19:00</p>
            </div>
            <p className="font-display tabular text-right text-3xl font-black leading-none text-white" suppressHydrationWarning>
              <span className="sr-only">Hora actual: </span>
              {clock ?? "--:--"}
            </p>
          </div>

          <div className="flex items-end justify-between gap-6 py-5 text-white">
            <ChalkTally
              count={count}
              max={DEMO_ROSTER.length}
              className="h-20 drop-shadow-[0_1px_0_rgba(11,20,48,0.35)]"
              label={`${count} de ${DEMO_ROSTER.length} presentes`}
            />
            <p className="font-display tabular text-6xl font-black leading-none text-white" aria-live="polite">
              {count}
              <span className="text-2xl text-mat-lane">/{DEMO_ROSTER.length}</span>
            </p>
          </div>

          <ul className="border-t border-white/30" aria-label="Pasar lista (demostración)">
            {DEMO_ROSTER.map((athlete, i) => {
              const on = present.has(i);
              return (
                <li key={athlete.name} className="border-b border-white/20">
                  <button
                    type="button"
                    onClick={() => toggle(i)}
                    aria-pressed={on}
                    className="flex min-h-12 w-full items-center justify-between gap-3 text-left text-white transition-colors hover:bg-white/[0.06] focus-visible:ring-white focus-visible:ring-offset-mat"
                  >
                    <span className="truncate text-base font-semibold">{athlete.name}</span>
                    <span
                      className={cn(
                        "inline-flex h-8 min-w-[6rem] items-center justify-center rounded-sm text-xs font-extrabold uppercase tracking-[0.08em] transition-colors",
                        on ? "bg-white text-mat-deep" : "border-2 border-white/45 text-white/85"
                      )}
                    >
                      {on ? "Presente" : "Marcar"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs font-medium text-white/85">
            Ejemplo con datos ficticios: toca una gimnasta y suma un palote.
          </p>
        </div>
      </div>
    </section>
  );
}
