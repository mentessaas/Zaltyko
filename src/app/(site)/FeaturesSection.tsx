import Link from "next/link";
import {
  Users,
  UserCog,
  CreditCard,
  ClipboardCheck,
  CalendarClock,
  Database,
  Plug,
  ShieldCheck,
  Check,
  ArrowRight,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function FeaturesSection() {
  const features = [
    {
      id: "atletas",
      icon: Users,
      label: "Atletas",
      content: {
        title: "Gestión integral de atletas",
        features: [
          "Fichas con nivel, aparato favorito y seguimiento de progreso",
          "Historial de asistencia y pago en tiempo real",
          "Importación masiva desde Excel o CSV",
          "Portal para que familias vean progreso de sus hijas",
          "Datos siempre sincronizados, sin errores de importación",
          "Cumplimiento RGPD y políticas de protección de menores",
        ],
        impact: "Reduce 4 h semanales de tareas administrativas",
      },
    },
    {
      id: "coaches",
      icon: UserCog,
      label: "Coaches",
      content: {
        title: "Staff coordinado y productivo",
        features: [
          "Roles diferenciados: director, coach, staff y admin",
          "Agenda compartida con toma de asistencia desde móvil",
          "Notas privadas por atleta y evaluaciones pendientes",
          "Alertas cuando un atleta necesita atención especial",
          "Panel de horas dictadas y seguimiento de bonificaciones",
          "Control de acceso por academias con múltiples sedes",
        ],
        impact: "Evita malentendidos y mejora la comunicación interna",
      },
    },
    {
      id: "billing",
      icon: CreditCard,
      label: "Facturación",
      content: {
        title: "Stripe listo para academias",
        features: [
          "Cobros automáticos mensuales con Stripe",
          "Recordatorios de pago y recibos automatizados",
          "Portal para familias con historial de pagos",
          "Gestión de morosos con avisos automáticos",
          "Panel de métricas de ingresos y morosidad",
          "Facturación sin errores ni hojas de cálculo",
        ],
        impact: "Conciliar pagos recurrentes sin hojas de cálculo",
      },
    },
    {
      id: "evaluaciones",
      icon: ClipboardCheck,
      label: "Evaluaciones",
      content: {
        title: "Evaluaciones técnicas y planes de progreso",
        features: [
          "Catálogo de habilidades por aparato y dificultad",
          "Registro de notas y comentarios por atleta",
          "Seguimiento visual de progreso por temporada",
          "Exportables PDF para federaciones y padres",
          "Workflows para lesión/retorno a pista",
          "Reportes comparativos entre academias",
        ],
        impact: "Claridad total para directores técnicos y familias",
      },
    },
    {
      id: "eventos",
      icon: CalendarClock,
      label: "Eventos",
      content: {
        title: "Planificación de eventos y giras",
        features: [
          "Calendario unificado de competencias y clínicas",
          "Asignación de coaches responsables por sede",
          "Sincronización de listas de viaje y alojamiento",
          "Notificaciones automáticas para padres y staff",
          "Checklist de equipo por atleta",
          "Inscripción online para padres sin WhatsApp",
        ],
        impact: "Evita mensajes dispersos y asegura que todos lleguen preparados",
      },
    },
    {
      id: "datos",
      icon: Database,
      label: "Datos",
      content: {
        title: "Datos siempre sincronizados y seguros",
        features: [
          "Sincronización en tiempo real sin errores",
          "Importación desde Excel o CSV sin complicaciones",
          "Copias de seguridad automáticas diarias",
          "Acceso multi-usuario sin conflictos de datos",
          "Historial completo de cambios por seguridad",
          "Infraestructura de nivel empresarial",
        ],
        impact: "Datos siempre controlados, sin importar el tamaño de tu academia",
      },
    },
    {
      id: "integraciones",
      icon: Plug,
      label: "Integraciones",
      content: {
        title: "Conecta tus herramientas favoritas",
        features: [
          "Envío de comunicaciones automáticas a familias",
          "Almacenamiento de rutinas y vídeos de entrenamiento",
          "Compartición de archivos con coaches y padres",
          "Notificaciones push para提醒 de clases y eventos",
          "Sincronización con calendarios externos",
          "Copias de seguridad en la nube automáticas",
        ],
        impact: "Un solo origen de datos, sin duplicados ni confusiones",
      },
    },
    {
      id: "seguridad",
      icon: ShieldCheck,
      label: "Seguridad",
      content: {
        title: "Datos protegidos y cumplimiento RGPD",
        features: [
          "Login sin contraseña (Magic Link) o con Google",
          "Registro de actividad por seguridad",
          "Copias de seguridad automáticas diarias",
          "Cumplimiento RGPD y normativa de menores",
          "Encriptación de datos en tránsito y en reposo",
          "Planes de respuesta ante incidentes",
        ],
        impact: "Tranquilidad para dueños, padres y directores financieros",
      },
    },
  ];

  return (
    <section className="bg-zaltyko-primary-dark py-20 px-4 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 space-y-4 text-center">
          <span className="font-display text-xs uppercase tracking-[0.45em] text-zaltyko-accent">
            Módulos conectados
          </span>
          <h2 className="mx-auto max-w-4xl font-display text-3xl font-semibold leading-tight sm:text-4xl md:text-5xl">
            Todo lo que una red de academias necesita para operar sin caos.
          </h2>
          <p className="mx-auto max-w-3xl font-sans text-base text-white/70 md:text-lg">
            Selecciona un módulo y descubre cómo Zaltyko reduce tareas repetitivas, mantiene tus datos seguros y ofrece
            experiencias impecables a atletas, coaches y familias.
          </p>
        </div>

        <Tabs defaultValue="atletas" className="w-full">
          <TabsList className="mb-10 flex h-auto flex-wrap justify-center gap-4 bg-transparent">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <TabsTrigger
                  key={feature.id}
                  value={feature.id}
                  className="flex min-w-[140px] flex-col items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-5 py-4 font-sans text-sm font-medium text-white/70 transition data-[state=active]:border-zaltyko-accent/50 data-[state=active]:bg-zaltyko-accent/10 data-[state=active]:text-white"
                >
                  <Icon className="h-6 w-6" />
                  <span>{feature.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {features.map((feature) => (
            <TabsContent
              key={feature.id}
              value={feature.id}
              className="space-y-8 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-xl"
            >
              <div className="space-y-6">
                <h3 className="font-display text-2xl font-semibold text-white">
                  {feature.content.title}
                </h3>
                <p className="font-display text-sm uppercase tracking-[0.25em] text-zaltyko-accent">
                  Impacto
                </p>
                <p className="font-sans text-base text-white/70">
                  {feature.content.impact}
                </p>
                <div className="grid gap-4 pt-6 md:grid-cols-2">
                  {feature.content.features.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4"
                    >
                      <Check className="mt-1 h-5 w-5 flex-shrink-0 text-zaltyko-accent" />
                      <span className="font-sans text-sm leading-relaxed text-white/80">
                        {item}
                      </span>
                    </div>
                  ))}
                </div>
                {/* CTA dentro del tab */}
                <div className="mt-8 pt-6 border-t border-white/10">
                  <Link
                    href="/onboarding"
                    className="inline-flex items-center gap-2 bg-white text-red-700 font-semibold px-6 py-3 rounded-xl hover:bg-gray-100 transition-colors text-sm"
                  >
                    Probar 14 días gratis
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  );
}
