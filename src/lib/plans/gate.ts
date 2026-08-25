import { getActiveSubscription } from "@/lib/limits";

const GROWTH_CODES = new Set(["premium", "network"]);

/**
 * Verifica si la academia tiene plan Growth o superior.
 * Starter (pro) y Free no acceden a reportes ejecutivos.
 */
export async function getAcademyPlanGate(academyId: string) {
  try {
    const sub = await getActiveSubscription(academyId);
    const code = (sub as unknown as { planCode?: string })?.planCode ?? null;
    return {
      allowedForGrowth: code ? GROWTH_CODES.has(code) : false,
      planCode: code,
    };
  } catch {
    return { allowedForGrowth: false, planCode: null as string | null };
  }
}
