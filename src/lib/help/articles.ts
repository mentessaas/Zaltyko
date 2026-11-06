import type { LucideIcon } from "lucide-react";
import { BookOpen, Calendar, CreditCard, ShieldCheck, Users } from "lucide-react";

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
        steps: ["Entra en registro.", "Completa tus datos principales.", "Confirma el enlace recibido por correo en el mismo navegador.", "Accede al dashboard para continuar la configuración."],
      },
      {
        slug: "configurar-academia",
        title: "Configurar tu academia",
        category: "Primeros pasos",
        summary: "Crea la academia y su primera sede desde la configuración inicial.",
        steps: ["Accede con tu cuenta confirmada.", "Completa los datos de la academia y sede en la configuración inicial.", "Revisa antes de enviar.", "Abre el resumen para continuar con gimnastas y grupos."],
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
        summary: "Actualiza los datos personales y las relaciones familiares desde la ficha del gimnasta.",
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
        summary: "Define una clase con grupo, sede, horario y capacidad.",
        steps: ["Abre Clases.", "Pulsa Nueva clase.", "Completa los campos principales.", "Guarda y revisa la vista de detalle."],
      },
      {
        slug: "gestionar-horarios",
        title: "Gestionar horarios",
        category: "Clases y horarios",
        summary: "Mantén horarios consistentes para las sesiones y el registro de asistencia.",
        steps: ["Abre la clase.", "Revisa días y horas.", "Ajusta sesiones recurrentes si aplica.", "Comunica cambios importantes al equipo."],
      },
      {
        slug: "control-asistencia",
        title: "Control de asistencia",
        category: "Clases y horarios",
        summary: "Guarda el estado de asistencia por sesión y consulta las marcas persistidas.",
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
        summary: "Define una tarifa mensual y su cobertura de clases antes de emitir cuotas familiares.",
        steps: ["Abre Cuotas mensuales.", "Revisa familia, pagador y vencimiento.", "Configura las tarifas y coberturas que falten.", "Previsualiza antes de emitir las cuotas."],
      },
      {
        slug: "procesar-pagos",
        title: "Procesar pagos",
        category: "Pagos y cobros",
        summary: "Registra manualmente pagos recibidos y asígnalos a cargos pendientes; no se realizan cobros automáticos a familias.",
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
    title: "Seguridad y soporte",
    description: "Trabaja con acceso controlado y ayuda clara",
    icon: ShieldCheck,
    articles: [
      {
        slug: "roles-y-accesos",
        title: "Entender roles y accesos",
        category: "Seguridad y soporte",
        summary: "Los módulos operativos exigen una cuenta autorizada en la academia y, cuando corresponda, en la sede.",
        steps: ["Revisa el rol autorizado.", "Comprueba la academia y la sede seleccionadas.", "Si aparece un acceso denegado, contacta con el responsable de tu academia."],
      },
      {
        slug: "contactar-soporte",
        title: "Contactar con soporte",
        category: "Seguridad y soporte",
        summary: "Contacta por email con contexto suficiente, sin incluir contraseñas ni datos personales innecesarios.",
        steps: ["Abre Ayuda.", "Escribe a hola@zaltyko.com indicando módulo, pasos y resultado esperado.", "No incluyas contraseñas ni información sensible de menores."],
      },
    ],
  },
];

export const helpArticles = helpCategories.flatMap((category) => category.articles);

export function getHelpArticle(slug: string) {
  return helpArticles.find((article) => article.slug === slug) ?? null;
}
