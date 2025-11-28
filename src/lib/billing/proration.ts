
export interface ProrationResult {
    amountDue: number;
    credit: number;
    daysRemaining: number;
    totalDays: number;
    prorationDate: Date;
}

export const PLAN_PRICES: Record<string, number> = {
    free: 0,
    pro: 19,
    premium: 49,
};

/**
 * Calcula el prorrateo para un cambio de plan
 */
export function calculateProration(
    currentPlan: string,
    newPlan: string,
    cycleStartDate: Date,
    cycleEndDate: Date
): ProrationResult {
    const now = new Date();
    const totalDays = Math.ceil(
        (cycleEndDate.getTime() - cycleStartDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const daysRemaining = Math.max(
        0,
        Math.ceil((cycleEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    );

    const currentPrice = PLAN_PRICES[currentPlan] || 0;
    const newPrice = PLAN_PRICES[newPlan] || 0;

    // Calcular crédito del plan actual (lo que no se usó)
    const credit = (currentPrice / totalDays) * daysRemaining;

    // Calcular costo del nuevo plan (por los días restantes)
    const cost = (newPrice / totalDays) * daysRemaining;

    // El monto a pagar es la diferencia
    const amountDue = Math.max(0, cost - credit);
    const remainingCredit = Math.max(0, credit - cost);

    return {
        amountDue: Math.round(amountDue * 100) / 100,
        credit: Math.round(remainingCredit * 100) / 100,
        daysRemaining,
        totalDays,
        prorationDate: now,
    };
}
