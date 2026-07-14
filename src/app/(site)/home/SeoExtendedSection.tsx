import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const painPoints = [
  {
    before: "Hojas de cálculo dispersas",
    after: "Panel centralizado con toda la información",
  },
  {
    before: "Cobros manuales y persecución de morosos",
    after: "Cobros automáticos y recordatorios programados",
  },
  {
    before: "WhatsApp saturado de mensajes",
    after: "Notificaciones organizadas por canales",
  },
  {
    before: "Inscripciones a competiciones caóticas",
    after: "Gestión de eventos con un solo clic",
  },
];

export default function SeoExtendedSection() {
  return (
    <section className="py-20 lg:py-28 bg-gradient-to-b from-white to-zaltyko-bg/50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="max-w-3xl mx-auto text-center mb-16">
          <span className="inline-block text-sm font-semibold text-zaltyko-primary uppercase tracking-wider mb-4">
            Digitaliza tu academia
          </span>
          <h2 className="font-display text-3xl font-bold tracking-tight text-zaltyko-text-main sm:text-4xl">
            De la gestión manual al control total
          </h2>
          <p className="mt-4 text-lg text-zaltyko-text-secondary">
            Transforma horas de trabajo administrativo en decisiones claras.
            Zaltyko ordena lo repetitivo para que te enfoques en tus gimnastas.
          </p>
        </div>

        {/* Before/After */}
        <div className="max-w-4xl mx-auto">
          <h3 className="text-center font-semibold text-zaltyko-text-main mb-8">
            Lo que cambia con Zaltyko
          </h3>
          <div className="space-y-3">
            {painPoints.map((point, index) => (
              <div 
                key={index}
                className="grid md:grid-cols-[1fr,auto,1fr] gap-4 items-center p-4 rounded-xl bg-white border border-zaltyko-border"
              >
                <div className="flex items-center gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-zaltyko-teal/10 text-zaltyko-coral flex items-center justify-center text-xs font-bold">✗</span>
                  <span className="text-sm text-zaltyko-text-secondary line-through decoration-zaltyko-coral/40">{point.before}</span>
                </div>
                <ArrowRight className="hidden md:block w-5 h-5 text-zaltyko-primary" />
                <div className="flex items-center gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs font-bold">✓</span>
                  <span className="text-sm text-zaltyko-text-main font-medium">{point.after}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-12">
          <Link
            href="/auth/register?role=owner"
            className={cn(
              buttonVariants({ variant: "default", size: "lg" }),
              "shadow-soft hover:shadow-medium"
            )}
          >
            Crea tu academia gratis
            <ArrowRight className="ml-2 h-5 w-5" />
          </Link>
          <p className="mt-3 text-sm text-zaltyko-text-secondary">
            Puesta en marcha guiada · Sin compromiso
          </p>
        </div>
      </div>
    </section>
  );
}
