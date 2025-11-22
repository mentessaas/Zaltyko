/**
 * Utilidades puras para onboarding que no requieren acceso a la base de datos.
 * Estas funciones pueden ser usadas en componentes cliente.
 */

export const CHECKLIST_KEYS = [
  "create_first_group",
  "add_5_athletes",
  "invite_first_coach",
  "setup_weekly_schedule",
  "enable_payments",
  "send_first_communication",
  "login_again",
] as const;

export type ChecklistKey = (typeof CHECKLIST_KEYS)[number];

export type ChecklistStatus = "pending" | "completed" | "skipped";

export interface ChecklistDefinition {
  key: ChecklistKey;
  label: string;
  description: string;
  auto?: boolean;
}

export const CHECKLIST_DEFINITIONS: ChecklistDefinition[] = [
  {
    key: "create_first_group",
    label: "Crea tu primer grupo de entrenamiento",
    description: "Sin grupos no hay orden. Organiza a tus gimnastas por nivel y horarios.",
    auto: true,
  },
  {
    key: "add_5_athletes",
    label: "Añade al menos 5 atletas",
    description: "Carga a tus atletas principales para empezar a ver el valor real del sistema.",
    auto: true,
  },
  {
    key: "invite_first_coach",
    label: "Invita a tu primer entrenador",
    description: "No lo gestiones solo: trae a tu mano derecha para que administre sus grupos.",
    auto: true,
  },
  {
    key: "setup_weekly_schedule",
    label: "Configura tu calendario semanal",
    description: "Crea tus primeras clases recurrentes para que todos tengan visibilidad.",
    auto: true,
  },
  {
    key: "enable_payments",
    label: "Activa métodos de pago",
    description: "Automatiza cobros y olvídate de perseguir a padres cada mes.",
    auto: true,
  },
  {
    key: "send_first_communication",
    label: "Envía tu primera comunicación a padres",
    description: "Hazles saber que todo se gestionará desde Zaltyko a partir de ahora.",
  },
  {
    key: "login_again",
    label: "Vuelve a entrar a Zaltyko",
    description: "Un segundo inicio de sesión demuestra que el producto engancha.",
    auto: true,
  },
];

export const WIZARD_STEP_KEYS = [
  "academy",
  "structure",
  "group",
  "athletes",
  "coaches",
  "payments",
] as const;

export type WizardStepKey = (typeof WIZARD_STEP_KEYS)[number];

export const WIZARD_STEPS: Array<{ key: WizardStepKey; label: string }> = [
  { key: "academy", label: "Academia" },
  { key: "structure", label: "Disciplinas" },
  { key: "group", label: "Primer grupo" },
  { key: "athletes", label: "Atletas" },
  { key: "coaches", label: "Entrenadores" },
  { key: "payments", label: "Pagos" },
];

export function calculateDaysLeft(trialEndsAt: Date | string | null | undefined): number | null {
  if (!trialEndsAt) {
    return null;
  }
  const end = trialEndsAt instanceof Date ? trialEndsAt : new Date(trialEndsAt);
  const diff = end.getTime() - Date.now();
  if (Number.isNaN(diff)) {
    return null;
  }
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

