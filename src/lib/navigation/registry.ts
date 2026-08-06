import {
  BarChart3,
  BookOpen,
  Building2,
  Calendar,
  ClipboardCheck,
  CreditCard,
  FileText,
  Globe,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  ScrollText,
  Settings,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";

import {
  getEffectiveAcademyNavigationRole,
  type MembershipRole,
  type ProfileRole,
} from "@/lib/product/roles";
import { isFeatureEnabled } from "@/lib/product/features";
import type { AcademySpecializationContext } from "@/lib/specialization/registry";
import { getSpecializedNavigationLabel } from "@/lib/specialization/registry";

export interface NavigationItem {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
}

interface NavigationDefinition {
  key: string;
  label: string;
  icon: LucideIcon;
  href: string | ((academyId: string) => string);
  roles: ProfileRole[];
  mobile?: boolean;
}

const GLOBAL_NAV: NavigationDefinition[] = [
  { key: "academies", label: "Academias", icon: Building2, href: "/dashboard/academies", roles: ["owner", "admin"] },
  { key: "profile", label: "Mi perfil", icon: User, href: "/dashboard/profile", roles: ["owner", "admin", "coach", "athlete", "parent"] },
  { key: "calendar", label: "Calendario", icon: Calendar, href: "/dashboard/calendar", roles: ["owner", "admin", "coach", "athlete", "parent"] },
  { key: "team", label: "Equipo", icon: Users, href: "/dashboard/users", roles: ["owner", "admin"] },
  { key: "billing", label: "Cobros", icon: CreditCard, href: "/dashboard/plan-limits", roles: ["owner"] },
  { key: "classes", label: "Mis clases", icon: BookOpen, href: "/dashboard/classes", roles: ["coach"] },
  { key: "messages", label: "Mensajes", icon: Megaphone, href: "/dashboard/messages", roles: ["coach", "athlete", "parent"] },
  { key: "marketplace", label: "Mis productos", icon: Globe, href: "/dashboard/marketplace/mis-productos", roles: ["provider"] },
  { key: "provider-profile", label: "Mi perfil", icon: User, href: "/dashboard/profile", roles: ["provider"] },
];

const ACADEMY_NAV: NavigationDefinition[] = [
  { key: "my-dashboard", label: "Mi panel", icon: LayoutDashboard, href: (academyId) => `/app/${academyId}/my-dashboard`, roles: ["athlete", "parent"], mobile: true },
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: (academyId) => `/app/${academyId}/dashboard`, roles: ["super_admin", "owner", "admin", "coach"], mobile: true },
  { key: "athletes", label: "Atletas", icon: Users, href: (academyId) => `/app/${academyId}/athletes`, roles: ["super_admin", "owner", "admin", "coach"], mobile: true },
  { key: "coaches", label: "Entrenadores", icon: User, href: (academyId) => `/app/${academyId}/coaches`, roles: ["super_admin", "owner", "admin"] },
  { key: "groups", label: "Grupos", icon: Users, href: (academyId) => `/app/${academyId}/groups`, roles: ["super_admin", "owner", "admin", "coach"] },
  { key: "classes", label: "Clases", icon: Calendar, href: (academyId) => `/app/${academyId}/classes`, roles: ["super_admin", "owner", "admin", "coach"], mobile: true },
  { key: "attendance-today", label: "Pasar lista", icon: ClipboardCheck, href: (academyId) => `/app/${academyId}/attendance/today`, roles: ["super_admin", "owner", "admin", "coach"], mobile: true },
  { key: "events", label: "Eventos", icon: Calendar, href: (academyId) => `/app/${academyId}/events`, roles: ["super_admin", "owner", "admin", "coach"] },
  { key: "assessments", label: "Evaluaciones", icon: FileText, href: (academyId) => `/app/${academyId}/assessments`, roles: ["super_admin", "owner", "admin", "coach"] },
  { key: "messages", label: "Mensajes", icon: MessageSquare, href: (academyId) => `/app/${academyId}/messages`, roles: ["super_admin", "owner", "admin", "coach", "athlete", "parent"], mobile: true },
  { key: "notifications", label: "Avisos", icon: Megaphone, href: (academyId) => `/app/${academyId}/notifications`, roles: ["athlete", "parent"], mobile: true },
  { key: "announcements", label: "Anuncios", icon: Megaphone, href: (academyId) => `/app/${academyId}/announcements`, roles: ["super_admin", "owner", "admin"] },
  { key: "reports", label: "Informes", icon: BarChart3, href: (academyId) => `/app/${academyId}/reports/attendance`, roles: ["super_admin", "owner", "admin", "coach"] },
  { key: "billing", label: "Cobros", icon: CreditCard, href: (academyId) => `/app/${academyId}/billing`, roles: ["super_admin", "owner", "admin"] },
  { key: "settings", label: "Ajustes", icon: Settings, href: (academyId) => `/app/${academyId}/settings`, roles: ["super_admin", "owner", "admin"], mobile: true },
];

