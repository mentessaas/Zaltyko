"use client";

import Link from "next/link";
import {
  Users,
  Calendar,
  CreditCard,
  MessageSquare,
  Award,
  ClipboardList,
  BarChart3,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Reveal from "@/components/motion/Reveal";

const modules = [
  {
    title: "Cobros",
    description: "Consulta cuotas, pagos y recibos desde la academia. Los cobros recurrentes están disponibles según el plan.",
    icon: CreditCard,
    span: "lg:col-span-2",
    features: ["Estado de cobros", "Pagos recurrentes por plan", "Historial de pagos", "Reportes básicos"],
  },
  {
    title: "Clases & Horarios",
    description: "Organiza grupos y sesiones, controla el aforo y pasa lista desde el móvil.",
    icon: Calendar,
    features: ["Calendario interactivo", "Control de aforo", "Pase de lista por sesión", "Listas de espera"],
  },
  {
    title: "Comunicación",
    description: "Centraliza avisos y mensajes internos para que el equipo y las familias tengan la información importante a mano.",
    icon: MessageSquare,
    features: ["Avisos internos", "Mensajes", "Notificaciones", "Acceso familiar limitado"],
  },
  {
    title: "Gimnastas",
    description: "Mantén juntas las fichas, el nivel, la categoría y la información deportiva de cada gimnasta.",
    icon: Users,
    features: ["Fichas", "Niveles y categorías", "Aparatos", "Historial"],
  },
  {
    title: "Eventos",
    description: "Organiza eventos e inscripciones con sus plazas, requisitos y comunicación asociada.",
    icon: Award,
    features: ["Inscripciones online", "Gestión de plazas", "Lista de espera", "Comunicación"],
  },
  {
    title: "Evaluaciones",
    description: "Registra evaluaciones y sigue la evolución técnica de tus gimnastas a lo largo de la temporada.",
    icon: ClipboardList,
    features: ["Rúbricas personalizadas", "Vídeos adjuntos", "Gráficos de progreso", "Exportación PDF"],
  },
  {
    title: "Reportes",
    description: "Consulta información de actividad, asistencia, cobros y progreso para preparar tus decisiones de dirección.",
    icon: BarChart3,
    features: ["Export multi-formato", "Panel de dirección", "Métricas de ocupación y cobros", "Datos para decidir"],
  },
  {
    title: "Multi-Sede",
    description: "Si diriges varias sedes, Network ofrece una puesta en marcha acompañada y una vista pensada para coordinar la organización.",
    icon: Shield,
    features: ["Varias sedes", "Roles por usuario", "Panel de director", "Datos aislados"],
  },
];

export default function ModulesSection() {
  return (
    <section className="bg-zaltyko-white py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.08em] text-zaltyko-teal">
            Para el trabajo real de dirección
          </p>
          <h2 className="text-4xl sm:text-5xl font-bold text-zaltyko-navy mb-6">
            Cada función responde a una tarea de tu academia
          </h2>
          <p className="text-xl text-zaltyko-text-secondary">
            De las fichas y los grupos a los cobros y la asistencia: Zaltyko
            reúne la operación diaria en un sistema para gimnasia artística y
            rítmica.
          </p>
        </div>

        {/* Modules grid — bento (tamaños variados) */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 lg:grid-flow-dense gap-6">
          {modules.map((module, index) => (
            <Reveal
              key={module.title}
              delay={(index % 4) * 80}
              className={cn("h-full", module.span)}
            >
              <div
                className={cn(
                  "h-full rounded-card border border-zaltyko-mist dark:border-border bg-white dark:bg-card p-6 transition-all duration-200 hover:-translate-y-1.5 hover:border-zaltyko-teal hover:shadow-lift"
                )}
              >
              {/* Icon */}
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[6px] bg-zaltyko-primary-ultralight">
                <module.icon className="h-6 w-6 text-zaltyko-teal" />
              </div>

              {/* Title */}
              <h3 className="mb-2 text-lg font-bold text-zaltyko-navy">
                {module.title}
              </h3>

              {/* Description */}
              <p className="text-sm text-zaltyko-text-secondary mb-4 leading-relaxed">
                {module.description}
              </p>

              {/* Features tags */}
              <ul className={cn("gap-x-6 gap-y-2", module.span ? "grid grid-cols-2" : "space-y-2")}>
                {module.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-xs text-gray-500">
                    <div className="h-1.5 w-1.5 rounded-full bg-zaltyko-teal" />
                    {feature}
                  </li>
                ))}
              </ul>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Bottom CTA */}
        <Reveal>
          <div className="text-center mt-12">
            <Link
              href="/features"
              className="inline-flex items-center gap-2 font-semibold text-zaltyko-teal transition-all hover:gap-3"
            >
              Ver qué resuelve Zaltyko
              <span className="text-xl">→</span>
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
