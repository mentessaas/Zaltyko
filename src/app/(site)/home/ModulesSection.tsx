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

const modules = [
  {
    title: "Cobros",
    description: "Lo que más usan las directoras: cuotas recurrentes, avisos automáticos a familias y seguimiento de impagos sin perseguir a nadie.",
    icon: CreditCard,
    span: "lg:col-span-2",
    features: ["Pagos recurrentes", "Avisos automáticos", "Seguimiento de impagos", "Cuotas por grupo"],
  },
  {
    title: "Clases & Horarios",
    description: "Programación flexible con control de aforo, pase de lista por sesión y gestión de listas de espera.",
    icon: Calendar,
    features: ["Calendario interactivo", "Control de aforo", "Pase de lista por sesión", "Waiting lists"],
  },
  {
    title: "Comunicación",
    description: "Mensajes y notificaciones internas por grupo con historial auditable, sin saturar los chats del club.",
    icon: MessageSquare,
    features: ["Mensajes grupales", "Plantillas", "Notificaciones internas", "Familias informadas"],
  },
  {
    title: "Gimnastas",
    description: "Fichas con nivel, categoría, aparatos, rutinas, documentación y evolución técnica de cada gimnasta.",
    icon: Users,
    features: ["Perfiles completos", "Niveles y categorías", "Aparatos y rutinas", "Documentación"],
  },
  {
    title: "Eventos",
    description: "Inscripciones a competiciones con categorías por edad y nivel, y lista de espera gestionada.",
    icon: Award,
    features: ["Inscripciones online", "Categorías por edad y nivel", "Lista de espera", "Comunicación"],
  },
  {
    title: "Evaluaciones",
    description: "Sistema de evaluaciones técnicas y artísticas con rúbricas configurables, vídeos adjuntos y exportación a PDF.",
    icon: ClipboardList,
    features: ["Rúbricas personalizadas", "Videos adjuntos", "Gráficos de progreso", "Export PDF"],
  },
  {
    title: "Reportes",
    description: "Informes de asistencia, cobros, ocupación y evolución para decidir dirección con datos reales.",
    icon: BarChart3,
    features: ["Export multi-formato", "Informes programados", "Panel de dirección", "Métricas claras"],
  },
  {
    title: "Multi-Sede",
    description: "Gestión multi-sede para Network con diagnóstico y puesta en marcha acompañada, además de aislamiento por academia y control de acceso por rol.",
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
            Funcionalidades
          </p>
          <h2 className="text-4xl sm:text-5xl font-bold text-zaltyko-navy mb-6">
            Hecho para cómo funciona un club de gimnasia
          </h2>
          <p className="text-xl text-zaltyko-text-secondary">
            Niveles, aparatos, ramas GAF/GAM/rítmica, cuotas por grupo, evaluaciones con rúbrica.
            Cosas que un CRM genérico no sabe ni escribir.
          </p>
        </div>

        {/* Modules grid — bento (tamaños variados) */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 lg:grid-flow-dense gap-6">
          {modules.map((module) => (
            <div
              key={module.title}
              className={cn(
                "rounded-card border border-zaltyko-mist bg-white p-6 transition-colors hover:border-zaltyko-teal",
                module.span
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
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-12">
          <Link
            href="/features" 
            className="inline-flex items-center gap-2 font-semibold text-zaltyko-teal transition-all hover:gap-3"
          >
            Ver todas las funcionalidades
            <span className="text-xl">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
