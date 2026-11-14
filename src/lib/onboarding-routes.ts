import type { ChecklistKey } from "@/lib/onboarding-utils";

/**
 * Navegación pura del checklist de activación.
 *
 * Se mantiene fuera del componente visual para que las páginas que sólo
 * necesitan resolver un CTA no tengan que cargar todo el checklist cliente.
 */
export const ITEM_ROUTES: Record<
  ChecklistKey,
  {
    href: (academyId: string) => string;
    cta: string;
    allowManualCompletion?: boolean;
  }
> = {
  create_first_group: {
    href: () => "/owner/groups",
    cta: "Crear grupo",
  },
  add_5_athletes: {
    href: () => "/owner/athletes",
    cta: "Añadir atletas",
  },
  invite_first_coach: {
    href: () => "/owner/staff",
    cta: "Invitar entrenador",
  },
  setup_weekly_schedule: {
    href: () => "/owner/classes",
    cta: "Configurar calendario",
  },
  enable_payments: {
    href: () => "/owner/payments",
    cta: "Activar pagos",
  },
  send_first_communication: {
    href: () => "/owner",
    cta: "Enviar comunicación",
    allowManualCompletion: true,
  },
  login_again: {
    href: () => "/owner",
    cta: "Ir a la mesa de dirección",
  },
};
