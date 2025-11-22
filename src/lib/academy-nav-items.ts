import {
  LayoutDashboard,
  Users,
  UserCheck,
  BookOpen,
  CheckSquare,
  CreditCard,
  ClipboardList,
} from "lucide-react";

export interface AcademyNavItem {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  href: string;
}

export const ACADEMY_NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "athletes", label: "Atletas", icon: Users },
  { key: "coaches", label: "Entrenadores", icon: UserCheck },
  { key: "groups", label: "Grupos", icon: Users },
  { key: "classes", label: "Clases", icon: BookOpen },
  { key: "attendance", label: "Asistencia", icon: CheckSquare },
  { key: "billing", label: "Facturación", icon: CreditCard },
  { key: "assessments", label: "Evaluaciones", icon: ClipboardList },
];

export function getAcademyNavItems(academyId: string): AcademyNavItem[] {
  return ACADEMY_NAV_ITEMS.map((item) => ({
    ...item,
    href: `/app/${academyId}/${item.key === "dashboard" ? "dashboard" : item.key}`,
  }));
}

