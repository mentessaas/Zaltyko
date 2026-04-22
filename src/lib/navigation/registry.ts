import {
  BarChart3,
  BookOpen,
  Building2,
  Calendar,
  CreditCard,
  FileText,
  Globe,
  HeadphonesIcon,
  LayoutDashboard,
  Megaphone,
  ScrollText,
  Settings,
  Settings2,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { MembershipRole, ProfileRole } from "@/lib/product/roles";
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
  { key: "billing", label: "Facturación", icon: CreditCard, href: "/dashboard/plan-limits", roles: ["owner"] },
  { key: "classes", label: "Mis clases", icon: BookOpen, href: "/dashboard/classes", roles: ["coach"] },
  { key: "messages", label: "Mensajes", icon: Megaphone, href: "/dashboard/messages", roles: ["coach", "athlete", "parent"] },
];

const ACADEMY_NAV: NavigationDefinition[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: (academyId) => `/app/${academyId}/dashboard`, roles: ["owner", "admin", "coach"], mobile: true },
  { key: "athletes", label: "Atletas", icon: Users, href: (academyId) => `/app/${academyId}/athletes`, roles: ["owner", "admin", "coach"], mobile: true },
  { key: "classes", label: "Clases", icon: Calendar, href: (academyId) => `/app/${academyId}/classes`, roles: ["owner", "admin", "coach"], mobile: true },
  { key: "coaches", label: "Entrenadores", icon: User, href: (academyId) => `/app/${academyId}/coaches`, roles: ["owner", "admin"] },
  { key: "events", label: "Eventos", icon: Calendar, href: (academyId) => `/app/${academyId}/events`, roles: ["owner", "admin", "coach"] },
  { key: "announcements", label: "Anuncios", icon: Megaphone, href: (academyId) => `/app/${academyId}/announcements`, roles: ["owner", "admin"] },
  { key: "reports", label: "Reportes", icon: BarChart3, href: (academyId) => `/app/${academyId}/reports/attendance`, roles: ["owner", "admin", "coach"], mobile: true },
  { key: "billing", label: "Facturación", icon: CreditCard, href: (academyId) => `/app/${academyId}/billing`, roles: ["owner", "admin"] },
  { key: "settings", label: "Configuración", icon: Settings, href: (academyId) => `/app/${academyId}/settings`, roles: ["owner", "admin"], mobile: true },
];

const SUPER_ADMIN_NAV: NavigationDefinition[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/super-admin/dashboard", roles: ["super_admin"] },
  { key: "users", label: "Usuarios", icon: Users, href: "/super-admin/users", roles: ["super_admin"] },
  { key: "academies", label: "Academias", icon: Building2, href: "/super-admin/academies", roles: ["super_admin"] },
  { key: "public-academies", label: "Academias Públicas", icon: Globe, href: "/super-admin/academies/public", roles: ["super_admin"] },
  { key: "billing", label: "Facturación", icon: CreditCard, href: "/super-admin/billing", roles: ["super_admin"] },
  { key: "support", label: "Soporte", icon: HeadphonesIcon, href: "/super-admin/support", roles: ["super_admin"] },
  { key: "logs", label: "Logs", icon: ScrollText, href: "/super-admin/logs", roles: ["super_admin"] },
  { key: "settings", label: "Configuración", icon: Settings2, href: "/super-admin/settings", roles: ["super_admin"] },
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
  void args.membershipRole;
  const academyItems = isFeatureEnabled("reportsHub")
    ? ACADEMY_NAV
    : ACADEMY_NAV.filter((item) => item.key !== "reports");

  return mapNavigation(academyItems, args.profileRole, args.academyId).map((item) => ({
    ...item,
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
  void args.membershipRole;
  const academyItems = isFeatureEnabled("reportsHub")
    ? ACADEMY_NAV
    : ACADEMY_NAV.filter((item) => item.key !== "reports");

  return mapNavigation(academyItems, args.profileRole, args.academyId, { mobileOnly: true }).map((item) => ({
    ...item,
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
