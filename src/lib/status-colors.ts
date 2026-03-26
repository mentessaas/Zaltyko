/**
 * Constantes de colores para estados y acciones
 * Compartidas entre múltiples componentes
 */

// Colores para estados de atleta
export const ATHLETE_STATUS_COLORS = {
  trial: {
    bg: "bg-amber-500",
    bgLight: "bg-amber-50",
    border: "border-amber-500/50",
    text: "text-amber-600",
    textLight: "text-amber-700",
  },
  active: {
    bg: "bg-emerald-500",
    bgLight: "bg-emerald-50",
    border: "border-emerald-500/50",
    text: "text-emerald-600",
    textLight: "text-emerald-700",
  },
  inactive: {
    bg: "bg-gray-500",
    bgLight: "bg-gray-50",
    border: "border-gray-500/50",
    text: "text-gray-600",
    textLight: "text-gray-700",
  },
  paused: {
    bg: "bg-blue-500",
    bgLight: "bg-blue-50",
    border: "border-blue-500/50",
    text: "text-blue-600",
    textLight: "text-blue-700",
  },
  archived: {
    bg: "bg-slate-500",
    bgLight: "bg-slate-50",
    border: "border-slate-500/50",
    text: "text-slate-600",
    textLight: "text-slate-700",
  },
} as const;

// Colores para estados de asistencia
export const ATTENDANCE_STATUS_COLORS = {
  present: {
    bg: "bg-emerald-500",
    bgLight: "bg-emerald-50",
    border: "border-emerald-500/50",
    text: "text-emerald-600",
  },
  absent: {
    bg: "bg-red-500",
    bgLight: "bg-red-50",
    border: "border-red-500/50",
    text: "text-red-600",
  },
  excused: {
    bg: "bg-amber-500",
    bgLight: "bg-amber-50",
    border: "border-amber-500/50",
    text: "text-amber-600",
  },
  late: {
    bg: "bg-orange-500",
    bgLight: "bg-orange-50",
    border: "border-orange-500/50",
    text: "text-orange-600",
  },
} as const;

// Función helper para obtener color de estado de atleta
export function getAthleteStatusColor(
  status: string,
  variant: "bg" | "bgLight" | "border" | "text" | "textLight" = "bg"
): string {
  const statusKey = status as keyof typeof ATHLETE_STATUS_COLORS;
  const colors = ATHLETE_STATUS_COLORS[statusKey];
  return colors?.[variant] ?? ATHLETE_STATUS_COLORS.inactive[variant];
}

// Función helper para obtener color de estado de asistencia
export function getAttendanceStatusColor(
  status: string,
  variant: "bg" | "bgLight" | "border" | "text" = "bg"
): string {
  const statusKey = status as keyof typeof ATTENDANCE_STATUS_COLORS;
  const colors = ATTENDANCE_STATUS_COLORS[statusKey];
  return colors?.[variant] ?? "bg-gray-500";
}
