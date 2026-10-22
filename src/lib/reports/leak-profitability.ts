export type DiagnosticAnswers = Record<string, boolean | number | string>;

export interface DiagnosticResult {
  score: number;
  level: "supervivencia" | "fugas" | "buena_base" | "escalable";
  recommendedTasks: string[];
}

const DIAGNOSTIC_TASKS: Record<string, string> = {
  paymentsConfigured: "Configurar pagos y vencimientos por atleta",
  attendanceTracked: "Registrar asistencia de forma semanal",
  groupsHaveCapacity: "Completar capacidad y plazas disponibles por grupo",
  costsConfigured: "Añadir costes de entrenadores y gastos operativos",
  evaluationsRecent: "Crear evaluaciones recientes para atletas activos",
  churnReasonsTracked: "Registrar motivos de baja al cambiar estados",
  waitlistManaged: "Activar lista de espera en clases completas",
  communicationTemplates: "Crear plantillas de pago, faltas y progreso",
  coachAssignments: "Asignar entrenadores a clases y grupos",
  reportsReviewed: "Revisar fugas y rentabilidad cada semana",
};

export function calculateDiagnosticResult(answers: DiagnosticAnswers): DiagnosticResult {
  const keys = Object.keys(DIAGNOSTIC_TASKS);
  const positiveAnswers = keys.filter((key) => {
    const value = answers[key];
    return value === true || value === "true" || (typeof value === "number" && value > 0);
  });
  const score = Math.round((positiveAnswers.length / keys.length) * 100);

  let level: DiagnosticResult["level"] = "supervivencia";
  if (score >= 80) {
    level = "escalable";
  } else if (score >= 60) {
    level = "buena_base";
  } else if (score >= 35) {
    level = "fugas";
  }

  const recommendedTasks = keys
    .filter((key) => !positiveAnswers.includes(key))
    .map((key) => DIAGNOSTIC_TASKS[key]);

  return { score, level, recommendedTasks };
}

export interface ClassProfitabilityInput {
  classId: string;
  className: string;
  capacity: number;
  enrolledCount: number;
  waitlistCount: number;
  expectedRevenueCents: number;
  collectedRevenueCents: number;
  coachCostCents: number;
  allocatedExpenseCents: number;
  missingCostData: boolean;
}

export interface ClassProfitabilityResult extends ClassProfitabilityInput {
  occupancyRate: number;
  estimatedCostCents: number;
  estimatedMarginCents: number;
  estimatedMarginRate: number | null;
  isEstimated: boolean;
  alerts: string[];
}

export function calculateClassProfitability(input: ClassProfitabilityInput): ClassProfitabilityResult {
  const occupancyRate = input.capacity > 0 ? input.enrolledCount / input.capacity : 0;
  const estimatedCostCents = input.coachCostCents + input.allocatedExpenseCents;
  const estimatedMarginCents = input.expectedRevenueCents - estimatedCostCents;
  const estimatedMarginRate =
    input.expectedRevenueCents > 0 ? estimatedMarginCents / input.expectedRevenueCents : null;

  const alerts: string[] = [];
  if (input.capacity > 0 && occupancyRate < 0.75) {
    alerts.push("Plazas libres relevantes");
  }
  if (input.expectedRevenueCents > 0 && estimatedMarginCents < 0) {
    alerts.push("Margen estimado negativo");
  }
  if (input.waitlistCount > 0 && input.capacity > 0 && occupancyRate >= 1) {
    alerts.push("Demanda en lista de espera");
  }
  if (input.missingCostData) {
    alerts.push("Costes incompletos");
  }

  return {
    ...input,
    occupancyRate,
    estimatedCostCents,
    estimatedMarginCents,
    estimatedMarginRate,
    isEstimated: true,
    alerts,
  };
}

