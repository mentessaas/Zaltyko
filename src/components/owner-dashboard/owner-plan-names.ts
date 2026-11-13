/**
 * Nombre público del plan a partir del código que devuelve el servidor.
 * Un código desconocido no recibe nombre: no se inventa un plan.
 */
const PLAN_NAMES: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Starter",
  growth: "Growth",
  premium: "Growth",
  network: "Network",
};

export function ownerPlanPublicName(planCode: string | null | undefined): string | null {
  if (!planCode) return null;
  return PLAN_NAMES[planCode] ?? null;
}
