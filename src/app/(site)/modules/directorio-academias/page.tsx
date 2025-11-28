import { Metadata } from "next";
import { Building2, Globe, TrendingUp, Search, Users, Briefcase, GraduationCap } from "lucide-react";
import ModuleHero from "../components/ModuleHero";
import {
  ProblemSection,
  SolutionSection,
  BenefitsSection,
  UseCasesSection,
  ModuleCta,
} from "../components/ModuleSections";

export const metadata: Metadata = {
  title: "Directorio de Academias de Gimnasia | Zaltyko",
  description: "Aumenta la visibilidad de tu club de gimnasia con un perfil público optimizado. Aparece en búsquedas locales y capta nuevos atletas.",
  keywords: [
    "directorio gimnasia",
    "academias por ciudad",
    "visibilidad clubes deportivos",
    "buscar academia gimnasia",
    "encontrar club gimnasia",
    "directorio clubes gimnasia artística",
  ],
  openGraph: {
    title: "Directorio de Academias de Gimnasia | Zaltyko",
    description: "Aumenta la visibilidad de tu club de gimnasia con un perfil público optimizado. Capta nuevos atletas.",
    type: "website",
  },
};

const MODULE_COLOR = "from-indigo-500 to-violet-600";

const problemContent = `Captar nuevos atletas es uno de los mayores desafíos para cualquier academia de gimnasia. Muchos padres buscan opciones online pero tu club no aparece en los resultados o aparece con información desactualizada. Tu presencia digital se limita quizás a una página de Facebook que actualizas cuando puedes o una web básica que no refleja la calidad de tu trabajo.

Los padres que buscan academias de gimnasia en su zona tienen pocas herramientas para comparar opciones. No encuentran fácilmente información sobre modalidades ofrecidas, horarios disponibles, niveles de enseñanza o ubicación exacta. Esta falta de información clara hace que muchos potenciales interesados abandonen la búsqueda o elijan competidores que sí tienen presencia online profesional.

El boca a boca sigue funcionando, pero depender exclusivamente de él limita tu crecimiento. Las academias que combinan recomendaciones personales con visibilidad online captan significativamente más atletas nuevos cada temporada.`;

const solutionContent = `El directorio público de Zaltyko te da presencia online profesional sin necesidad de construir ni mantener una web propia. Tu academia aparece en un directorio especializado en gimnasia que los padres consultan cuando buscan opciones en su zona. Un perfil completo con toda la información que necesitan para decidir.

Personaliza tu perfil con logo, fotos de instalaciones, descripción de tu proyecto educativo y todas las modalidades que ofreces: gimnasia artística, rítmica, acrobática, trampolín. Muestra tus horarios, rangos de edad atendidos, niveles disponibles y datos de contacto. Los interesados pueden enviarte consultas directamente desde tu perfil.

El directorio está optimizado para búsquedas locales. Cuando alguien busca academia de gimnasia en tu ciudad, tu perfil tiene posibilidades reales de aparecer gracias a la estructura SEO del directorio. Cada perfil incluye mapa de ubicación, facilitando que las familias cercanas te encuentren.`;

const solutionFeatures = [
  "Perfil público personalizable con logo y fotos",
  "Información completa: modalidades, horarios y niveles",
  "Formulario de contacto integrado para interesados",
  "Optimización SEO para búsquedas locales",
  "Mapa de ubicación para facilitar visitas",
  "Enlace compartible para redes sociales y WhatsApp",
];

const benefits = [
  {
    icon: Globe,
    title: "Visibilidad online inmediata",
    description: "Tu academia aparece en búsquedas sin necesidad de crear ni mantener una web propia.",
  },
  {
    icon: Search,
    title: "SEO optimizado",
    description: "Estructura técnica que favorece el posicionamiento en buscadores locales.",
  },
  {
    icon: TrendingUp,
    title: "Capta más atletas",
    description: "Formulario de contacto directo convierte visitantes interesados en consultas reales.",
  },
  {
    icon: Building2,
    title: "Imagen profesional",
    description: "Un perfil bien presentado transmite la calidad de tu academia antes de la primera visita.",
  },
];

const useCases = [
  {
    role: "Entrenadores",
    icon: GraduationCap,
    title: "Muestra tu experiencia",
    description: "Tu perfil incluye información sobre el equipo técnico de la academia. Los padres valoran conocer la experiencia y formación de quienes entrenarán a sus hijos antes de visitarte.",
  },
  {
    role: "Administrativos",
    icon: Briefcase,
    title: "Gestiona consultas de interesados",
    description: "Recibe y responde consultas de familias interesadas directamente desde el panel de Zaltyko. Convierte más consultas en visitas y más visitas en inscripciones con seguimiento organizado.",
  },
  {
    role: "Dueños de academia",
    icon: Users,
    title: "Posiciona tu marca",
    description: "Diferencia tu academia de la competencia con un perfil que comunique tus valores, metodología y logros. El directorio especializado te posiciona como opción seria frente a alternativas genéricas.",
  },
];

export default function DirectorioAcademiasPage() {
  return (
    <>
      {/* Schema.org markup */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Zaltyko - Directorio de Academias",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            description: "Directorio público de academias de gimnasia. Aumenta tu visibilidad online y capta nuevos atletas.",
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
        icon={Building2}
        title="Directorio Público de Academias"
        subtitle="Aumenta la visibilidad de tu club con un perfil profesional en el directorio de academias de gimnasia. Capta nuevos atletas con presencia online optimizada."
        color={MODULE_COLOR}
      />

      <ProblemSection
        title="La dificultad de captar nuevos atletas sin presencia online"
        content={problemContent}
        color={MODULE_COLOR}
      />

      <SolutionSection
        title="Tu academia visible para familias que buscan gimnasia"
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

