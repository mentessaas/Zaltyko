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

export interface QuickAction {
  id: string;
  label: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  href: (academyId: string) => string;
  color: string;
  textColor?: string;
}

export const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "add-athlete",
    label: "Añadir atleta",
    description: "Registra un nuevo atleta en tu academia",
    icon: UserPlus,
    href: (id) => `/app/${id}/athletes?action=create`,
    color: "bg-blue-500",
    textColor: "text-blue-600",
  },
  {
    id: "create-class",
    label: "Crear clase",
    description: "Programa una nueva clase o sesión",
    icon: Calendar,
    href: (id) => `/app/${id}/classes?action=create`,
    color: "bg-emerald-500",
    textColor: "text-emerald-600",
  },
  {
    id: "take-attendance",
    label: "Pasar asistencia",
    description: "Registra la asistencia de hoy",
    icon: ClipboardCheck,
    href: (id) => `/app/${id}/attendance?date=today`,
    color: "bg-amber-500",
    textColor: "text-amber-600",
  },
  {
    id: "create-report",
    label: "Reportes",
    description: "Crea un reporte de asistencia o financiero",
    icon: FileText,
    href: (id) => `/app/${id}/reports/attendance`,
    color: "bg-red-500",
    textColor: "text-red-600",
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
