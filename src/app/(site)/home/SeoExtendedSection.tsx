import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const painPoints = [
  {
    before: "Buscar fichas entre hojas y mensajes",
    after: "Gimnastas, grupos y datos de familia en la academia",
  },
  {
    before: "Revisar cuotas y pagos en varios sitios",
    after: "Cuotas y pagos consultables desde el módulo de cobros",
  },
  {
    before: "Cambios de horario y listas difíciles de seguir",
    after: "Grupos, sesiones y asistencia organizados por clase",
  },
  {
    before: "Familias que necesitan preguntar por lo básico",
    after: "Horarios, avisos, cuotas y progreso publicado en su portal limitado",
  },
];

export default function SeoExtendedSection() {
  return (
    <section className="py-20 lg:py-28 bg-gradient-to-b from-white to-zaltyko-bg/50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="max-w-3xl mx-auto text-center mb-16">
          <span className="inline-block text-sm font-semibold text-zaltyko-primary uppercase tracking-wider mb-4">
            Menos gestión a base de memoria
          </span>
          <h2 className="font-display text-3xl font-bold tracking-tight text-zaltyko-text-main sm:text-4xl">
            De tareas sueltas a una operación con contexto
          </h2>
          <p className="mt-4 text-lg text-zaltyko-text-secondary">
            Al reunir información que hoy vive en varios archivos y conversaciones,
            puedes revisar la operación con más claridad y dedicar más atención al
            equipo y al entrenamiento.
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
                className="grid md:grid-cols-[1fr,auto,1fr] gap-4 items-center p-4 rounded-xl bg-white dark:bg-card border border-zaltyko-border dark:border-border"
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
            Crear academia gratis
            <ArrowRight className="ml-2 h-5 w-5" />
          </Link>
          <p className="mt-3 text-sm text-zaltyko-text-secondary">
            Free hasta 30 gimnastas · Después puedes elegir el plan que encaje
          </p>
        </div>
      </div>
    </section>
  );
}
