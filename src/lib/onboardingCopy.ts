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
        "Paso 3 · Vincula a tus entrenadores de aparatos",
        "Paso 4 · Registra a tus gimnastas base",
        "Paso 5 · Selecciona el plan que mejor acompaña tu progresión",
      ],
      description: [
        "Establece un acceso seguro para ti o la persona responsable de la academia. Este usuario será quien gestione toda la configuración inicial.",
        "Detalla los datos de la academia para personalizar paneles, reportes y comunicación con atletas y familias.",
        "Invita a tu staff para que acceda a horarios, asistencia y programaciones de aparatos (suelo, salto, viga, barras asimétricas, etc.).",
        "Añade atletas para comenzar a registrar avances técnicos, rutinas y evaluaciones por nivel FIG.",
        "Escoge el plan ideal para tus necesidades actuales. Siempre podrás cambiarlo si tu academia crece.",
      ],
      sectionTitle: [
        "Credenciales del usuario propietario",
        "Datos esenciales de la academia",
        "Entrenadores y especialistas",
        "Primer grupo de gimnastas",
        "Plan de suscripción",
      ],
      sectionDescription: [
        "Esta cuenta tendrá permisos de propietario. Usa un correo activo y una contraseña segura.",
        "Indica el nombre comercial, ubicación y disciplina principal para adaptar la experiencia.",
        "Comparte acceso con quienes dirigen cada aparato o nivel para que colaboren desde el primer día.",
        "Crea un pequeño roster inicial; podrás importar más gimnastas más adelante.",
        "Revisa beneficios y limita tu coste según el tamaño actual de tu academia.",
      ],
      recommendations: [
        [
          "Utiliza un correo que revises a diario para recibir alertas y notificaciones.",
          "Define una contraseña única para Zaltyko y guárdala en tu gestor de contraseñas.",
          "Si guardas tu cuenta en equipo compartido, recuerda cerrar sesión al finalizar.",
        ],
        [
          "Incluye el nombre como aparece en tu material promocional.",
          "Añade provincia o ciudad para activar reportes locales.",
          "Selecciona el tipo artístico para personalizar dashboards de aparatos.",
        ],
        [
          "Añade al menos un entrenador por aparato para repartir responsabilidades.",
          "Invita con correos corporativos cuando sea posible.",
          "Aclara roles para saber quién gestiona cada nivel o turno.",
        ],
        [
          "Registra atletas por nivel FIG o edad para tus primeras planificaciones.",
          "Incluye sus nombres reales para sincronizar reportes y asistencia.",
          "Puedes saltar este paso, pero recomendamos registrar algunos perfiles de referencia.",
        ],
        [
          "Confirma que la cantidad de atletas incluida cubre tu plantilla actual.",
          "Activa el plan Free mientras evalúas la plataforma; no tiene coste.",
          "Programa un recordatorio mensual para revisar si necesitas escalar de plan.",
        ],
      ],
    }),
  },
  ritmica: {
    steps: buildCopy({
      heading: [
        "Paso 1 · Crea la cuenta líder de tu academia rítmica",
        "Paso 2 · Define la esencia de tu academia rítmica",
        "Paso 3 · Suma a tus entrenadoras y coreógrafas",
        "Paso 4 · Registra a tus gimnastas de cinta, aro y mazas",
        "Paso 5 · Elige el plan ideal para tus galas y competencias",
      ],
      description: [
        "Genera las credenciales iniciales para administrar grupos, rutinas y calendarios de eventos.",
        "Completa la información institucional para alinear comunicación con familias y equipos.",
        "Invita al staff técnico y creativo para trabajar las coreografías y sus horarios.",
        "Añade a las gimnastas que entrenan actualmente para seguir sus progresos y aparatos favoritos.",
        "Selecciona el plan que acompañe tus temporadas de torneos y exhibiciones.",
      ],
      sectionTitle: [
        "Cuenta principal",
        "Identidad de la academia",
        "Equipo técnico y artístico",
        "Gimnastas iniciales",
        "Plan de trabajo",
      ],
      sectionDescription: [
        "Será la cuenta con mayor acceso. Usa datos reales y seguros.",
        "Tu información alimentará reportes, estadísticas y comunicación externa.",
        "Comparte acceso con quienes construyen coreografías y gestionan entrenamiento.",
        "Crea registros base para empezar a trackear rutinas y materiales por aparato.",
        "Evalúa ventajas de cada plan según tus campeonatos y número de atletas.",
      ],
      recommendations: [
        [
          "Elige un correo que consultes con frecuencia; enviaremos alertas clave.",
          "Revisa que la contraseña cumpla políticas de seguridad internas.",
          "Activa la autenticación de dos factores desde tu perfil cuando esté disponible.",
        ],
        [
          "Incluye contactos para coordinación con familias y jueces.",
          "Selecciona disciplina rítmica para habilitar plantillas de música y coreografía.",
          "Añade la región donde compites con más frecuencia.",
        ],
        [
          "Invita a entrenadoras principales y asistentes para cubrir vacaciones.",
          "Agrega coreógrafas externas si colaboran con galas especiales.",
          "Describe aparatos que lidera cada una para ordenar responsabilidades.",
        ],
        [
          "Crea fichas con el nombre completo y nivel competitivo.",
          "Anota su aparato fuerte: cinta, pelota, aro, mazas o cuerda.",
          "Usa estos registros para preparar importaciones masivas posteriores.",
        ],
        [
          "Considera el plan Pro si manejas más de un grupo competitivo.",
          "Activa recordatorios automáticos para cuotas familiares si usas planes avanzados.",
          "Guarda el comprobante de suscripción para tus registros contables.",
        ],
      ],
    }),
  },
  trampolin: {
    steps: buildCopy({
      heading: [
        "Paso 1 · Configura la cuenta administradora de trampolín",
        "Paso 2 · Describe tu centro de trampolín",
        "Paso 3 · Invita a tus entrenadores y spotters",
        "Paso 4 · Registra a los atletas que ya vuelan alto",
        "Paso 5 · Activa el plan que se ajusta a tus saltos",
      ],
      description: [
        "Crea el acceso principal para gestionar turnos, seguridad y progresiones técnicas.",
        "Completa datos de la academia para personalizar métricas de trampolín sincronizado e individual.",
        "Agrega a entrenadores y asistentes responsables de seguridad en cada cama elástica.",
        "Registra atletas para comenzar a documentar las rutinas y grados de dificultad.",
        "Escoge el plan que te permita escalar tu operación a la velocidad de tus saltos.",
      ],
      sectionTitle: [
        "Cuenta administradora",
        "Información del centro",
        "Equipo de entrenadores/spotters",
        "Atletas de trampolín",
        "Plan de suscripción",
      ],
      sectionDescription: [
        "Define quién gestiona la plataforma diariamente. Usa credenciales seguras.",
        "Estos datos se mostrarán en dashboards y comunicaciones.",
        "Comparte acceso con quienes supervisan seguridad y técnica en cada entrenamiento.",
        "Cuantos más registros tengas, más precisas serán las métricas de progresión.",
        "Elige un plan flexible para ajustarte a la demanda de atletas.",
      ],
      recommendations: [
        [
          "Usa un correo institucional para conservar el historial de la academia.",
          "Documenta la contraseña en un gestor seguro.",
          "Configura acceso para co-directores desde Invitar usuarios después del onboarding.",
        ],
        [
          "Indica el número de camas y áreas disponibles en las notas internas.",
          "Selecciona trampolín como disciplina para desbloquear métricas específicas.",
          "Actualiza la región para obtener referencias de campeonatos locales.",
        ],
        [
          "Invita a al menos dos entrenadores para cubrir turnos y descansos.",
          "Incluye spotters con su correo para registros de seguridad.",
          "Labela quién supervisa rutinas sincronizadas vs. individuales.",
        ],
        [
          "Registra altura promedio alcanzada o notas técnicas en observaciones.",
          "Añade atletas con sus niveles FIG para estadísticas comparativas.",
          "Si aún no tienes datos, crea fichas placeholder para probar flujos.",
        ],
        [
          "Plan Free es perfecto para academias en lanzamiento.",
          "Plan Pro ofrece métricas avanzadas de progresión y exportes.",
          "Plan Premium habilita integraciones externas para federaciones.",
        ],
      ],
    }),
  },
  general: {
    steps: buildCopy({
      heading: [
        "Paso 1 · Crea la cuenta responsable de tu academia multideportiva",
        "Paso 2 · Presenta tu academia general o mixta",
        "Paso 3 · Incluye a tus instructores y monitores",
        "Paso 4 · Añade a tus primeras alumnas y alumnos",
        "Paso 5 · Selecciona el plan ideal para tus actividades",
      ],
      description: [
        "Configura el acceso principal para gestionar tus clases recreativas o de formación básica.",
        "Completa los datos institucionales para personalizar agendas, recordatorios y materiales.",
        "Invita a quienes lideran cada clase o actividad para organizar agendas y asistencia.",
        "Registra a tu alumnado inicial para comenzar con listas, control y seguimiento básico.",
        "Escoge el plan que te permitirá crecer sin perder el control pedagógico.",
      ],
      sectionTitle: [
        "Cuenta principal",
        "Datos de la academia",
        "Equipo de instructores",
        "Alumnado inicial",
        "Plan de suscripción",
      ],
      sectionDescription: [
        "Será quien configure todo el entorno; usa datos reales y seguros.",
        "Estos datos aparecerán en comunicaciones y dashboards internos.",
        "Agrega a monitores, asistentes y coordinadores para que colaboren.",
        "Cuantos más registros, mejor funcionarán horarios y asistencia.",
        "Revisa qué plan cubre tu volumen de clases y alumnos actuales.",
      ],
      recommendations: [
        [
          "Usa un correo empresarial o uno compartido por el equipo directivo.",
          "La contraseña debe ser única para mantener la seguridad de tu academia.",
          "Guarda un contacto alternativo para recuperación desde tu perfil luego.",
        ],
        [
          "Incluye ciudad y región para ajustes de calendario y feriados.",
          "Selecciona disciplina general para obtener recomendaciones mixtas.",
          "Menciona si impartes otras actividades como psicomotricidad o parkour.",
        ],
        [
          "Invita a instructores principales y asistentes por grupo etario.",
          "Añade quién lidera cada clase para asignar responsabilidades.",
          "Define roles (coach, monitor, asistente) para reflejar permisos futuros.",
        ],
        [
          "Registra a niñas y niños con nombre y edad aproximada.",
          "Asigna nivel o grupo para segmentar comunicados.",
          "Puedes dejar algunos campos en blanco y completarlos luego.",
        ],
        [
          "Plan Free cubre academias pequeñas con hasta 50 alumnos.",
          "Plan Pro suma estadísticas y soporte prioritario.",
          "Plan Premium ofrece integraciones y automatizaciones avanzadas.",
        ],
      ],
    }),
  },
};

