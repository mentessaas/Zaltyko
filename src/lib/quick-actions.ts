/**
 * Constantes de acciones rápidas compartidas
 * Usadas por QuickActions y QuickAccessBar
 */

import {
  UserPlus,
  Calendar,
  ClipboardCheck,
  FileText,
  CreditCard,
} from "lucide-react";
import type { SpecializedLabels } from "@/lib/specialization/registry";

export interface QuickAction {
  id: string;
  label: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  href: (academyId: string) => string;
  color: string;
  textColor?: string;
}

const DEFAULT_LABELS: SpecializedLabels = {
  disciplineName: "Academia deportiva",
  athleteSingular: "Atleta",
  athletesPlural: "Atletas",
  groupLabel: "Grupo",
  classLabel: "Clase",
  sessionLabel: "Sesión",
  levelLabel: "Nivel",
  coachLabel: "Entrenador",
  dashboardHeadline: "Panel de la academia",
  familyHeadline: "Seguimiento familiar",
};

export function getQuickActions(
  labels: SpecializedLabels = DEFAULT_LABELS,
  options: { reportsEnabled?: boolean } = {}
): QuickAction[] {
  const baseActions: QuickAction[] = [
    {
      id: "add-athlete",
      label: `Añadir ${labels.athleteSingular.toLowerCase()}`,
      description: `Registra un nuevo ${labels.athleteSingular.toLowerCase()} en tu academia`,
      icon: UserPlus,
      href: (id) => `/app/${id}/athletes?action=create`,
      color: "bg-blue-500",
      textColor: "text-blue-600",
    },
    {
      id: "create-class",
      label: `Crear ${labels.classLabel.toLowerCase()}`,
      description: `Programa un nuevo ${labels.classLabel.toLowerCase()} o ${labels.sessionLabel.toLowerCase()}`,
      icon: Calendar,
      href: (id) => `/app/${id}/classes?action=create`,
      color: "bg-emerald-500",
      textColor: "text-emerald-600",
    },
    {
      id: "take-attendance",
      label: "Pasar asistencia",
      description: `Registra la asistencia del ${labels.classLabel.toLowerCase()} de hoy`,
      icon: ClipboardCheck,
      href: (id) => `/app/${id}/attendance?date=today`,
      color: "bg-amber-500",
      textColor: "text-amber-600",
    },
    {
      id: "billing",
      label: "Facturación",
      description: "Gestiona métodos de pago y facturación",
      icon: CreditCard,
      href: (id) => `/app/${id}/billing`,
      color: "bg-green-500",
      textColor: "text-green-600",
    },
  ];

  if (options.reportsEnabled) {
    baseActions.splice(3, 0, {
      id: "create-report",
      label: "Reportes",
      description: "Consulta indicadores de asistencia y finanzas",
      icon: FileText,
      href: (id) => `/app/${id}/reports/attendance`,
      color: "bg-red-500",
      textColor: "text-red-600",
    });
  }

  return baseActions;
}

export const QUICK_ACTIONS: QuickAction[] = getQuickActions();
