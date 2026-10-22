import type { LucideIcon } from "lucide-react";
import { BookOpen, Calendar, CreditCard, ShieldCheck, Upload, Users } from "lucide-react";

export interface HelpArticle {
  slug: string;
  title: string;
  category: string;
  summary: string;
  steps: string[];
}

export interface HelpCategory {
  title: string;
  description: string;
  icon: LucideIcon;
  articles: HelpArticle[];
}

export const helpCategories: HelpCategory[] = [
  {
    title: "Primeros pasos",
    description: "Todo lo que necesitas para empezar",
    icon: BookOpen,
    articles: [
      {
        slug: "crear-cuenta",
        title: "Cómo crear tu cuenta",
        category: "Primeros pasos",
        summary: "Registra tu usuario, confirma el acceso y empieza desde el panel inicial.",
        steps: ["Entra en registro.", "Completa tus datos principales.", "Confirma el correo si se solicita.", "Accede al dashboard para continuar la configuración."],
      },
      {
        slug: "configurar-academia",
        title: "Configurar tu academia",
        category: "Primeros pasos",
        summary: "Define nombre, disciplina, país, horarios básicos y datos de contacto público.",
        steps: ["Abre Ajustes.", "Revisa la información general.", "Configura disciplina y país.", "Guarda los cambios antes de invitar a tu equipo."],
      },
      {
        slug: "invitar-equipo",
        title: "Invitar a tu equipo",
        category: "Primeros pasos",
        summary: "Añade entrenadores y perfiles administrativos con permisos adecuados.",
        steps: ["Entra en Equipo o Entrenadores.", "Crea una invitación.", "Elige el rol correcto.", "Pide a la persona invitada que complete su acceso."],
      },
    ],
  },
  {
    title: "Gestión de atletas",
    description: "Administra tu base de datos de atletas",
    icon: Users,
    articles: [
      {
        slug: "agregar-atletas",
        title: "Agregar nuevos atletas",
        category: "Gestión de atletas",
        summary: "Crea una ficha de atleta con datos básicos, estado y contactos familiares.",
        steps: ["Abre Atletas.", "Pulsa Nuevo atleta.", "Completa nombre y estado.", "Añade contactos familiares si los tienes."],
      },
      {
        slug: "editar-atletas",
        title: "Editar información de atletas",
        category: "Gestión de atletas",
        summary: "Actualiza datos personales, estado, nivel y contactos desde la ficha del atleta.",
        steps: ["Abre la lista de atletas.", "Selecciona la ficha.", "Pulsa Editar.", "Guarda los cambios revisados."],
      },
      {
        slug: "asignar-clases",
        title: "Asignar a clases",
        category: "Gestión de atletas",
        summary: "Relaciona atletas con clases o grupos para asistencia, horarios y seguimiento.",
        steps: ["Abre la clase o el grupo.", "Usa la acción de añadir atleta.", "Selecciona la persona.", "Verifica que aparece en la lista asignada."],
      },
    ],
  },
  {
    title: "Clases y horarios",
    description: "Organiza tu calendario de clases",
    icon: Calendar,
    articles: [
      {
        slug: "crear-clases",
        title: "Crear clases",
        category: "Clases y horarios",
        summary: "Define una clase con nombre, entrenador, capacidad y programación básica.",
        steps: ["Abre Clases.", "Pulsa Nueva clase.", "Completa los campos principales.", "Guarda y revisa la vista de detalle."],
      },
      {
        slug: "gestionar-horarios",
        title: "Gestionar horarios",
        category: "Clases y horarios",
        summary: "Mantén horarios consistentes para que asistencia y comunicaciones funcionen correctamente.",
        steps: ["Abre la clase.", "Revisa días y horas.", "Ajusta sesiones recurrentes si aplica.", "Comunica cambios importantes al equipo."],
      },
      {
        slug: "control-asistencia",
        title: "Control de asistencia",
        category: "Clases y horarios",
        summary: "Registra presentes, ausentes y observaciones para mantener métricas de asistencia.",
        steps: ["Abre la sesión del día.", "Marca el estado de cada atleta.", "Añade notas si es necesario.", "Guarda el registro."],
      },
    ],
  },
  {
    title: "Pagos y cobros",
    description: "Gestiona cobros y suscripciones",
    icon: CreditCard,
    articles: [
      {
        slug: "configurar-planes-precio",
        title: "Configurar planes de precio",
        category: "Pagos y cobros",
        summary: "Define conceptos de cobro claros para mensualidades, matrículas o servicios extra.",
        steps: ["Abre Cobros.", "Revisa conceptos activos.", "Añade importes y periodicidad.", "Comprueba el resumen antes de cobrar."],
      },
      {
        slug: "procesar-pagos",
        title: "Procesar pagos",
        category: "Pagos y cobros",
        summary: "Registra pagos manuales o procesa cobros conectados según tu configuración.",
        steps: ["Busca la cuenta o atleta.", "Selecciona el cargo pendiente.", "Registra el pago.", "Revisa recibo e historial."],
      },
      {
        slug: "gestionar-impagos",
        title: "Gestionar impagos",
        category: "Pagos y cobros",
        summary: "Detecta saldos vencidos y prioriza seguimiento sin perder trazabilidad.",
        steps: ["Abre el panel de cobros.", "Filtra pagos vencidos.", "Revisa el historial.", "Contacta a la familia por el canal acordado."],
      },
    ],
  },
  {
    title: "Importación y exportación",
    description: "Mueve tus datos con claridad y control",
    icon: Upload,
    articles: [
      {
        slug: "importar-desde-csv",
        title: "Importar gimnastas desde CSV o Excel",
        category: "Importación y exportación",
        summary: "Prepara la base principal de tu academia y revisa los errores antes de confirmar la importación.",
        steps: [
          "Abre Atletas e inicia la importación.",
          "Descarga o revisa la plantilla de columnas.",
          "Sube el archivo CSV o Excel y corrige las filas señaladas.",
          "Confirma la importación y guarda el resumen de resultados.",
        ],
      },
      {
        slug: "migracion-acompanada",
        title: "Solicitar una migración acompañada",
        category: "Importación y exportación",
        summary: "Para históricos, familias, grupos o cobros complejos, revisamos el formato y el alcance antes de empezar.",
        steps: [
          "Contacta con el equipo e indica el origen de los datos.",
          "Comparte una muestra sin datos sensibles innecesarios.",
          "Recibe el alcance, las transformaciones y las responsabilidades.",
          "Valida una muestra antes de completar la carga.",
        ],
      },
      {
        slug: "exportar-datos",
        title: "Exportar datos de tu academia",
        category: "Importación y exportación",
        summary: "Descarga los datos disponibles según tu rol y el módulo consultado.",
        steps: [
          "Abre el módulo que quieras revisar.",
          "Usa la acción Exportar y elige el formato disponible.",
          "Comprueba filtros, periodo y academia antes de descargar.",
          "Guarda el archivo siguiendo la política interna de tu academia.",
        ],
      },
    ],
  },
  {
    title: "Seguridad y soporte",
    description: "Trabaja con acceso controlado y ayuda clara",
    icon: ShieldCheck,
    articles: [
      {
        slug: "roles-y-accesos",
        title: "Entender roles y accesos",
        category: "Seguridad y soporte",
        summary: "Cada miembro del equipo y cada familia accede según su relación autorizada con la academia.",
        steps: [
          "Revisa el rol antes de enviar una invitación.",
          "Comprueba qué módulos necesita la persona.",
          "Invita solo a cuentas vinculadas a la academia.",
          "Revoca o ajusta el acceso cuando cambie la responsabilidad.",
        ],
      },
      {
        slug: "contactar-soporte",
        title: "Contactar con soporte",
        category: "Seguridad y soporte",
        summary: "Abre un ticket con contexto suficiente para que el equipo pueda ayudarte más rápido.",
        steps: [
          "Abre Ayuda o Soporte desde tu espacio de trabajo.",
          "Elige la categoría y describe el resultado esperado.",
          "Incluye la academia, módulo y pasos para reproducirlo; nunca envíes contraseñas.",
          "Sigue el historial del ticket hasta su resolución.",
        ],
      },
    ],
  },
];

export const helpArticles = helpCategories.flatMap((category) => category.articles);

export function getHelpArticle(slug: string) {
  return helpArticles.find((article) => article.slug === slug) ?? null;
}
