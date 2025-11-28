import Link from "next/link";
import { 
  Users, 
  Calendar, 
  CreditCard, 
  Trophy, 
  MessageSquare, 
  Building2, 
  BarChart3,
  ArrowRight 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const modules = [
  {
    id: "atletas",
    href: "/modules/gestion-atletas",
    icon: Users,
    title: "Gestión de atletas",
    description: "Centraliza toda la información de tus gimnastas en un solo lugar. El módulo de gestión de atletas te permite mantener fichas completas con datos personales, niveles de competición, historial médico, documentación y notas de entrenadores. Ideal para academias de gimnasia artística que necesitan un seguimiento detallado del progreso de cada deportista en los diferentes aparatos y categorías.",
    features: [
      "Fichas completas con datos personales y de emergencia",
      "Seguimiento de nivel técnico por aparato",
      "Historial de lesiones y condiciones médicas",
      "Documentación y permisos digitalizados",
      "Importación masiva desde Excel o CSV",
    ],
    color: "from-violet-500 to-purple-600",
  },
  {
    id: "clases",
    href: "/modules/clases-horarios",
    icon: Calendar,
    title: "Clases y horarios",
    description: "Organiza la programación de clases de tu academia de gimnasia con un sistema flexible que se adapta a grupos por edad, nivel y modalidad. Define horarios recurrentes, gestiona capacidades máximas y permite inscripciones con listas de espera automáticas. La gestión de clases y horarios nunca fue tan sencilla para clubes de gimnasia rítmica y artística.",
    features: [
      "Calendario visual con vista diaria, semanal y mensual",
      "Clases recurrentes con excepciones para festivos",
      "Capacidad máxima y lista de espera automática",
      "Asignación de entrenadores y recursos",
      "Notificaciones automáticas de cambios",
    ],
    color: "from-teal-500 to-emerald-600",
  },
  {
    id: "pagos",
    href: "/modules/pagos-administracion",
    icon: CreditCard,
    title: "Pagos y administración",
    description: "Automatiza la facturación de tu academia con un sistema de cobros integrado. Genera cargos mensuales automáticos, aplica descuentos por hermanos o becas, y recibe pagos online. El módulo de administración financiera te da visibilidad completa sobre ingresos, morosidad y proyecciones para una gestión de gimnasios profesional.",
    features: [
      "Cobros recurrentes automatizados",
      "Pasarela de pago con Stripe integrada",
      "Descuentos por familia y becas especiales",
      "Recordatorios automáticos de pago",
      "Reportes de ingresos y morosidad",
    ],
    color: "from-amber-500 to-orange-600",
  },
  {
    id: "eventos",
    href: "/modules/eventos-competiciones",
    icon: Trophy,
    title: "Eventos y competiciones",
    description: "Gestiona la participación de tus atletas en competiciones locales, regionales y nacionales. Desde la selección de gimnastas hasta la generación de listados oficiales, el módulo de inscripciones a competiciones simplifica toda la logística de eventos deportivos para clubes de gimnasia artística, rítmica y acrobática.",
    features: [
      "Calendario de eventos y competiciones",
      "Inscripción de atletas por categoría",
      "Gestión de cuotas de participación",
      "Generación de listados para federaciones",
      "Comunicación automatizada con familias",
    ],
    color: "from-rose-500 to-pink-600",
  },
  {
    id: "comunicacion",
    href: "/modules/comunicacion",
    icon: MessageSquare,
    title: "Comunicación con padres y staff",
    description: "Mantén informados a padres, atletas y entrenadores sin depender de grupos de WhatsApp. Envía notificaciones sobre clases, pagos, eventos y novedades desde la plataforma. Un software para academias de gimnasia debe facilitar la comunicación efectiva con todas las familias sin perder el control del mensaje.",
    features: [
      "Centro de notificaciones unificado",
      "Mensajes segmentados por grupo o nivel",
      "Historial de comunicaciones por atleta",
      "Notificaciones por email y app",
      "Plantillas personalizables",
    ],
    color: "from-sky-500 to-blue-600",
  },
  {
    id: "directorio",
    href: "/modules/directorio-academias",
    icon: Building2,
    title: "Directorio público de academias",
    description: "Aumenta la visibilidad de tu club deportivo con una página pública en el directorio de Zaltyko. Los padres que buscan academias de gimnasia en su zona podrán encontrarte, ver tus horarios, modalidades y contactarte directamente. Perfecto para la captación de nuevos atletas y el posicionamiento de tu marca.",
    features: [
      "Perfil público personalizable",
      "Información de contacto y ubicación",
      "Galería de fotos y modalidades",
      "Formulario de contacto integrado",
      "SEO optimizado para búsquedas locales",
    ],
    color: "from-indigo-500 to-violet-600",
  },
  {
    id: "reportes",
    href: "/modules/dashboard-reportes",
    icon: BarChart3,
    title: "Dashboard y reportes",
    description: "Toma decisiones informadas con datos reales de tu academia. El dashboard centraliza métricas de asistencia, evolución de atletas, estado financiero y rendimiento de clases. Genera reportes personalizados para presentar a socios, federaciones o para tu propia gestión estratégica del club.",
    features: [
      "Panel de control con métricas clave",
      "Reportes de asistencia por período",
      "Análisis financiero y proyecciones",
      "Exportación a Excel y PDF",
      "Comparativas entre períodos",
    ],
    color: "from-fuchsia-500 to-purple-600",
  },
];

export default function ModulesSection() {
  return (
    <section id="modulos" className="py-20 lg:py-28 bg-zaltyko-bg">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center mb-16">
          <span className="inline-block text-sm font-semibold text-zaltyko-primary uppercase tracking-wider mb-4">
            Funcionalidades completas
          </span>
          <h2 className="font-display text-3xl font-bold tracking-tight text-zaltyko-text-main sm:text-4xl lg:text-5xl">
            Todo lo que tu academia necesita para funcionar sin caos
          </h2>
          <p className="mt-6 text-lg text-zaltyko-text-secondary leading-relaxed">
            Módulos diseñados específicamente para la gestión integral de academias de gimnasia, 
            clubes deportivos y escuelas de gimnasia artística, rítmica y acrobática.
          </p>
        </div>

        {/* Modules grid */}
        <div className="space-y-8">
          {modules.map((module, index) => (
            <div
              key={module.id}
              className={cn(
                "relative rounded-3xl bg-white border border-zaltyko-border overflow-hidden shadow-soft hover:shadow-medium transition-shadow duration-300",
                index % 2 === 1 && "lg:flex-row-reverse"
              )}
            >
              <div className="grid lg:grid-cols-2 gap-8 p-8 lg:p-10">
                {/* Content */}
                <div className={cn("flex flex-col justify-center", index % 2 === 1 && "lg:order-2")}>
                  <div className={cn(
                    "inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br text-white mb-6",
                    module.color
                  )}>
                    <module.icon className="w-7 h-7" />
                  </div>
                  
                  <h3 className="font-display text-2xl font-bold text-zaltyko-text-main mb-4">
                    {module.title}
                  </h3>
                  
                  <p className="text-zaltyko-text-secondary leading-relaxed mb-6">
                    {module.description}
                  </p>

                  <Link
                    href={module.href}
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "w-fit"
                    )}
                  >
                    Más información
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </div>

                {/* Features list */}
                <div className={cn(
                  "bg-zaltyko-bg/50 rounded-2xl p-6 lg:p-8",
                  index % 2 === 1 && "lg:order-1"
                )}>
                  <p className="text-sm font-semibold text-zaltyko-text-main uppercase tracking-wider mb-4">
                    Características principales
                  </p>
                  <ul className="space-y-4">
                    {module.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <div className={cn(
                          "flex-shrink-0 w-5 h-5 rounded-full bg-gradient-to-br flex items-center justify-center mt-0.5",
                          module.color
                        )}>
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <span className="text-sm text-zaltyko-text-secondary">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

