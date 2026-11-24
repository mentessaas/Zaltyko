/**
 * Nombre público del plan a partir del código que devuelve el servidor.
 * Un código desconocido no recibe nombre: no se inventa un plan.
 */
const PLAN_NAMES: Record<string, string> = {
  free: "Gratis",
  starter: "Club",
  pro: "Club",
  growth: "Club",
  premium: "Club",
  network: "Club",
};

export function ownerPlanPublicName(planCode: string | null | undefined): string | null {
  if (!planCode) return null;
  return PLAN_NAMES[planCode] ?? null;
}
