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
        summary: "Registra tu usuario, confirma el acceso y empieza desde el Resumen.",
        steps: ["Entra en registro.", "Completa tus datos principales.", "Confirma el enlace recibido por correo en el mismo navegador.", "Abre el Resumen para continuar la configuración."],
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
    title: "Gestión de gimnastas",
    description: "Administra las fichas de tus gimnastas",
    icon: Users,
    articles: [
      {
        slug: "agregar-atletas",
        title: "Dar de alta gimnastas",
        category: "Gestión de gimnastas",
        summary: "Crea la ficha de una gimnasta con datos básicos, estado y contactos de su familia.",
        steps: ["Abre Gimnastas.", "Completa «Alta de gimnasta».", "Revisa nombre y estado.", "Vincula a su familia si ya la tienes."],
      },
      {
        slug: "editar-atletas",
        title: "Editar la ficha de una gimnasta",
        category: "Gestión de gimnastas",
        summary: "Actualiza los datos personales y los vínculos con su familia desde la ficha de la gimnasta.",
        steps: ["Abre la lista de Gimnastas.", "Selecciona la ficha.", "Pulsa Editar.", "Guarda los cambios revisados."],
      },
      {
        slug: "asignar-clases",
        title: "Inscribir en clases",
        category: "Gestión de gimnastas",
        summary: "Relaciona gimnastas con clases o grupos mediante inscripciones para la asistencia, los horarios y el seguimiento.",
        steps: ["Abre la clase o el grupo.", "Usa la acción de añadir gimnasta.", "Selecciona la persona.", "Verifica que aparece en la lista asignada."],
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
        steps: ["Abre Clases.", "Pulsa Crear clase recurrente.", "Completa los campos principales.", "Guarda y revisa la vista de detalle."],
      },
      {
        slug: "gestionar-horarios",
        title: "Gestionar horarios",
        category: "Clases y horarios",
        summary: "Mantén horarios consistentes para las sesiones y el pase de lista.",
        steps: ["Abre la clase.", "Revisa días y horas.", "Ajusta sesiones recurrentes si aplica.", "Comunica cambios importantes al equipo."],
      },
      {
        slug: "control-asistencia",
        title: "Pasar lista",
        category: "Clases y horarios",
        summary: "Guarda la asistencia de cada sesión y consulta las marcas guardadas.",
        steps: ["Abre la sesión del día en Hoy en el club o en Asistencia.", "Marca el estado de cada gimnasta.", "Añade notas si es necesario.", "Guarda el registro."],
      },
    ],
  },
  {
    title: "Pagos y cobros",
    description: "Gestiona cuotas, pagos y el plan de tu academia",
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
        steps: ["Busca la familia o la gimnasta.", "Selecciona el cargo pendiente.", "Registra el pago.", "Revisa el historial de pagos."],
      },
      {
        slug: "gestionar-impagos",
        title: "Gestionar impagos",
        category: "Pagos y cobros",
        summary: "Detecta saldos vencidos y prioriza seguimiento sin perder trazabilidad.",
        steps: ["Abre Cobros.", "Filtra pagos vencidos.", "Revisa el historial.", "Contacta a la familia por el canal acordado."],
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
