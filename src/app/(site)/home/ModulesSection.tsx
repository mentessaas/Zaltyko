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
    title: "Atletas",
    description: "Gestión completa de atletas con perfiles detallados, niveles de habilidad y evaluaciones técnicas.",
    icon: Users,
    color: "bg-rose-500",
    features: ["Perfiles completos", "Niveles y categorías", "Evaluaciones técnicas", "Documentación"],
  },
  {
    title: "Clases & Horarios",
    description: "Programación flexible con control de aforo, registro de asistencia en tiempo real y gestión de waiting lists.",
    icon: Calendar,
    color: "bg-teal-500",
    features: ["Calendario interactivo", "Control de aforo", "Asistencia automática", "Waiting lists"],
  },
  {
    title: "Facturación",
    description: "Sistema de cobros automatizados con Stripe integrado, gestión de planes y portal de facturación.",
    icon: CreditCard,
    color: "bg-amber-500",
    features: ["Pagos recurrentes", "Portal de facturación", "Gestión de morosos", "Planes flexibles"],
  },
  {
    title: "Eventos",
    description: "Gestión de inscripciones a competiciones, categorías por edad/level y sistema de lista de espera.",
    icon: Award,
    color: "bg-violet-500",
    features: ["Inscripciones online", "Categorías automáticas", "Lista de espera", "Comunicación"],
  },
  {
    title: "Evaluaciones",
    description: "Sistema de evaluaciones técnicas y artísticas con rúbricas configurables, vídeos y exportación a PDF.",
    icon: ClipboardList,
    color: "bg-blue-500",
    features: ["Rúbricas personalizadas", "Videos adjuntos", "Gráficos de progreso", "Export PDF"],
  },
  {
    title: "Comunicación",
    description: "Mensajería grupal, templates, notificaciones programadas e integración con WhatsApp.",
    icon: MessageSquare,
    color: "bg-green-500",
    features: ["Mensajes grupales", "Templates", "Notificaciones", "WhatsApp API"],
  },
  {
    title: "Reportes",
    description: "Exportación a CSV/Excel, reportes programados y dashboard con métricas clave.",
    icon: BarChart3,
    color: "bg-indigo-500",
    features: ["Export multi-formato", "Reportes programados", "Dashboard analytics", "KPI's clave"],
  },
  {
    title: "Multi-Academia",
    description: "Gestión de varias sedes o academias desde un solo panel, con control de acceso por rol.",
    icon: Shield,
    color: "bg-gray-700",
    features: ["Varias sedes", "Roles por usuario", "Panel de director", "Datos aislados"],
  },
];

export default function ModulesSection() {
  return (
    <section className="py-24 bg-gray-50 relative overflow-hidden">
      {/* Background pattern */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-red-100 rounded-full blur-3xl opacity-30" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-rose-100 rounded-full blur-3xl opacity-30" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="inline-block px-4 py-1.5 bg-red-100 text-red-700 text-sm font-semibold rounded-full mb-4">
            Funcionalidades
          </span>
          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6">
            Todo lo que tu academia necesita
          </h2>
          <p className="text-xl text-gray-600">
            Módulos diseñados específicamente para la gestión integral de academias de gimnasia. 
            Sin Excel, sin caos, sin perder tiempo.
          </p>
        </div>

        {/* Modules grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {modules.map((module, i) => (
            <div 
              key={module.title}
              className="group bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-xl hover:border-red-100 transition-all duration-300 hover:-translate-y-1"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              {/* Icon */}
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center mb-4", module.color)}>
                <module.icon className="h-6 w-6 text-white" />
              </div>

              {/* Title */}
              <h3 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-red-600 transition-colors">
                {module.title}
              </h3>

              {/* Description */}
              <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                {module.description}
              </p>

              {/* Features tags */}
              <ul className="space-y-2">
                {module.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-xs text-gray-500">
                    <div className="w-1.5 h-1.5 bg-red-400 rounded-full" />
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
            className="inline-flex items-center gap-2 text-red-600 font-semibold hover:gap-3 transition-all"
          >
            Ver todas las funcionalidades
            <span className="text-xl">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
