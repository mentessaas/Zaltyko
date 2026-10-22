import { Metadata } from "next";
import { MessageSquare, Clock, Shield, Bell, Users, Briefcase, GraduationCap } from "lucide-react";
import ModuleHero from "../components/ModuleHero";
import {
  ProblemSection,
  SolutionSection,
  BenefitsSection,
  UseCasesSection,
  ModuleCta,
} from "../components/ModuleSections";

export const metadata: Metadata = {
  title: "Comunicación con Padres y Staff",
  description: "Centraliza la comunicación de tu academia de gimnasia. Notificaciones a padres, mensajes al staff y comunicados oficiales sin depender de WhatsApp.",
  keywords: [
    "notificaciones a padres",
    "comunicación interna academias",
    "mensajes familias gimnasia",
    "comunicación familias gimnasia",
    "software comunicación clubes",
    "notificaciones academia gimnasia",
  ],
  openGraph: {
    title: "Comunicación con Padres y Staff",
    description: "Centraliza la comunicación de tu academia de gimnasia. Notificaciones a padres y staff sin depender de WhatsApp.",
    type: "website",
  },
};

const MODULE_COLOR = "from-sky-500 to-blue-600";

const problemContent = `La comunicación en una academia de gimnasia es un desafío constante que consume tiempo y genera frustración. Los grupos de WhatsApp empiezan como solución práctica pero rápidamente se convierten en un problema: mensajes importantes se pierden entre conversaciones triviales, los padres envían consultas a cualquier hora, y mantener múltiples grupos por clase o nivel es insostenible.

Cuando necesitas comunicar un cambio de horario, una cancelación por festivo o información sobre una competición, debes repetir el mismo mensaje en varios canales. Algunos padres no leen los grupos, otros no tienen WhatsApp, y siempre hay quien dice no haberse enterado. La falta de un canal oficial genera confusión y desconfianza.

La comunicación interna con entrenadores y staff también se complica. Las instrucciones se transmiten verbalmente y se olvidan, los cambios de programación no llegan a tiempo, y coordinar un equipo grande sin herramientas adecuadas genera fricción innecesaria. Todo esto mientras intentas mantener una imagen profesional ante las familias.`;

const solutionContent = `El módulo de comunicación de Zaltyko te devuelve el control sobre los mensajes de tu academia. Un centro de notificaciones unificado te permite preparar y enviar comunicados oficiales a las familias correctas según el grupo, nivel o situación de cada atleta. Sin ruido, sin conversaciones paralelas y con un historial consultable.

Segmenta tus comunicaciones por los grupos y destinatarios disponibles. Envía un aviso al grupo de competición, notifica un cambio de horario a las personas afectadas o comunica una novedad general a toda la academia. El sistema conserva el estado disponible del mensaje; la recepción efectiva depende del canal y de la configuración de cada cuenta.

Los avisos pueden apoyarse en el centro de mensajes y, cuando estén configurados, en email o notificaciones. El portal deja una referencia consultable para las familias. Para comunicaciones sensibles, puedes solicitar una confirmación cuando el flujo contratado lo contemple.`;

const solutionFeatures = [
  "Centro de notificaciones unificado y profesional",
  "Segmentación por grupo, nivel, entrenador o situación",
  "Historial completo de comunicaciones por atleta",
  "Centro de mensajes e historial consultable",
  "Confirmación de lectura cuando el flujo la contemple",
  "Plantillas personalizables para comunicados frecuentes",
];

const benefits = [
  {
    icon: Clock,
    title: "Comunica en segundos",
    description: "Un solo mensaje se prepara para las familias seleccionadas sin repetirlo en múltiples grupos.",
  },
  {
    icon: Shield,
    title: "Control total del mensaje",
    description: "Tú decides qué se comunica, a quién y cuándo. Sin ruido ni conversaciones paralelas.",
  },
  {
    icon: Bell,
    title: "Seguimiento más claro",
    description: "El historial y los estados disponibles ayudan a comprobar el seguimiento de la información.",
  },
  {
    icon: MessageSquare,
    title: "Imagen profesional",
    description: "Comunicaciones oficiales refuerzan la percepción de organización y seriedad.",
  },
];

const useCases = [
  {
    role: "Entrenadores",
    icon: GraduationCap,
    title: "Comunica con tu grupo",
    description: "Envía mensajes directos a las familias de tus gimnastas cuando necesites informar sobre el entrenamiento, recordar material específico o comunicar observaciones sobre el progreso técnico.",
  },
  {
    role: "Administrativos",
    icon: Briefcase,
    title: "Gestiona comunicados oficiales",
    description: "Programa y envía comunicaciones de la academia: cierres por festivos, cambios de política, información sobre eventos. Usa plantillas para mensajes recurrentes y ahorra tiempo en cada comunicado.",
  },
  {
    role: "Dueños de academia",
    icon: Users,
    title: "Supervisa todas las comunicaciones",
    description: "Accede al historial completo de mensajes enviados y recibidos. Asegúrate de que la comunicación de tu academia mantiene el tono profesional que deseas proyectar a las familias.",
  },
];

export default function ComunicacionPage() {
  return (
    <>
      {/* Schema.org markup */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Zaltyko - Comunicación",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            description: "Módulo de comunicación para academias de gimnasia. Notificaciones a padres y staff de forma profesional.",
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
        icon={MessageSquare}
        title="Comunicación con Padres y Staff"
        subtitle="Centraliza todas las comunicaciones de tu academia en un canal profesional. Notificaciones segmentadas, historial completo y confirmación de lectura."
        color={MODULE_COLOR}
      />

      <ProblemSection
        title="El caos de comunicar por WhatsApp y múltiples canales"
        content={problemContent}
        color={MODULE_COLOR}
      />

      <SolutionSection
        title="Un canal oficial para tu academia"
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
