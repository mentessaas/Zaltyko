import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CirclePlay } from "lucide-react";
import Reveal from "@/components/motion/Reveal";

export default function HeroSection() {
  return (
    <section className="relative isolate overflow-hidden bg-zaltyko-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 -top-20 h-[34rem] w-[34rem] rounded-full bg-zaltyko-lime/25 blur-3xl"
      />
      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pb-16 pt-28 sm:px-6 sm:pb-20 lg:grid-cols-[0.92fr_1.08fr] lg:gap-14 lg:px-8 lg:pb-24 lg:pt-32">
        <div className="relative z-10 max-w-2xl">
          <Reveal>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-zaltyko-teal/20 bg-white/80 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-zaltyko-teal">
              <span className="h-2 w-2 rounded-full bg-zaltyko-lime" />
              Tu academia, en ritmo
            </p>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="max-w-[13ch] text-[clamp(2.8rem,6vw,5.2rem)] font-bold leading-[0.99] tracking-[-0.055em] text-zaltyko-navy">
              Dirige tu academia de gimnasia sin vivir apagando fuegos.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-6 max-w-xl text-lg leading-8 text-zaltyko-text-secondary sm:text-xl">
              Cuotas, grupos, asistencia y comunicación con familias en un
              sistema pensado para gimnasia artística y rítmica. Más claridad
              para dirigir; más espacio para el entrenamiento y las personas.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/auth/register?role=owner"
                className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-zaltyko-teal px-6 py-3 text-base font-bold text-white shadow-brand transition hover:bg-zaltyko-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zaltyko-teal focus-visible:ring-offset-2"
              >
                Crear academia gratis
                <ArrowRight aria-hidden="true" className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                href="/features"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-zaltyko-mist bg-white/80 px-6 py-3 text-base font-semibold text-zaltyko-navy transition hover:border-zaltyko-teal/50 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zaltyko-teal focus-visible:ring-offset-2"
              >
                <CirclePlay aria-hidden="true" className="h-5 w-5 text-zaltyko-teal" />
                Ver Zaltyko por dentro
              </Link>
            </div>
          </Reveal>
          <Reveal delay={320}>
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-zaltyko-text-secondary">
              <span>Gratis hasta 30 gimnastas</span>
              <span aria-hidden="true" className="text-zaltyko-teal">·</span>
              <span>Sin tarjeta para empezar</span>
              <span aria-hidden="true" className="text-zaltyko-teal">·</span>
              <span>Artística y rítmica</span>
            </div>
          </Reveal>
        </div>

        <Reveal delay={120}>
          <figure className="relative mx-auto w-full max-w-[680px] lg:ml-auto">
            <div className="absolute -bottom-5 -left-5 h-2/3 w-2/3 rounded-[2rem] bg-zaltyko-lime" aria-hidden="true" />
            <div className="relative aspect-[1.08/1] overflow-hidden rounded-[2rem] border border-white/70 bg-zaltyko-navy shadow-medium sm:aspect-[1.16/1]">
              <Image
                src="/branding/zaltyko/photos/academia-editorial-01.png"
                alt="Entrenadora adulta revisa la planificación en una sala de gimnasia con barra de equilibrio y cintas rítmicas."
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 52vw"
                className="object-cover object-[57%_center]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-zaltyko-navy/65 via-transparent to-transparent" />
              <figcaption className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-8">
                <span className="mb-3 block text-xs font-semibold uppercase tracking-[0.16em] text-white/75">
                  Gestión con contexto de gimnasia
                </span>
                <span className="block max-w-md font-display text-2xl font-semibold leading-tight sm:text-3xl">
                  Que el trabajo alrededor del entrenamiento también encuentre su ritmo.
                </span>
              </figcaption>
              <div aria-hidden="true" className="absolute right-5 top-5 flex h-12 w-12 items-center justify-center rounded-full border border-white/40 bg-white/15 text-lg font-bold text-white backdrop-blur-sm">
                Z
              </div>
            </div>
          </figure>
        </Reveal>
      </div>
    </section>
  );
}
