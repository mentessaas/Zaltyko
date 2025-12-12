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
  title: "Gestión de Competiciones de Gimnasia | Zaltyko",
  description: "Organiza inscripciones a competiciones, torneos y eventos deportivos. Selección de atletas, cuotas de participación y comunicación con familias.",
  keywords: [
    "inscripciones a competiciones",
    "gestión de eventos deportivos",
    "torneos de gimnasia",
    "competiciones gimnasia artística",
    "software eventos deportivos",
    "inscripción atletas competiciones",
  ],
  openGraph: {
    title: "Gestión de Competiciones de Gimnasia | Zaltyko",
    description: "Organiza inscripciones a competiciones, torneos y eventos deportivos. Gestión completa de la participación de atletas.",
    type: "website",
  },
};

const MODULE_COLOR = "from-rose-500 to-pink-600";

const problemContent = `Las competiciones son el corazón de la gimnasia competitiva, pero organizarlas genera un caos administrativo significativo. Cada evento requiere identificar atletas elegibles por categoría y nivel, comunicar a las familias, recoger confirmaciones de asistencia, gestionar el cobro de cuotas de inscripción y preparar la documentación requerida por federaciones y organizadores.

Cuando gestionas múltiples competiciones al año con decenas de gimnastas, el volumen de información se vuelve inmanejable. Las hojas de cálculo se multiplican, los correos se pierden y las confirmaciones de última hora generan estrés innecesario. Un error en la inscripción puede significar que un atleta no pueda competir después de meses de preparación.

La comunicación con las familias durante la temporada de competiciones es particularmente desafiante. Cada evento tiene sus propios requisitos: horarios de competición, vestimenta requerida, ubicación, necesidad de jueces voluntarios. Transmitir toda esta información de forma clara y oportuna a cada familia afectada requiere un esfuerzo considerable.`;

const solutionContent = `El módulo de eventos y competiciones de Zaltyko centraliza toda la gestión competitiva de tu academia. Crea eventos con fechas, ubicaciones, categorías disponibles y requisitos de inscripción. El sistema identifica automáticamente qué atletas son elegibles para cada categoría según su nivel, edad y modalidad registrados en su ficha.

El proceso de inscripción se simplifica tanto para ti como para las familias. Publica el evento y los padres de atletas elegibles reciben una notificación para confirmar participación. El cobro de la cuota de inscripción se gestiona automáticamente junto con la confirmación. Tú solo supervisas el proceso y gestionas las excepciones.

Genera listados oficiales para federaciones con un clic, incluyendo toda la información requerida: nombres completos, fechas de nacimiento, números de licencia y categorías de competición. Antes del evento, envía comunicaciones masivas con información logística a todas las familias participantes. Después, registra resultados para mantener el historial competitivo de cada atleta.`;

const solutionFeatures = [
  "Calendario de competiciones con fechas límite de inscripción",
  "Identificación automática de atletas elegibles por categoría",
  "Inscripción online con cobro de cuotas integrado",
  "Generación de listados oficiales para federaciones",
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
    title: "Cero errores de elegibilidad",
    description: "El sistema valida automáticamente que cada atleta cumple los requisitos.",
  },
  {
    icon: TrendingUp,
    title: "Historial competitivo",
    description: "Mantén un registro completo de participaciones y resultados de cada gimnasta.",
  },
  {
    icon: Trophy,
    title: "Documentación perfecta",
    description: "Genera listados federativos con formato correcto sin errores de transcripción.",
  },
];

const useCases = [
  {
    role: "Entrenadores",
    icon: GraduationCap,
    title: "Planifica la temporada competitiva",
    description: "Visualiza el calendario de competiciones y selecciona qué atletas participarán en cada evento según su preparación. Consulta el historial competitivo para tomar decisiones informadas sobre la progresión de cada gimnasta.",
  },
  {
    role: "Administrativos",
    icon: Briefcase,
    title: "Gestión de inscripciones sin estrés",
    description: "Supervisa el estado de confirmaciones en tiempo real, gestiona cobros de cuotas de participación y genera la documentación requerida por federaciones. Todo centralizado sin perseguir familias por teléfono.",
  },
  {
    role: "Dueños de academia",
    icon: Users,
    title: "Imagen profesional del club",
    description: "Presenta tu academia de forma profesional en cada competición. Comunicaciones claras con las familias, inscripciones sin errores y documentación impecable refuerzan la reputación de tu club.",
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
        subtitle="Gestiona la participación de tus atletas en competiciones y torneos. Inscripciones, cobros, documentación federativa y comunicación con familias en un solo lugar."
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

