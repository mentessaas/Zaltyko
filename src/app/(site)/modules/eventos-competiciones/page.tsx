import { Metadata } from "next";
import { Trophy, Clock, TrendingUp, CheckCircle, Users, Briefcase, GraduationCap } from "lucide-react";
import ModuleHero from "../components/ModuleHero";
import {
  ProblemSection,
  SolutionSection,
  BenefitsSection,
  UseCasesSection,
  ModuleCta,
} from "../components/ModuleSections";

export const metadata: Metadata = {
  title: "Gestión de Competiciones de Gimnasia",
  description: "Organiza inscripciones a competiciones de gimnasia artística y rítmica. Selección de gimnastas, cuotas de participación y comunicación con familias.",
  keywords: [
    "inscripciones a competiciones",
    "gestión de competiciones de gimnasia",
    "torneos de gimnasia",
    "competiciones gimnasia artística",
    "software competiciones gimnasia",
    "inscripción gimnastas competiciones",
  ],
  openGraph: {
    title: "Gestión de Competiciones de Gimnasia",
    description: "Organiza inscripciones a competiciones de gimnasia. Gestión completa de la participación de gimnastas.",
    type: "website",
  },
};

const MODULE_COLOR = "from-zaltyko-indigo to-zaltyko-teal";

const problemContent = `Las competiciones son el corazón de la gimnasia competitiva, pero organizarlas genera un caos administrativo significativo. Cada evento requiere identificar gimnastas elegibles por categoría y nivel, comunicar a las familias, recoger confirmaciones de asistencia, gestionar el cobro de cuotas de inscripción y preparar la documentación requerida por federaciones y organizadores.

Cuando gestionas múltiples competiciones al año con decenas de gimnastas, el volumen de información se vuelve inmanejable. Las hojas de cálculo se multiplican, los correos se pierden y las confirmaciones de última hora generan estrés innecesario. Un error en la inscripción puede significar que un atleta no pueda competir después de meses de preparación.

La comunicación con las familias durante la temporada de competiciones es particularmente desafiante. Cada evento tiene sus propios requisitos: horarios de competición, vestimenta requerida, ubicación, necesidad de jueces voluntarios. Transmitir toda esta información de forma clara y oportuna a cada familia afectada requiere un esfuerzo considerable.`;

const solutionContent = `El módulo de eventos y competiciones de Zaltyko centraliza toda la gestión competitiva de tu academia. Crea eventos con fechas, ubicaciones, categorías disponibles y requisitos de inscripción. El sistema identifica qué gimnastas son elegibles para cada categoría según su nivel, edad y modalidad registrados en su ficha.

El proceso de inscripción se simplifica tanto para ti como para las familias. Publica el evento y las familias de gimnastas elegibles reciben una notificación para confirmar participación. El cobro de la cuota de inscripción se gestiona junto con la confirmación. Tú solo supervisas el proceso y gestionas las excepciones.

Exporta los datos disponibles para preparar listados y revisa con tu equipo cualquier requisito federativo específico. Antes del evento, envía comunicaciones a las familias participantes. Después, registra los resultados que quieras conservar en el historial competitivo de cada atleta.`;

const solutionFeatures = [
  "Calendario de competiciones con fechas límite de inscripción",
  "Identificación de gimnastas elegibles por categoría",
  "Inscripción online con cobro de cuotas integrado",
  "Exportación operativa para revisión y entrega acompañada",
  "Comunicación masiva a familias participantes",
  "Registro de resultados e historial competitivo",
];

const benefits = [
  {
    icon: Clock,
    title: "Inscripciones en minutos",
    description: "Elimina el proceso manual de recoger confirmaciones familia por familia.",
  },
  {
    icon: CheckCircle,
    title: "Revisión de elegibilidad",
    description: "Revisa la información de cada atleta y valida la elegibilidad antes de confirmar la inscripción.",
  },
  {
    icon: TrendingUp,
    title: "Historial competitivo",
    description: "Mantén un registro completo de participaciones y resultados de cada gimnasta.",
  },
  {
    icon: Trophy,
    title: "Documentación revisable",
    description: "Prepara exportaciones con los datos disponibles y revisa el formato antes de enviarlas.",
  },
];

const useCases = [
  {
    role: "Entrenadores",
    icon: GraduationCap,
    title: "Planifica la temporada competitiva",
    description: "Visualiza el calendario de competiciones y selecciona qué gimnastas participarán en cada evento según su preparación. Consulta el historial competitivo para tomar decisiones informadas sobre la progresión de cada gimnasta.",
  },
  {
    role: "Administrativos",
    icon: Briefcase,
    title: "Gestión de inscripciones sin estrés",
    description: "Supervisa el estado de confirmaciones, gestiona cobros de cuotas de participación y prepara la documentación disponible para revisión. Todo centralizado sin perseguir familias por teléfono.",
  },
  {
    role: "Dueños de academia",
    icon: Users,
    title: "Imagen profesional del club",
    description: "Presenta tu academia de forma profesional en cada competición. Comunicaciones claras, inscripciones revisables y documentación disponible refuerzan la organización de tu club.",
  },
];

export default function EventosCompeticionesPage() {
  return (
    <>
      {/* Schema.org markup */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Zaltyko - Eventos y Competiciones",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            description: "Módulo de gestión de competiciones para academias de gimnasia. Inscripciones, cuotas y comunicación con familias.",
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
        icon={Trophy}
        title="Eventos y Competiciones"
        subtitle="Gestiona la participación de tus gimnastas en competiciones. Inscripciones, cobros, documentación federativa y comunicación con familias en un solo lugar."
        color={MODULE_COLOR}
      />

      <ProblemSection
        title="El caos de organizar competiciones manualmente"
        content={problemContent}
        color={MODULE_COLOR}
      />

      <SolutionSection
        title="Gestión competitiva profesional"
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
