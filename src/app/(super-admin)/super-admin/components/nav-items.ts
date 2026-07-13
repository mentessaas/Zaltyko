import {
  Building2,
  Globe,
  LayoutDashboard,
  LineChart,
  ScrollText,
  Users,
} from "lucide-react";

// Nota: "Cobros", "Soporte" y "Configuración" están ocultos del nav mientras
// sean placeholders (Cobros/Configuración) o no funcionen (Soporte redirige al
// Dashboard). Re-añadir cuando existan de verdad.
export const SUPER_ADMIN_NAV_ITEMS = [
  { href: "/super-admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/super-admin/users", label: "Usuarios", icon: Users },
  { href: "/super-admin/academies", label: "Academias", icon: Building2 },
  { href: "/super-admin/academies/public", label: "Academias Públicas", icon: Globe },
  { href: "/super-admin/growth", label: "Growth", icon: LineChart },
  { href: "/super-admin/logs", label: "Logs", icon: ScrollText },
] as const;
