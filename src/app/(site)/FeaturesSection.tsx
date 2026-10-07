"use client";

import { useState } from "react";
import {
  Users,
  CalendarDays,
  CircleDollarSign,
  MessagesSquare,
  Activity,
  Trophy,
  Check,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const features = [
  {
    id: "gimnastas",
    icon: Users,
    label: "Gimnastas",
    pain: "Buscar una ficha no debería frenar tu día.",
    result:
      "Reúne los datos deportivos y de contacto de cada gimnasta en el espacio de tu academia.",
    items: [
      "Fichas de gimnastas y datos de familia",
      "Niveles, categorías y aparatos",
      "Historial de actividad y seguimiento",
      "Importación de gimnastas desde Excel o CSV",
    ],
  },
  {
    id: "clases",
    icon: CalendarDays,
    label: "Grupos y clases",
    pain: "Llega a cada clase sabiendo quién viene y qué grupo entrena.",
    result:
      "Organiza horarios, sesiones, capacidad y asistencia en un mismo flujo de trabajo.",
    items: [
      "Grupos y clases por academia",
      "Sesiones con horario y entrenador asignado",
      "Pase de lista desde el móvil",
      "Capacidad y listas de espera en clases",
    ],
  },
  {
    id: "cuotas",
    icon: CircleDollarSign,
    label: "Cuotas y pagos",
    pain: "Ten claro qué se ha cobrado y qué necesita seguimiento.",
    result:
      "Consulta cargos, pagos, recibos e información básica de cobros desde el área de facturación.",
    items: [
      "Cobros recurrentes en planes compatibles",
      "Registro e historial de pagos",
      "Cuotas y cargos de la academia",
      "Reportes básicos según el plan",
    ],
  },
  {
    id: "familias",
    icon: MessagesSquare,
    label: "Familias",
    pain: "Que cada familia encuentre la información que le corresponde.",
    result:
      "El portal familiar tiene un alcance limitado y muestra información publicada para ese vínculo.",
    items: [
      "Horarios y avisos publicados",
      "Cuotas y pagos disponibles para la familia",
      "Progreso que la academia ha publicado",
      "Mensajes y comunicación interna",
    ],
  },
  {
    id: "progreso",
    icon: Activity,
    label: "Progreso",
    pain: "Sigue la evolución deportiva con más contexto.",
    result:
      "Registra evaluaciones y consulta el historial de progreso por gimnasta.",
    items: [
      "Evaluaciones ligadas a sesión y modalidad",
      "Registro por aparato y evaluador",
      "Historial de progreso por gimnasta",
      "Salidas disponibles según el módulo",
    ],
  },
  {
    id: "eventos",
    icon: Trophy,
    label: "Eventos",
    pain: "Coordina inscripciones y plazas sin perder los detalles.",
    result:
      "Centraliza la información del evento, sus inscripciones y los avisos asociados.",
    items: [
      "Datos, fechas y requisitos del evento",
      "Inscripciones online según configuración",
      "Gestión de plazas y listas de espera",
      "Comunicación con participantes y equipo",
    ],
  },
];

export default function FeaturesSection() {
  const [activeFeature, setActiveFeature] = useState(features[0].id);

  return (
    <section className="bg-zaltyko-navy px-4 py-16 text-white sm:px-6 sm:py-24 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.15em] text-zaltyko-lime">
            Problemas concretos. Herramientas concretas.
          </p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Lo que necesitas para llevar el día a día de tu academia.
          </h2>
          <p className="mt-4 text-base leading-7 text-white/75 sm:text-lg">
            Empieza por el área que más trabajo te da. Consulta las funciones
            disponibles y el plan que las incluye.
          </p>
        </div>

        <Tabs value={activeFeature} onValueChange={setActiveFeature} className="w-full">
          <TabsList className="mb-8 flex h-auto flex-wrap justify-center gap-2 bg-transparent p-0">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <TabsTrigger
                  key={feature.id}
                  value={feature.id}
                  className="flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/80 transition data-[state=active]:border-zaltyko-lime data-[state=active]:bg-zaltyko-lime data-[state=active]:text-zaltyko-navy"
                >
                  <Icon aria-hidden="true" className="h-4 w-4" />
                  {feature.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {features.map((feature) => (
            <TabsContent key={feature.id} value={feature.id} className="mt-0">
              <article className="grid gap-8 rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-medium sm:p-9 lg:grid-cols-[0.82fr_1.18fr] lg:gap-12 lg:p-12">
                <div className="flex flex-col justify-between gap-8">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-wide text-zaltyko-lime">
                      {feature.label}
                    </p>
                    <h3 className="mt-4 font-display text-2xl font-bold leading-tight sm:text-3xl">
                      {feature.pain}
                    </h3>
                    <p className="mt-4 text-base leading-7 text-white/75">
                      {feature.result}
                    </p>
                  </div>
                  <p className="border-l-2 border-zaltyko-lime pl-4 text-sm leading-6 text-white/70">
                    Diseñado para la gestión de gimnasia artística y rítmica.
                  </p>
                </div>

                <ul className="grid content-center gap-3 sm:grid-cols-2">
                  {feature.items.map((item) => (
                    <li
                      key={item}
                      className="flex min-h-16 items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-white/90"
                    >
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zaltyko-lime text-zaltyko-navy">
                        <Check aria-hidden="true" className="h-3.5 w-3.5" />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  );
}
