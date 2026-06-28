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
    color: "bg-zaltyko-indigo",
    accent: "from-zaltyko-indigo to-zaltyko-electric",
    span: "lg:col-span-2",
    features: ["Perfiles completos", "Niveles y categorías", "Aparatos y rutinas", "Documentación"],
  },
  {
    title: "Clases & Horarios",
    description: "Programación flexible con control de aforo, registro de asistencia en tiempo real y gestión de waiting lists.",
    icon: Calendar,
    color: "bg-teal-500",
    accent: "from-teal-500 to-emerald-500",
    features: ["Calendario interactivo", "Control de aforo", "Asistencia automática", "Waiting lists"],
  },
  {
    title: "Facturación",
    description: "Control de cuotas, cobros pendientes, recordatorios y administración económica de familias.",
    icon: CreditCard,
    color: "bg-zaltyko-coral",
    accent: "from-zaltyko-coral to-orange-400",
    features: ["Pagos recurrentes", "Pagos pendientes", "Gestión de morosidad", "Cuotas flexibles"],
  },
  {
    title: "Eventos",
    description: "Gestión de inscripciones a competiciones, categorías por edad/level y sistema de lista de espera.",
    icon: Award,
    color: "bg-violet-500",
    accent: "from-violet-500 to-purple-500",
    features: ["Inscripciones online", "Categorías automáticas", "Lista de espera", "Comunicación"],
  },
  {
    title: "Evaluaciones",
    description: "Sistema de evaluaciones técnicas y artísticas con rúbricas configurables, vídeos y exportación a PDF.",
    icon: ClipboardList,
    color: "bg-blue-500",
    accent: "from-blue-500 to-cyan-500",
    features: ["Rúbricas personalizadas", "Videos adjuntos", "Gráficos de progreso", "Export PDF"],
  },
  {
    title: "Comunicación",
    description: "Mensajería grupal, templates, notificaciones programadas e integración con WhatsApp.",
    icon: MessageSquare,
    color: "bg-green-500",
    accent: "from-green-500 to-emerald-500",
    features: ["Mensajes grupales", "Plantillas", "Notificaciones", "Familias informadas"],
  },
  {
    title: "Reportes",
    description: "Informes de asistencia, cobros, ocupación y evolución para tomar decisiones de dirección.",
    icon: BarChart3,
    color: "bg-indigo-500",
    accent: "from-indigo-500 to-zaltyko-indigo",
    features: ["Export multi-formato", "Informes programados", "Panel de dirección", "Métricas claras"],
  },
  {
    title: "Multi-Academia",
    description: "Gestión de varias sedes o academias desde un solo panel, con control de acceso por rol.",
    icon: Shield,
    color: "bg-gray-700",
    accent: "from-gray-700 to-zaltyko-navy",
    span: "lg:col-span-2",
    features: ["Varias sedes", "Roles por usuario", "Panel de director", "Datos aislados"],
  },
];

export default function ModulesSection() {
  return (
    <section className="relative overflow-hidden bg-zaltyko-white py-24">
      {/* Background pattern */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/4 h-96 w-96 rounded-full bg-zaltyko-indigo/8 blur-3xl opacity-40" />
        <div className="absolute bottom-0 right-1/4 h-96 w-96 rounded-full bg-zaltyko-teal/10 blur-3xl opacity-40" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="mb-4 inline-block rounded-full bg-zaltyko-teal/10 px-4 py-1.5 text-sm font-semibold text-zaltyko-indigo">
            Funcionalidades
          </span>
          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6">
            Todo lo que tu academia necesita
          </h2>
          <p className="text-xl text-gray-600">
            Módulos diseñados específicamente para academias de gimnasia artística y rítmica. 
            Sin Excel, sin caos, sin perder tiempo.
          </p>
        </div>

        {/* Modules grid — bento (tamaños variados) */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 lg:grid-flow-dense gap-6">
          {modules.map((module) => (
            <div
              key={module.title}
              className={cn(
                "group card-hover relative overflow-hidden rounded-2xl border border-zaltyko-mist/70 bg-white p-6 shadow-soft hover:border-zaltyko-teal/25",
                module.span
              )}
            >
              {/* Barra de acento superior */}
              <div className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r opacity-80 transition-opacity group-hover:opacity-100", module.accent)} />

              {/* Icon */}
              <div className={cn("mt-1 mb-4 flex h-12 w-12 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110", module.color)}>
                <module.icon className="h-6 w-6 text-white" />
              </div>

              {/* Title */}
              <h3 className="mb-2 text-lg font-bold text-gray-900 transition-colors group-hover:text-zaltyko-indigo">
                {module.title}
              </h3>

              {/* Description */}
              <p className="text-sm text-gray-600 mb-4 leading-relaxed">
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
