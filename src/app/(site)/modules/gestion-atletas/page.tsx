import { Metadata } from "next";
import { Users, Clock, TrendingUp, Shield, Briefcase, GraduationCap } from "lucide-react";
import ModuleHero from "../components/ModuleHero";
import {
  ProblemSection,
  SolutionSection,
  BenefitsSection,
  UseCasesSection,
  ModuleCta,
} from "../components/ModuleSections";

export const metadata: Metadata = {
  title: "Gestión de Atletas para Gimnasia | Zaltyko",
  description: "Centraliza fichas de atletas, niveles técnicos y progresiones. Software especializado para academias de gimnasia artística y rítmica.",
  keywords: [
    "software gestión de atletas",
    "niveles de gimnasia",
    "seguimiento progresiones",
    "ficha de atleta",
    "gestión de gimnastas",
    "software gimnasia artística",
  ],
  openGraph: {
    title: "Gestión de Atletas para Gimnasia | Zaltyko",
    description: "Centraliza fichas de atletas, niveles técnicos y progresiones. Software especializado para academias de gimnasia.",
    type: "website",
  },
};

const MODULE_COLOR = "from-violet-500 to-purple-600";

const problemContent = `Administrar la información de decenas o cientos de gimnastas sin un sistema centralizado es un desafío constante para cualquier academia de gimnasia. Los datos personales se dispersan entre hojas de cálculo, libretas de entrenadores y grupos de mensajería. Cuando un padre solicita información sobre el progreso de su hijo, encontrar los datos actualizados puede tomar minutos valiosos que podrían dedicarse a entrenar.

El seguimiento de niveles técnicos por aparato se complica cuando cada entrenador mantiene sus propios registros. Las fichas médicas se pierden o quedan desactualizadas, generando riesgos innecesarios durante las sesiones de entrenamiento. La documentación importante como permisos de imagen, certificados médicos y autorizaciones de viaje se acumula en carpetas físicas difíciles de organizar y consultar.

Esta fragmentación de información afecta directamente la calidad del servicio que ofrece tu academia y la confianza de las familias en tu gestión profesional.`;

const solutionContent = `Zaltyko transforma la gestión de atletas en un proceso fluido y profesional. Nuestro módulo de fichas de atletas centraliza toda la información relevante de cada gimnasta en un perfil digital completo y siempre actualizado. Desde datos de contacto de emergencia hasta historial de lesiones, todo está a un clic de distancia para entrenadores y administrativos autorizados.

El sistema de seguimiento de progresiones te permite registrar los niveles técnicos de cada atleta en los diferentes aparatos de gimnasia artística, rítmica o acrobática. Los entrenadores pueden actualizar evaluaciones después de cada sesión, creando un historial detallado que facilita la planificación del entrenamiento personalizado y la comunicación con las familias sobre el desarrollo deportivo de sus hijos.

La digitalización de documentos elimina el caos de las carpetas físicas. Sube permisos, certificados médicos y autorizaciones directamente al perfil del atleta. El sistema te alerta cuando un documento está por vencer, asegurando que tu academia siempre cumpla con los requisitos legales y federativos.`;

const solutionFeatures = [
  "Fichas completas con datos personales, contactos de emergencia y fotografía",
  "Seguimiento de nivel técnico por aparato y categoría competitiva",
  "Historial médico con registro de lesiones y condiciones especiales",
  "Almacenamiento digital de documentos con alertas de vencimiento",
  "Importación masiva desde Excel o CSV para migrar datos existentes",
  "Búsqueda y filtrado avanzado por grupo, nivel o entrenador asignado",
];

const benefits = [
  {
    icon: Clock,
    title: "Ahorra 5+ horas semanales",
    description: "Elimina la búsqueda manual de información dispersa en diferentes sistemas y documentos.",
  },
  {
    icon: Shield,
    title: "Cumplimiento garantizado",
    description: "Alertas automáticas para documentos vencidos y requisitos federativos pendientes.",
  },
  {
    icon: TrendingUp,
    title: "Mejor seguimiento",
    description: "Historial detallado de progresiones que facilita la planificación del entrenamiento.",
  },
  {
    icon: Users,
    title: "Confianza familiar",
    description: "Demuestra profesionalismo con información organizada y accesible cuando la necesiten.",
  },
];

const useCases = [
  {
    role: "Entrenadores",
    icon: GraduationCap,
    title: "Conoce a cada gimnasta",
    description: "Accede rápidamente a las fichas de tus atletas antes de cada sesión. Consulta su nivel técnico actual, condiciones médicas a considerar y notas de entrenamientos anteriores para personalizar tu plan de trabajo.",
  },
  {
    role: "Administrativos",
    icon: Briefcase,
    title: "Gestión documental eficiente",
    description: "Mantén toda la documentación al día sin perseguir a las familias. El sistema te alerta sobre certificados médicos por vencer y permisos pendientes, permitiéndote actuar proactivamente.",
  },
  {
    role: "Dueños de academia",
    icon: Users,
    title: "Visión completa del club",
    description: "Obtén estadísticas sobre la composición de tu academia: distribución por niveles, edades, modalidades y entrenadores. Información valiosa para la toma de decisiones estratégicas.",
  },
];

export default function GestionAtletasPage() {
  return (
    <>
      {/* Schema.org markup */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Zaltyko - Gestión de Atletas",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            description: "Módulo de gestión de atletas para academias de gimnasia. Centraliza fichas, niveles técnicos y documentación.",
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
        icon={Users}
        title="Gestión de Atletas"
        subtitle="Centraliza toda la información de tus gimnastas en fichas digitales completas. Seguimiento de niveles, historial médico y documentación en un solo lugar."
        color={MODULE_COLOR}
      />

      <ProblemSection
        title="El caos de gestionar información de atletas sin sistema"
        content={problemContent}
        color={MODULE_COLOR}
      />

      <SolutionSection
        title="Fichas digitales completas para cada gimnasta"
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

