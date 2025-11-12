import {
  Building2,
  CreditCard,
  LayoutDashboard,
  ScrollText,
  Settings2,
  Users,
} from "lucide-react";

export const SUPER_ADMIN_NAV_ITEMS = [
  { href: "/super-admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/super-admin/users", label: "Usuarios", icon: Users },
  { href: "/super-admin/academies", label: "Academias", icon: Building2 },
  { href: "/super-admin/billing", label: "Facturación", icon: CreditCard },
  { href: "/super-admin/logs", label: "Logs", icon: ScrollText },
  { href: "/super-admin/settings", label: "Configuración", icon: Settings2 },
] as const;


