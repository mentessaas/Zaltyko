import { Metadata } from "next";
import { Calendar, Clock, TrendingUp, CheckCircle, Users, Briefcase, GraduationCap } from "lucide-react";
import ModuleHero from "../components/ModuleHero";
import {
  ProblemSection,
  SolutionSection,
  BenefitsSection,
  UseCasesSection,
  ModuleCta,
} from "../components/ModuleSections";

export const metadata: Metadata = {
  title: "Gestión de Clases y Horarios | Zaltyko",
  description: "Organiza clases, horarios y asistencia de tu academia de gimnasia. Calendario visual con inscripciones automáticas y control de capacidad.",
  keywords: [
    "gestión de clases de gimnasia",
    "horarios deportivos",
    "asistencia alumnos",
    "calendario academia gimnasia",
    "programación clases deportivas",
    "software horarios gimnasio",
  ],
  openGraph: {
    title: "Gestión de Clases y Horarios | Zaltyko",
    description: "Organiza clases, horarios y asistencia de tu academia de gimnasia. Calendario visual con inscripciones automáticas.",
    type: "website",
  },
};

const MODULE_COLOR = "from-teal-500 to-emerald-600";

const problemContent = `La programación de clases en una academia de gimnasia es un rompecabezas constante. Debes coordinar grupos por edad, nivel técnico y modalidad, asignar entrenadores disponibles, respetar la capacidad de cada sala y gestionar las inevitables excepciones por festivos o eventos especiales. Cuando todo esto se maneja con hojas de cálculo o pizarras, los errores son frecuentes y costosos.

Las familias preguntan constantemente por horarios disponibles, y responder requiere revisar múltiples fuentes de información. Cuando hay cambios de última hora por ausencia de un entrenador o mantenimiento del gimnasio, comunicar a todas las familias afectadas se convierte en una carrera contra el tiempo. Los grupos se desbalancean porque no hay visibilidad clara de la ocupación real de cada clase.

El control de asistencia manual es propenso a errores y consume tiempo valioso que los entrenadores deberían dedicar a la enseñanza. Sin datos precisos de asistencia, es imposible identificar patrones de abandono o evaluar la popularidad real de cada horario.`;

const solutionContent = `El módulo de gestión de clases y horarios de Zaltyko transforma la organización de tu academia con un calendario visual intuitivo que muestra toda tu programación de un vistazo. Define horarios recurrentes por día de la semana y el sistema los replica automáticamente, permitiéndote gestionar excepciones puntuales sin afectar la programación base.

Cada clase tiene su configuración propia: capacidad máxima, rango de edades, nivel requerido y entrenador asignado. Cuando un grupo alcanza su límite, el sistema activa automáticamente una lista de espera ordenada. Si se libera una plaza, notifica al siguiente en la lista para que confirme su asistencia.

El control de asistencia es rápido y preciso. Los entrenadores marcan presencias desde cualquier dispositivo en segundos, generando automáticamente el historial de cada atleta. Los padres pueden justificar ausencias desde su portal, y el sistema te alerta sobre patrones de inasistencia que podrían indicar riesgo de abandono.`;

const solutionFeatures = [
  "Calendario visual con vistas diaria, semanal y mensual",
  "Clases recurrentes con gestión de excepciones para festivos",
  "Capacidad máxima por grupo con lista de espera automática",
  "Asignación de entrenadores y control de disponibilidad",
  "Control de asistencia digital desde cualquier dispositivo",
  "Notificaciones automáticas de cambios a familias afectadas",
];

const benefits = [
  {
    icon: Clock,
    title: "Organización instantánea",
    description: "Visualiza toda tu semana de clases y detecta conflictos antes de que ocurran.",
  },
  {
    icon: Users,
    title: "Grupos equilibrados",
    description: "Mantén el balance perfecto en cada clase con control automático de capacidad.",
  },
  {
    icon: TrendingUp,
    title: "Datos de asistencia",
    description: "Identifica patrones y optimiza horarios basándote en asistencia real.",
  },
  {
    icon: CheckCircle,
    title: "Comunicación eficiente",
    description: "Cambios de horario notificados automáticamente a las familias correctas.",
  },
];

const useCases = [
  {
    role: "Entrenadores",
    icon: GraduationCap,
    title: "Tu agenda siempre clara",
    description: "Consulta tu programación diaria, semanal o mensual desde tu móvil. Marca asistencias en segundos y accede a las fichas de los atletas presentes para adaptar la sesión según el grupo real del día.",
  },
  {
    role: "Administrativos",
    icon: Briefcase,
    title: "Gestión de inscripciones simplificada",
    description: "Asigna atletas a clases con un clic, gestiona cambios de grupo y maneja listas de espera sin llamadas ni correos. El sistema te muestra la disponibilidad real de cada horario al instante.",
  },
  {
    role: "Dueños de academia",
    icon: Users,
    title: "Optimiza tu oferta",
    description: "Analiza qué horarios tienen mayor demanda y cuáles están infrautilizados. Toma decisiones sobre apertura de nuevos grupos o redistribución de recursos basándote en datos reales de ocupación.",
  },
];

export default function ClasesHorariosPage() {
  return (
    <>
      {/* Schema.org markup */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Zaltyko - Clases y Horarios",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            description: "Módulo de gestión de clases y horarios para academias de gimnasia. Calendario visual, inscripciones y control de asistencia.",
            featureList: solutionFeatures,
            offers: {
              "@type": "Offer",
              price: "0",
              priceCurrency: "USD",
              description: "Prueba gratuita disponible",
            },
          }),
        }}
      />

      <ModuleHero
        icon={Calendar}
        title="Clases y Horarios"
        subtitle="Organiza la programación de tu academia con un calendario visual intuitivo. Gestiona grupos, capacidades, asistencia y cambios de horario sin complicaciones."
        color={MODULE_COLOR}
      />

      <ProblemSection
        title="El desafío de coordinar clases sin herramientas adecuadas"
        content={problemContent}
        color={MODULE_COLOR}
      />

      <SolutionSection
        title="Calendario inteligente para tu academia"
        content={solutionContent}
        features={solutionFeatures}
        color={MODULE_COLOR}
      />

      <BenefitsSection benefits={benefits} color={MODULE_COLOR} />

      <UseCasesSection useCases={useCases} color={MODULE_COLOR} />

      <ModuleCta />
    </>
  );
}

