import { Clock, FileSpreadsheet, MessageCircle, TrendingUp, ArrowRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const stats = [
  {
    icon: Clock,
    value: "15h",
    label: "ahorradas por semana",
    description: "en tareas administrativas",
  },
  {
    icon: FileSpreadsheet,
    value: "0",
    label: "hojas de Excel",
    description: "todo centralizado",
  },
  {
    icon: MessageCircle,
    value: "100%",
    label: "comunicación controlada",
    description: "sin grupos de WhatsApp",
  },
  {
    icon: TrendingUp,
    value: "3x",
    label: "más eficiencia",
    description: "en cobros y pagos",
  },
];

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
            Transforma horas de trabajo administrativo en minutos. 
            Zaltyko automatiza lo repetitivo para que te enfoques en tus atletas.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center p-6 rounded-2xl bg-white border border-zaltyko-border shadow-soft">
              <div className="w-12 h-12 mx-auto rounded-full bg-zaltyko-primary/10 flex items-center justify-center text-zaltyko-primary mb-4">
                <stat.icon className="w-6 h-6" />
              </div>
              <p className="text-3xl font-bold text-zaltyko-primary">{stat.value}</p>
              <p className="text-sm font-medium text-zaltyko-text-main">{stat.label}</p>
              <p className="text-xs text-zaltyko-text-secondary mt-1">{stat.description}</p>
            </div>
          ))}
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
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-100 text-red-500 flex items-center justify-center text-xs font-bold">✗</span>
                  <span className="text-sm text-zaltyko-text-secondary line-through decoration-red-300">{point.before}</span>
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
            href="/onboarding"
            className={cn(
              buttonVariants({ variant: "default", size: "lg" }),
              "shadow-glow"
            )}
          >
            Empezar digitalización gratis
            <ArrowRight className="ml-2 h-5 w-5" />
          </Link>
          <p className="mt-3 text-sm text-zaltyko-text-secondary">
            Sin tarjeta de crédito · Configuración en 5 minutos
          </p>
        </div>
      </div>
    </section>
  );
}
