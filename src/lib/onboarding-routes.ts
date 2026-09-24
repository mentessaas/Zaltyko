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
    href: (academyId) => `/app/${academyId}/groups`,
    cta: "Crear grupo",
  },
  add_5_athletes: {
    href: (academyId) => `/app/${academyId}/athletes`,
    cta: "Añadir atletas",
  },
  invite_first_coach: {
    href: (academyId) => `/app/${academyId}/coaches`,
    cta: "Invitar entrenador",
  },
  setup_weekly_schedule: {
    href: (academyId) => `/app/${academyId}/classes`,
    cta: "Configurar calendario",
  },
  enable_payments: {
    href: (academyId) => `/app/${academyId}/billing`,
    cta: "Activar pagos",
  },
  send_first_communication: {
    href: (academyId) => `/app/${academyId}/announcements`,
    cta: "Enviar comunicación",
    allowManualCompletion: true,
  },
  login_again: {
    href: (academyId) => `/app/${academyId}/dashboard`,
    cta: "Ir al dashboard",
  },
};