const SUPER_ADMIN_NAV: NavigationDefinition[] = [
  { key: "dashboard", label: "Inicio", icon: LayoutDashboard, href: "/super-admin/dashboard", roles: ["super_admin"] },
  { key: "users", label: "Usuarios", icon: Users, href: "/super-admin/users", roles: ["super_admin"] },
  { key: "academies", label: "Academias", icon: Building2, href: "/super-admin/academies", roles: ["super_admin"] },
  { key: "public-academies", label: "Academias Públicas", icon: Globe, href: "/super-admin/academies/public", roles: ["super_admin"] },
  { key: "logs", label: "Logs", icon: ScrollText, href: "/super-admin/logs", roles: ["super_admin"] },
  // Cobros, Soporte y Configuración ocultos hasta que existan (placeholders/rotos).
];

function mapNavigation(
  items: NavigationDefinition[],
  role: ProfileRole,
  academyId?: string,
  options?: { mobileOnly?: boolean }
): NavigationItem[] {
  return items
    .filter((item) => item.roles.includes(role))
    .filter((item) => (options?.mobileOnly ? item.mobile : true))
    .map((item) => ({
      key: item.key,
      label: item.label,
      icon: item.icon,
      href: typeof item.href === "function" ? item.href(academyId ?? "") : item.href,
    }));
}

export function getGlobalNavigation(role: ProfileRole): NavigationItem[] {
  return mapNavigation(GLOBAL_NAV, role);
}

export function getAcademyNavigation(args: {
  academyId: string;
  profileRole: ProfileRole;
  membershipRole?: MembershipRole | null;
  specialization?: AcademySpecializationContext | null;
}): NavigationItem[] {
  const effectiveRole = getEffectiveAcademyNavigationRole(
    args.profileRole,
    args.membershipRole
  );
  if (!effectiveRole) return [];

  const academyItems = isFeatureEnabled("reportsHub")
    ? ACADEMY_NAV
    : ACADEMY_NAV.filter((item) => item.key !== "reports");

  return mapNavigation(academyItems, effectiveRole, args.academyId).map((item) => ({
    ...item,
    href:
      effectiveRole === "coach" && item.key === "dashboard"
        ? `/app/${args.academyId}/coach`
        : item.href,
    label: args.specialization
      ? getSpecializedNavigationLabel(args.specialization, item.key, item.label)
      : item.label,
  }));
}

export function getMobileAcademyNavigation(args: {
  academyId: string;
  profileRole: ProfileRole;
  membershipRole?: MembershipRole | null;
  specialization?: AcademySpecializationContext | null;
}): NavigationItem[] {
  const effectiveRole = getEffectiveAcademyNavigationRole(
    args.profileRole,
    args.membershipRole
  );
  if (!effectiveRole) return [];

  const academyItems = isFeatureEnabled("reportsHub")
    ? ACADEMY_NAV
    : ACADEMY_NAV.filter((item) => item.key !== "reports");

  return mapNavigation(academyItems, effectiveRole, args.academyId, { mobileOnly: true }).map((item) => ({
    ...item,
    href:
      effectiveRole === "coach" && item.key === "dashboard"
        ? `/app/${args.academyId}/coach`
        : item.href,
    label: args.specialization
      ? getSpecializedNavigationLabel(args.specialization, item.key, item.label)
      : item.label,
  }));
}

export function getSuperAdminNavigation(): NavigationItem[] {
  return mapNavigation(SUPER_ADMIN_NAV, "super_admin");
}

export function getAcademyBreadcrumbLabel(segment: string): string | null {
  const match = ACADEMY_NAV.find((item) => item.key === segment);
  return match?.label ?? null;
}

export function getGlobalBreadcrumbLabel(segment: string): string | null {
  const match = GLOBAL_NAV.find((item) => item.key === segment);
  return match?.label ?? null;
}
