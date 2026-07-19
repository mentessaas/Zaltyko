"use client";

import Link from "next/link";
import { ArrowRight, Play, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const clipChip = {
  clipPath: "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%)",
} as const;

const rosterPreview = [
  { name: "Lucía M.", group: "Base 3 · GAF", status: "present" as const },
  { name: "Martín O.", group: "Iniciación · GAM", status: "present" as const },
  { name: "Vera S.", group: "Base 2 · Rítmica", status: "late" as const },
  { name: "Noa P.", group: "Base 3 · GAF", status: "absent" as const },
];

const STATUS_LABEL: Record<string, string> = {
  present: "Presente",
  late: "Tarde",
  absent: "Ausente",
};

const STATUS_CLASS: Record<string, string> = {
  present: "bg-zaltyko-primary-ultralight text-zaltyko-teal",
  late: "bg-zaltyko-navy/10 text-zaltyko-navy",
  absent: "bg-zaltyko-coral/12 text-zaltyko-coral",
};

export default function HeroSection() {
  return (
    <section className="relative bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-20 items-center">
          {/* Left Content */}
          <div className="max-w-2xl">
            <p className="mb-6 text-xs font-semibold uppercase tracking-[0.08em] text-zaltyko-teal">
              Gimnasia artística · GAM · Rítmica
            </p>

            {/* H1 */}
            <h1 className="mb-6 font-display font-bold leading-[1.05] tracking-tight text-zaltyko-navy text-[clamp(1.875rem,6vw,4.5rem)]">
              Las cuotas cobradas, los grupos montados y la lista pasada.
            </h1>
            <p className="mb-3 font-display text-xl font-medium text-zaltyko-text-secondary sm:text-2xl">
              Sin Excel y sin los chats de WhatsApp del club.
            </p>

            {/* Subtitle */}
            <p className="mb-8 max-w-xl text-lg leading-relaxed text-zaltyko-text-secondary">
              Zaltyko es el software de gestión hecho solo para clubes de gimnasia artística y rítmica: gimnastas por nivel y aparato, cuotas recurrentes, asistencia por sesión y familias informadas.
            </p>

            {/* CTAs */}
            <div className="mb-6">
              <div className="flex flex-col sm:flex-row gap-4 mb-4">
                <Link
                  href="/auth/register?role=owner"
                  className={cn(
                    buttonVariants({ variant: "default", size: "lg" }),
                    "group bg-zaltyko-teal px-8 py-6 text-base text-white shadow-brand transition-all duration-200 hover:bg-primary-dark hover:shadow-lift"
                  )}
                >
                  Crea tu academia gratis
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link
                  href="/pricing"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "lg" }),
                    "border-zaltyko-mist bg-white px-8 py-6 text-base text-zaltyko-indigo hover:border-zaltyko-indigo/35 hover:bg-zaltyko-white"
                  )}
                >
                  <Play className="mr-2 h-5 w-5 text-zaltyko-teal" />
                  Ver planes
                </Link>
              </div>
              {/* Microcopy bajo CTA */}
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zaltyko-text-secondary">
                <span className="flex items-center gap-1">
                  <Shield className="h-4 w-4 text-zaltyko-teal" /> Sin tarjeta de crédito
                </span>
                <span>·</span>
                <span>Puesta en marcha guiada</span>
                <span>·</span>
                <span>Sin compromiso</span>
              </p>
            </div>
          </div>

          {/* Right Content - vista ilustrativa del pase de lista, no una captura del producto */}
          <div className="border-b-2 border-zaltyko-teal">
            <div className="rounded-card border border-zaltyko-mist bg-white shadow-soft">
              <div className="flex items-center justify-between border-b border-zaltyko-mist px-5 py-4">
                <div>
                  <p className="font-display text-sm font-bold text-zaltyko-navy">Entrenamiento · Base 3</p>
                  <p className="text-xs text-zaltyko-text-light">Hoy · 17:30</p>
                </div>
                <p className="font-display text-lg font-bold tabular-nums text-zaltyko-navy">
                  2<span className="text-zaltyko-text-light">/4</span>
                </p>
              </div>
              <ul className="divide-y divide-zaltyko-mist/60">
                {rosterPreview.map((athlete) => (
                  <li key={athlete.name} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zaltyko-navy">{athlete.name}</p>
                      <p className="truncate text-xs text-zaltyko-text-light">{athlete.group}</p>
                    </div>
                    <span
                      style={clipChip}
                      className={cn(
                        "shrink-0 px-2.5 py-1 text-xs font-semibold",
                        STATUS_CLASS[athlete.status]
                      )}
                    >
                      {STATUS_LABEL[athlete.status]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-3 text-xs text-zaltyko-text-light">
              Así se pasa lista desde el móvil, sesión por sesión.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
