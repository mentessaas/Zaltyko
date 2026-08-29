"use client";

import { Building2, FileSpreadsheet, CreditCard, Users } from "lucide-react";

// No hay todavía cifras de clientes que citar (ver LANDING-CRO.md). En vez de
// dejar la sección sin ningún elemento de confianza, describe el proceso real
// de puesta en marcha — verificable en ModulesSection/FaqSection — hasta que
// exista un testimonio real que la sustituya.
const steps = [
  {
    icon: Building2,
    title: "Configuras tu academia",
    description: "Sedes, grupos y niveles por modalidad, en una puesta en marcha guiada.",
  },
  {
    icon: FileSpreadsheet,
    title: "Importas tus gimnastas",
    description: "Desde Excel o CSV, sin migración manual gimnasta por gimnasta.",
  },
  {
    icon: CreditCard,
    title: "Activas cobros y horarios",
    description: "Cuotas recurrentes y clases listas para pasar lista desde el móvil.",
  },
  {
    icon: Users,
    title: "Sumas a tu equipo",
    description: "Coaches y familias entran con acceso según su rol, sin permisos de más.",
  },
];

export default function SocialProofSection() {
  return (
    <section className="py-16 bg-white border-y border-border">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.08em] text-zaltyko-teal mb-10">
          Cómo te acompañamos en la puesta en marcha
        </p>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <div key={step.title} className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-control bg-zaltyko-primary-ultralight">
                <step.icon className="h-6 w-6 text-zaltyko-teal" />
              </div>
              <p className="mb-1 text-xs font-semibold text-zaltyko-text-light">Paso {index + 1}</p>
              <h3 className="mb-2 font-display text-base font-bold text-zaltyko-navy">{step.title}</h3>
              <p className="text-sm text-zaltyko-text-secondary">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
