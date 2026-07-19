"use client";

import { useState } from "react";
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
      id: "gimnastas",
      icon: Users,
      label: "Gimnastas",
      content: {
        title: "Gestión integral de gimnastas",
        features: [
          "Fichas con nivel, aparato favorito y seguimiento de progreso",
          "Historial de asistencia y pago en tiempo real",
          "Importación masiva desde Excel o CSV",
          "Portal para que familias vean progreso de sus hijas",
          "Registros centralizados por academia",
          "Permisos diferenciados para staff y familias",
        ],
        impact: "Reduce tareas repetidas y búsquedas en archivos dispersos",
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
          "Notas privadas por gimnasta y evaluaciones pendientes",
          "Alertas cuando una gimnasta necesita atención especial",
          "Panel de horas dictadas y seguimiento de bonificaciones",
          "Control de acceso por academias con múltiples sedes",
        ],
        impact: "Evita malentendidos y mejora la comunicación interna",
      },
    },
    {
      id: "billing",
      icon: CreditCard,
      label: "Cobros",
      content: {
        title: "Cobros claros para academias",
        features: [
          "Cobros mensuales y recordatorios",
          "Recordatorios de pago y recibos automatizados",
          "Portal para familias con historial de pagos",
          "Gestión de morosos con avisos automáticos",
          "Panel de métricas de ingresos y morosidad",
          "Recibos internos sin errores ni hojas de cálculo",
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
          "Registro de notas y comentarios por gimnasta",
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
        title: "Datos centralizados y acceso controlado",
        features: [
          "Registros operativos en una sola plataforma",
          "Importación de gimnastas desde Excel o CSV",
          "Acceso diferenciado por rol",
          "Aislamiento por academia y tenant",
          "Logs de auditoría para acciones compatibles",
          "Exportaciones disponibles según el módulo",
        ],
        impact: "Menos archivos dispersos y mayor trazabilidad operativa",
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
          "Notificaciones push para recordatorios de clases y eventos",
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
        title: "Controles de acceso y privacidad",
        features: [
          "Login sin contraseña (Magic Link) o con Google",
          "Registro de actividad por seguridad",
          "Aislamiento de datos por academia",
          "Permisos diferenciados por rol",
          "Conexiones cifradas en tránsito",
          "Gestión de sesiones y accesos",
        ],
        impact: "Tranquilidad para dueños, padres y directores financieros",
      },
    },
  ];
  const [activeFeature, setActiveFeature] = useState(features[0].id);

  return (
    <section className="bg-primary-dark py-20 px-4 text-white">
      <div className="mx-auto max-w-6xl">
        <Tabs value={activeFeature} onValueChange={setActiveFeature} className="w-full">
          <TabsList className="mb-10 flex h-auto flex-wrap justify-center gap-4 bg-transparent">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <TabsTrigger
                  key={feature.id}
                  value={feature.id}
                  onClick={() => setActiveFeature(feature.id)}
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
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  );
}
