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
  title: "Gestión de Clases y Horarios",
  description: "Organiza clases, horarios, capacidad, inscripciones y asistencia de tu academia desde el panel de gestión.",
  keywords: [
    "gestión de clases de gimnasia",
    "horarios gimnasia",
    "asistencia alumnos",
    "calendario academia gimnasia",
    "programación clases gimnasia",
    "software horarios gimnasio",
  ],
  openGraph: {
    title: "Gestión de Clases y Horarios",
    description: "Organiza clases, horarios, capacidad, inscripciones y asistencia de tu academia desde el panel de gestión.",
    type: "website",
  },
};

const MODULE_COLOR = "from-teal-500 to-emerald-600";

const problemContent = `La programación de clases en una academia de gimnasia es un rompecabezas constante. Debes coordinar grupos por edad, nivel técnico y modalidad, asignar entrenadores disponibles, respetar la capacidad de cada sala y gestionar las inevitables excepciones por festivos o eventos especiales. Cuando todo esto se maneja con hojas de cálculo o pizarras, los errores son frecuentes y costosos.

Las familias preguntan constantemente por horarios disponibles, y responder requiere revisar múltiples fuentes de información. Cuando hay cambios de última hora por ausencia de un entrenador o mantenimiento del gimnasio, comunicar a todas las familias afectadas se convierte en una carrera contra el tiempo. Los grupos se desbalancean porque no hay visibilidad clara de la ocupación real de cada clase.

El control de asistencia manual es propenso a errores y consume tiempo valioso que los entrenadores deberían dedicar a la enseñanza. Sin datos precisos de asistencia, es imposible identificar patrones de abandono o evaluar la popularidad real de cada horario.`;

const solutionContent = `El panel de gestión permite a la dirección organizar horarios y gestionar capacidad e inscripciones de cada clase.

La asignación de entrenadores con acceso propio está en preparación.

La dirección registra la asistencia de cada sesión y consulta las marcas guardadas.`;

const solutionFeatures = [
  "Programación de clases y sesiones",
  "Programación y capacidad gestionadas por la dirección",
  "Inscripciones administradas desde el panel de gestión",
  "Asignación de entrenadores con acceso propio en preparación",
  "Registro y consulta de asistencia por sesión",
];

const benefits = [
  {
    icon: Clock,
    title: "Organización de clases",
    description: "Gestiona la programación y capacidad de los grupos desde el panel.",
  },
  {
    icon: Users,
    title: "Capacidad e inscripciones",
    description: "Administra la capacidad de cada clase y sus inscripciones.",
  },
  {
    icon: TrendingUp,
    title: "Registro de asistencia",
    description: "Consulta las marcas de asistencia guardadas por sesión.",
  },
  {
    icon: CheckCircle,
    title: "Acceso de entrenadores",
    description: "El acceso y la asignación de entrenadores están en preparación.",
  },
];

const useCases = [
  {
    role: "Dirección",
    icon: GraduationCap,
    title: "Tu programación siempre clara",
    description: "Consulta la programación y registra la asistencia de cada sesión desde el panel de gestión.",
  },
  {
    role: "Administrativos",
    icon: Briefcase,
    title: "Gestión de inscripciones",
    description: "Administra las inscripciones y la capacidad de cada clase desde el panel de gestión.",
  },
  {
    role: "Dueños de academia",
    icon: Users,
    title: "Organiza tu programación",
    description: "Revisa las clases, la capacidad y las inscripciones de tu academia desde el panel de gestión.",
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
            description: "Módulo para organizar clases y sesiones, gestionar inscripciones y registrar asistencia.",
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
        subtitle="Organiza clases y sesiones desde el panel de gestión. Administra capacidad, inscripciones y asistencia."
        color={MODULE_COLOR}
      />

      <ProblemSection
        title="El desafío de coordinar clases sin herramientas adecuadas"
        content={problemContent}
        color={MODULE_COLOR}
      />

      <SolutionSection
        title="Clases y horarios para tu academia"
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
