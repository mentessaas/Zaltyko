type StepContent = {
  heading: string;
  description: string;
  sectionTitle: string;
  sectionDescription: string;
  recommendations: string[];
};

type StepMap = Record<1 | 2 | 3 | 4 | 5, StepContent>;

export const ACADEMY_TYPES = [
  { value: "artistica", label: "Gimnasia artística" },
  { value: "ritmica", label: "Gimnasia rítmica" },
  { value: "trampolin", label: "Trampolín" },
  { value: "general", label: "General / Mixta" },
] as const;

type AcademyType = (typeof ACADEMY_TYPES)[number]["value"];

const buildCopy = (options: {
  heading: string[];
  description: string[];
  sectionTitle: string[];
  sectionDescription: string[];
  recommendations: string[][];
}): StepMap => {
  return {
    1: {
      heading: options.heading[0],
      description: options.description[0],
      sectionTitle: options.sectionTitle[0],
      sectionDescription: options.sectionDescription[0],
      recommendations: options.recommendations[0],
    },
    2: {
      heading: options.heading[1],
      description: options.description[1],
      sectionTitle: options.sectionTitle[1],
      sectionDescription: options.sectionDescription[1],
      recommendations: options.recommendations[1],
    },
    3: {
      heading: options.heading[2],
      description: options.description[2],
      sectionTitle: options.sectionTitle[2],
      sectionDescription: options.sectionDescription[2],
      recommendations: options.recommendations[2],
    },
    4: {
      heading: options.heading[3],
      description: options.description[3],
      sectionTitle: options.sectionTitle[3],
      sectionDescription: options.sectionDescription[3],
      recommendations: options.recommendations[3],
    },
    5: {
      heading: options.heading[4],
      description: options.description[4],
      sectionTitle: options.sectionTitle[4],
      sectionDescription: options.sectionDescription[4],
      recommendations: options.recommendations[4],
    },
  };
};

export const onboardingCopy: Record<AcademyType, { steps: StepMap }> = {
  artistica: {
    steps: buildCopy({
      heading: [
        "Paso 1 · Crea la cuenta principal de tu academia artística",
        "Paso 2 · Describe la identidad de tu academia artística",
      ],
      description: [
        "Establece un acceso seguro para ti o la persona responsable de la academia. Este usuario será quien gestione toda la configuración inicial.",
        "Detalla los datos básicos de la academia. Podrás completar el resto de la configuración desde tu dashboard.",
      ],
      sectionTitle: [
        "Credenciales del usuario propietario",
        "Datos esenciales de la academia",
      ],
      sectionDescription: [
        "Esta cuenta tendrá permisos de propietario. Usa un correo activo y una contraseña segura.",
        "Indica el nombre comercial, ubicación y disciplina principal. Podrás añadir entrenadores, atletas y configurar pagos desde tu dashboard.",
      ],
      recommendations: [
        [
          "Utiliza un correo que revises a diario para recibir alertas y notificaciones.",
          "Define una contraseña única para Zaltyko y guárdala en tu gestor de contraseñas.",
          "Si guardas tu cuenta en equipo compartido, recuerda cerrar sesión al finalizar.",
        ],
        [
          "Incluye el nombre como aparece en tu material promocional.",
          "Añade ciudad para activar reportes locales (opcional).",
          "Selecciona el tipo artístico para personalizar dashboards de aparatos.",
          "Después de crear tu academia, verás un checklist en el dashboard para completar la configuración.",
        ],
      ],
    }),
  },
  ritmica: {
    steps: buildCopy({
      heading: [
        "Paso 1 · Crea la cuenta líder de tu academia rítmica",
        "Paso 2 · Define la esencia de tu academia rítmica",
      ],
      description: [
        "Genera las credenciales iniciales para administrar grupos, rutinas y calendarios de eventos.",
        "Completa la información básica de la academia. Podrás añadir entrenadoras, gimnastas y configurar pagos desde tu dashboard.",
      ],
      sectionTitle: [
        "Cuenta principal",
        "Identidad de la academia",
      ],
      sectionDescription: [
        "Será la cuenta con mayor acceso. Usa datos reales y seguros.",
        "Tu información alimentará reportes, estadísticas y comunicación externa. Podrás completar el resto desde el dashboard.",
      ],
      recommendations: [
        [
          "Elige un correo que consultes con frecuencia; enviaremos alertas clave.",
          "Revisa que la contraseña cumpla políticas de seguridad internas.",
          "Activa la autenticación de dos factores desde tu perfil cuando esté disponible.",
        ],
        [
          "Incluye el nombre como aparece en tu material promocional.",
          "Añade ciudad para activar reportes locales (opcional).",
          "Selecciona disciplina rítmica para habilitar plantillas de música y coreografía.",
          "Después de crear tu academia, verás un checklist en el dashboard para completar la configuración.",
        ],
      ],
    }),
  },
  trampolin: {
    steps: buildCopy({
      heading: [
        "Paso 1 · Configura la cuenta administradora de trampolín",
        "Paso 2 · Describe tu centro de trampolín",
      ],
      description: [
        "Crea el acceso principal para gestionar turnos, seguridad y progresiones técnicas.",
        "Completa los datos básicos del centro. Podrás añadir entrenadores, atletas y configurar pagos desde tu dashboard.",
      ],
      sectionTitle: [
        "Cuenta administradora",
        "Información del centro",
      ],
      sectionDescription: [
        "Define quién gestiona la plataforma diariamente. Usa credenciales seguras.",
        "Estos datos se mostrarán en dashboards y comunicaciones. Podrás completar el resto desde el dashboard.",
      ],
      recommendations: [
        [
          "Usa un correo institucional para conservar el historial de la academia.",
          "Documenta la contraseña en un gestor seguro.",
          "Configura acceso para co-directores desde Invitar usuarios después del onboarding.",
        ],
        [
          "Incluye el nombre como aparece en tu material promocional.",
          "Añade ciudad para activar reportes locales (opcional).",
          "Selecciona trampolín como disciplina para desbloquear métricas específicas.",
          "Después de crear tu academia, verás un checklist en el dashboard para completar la configuración.",
        ],
      ],
    }),
  },
  general: {
    steps: buildCopy({
      heading: [
        "Paso 1 · Crea la cuenta responsable de tu academia multideportiva",
        "Paso 2 · Presenta tu academia general o mixta",
      ],
      description: [
        "Configura el acceso principal para gestionar tus clases recreativas o de formación básica.",
        "Completa los datos básicos de la academia. Podrás añadir instructores, alumnos y configurar pagos desde tu dashboard.",
      ],
      sectionTitle: [
        "Cuenta principal",
        "Datos de la academia",
      ],
      sectionDescription: [
        "Será quien configure todo el entorno; usa datos reales y seguros.",
        "Estos datos aparecerán en comunicaciones y dashboards internos. Podrás completar el resto desde el dashboard.",
      ],
      recommendations: [
        [
          "Usa un correo empresarial o uno compartido por el equipo directivo.",
          "La contraseña debe ser única para mantener la seguridad de tu academia.",
          "Guarda un contacto alternativo para recuperación desde tu perfil luego.",
        ],
        [
          "Incluye el nombre como aparece en tu material promocional.",
          "Añade ciudad para activar reportes locales (opcional).",
          "Selecciona disciplina general para obtener recomendaciones mixtas.",
          "Después de crear tu academia, verás un checklist en el dashboard para completar la configuración.",
        ],
      ],
    }),
  },
};

