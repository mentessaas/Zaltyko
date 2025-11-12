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
          "Fichas con nivel, aparato favorito y seguimiento por lesiones",
          "Alertas automáticas cuando alcanzas el cupo del plan",
          "Inscripción masiva vía CSV o API REST",
          "Historial de asistencia en tiempo real",
          "Portal para familias (roadmap Q2)",
          "Cumplimiento RLS por tenant para datos sensibles",
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
          "Roles diferenciados: owner, coach, staff y súper admin",
          "Agenda compartida con toma de asistencia desde móvil",
          "Notas privadas por atleta y evaluaciones pendientes",
          "Alertas de rotación de aparatos y recursos",
          "Panel de horas dictadas y bonificaciones",
          "Integración con control de acceso por QR (beta)",
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
          "Checkout para upgrades Free → Pro → Premium",
          "Asignación automática de límites por plan",
          "Webhooks protegidos con verificación de firma",
          "Recordatorios de pago y recibos automatizados",
          "Panel de métricas MRR, churn y morosidad",
          "Integración con LemonSqueezy opcional",
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
          "Notificaciones email/SMS para padres y staff",
          "Checklist de equipo por atleta",
          "Integración con Google Calendar (roadmap Q3)",
        ],
        impact: "Evita mensajes dispersos y asegura que todos lleguen preparados",
      },
    },
    {
      id: "datos",
      icon: Database,
      label: "Datos",
      content: {
        title: "Arquitectura pensada para escalar",
        features: [
          "Drizzle ORM con tipado end-to-end",
          "Migraciones versionadas y seeds para demo",
          "RLS en Supabase + middleware Multi-tenant",
          "Testing con pg-mem para APIs críticas",
          "Jobs serverless con Supabase Edge Functions",
          "Observabilidad con auditorías por acción",
        ],
        impact: "Infraestructura lista para producción desde el día uno",
      },
    },
    {
      id: "integraciones",
      icon: Plug,
      label: "Integraciones",
      content: {
        title: "Conecta tus herramientas favoritas",
        features: [
          "SDK público para crear extensiones internas",
          "Webhooks listos para ERP o sistemas contables",
          "Mailgun para comunicaciones transaccionales",
          "Supabase Storage para compartir rutinas y videos",
          "Segmentación de audiencias para marketing",
          "CLI para automatizar seeds y pruebas end-to-end",
        ],
        impact: "Evita integraciones manuales y mantén un solo origen de datos",
      },
    },
    {
      id: "seguridad",
      icon: ShieldCheck,
      label: "Seguridad",
      content: {
        title: "Tenancy blindado y cumplimiento",
        features: [
          "Autenticación NextAuth con Magic Link y Google",
          "Logs de auditoría con IP y user-agent",
          "Backups automáticos de base de datos",
          "Configurable para RGPD y políticas de menores",
          "CSP estricta y headers de seguridad listos",
          "Playbooks de respuesta ante incidentes",
        ],
        impact: "Tranquilidad para dueños y directores financieros",
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
                  className="flex min-w-[140px] flex-col items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-5 py-4 text-sm font-medium text-slate-200/80 transition data-[state=active]:border-zaltyko-accent/50 data-[state=active]:bg-zaltyko-accent/10 data-[state=active]:text-white"
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
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  );
}
