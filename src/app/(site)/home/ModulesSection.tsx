"use client";

import Link from "next/link";
import { 
  Users, 
  Calendar, 
  CreditCard, 
  TrendingUp, 
  MessageSquare, 
  FileText, 
  Award,
  ClipboardList,
  BarChart3,
  Bell,
  Shield,
  Globe
} from "lucide-react";
import { cn } from "@/lib/utils";

const modules = [
  {
    title: "Gimnastas",
    description: "Fichas completas con nivel, categoría, aparatos, rutinas, documentación y evolución técnica.",
    icon: Users,
    span: "lg:col-span-2",
    features: ["Perfiles completos", "Niveles y categorías", "Aparatos y rutinas", "Documentación"],
  },
  {
    title: "Clases & Horarios",
    description: "Programación flexible con control de aforo, registro de asistencia por sesión y gestión de waiting lists.",
    icon: Calendar,
    features: ["Calendario interactivo", "Control de aforo", "Asistencia por sesión", "Waiting lists"],
  },
  {
    title: "Cobros",
    description: "Control de cuotas, cobros pendientes, recordatorios y administración económica de familias.",
    icon: CreditCard,
    features: ["Pagos recurrentes", "Pagos pendientes", "Gestión de morosidad", "Cuotas flexibles"],
  },
  {
    title: "Eventos",
    description: "Gestión de inscripciones a competiciones, categorías por edad y nivel y sistema de lista de espera.",
    icon: Award,
    features: ["Inscripciones online", "Categorías automáticas", "Lista de espera", "Comunicación"],
  },
  {
    title: "Evaluaciones",
    description: "Sistema de evaluaciones técnicas y artísticas con rúbricas configurables, vídeos y exportación a PDF.",
    icon: ClipboardList,
    features: ["Rúbricas personalizadas", "Videos adjuntos", "Gráficos de progreso", "Export PDF"],
  },
  {
    title: "Comunicación",
    description: "Mensajería grupal, templates, notificaciones programadas e integración con WhatsApp.",
    icon: MessageSquare,
    features: ["Mensajes grupales", "Plantillas", "Notificaciones", "Familias informadas"],
  },
  {
    title: "Reportes",
    description: "Informes de asistencia, cobros, ocupación y evolución para tomar decisiones de dirección.",
    icon: BarChart3,
    features: ["Export multi-formato", "Informes programados", "Panel de dirección", "Métricas claras"],
  },
  {
    title: "Multi-Academia",
    description: "Gestión de varias sedes o academias desde un solo panel, con control de acceso por rol.",
    icon: Shield,
    span: "lg:col-span-2",
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
